import { useState, useCallback, useRef } from 'react';
import { PlaybackQueue } from '../audio/PlaybackQueue';
import { TranscriptItem, EndpointingInfo } from '../components/TranscriptView';
import { BookingSlots } from '../components/BookingSlotsStrip';

export type AssistantState = 'IDLE' | 'LISTENING' | 'USER_SPEAKING' | 'THINKING' | 'SPEAKING';

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  timeMs: number;
  message: string;
  type: 'state' | 'barge_in' | 'audio' | 'warn' | 'stale_reject' | 'endpointing' | 'transcript' | 'llm' | 'tts';
  details?: Record<string, any>;
}

export interface BargeInRecord {
  interruptedTurnId: number;
  newTurnId: number;
  stopLatencyMs: number;
  timestamp: string;
}

export function useVoiceStateMachine(playbackQueue: PlaybackQueue) {
  const [state, setState] = useState<AssistantState>('IDLE');
  const [turnId, setTurnId] = useState<number>(1);
  const [lastBargeInLatency, setLastBargeInLatency] = useState<number | null>(null);
  const [bargeInHistory, setBargeInHistory] = useState<BargeInRecord[]>([]);
  const [staleRejectionsCount, setStaleRejectionsCount] = useState<number>(0);
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);

  // Phase 1 ASR & Endpointing states
  const [currentPartial, setCurrentPartial] = useState<string>('');
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [endpointingInfo, setEndpointingInfo] = useState<EndpointingInfo | null>(null);

  // Phase 2 LLM & Booking Slots states
  const [slots, setSlots] = useState<BookingSlots>({
    date: null,
    time: null,
    partySize: null,
    name: null,
  });
  const [isBookingComplete, setIsBookingComplete] = useState<boolean>(false);
  const [llmStatus, setLlmStatus] = useState<'idle' | 'streaming' | 'aborted' | 'complete'>('idle');
  const [llmTokenCount, setLlmTokenCount] = useState<number>(0);
  const [llmStreamingText, setLlmStreamingText] = useState<string>('');

  // Phase 3 TTS Streaming states
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'streaming' | 'aborted' | 'complete'>('idle');
  const [ttsChunksCount, setTtsChunksCount] = useState<number>(0);

  const stateRef = useRef<AssistantState>('IDLE');
  const turnIdRef = useRef<number>(1);
  const llmStreamingTextRef = useRef<string>('');
  const llmTokenCountRef = useRef<number>(0);
  const ttsChunksCountRef = useRef<number>(0);

  stateRef.current = state;
  turnIdRef.current = turnId;
  llmStreamingTextRef.current = llmStreamingText;
  llmTokenCountRef.current = llmTokenCount;
  ttsChunksCountRef.current = ttsChunksCount;

  const addLog = useCallback((message: string, type: DebugLogEntry['type'], details?: Record<string, any>) => {
    const now = new Date();
    const timeStr = `${now.toTimeString().split(' ')[0]}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    const newEntry: DebugLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: timeStr,
      timeMs: performance.now(),
      message,
      type,
      details,
    };
    setLogs((prev) => [newEntry, ...prev.slice(0, 49)]);
  }, []);

  const transitionTo = useCallback((newState: AssistantState, reason?: string) => {
    const prev = stateRef.current;
    if (prev === newState) return;

    stateRef.current = newState;
    setState(newState);
    addLog(`State: ${prev} ➔ ${newState}${reason ? ` (${reason})` : ''}`, 'state', { from: prev, to: newState });
  }, [addLog]);

  /**
   * Handle incoming streaming transcript from server (turn-tagged)
   */
  const handleIncomingTranscript = useCallback((msg: {
    turnId: number;
    text: string;
    isFinal: boolean;
    endpointingDecision?: { windowType: 'short' | 'long'; windowMs: number; reason: string };
  }) => {
    const currentTurn = turnIdRef.current;

    // Reject stale transcripts from older turns
    if (msg.turnId !== currentTurn) {
      setStaleRejectionsCount((prev) => prev + 1);
      addLog(`🚫 Dropped stale transcript (Turn #${msg.turnId}, active #${currentTurn}): "${msg.text}"`, 'stale_reject');
      return;
    }

    if (stateRef.current === 'LISTENING' || stateRef.current === 'IDLE') {
      transitionTo('USER_SPEAKING', 'User speech started');
    }

    if (msg.endpointingDecision) {
      setEndpointingInfo({
        turnId: msg.turnId,
        windowType: msg.endpointingDecision.windowType,
        windowMs: msg.endpointingDecision.windowMs,
        reason: msg.endpointingDecision.reason,
      });
    }

    if (msg.isFinal) {
      setCurrentPartial('');
      const newItem: TranscriptItem = {
        id: Math.random().toString(36).substring(2, 9),
        turnId: msg.turnId,
        text: msg.text,
        isFinal: true,
        speaker: 'user',
        timestamp: new Date().toLocaleTimeString(),
      };
      setTranscripts((prev) => [newItem, ...prev.slice(0, 19)]);
      addLog(`User [Turn #${msg.turnId}]: "${msg.text}"`, 'transcript');
    } else {
      setCurrentPartial(msg.text);
    }
  }, [transitionTo, addLog]);

  const handleEndpointingDecision = useCallback((msg: {
    turnId: number;
    windowType: 'short' | 'long';
    windowMs: number;
    reason: string;
  }) => {
    if (msg.turnId !== turnIdRef.current) return;

    setEndpointingInfo(msg);
    addLog(
      `⏱️ Endpointing [Turn #${msg.turnId}]: ${msg.windowType.toUpperCase()} (${msg.windowMs}ms) — ${msg.reason}`,
      'endpointing',
      msg
    );
  }, [addLog]);

  const handleTurnFinalized = useCallback((msg: {
    turnId: number;
    transcript: string;
    windowUsed: string;
  }) => {
    if (msg.turnId !== turnIdRef.current) return;

    setCurrentPartial('');
    transitionTo('THINKING', `Turn finalized via ${msg.windowUsed.toUpperCase()} window`);
    setLlmStatus('streaming');
    setLlmStreamingText('');
    setLlmTokenCount(0);
  }, [transitionTo]);

  const handleLLMChunk = useCallback((msg: {
    turnId: number;
    token: string;
    tokenCount: number;
  }) => {
    const currentTurn = turnIdRef.current;
    if (msg.turnId !== currentTurn) {
      setStaleRejectionsCount((prev) => prev + 1);
      addLog(`🚫 Dropped stale LLM token (Turn #${msg.turnId}, active #${currentTurn}): "${msg.token}"`, 'stale_reject');
      return;
    }

    setLlmStreamingText((prev) => prev + msg.token);
    setLlmTokenCount(msg.tokenCount);
    setLlmStatus('streaming');
  }, [addLog]);

  const handleLLMComplete = useCallback((msg: {
    turnId: number;
    reply: string;
    slots: BookingSlots;
    tokenCount: number;
  }) => {
    const currentTurn = turnIdRef.current;
    if (msg.turnId !== currentTurn) return;

    setLlmStatus('complete');
    setLlmStreamingText('');

    const replyItem: TranscriptItem = {
      id: Math.random().toString(36).substring(2, 9),
      turnId: msg.turnId,
      text: msg.reply,
      isFinal: true,
      speaker: 'assistant',
      timestamp: new Date().toLocaleTimeString(),
      wasAborted: false,
    };
    setTranscripts((prev) => [replyItem, ...prev.slice(0, 19)]);
    addLog(`🤖 Assistant [Turn #${msg.turnId}]: "${msg.reply}" (${msg.tokenCount} tokens)`, 'llm');
  }, [addLog]);

  const handleSlotsUpdated = useCallback((msg: {
    turnId: number;
    slots: BookingSlots;
    isComplete: boolean;
  }) => {
    setSlots(msg.slots);
    setIsBookingComplete(msg.isComplete);
    addLog(`📋 Booking Slots updated: ${JSON.stringify(msg.slots)}`, 'llm', msg.slots);
  }, [addLog]);

  // Phase 3 TTS Handlers
  const handleTTSStart = useCallback((msg: { turnId: number; text: string }) => {
    if (msg.turnId !== turnIdRef.current) return;
    setTtsStatus('streaming');
    setTtsChunksCount(0);
    transitionTo('SPEAKING', 'Started real TTS audio playback');
    addLog(`🔊 TTS streaming started for Turn #${msg.turnId}`, 'tts');
  }, [transitionTo, addLog]);

  const handleTTSChunk = useCallback((msg: { turnId: number; chunkIndex: number }) => {
    if (msg.turnId !== turnIdRef.current) {
      setStaleRejectionsCount((prev) => prev + 1);
      addLog(`🚫 Dropped stale TTS audio chunk #${msg.chunkIndex} (Turn #${msg.turnId}, active #${turnIdRef.current})`, 'stale_reject');
      return;
    }

    setTtsChunksCount(msg.chunkIndex);
    setTtsStatus('streaming');
    if (stateRef.current !== 'SPEAKING') {
      transitionTo('SPEAKING', 'First TTS audio chunk arrived');
    }
  }, [transitionTo, addLog]);

  const handleTTSComplete = useCallback((msg: { turnId: number; totalChunks: number }) => {
    if (msg.turnId !== turnIdRef.current) return;
    setTtsStatus('complete');
    addLog(`✅ TTS stream completed (${msg.totalChunks} chunks enqueued)`, 'tts');
  }, [addLog]);

  /**
   * Core Barge-In Trigger:
   * 1. Immediately stops audio playback queue (.stop(0) on active nodes).
   * 2. Sets LLM and TTS status to aborted.
   * 3. Increments turnId, invalidating older turns.
   */
  const handleBargeIn = useCallback((speechOnsetTimeMs: number) => {
    const current = stateRef.current;
    const currentTurn = turnIdRef.current;
    const isGenerating = current === 'THINKING' || llmStatus === 'streaming';
    const isSpeaking = current === 'SPEAKING' || playbackQueue.isPlaying() || ttsStatus === 'streaming';

    if (!isGenerating && !isSpeaking) {
      if (current === 'IDLE' || current === 'LISTENING') {
        transitionTo('USER_SPEAKING', 'User speech detected');
      }
      return null;
    }

    // 1. HARD STOP any playing audio
    const stopDuration = playbackQueue.hardStop();
    const totalLatencyMs = Math.round(performance.now() - speechOnsetTimeMs);

    // 2. Abort active TTS
    if (isSpeaking) {
      const frozenChunks = ttsChunksCountRef.current;
      setTtsStatus('aborted');
      addLog(`🛑 TTS aborted mid-utterance for Turn #${currentTurn}. Audio chunks frozen at ${frozenChunks}.`, 'barge_in');
    }

    // 3. Abort active LLM
    if (isGenerating) {
      const partialText = llmStreamingTextRef.current;
      const frozenTokens = llmTokenCountRef.current;
      setLlmStatus('aborted');
      setLlmStreamingText('');

      if (partialText.trim().length > 0) {
        const abortedItem: TranscriptItem = {
          id: Math.random().toString(36).substring(2, 9),
          turnId: currentTurn,
          text: partialText + ' [Canceled]',
          isFinal: true,
          speaker: 'assistant',
          timestamp: new Date().toLocaleTimeString(),
          wasAborted: true,
        };
        setTranscripts((prev) => [abortedItem, ...prev.slice(0, 19)]);
      }

      addLog(`🛑 LLM aborted mid-generation for Turn #${currentTurn}. Token count frozen at ${frozenTokens}.`, 'barge_in');
    }

    // 4. Increment turnId
    const nextTurn = currentTurn + 1;
    turnIdRef.current = nextTurn;
    setTurnId(nextTurn);
    playbackQueue.setTurnId(nextTurn);

    // 5. Clear interim states
    setCurrentPartial('');
    setEndpointingInfo(null);

    // 6. Update telemetry and state
    setLastBargeInLatency(totalLatencyMs);
    const record: BargeInRecord = {
      interruptedTurnId: currentTurn,
      newTurnId: nextTurn,
      stopLatencyMs: totalLatencyMs,
      timestamp: new Date().toLocaleTimeString(),
    };
    setBargeInHistory((prev) => [record, ...prev.slice(0, 9)]);

    transitionTo('USER_SPEAKING', `Barge-in: Turn #${currentTurn} ➔ #${nextTurn}`);
    addLog(
      `🚨 BARGE-IN: Audio stopped in ${totalLatencyMs}ms (Primitive: ${stopDuration.toFixed(2)}ms). Turn #${currentTurn} cancelled.`,
      'barge_in',
      { previousTurnId: currentTurn, newTurnId: nextTurn, totalLatencyMs, stopDuration }
    );

    return {
      interruptedTurnId: currentTurn,
      newTurnId: nextTurn,
      stopLatencyMs: totalLatencyMs,
    };
  }, [playbackQueue, llmStatus, ttsStatus, transitionTo, addLog]);

  const resetSession = useCallback(() => {
    playbackQueue.hardStop();
    turnIdRef.current = 1;
    setTurnId(1);
    playbackQueue.setTurnId(1);
    setLastBargeInLatency(null);
    setStaleRejectionsCount(0);
    setCurrentPartial('');
    setEndpointingInfo(null);
    setLlmStatus('idle');
    setLlmStreamingText('');
    setLlmTokenCount(0);
    setTtsStatus('idle');
    setTtsChunksCount(0);
    setSlots({ date: null, time: null, partySize: null, name: null });
    setIsBookingComplete(false);
    transitionTo('IDLE', 'Session reset');
    addLog('Session reset to Turn #1 (IDLE)', 'state');
  }, [playbackQueue, transitionTo, addLog]);

  return {
    state,
    turnId,
    lastBargeInLatency,
    bargeInHistory,
    staleRejectionsCount,
    logs,
    currentPartial,
    transcripts,
    endpointingInfo,
    slots,
    isBookingComplete,
    llmStatus,
    llmTokenCount,
    llmStreamingText,
    ttsStatus,
    ttsChunksCount,
    transitionTo,
    handleIncomingTranscript,
    handleEndpointingDecision,
    handleTurnFinalized,
    handleLLMChunk,
    handleLLMComplete,
    handleSlotsUpdated,
    handleTTSStart,
    handleTTSChunk,
    handleTTSComplete,
    handleBargeIn,
    resetSession,
    addLog,
  };
}
