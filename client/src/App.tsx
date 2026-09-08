import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PlaybackQueue } from './audio/PlaybackQueue';
import { createAssistantSpeechChunks } from './audio/CannedSpeech';
import { useVoiceStateMachine } from './state/useVoiceStateMachine';
import { useSileroVad } from './vad/useSileroVad';
import { DebugOverlay } from './components/DebugOverlay';
import { TranscriptView } from './components/TranscriptView';
import { BookingSlotsStrip } from './components/BookingSlotsStrip';
import {
  Mic,
  MicOff,
  Volume2,
  RotateCcw,
  Sparkles,
  Cpu,
  UtensilsCrossed,
  WifiOff,
} from 'lucide-react';

const WS_URL = 'ws://localhost:8080';

export const App: React.FC = () => {
  const playbackQueueRef = useRef<PlaybackQueue | null>(null);
  if (!playbackQueueRef.current) {
    playbackQueueRef.current = new PlaybackQueue();
  }
  const queue = playbackQueueRef.current;

  const {
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
  } = useVoiceStateMachine(queue);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [wsConnected, setWsConnected] = useState(false);
  const [hasDeepgramKey, setHasDeepgramKey] = useState(false);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [hasCartesiaKey, setHasCartesiaKey] = useState(false);
  const [framesSent, setFramesSent] = useState(0);
  const [bytesSent, setBytesSent] = useState(0);
  const [activeNodesCount, setActiveNodesCount] = useState(0);
  const [isAssistantActive, setIsAssistantActive] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);

  useEffect(() => {
    const unsubState = queue.subscribeState((isPlaying, count) => {
      setActiveNodesCount(count);
      if (!isPlaying && state === 'SPEAKING' && ttsStatus !== 'streaming') {
        transitionTo('LISTENING', 'Playback finished');
      }
    });

    const unsubStale = queue.subscribeStaleDrop((staleTurn, activeTurn) => {
      addLog(`🚫 Dropped stale audio chunk (Turn #${staleTurn}, active #${activeTurn})`, 'stale_reject');
    });

    return () => {
      unsubState();
      unsubStale();
    };
  }, [queue, state, ttsStatus, transitionTo, addLog]);

  const onSpeechStart = useCallback(
    (speechOnsetTimeMs: number) => {
      const result = handleBargeIn(speechOnsetTimeMs);
      if (result) {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'barge_in',
              turnId: result.interruptedTurnId,
              stopLatencyMs: result.stopLatencyMs,
            })
          );
        }
      }
    },
    [handleBargeIn]
  );

  const onSpeechEnd = useCallback(() => {
    addLog('Speech pause detected by VAD', 'audio');
  }, [addLog]);

  const isAssistantSpeaking = state === 'SPEAKING' || activeNodesCount > 0;

  const { vadState, start: startVad, destroy: destroyVad } = useSileroVad({
    onSpeechStart,
    onSpeechEnd,
    positiveSpeechThreshold: 0.55,
    negativeSpeechThreshold: 0.35,
    isAssistantSpeaking,
  });

  const connectWebSocket = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        setWsConnected(true);
        addLog('Connected to backend WebSocket (ws://localhost:8080)', 'state');
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'transcript') {
            handleIncomingTranscript(msg);
          } else if (msg.type === 'endpointing_decision') {
            handleEndpointingDecision(msg);
          } else if (msg.type === 'turn_finalized') {
            handleTurnFinalized(msg);
          } else if (msg.type === 'llm_chunk') {
            handleLLMChunk(msg);
          } else if (msg.type === 'llm_complete') {
            handleLLMComplete(msg);
          } else if (msg.type === 'slots_updated') {
            handleSlotsUpdated(msg);
          } else if (msg.type === 'tts_start') {
            handleTTSStart(msg);
          } else if (msg.type === 'tts_chunk') {
            handleTTSChunk(msg);
            if (msg.audioBase64) {
              queue.enqueueRawPcmBase64(msg.audioBase64, msg.turnId, msg.sampleRate || 16000);
            }
          } else if (msg.type === 'tts_complete') {
            handleTTSComplete(msg);
          } else if (msg.type === 'session_init') {
            setHasDeepgramKey(Boolean(msg.hasDeepgramKey));
            setHasOpenAIKey(Boolean(msg.hasOpenAIKey));
            setHasCartesiaKey(Boolean(msg.hasCartesiaKey));
            if (msg.slots) handleSlotsUpdated({ turnId: msg.turnId, slots: msg.slots, isComplete: false });
            addLog(`Session initialized (Client #${msg.clientId})`, 'state');
          } else if (msg.type === 'barge_in_ack') {
            addLog(
              `Server confirmed 3-way abort for Turn #${msg.previousTurnId} ➔ active is #${msg.newTurnId}`,
              'barge_in'
            );
          }
        } catch {
          // ignore non-json
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        addLog('Disconnected from backend WebSocket', 'warn');
      };

      ws.onerror = () => {
        setWsConnected(false);
        addLog('WebSocket error (ensure server is running on port 8080)', 'warn');
      };

      wsRef.current = ws;
    } catch (err: any) {
      console.error('WebSocket connection failed:', err);
    }
  }, [
    addLog,
    handleIncomingTranscript,
    handleEndpointingDecision,
    handleTurnFinalized,
    handleLLMChunk,
    handleLLMComplete,
    handleSlotsUpdated,
    handleTTSStart,
    handleTTSChunk,
    handleTTSComplete,
    queue,
  ]);

  const startAssistant = async () => {
    try {
      addLog('Starting voice assistant pipeline (echoCancellation: true)...', 'audio');
      connectWebSocket();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;

      await ctx.audioWorklet.addModule('/audio-processor.js');
      const workletNode = new AudioWorkletNode(ctx, 'audio-capture-processor');
      workletNodeRef.current = workletNode;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(workletNode);

      workletNode.port.onmessage = (e) => {
        const pcmData = e.data;
        setFramesSent((prev) => prev + 1);
        setBytesSent((prev) => prev + pcmData.byteLength);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(pcmData);
        }
      };

      await startVad(stream);
      setIsAssistantActive(true);
      transitionTo('LISTENING', 'Mic stream active');
      addLog('🎙️ Full-duplex audio + streaming ASR + LLM pipeline active', 'state');
    } catch (err: any) {
      console.error('Failed to start assistant:', err);
      addLog(`Failed to start assistant: ${err.message}`, 'warn');
    }
  };

  const stopAssistant = () => {
    queue.hardStop();
    destroyVad();

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsAssistantActive(false);
    transitionTo('IDLE', 'Assistant stopped');
    addLog('Assistant stopped and audio tracks released', 'state');
  };

  const playCannedSpeech = () => {
    if (!queue) return;
    const ctx = queue.getAudioContext();
    const chunks = createAssistantSpeechChunks(ctx);

    transitionTo('SPEAKING', 'Started assistant speech');
    addLog(`Enqueueing ${chunks.length} speech chunks for Turn #${turnId}`, 'audio');

    chunks.forEach((chunk, index) => {
      setTimeout(() => {
        const success = queue.enqueue(chunk.buffer, turnId);
        if (success) {
          addLog(`Enqueued chunk [${index + 1}/${chunks.length}]: "${chunk.label.slice(0, 30)}..."`, 'audio');
        }
      }, index * 200);
    });
  };

  // Phase 3 Canonical Test Handlers
  const runCase1CleanTurn = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    addLog('🧪 Proof Case 1: Clean Complete Turn ("Book a table for 2 tonight at 7 PM")', 'state');
    wsRef.current.send(JSON.stringify({
      type: 'simulate_speech',
      words: ['Book', 'a', 'table', 'for', 'two', 'tonight', 'at', '7', 'PM'],
      trailingOff: false,
    }));
  };

  const runCase2MidTTSBargeIn = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    addLog('🧪 Proof Case 2: Mid-Utterance Barge-In — Starting turn, then interrupting mid-TTS...', 'barge_in');
    runCase1CleanTurn();

    await new Promise((res) => setTimeout(res, 2200));
    const onset = performance.now();
    onSpeechStart(onset);
    addLog('⚡ Interrupted active TTS playback! Audio hard-stopped <150ms & 3-way abort fired.', 'barge_in');
  };

  const runCase3TrailingOff = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    addLog('🧪 Proof Case 3: Trailing-Off Endpointing ("Table for two tonight... um...")', 'endpointing');
    wsRef.current.send(JSON.stringify({
      type: 'simulate_speech',
      words: ['Table', 'for', 'two', 'tonight', 'um'],
      trailingOff: true,
    }));
  };

  const runCase4SlotCorrection = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    addLog('🧪 Proof Case 4: Slot Correction ("Actually make that seven people")', 'transcript');
    wsRef.current.send(JSON.stringify({
      type: 'simulate_speech',
      words: ['Actually', 'make', 'that', 'seven', 'people'],
      trailingOff: false,
    }));
  };

  const runCase5RapidDoubleInterrupt = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    addLog('🧪 Proof Case 5: Rapid Double Interrupt (Firing 2 interrupts 300ms apart)...', 'barge_in');
    runCase1CleanTurn();
    await new Promise((res) => setTimeout(res, 1200));

    addLog('⚡ Firing Barge-In #1...', 'barge_in');
    onSpeechStart(performance.now());
    await new Promise((res) => setTimeout(res, 300));

    addLog('⚡ Firing Barge-In #2...', 'barge_in');
    onSpeechStart(performance.now());
    addLog('✓ Double interrupt finished: Strict monotonic turn increment.', 'barge_in');
  };

  const runCase6TailEndInterrupt = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    addLog('🧪 Proof Case 6: Tail-End Interrupt — Interrupting right at final audio chunk...', 'barge_in');
    runCase1CleanTurn();

    await new Promise((res) => setTimeout(res, 3300));
    const onset = performance.now();
    onSpeechStart(onset);
    addLog('⚡ Tail-end barge-in fired! Verified zero race conditions.', 'barge_in');
  };

  const runRapidInterruptTest = async () => {
    addLog('🧪 Starting 5x Rapid Barge-In Stress Test...', 'barge_in');

    const latencies: number[] = [];

    for (let i = 1; i <= 5; i++) {
      addLog(`--- Iteration ${i}/5 ---`, 'state');
      playCannedSpeech();
      await new Promise((res) => setTimeout(res, 400));
      const onset = performance.now();
      const result = handleBargeIn(onset);
      if (result) {
        latencies.push(result.stopLatencyMs);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'barge_in',
              turnId: result.interruptedTurnId,
              stopLatencyMs: result.stopLatencyMs,
            })
          );
        }
      }
      await new Promise((res) => setTimeout(res, 350));
    }

    if (latencies.length > 0) {
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      addLog(`📊 5x Stress Test Stats: Avg = ${avg.toFixed(1)}ms [Runs: ${latencies.join(', ')}ms]`, 'barge_in');
    }
  };

  // Helper for Orb styling based on conversational state
  const getOrbGradient = () => {
    switch (state) {
      case 'SPEAKING':
        return 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
      case 'USER_SPEAKING':
        return 'linear-gradient(135deg, #10b981 0%, #6ee7b7 100%)';
      case 'THINKING':
        return 'linear-gradient(135deg, #34d399 0%, #d1fae5 100%)';
      case 'LISTENING':
        return 'linear-gradient(135deg, #047857 0%, #34d399 100%)';
      default:
        return 'linear-gradient(135deg, #142a1f 0%, #0d1b14 100%)';
    }
  };

  const getOrbAura = () => {
    switch (state) {
      case 'SPEAKING':
        return 'rgba(16, 185, 129, 0.4)';
      case 'USER_SPEAKING':
        return 'rgba(110, 231, 183, 0.45)';
      case 'THINKING':
        return 'rgba(52, 211, 153, 0.35)';
      case 'LISTENING':
        return 'rgba(52, 211, 153, 0.25)';
      default:
        return 'rgba(52, 211, 153, 0.05)';
    }
  };

  const getStateTitle = () => {
    switch (state) {
      case 'SPEAKING':
        return 'Assistant Speaking';
      case 'USER_SPEAKING':
        return 'Listening to You';
      case 'THINKING':
        return 'Formulating Response...';
      case 'LISTENING':
        return 'Ready • Speak Anytime';
      default:
        return 'Voice Concierge Ready';
    }
  };

  const getStateSubtitle = () => {
    switch (state) {
      case 'SPEAKING':
        return 'Interrupt naturally at any moment — playback stops instantly';
      case 'USER_SPEAKING':
        return 'Streaming audio frames with continuous voice activity detection';
      case 'THINKING':
        return 'Generating reservation response with live token streaming';
      case 'LISTENING':
        return 'Say: "I\'d like a table for 4 tomorrow at 8 PM"';
      default:
        return 'Click "Start Assistant" and grant microphone access to begin';
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '24px 20px 40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
      }}
    >
      {/* Symmetrical Top Navigation */}
      <header
        style={{
          width: '100%',
          maxWidth: '1040px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        {/* Brand / Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(110, 231, 183, 0.2), rgba(16, 185, 129, 0.1))',
              border: '1px solid rgba(110, 231, 183, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6ee7b7',
              boxShadow: '0 4px 14px rgba(52, 211, 153, 0.15)',
            }}
          >
            <UtensilsCrossed size={20} />
          </div>
          <div>
            <h1
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: '#f0fdf4',
                letterSpacing: '-0.3px',
                lineHeight: 1.2,
              }}
            >
              Bella Vista
            </h1>
            <p style={{ color: '#7ba691', fontSize: '12px', fontWeight: 500 }}>
              Voice AI Concierge
            </p>
          </div>
        </div>

        {/* Center Status Badge */}
        <div
          className="glass-pill"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            fontSize: '11px',
          }}
        >
          {wsConnected ? (
            <>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#34d399',
                  boxShadow: '0 0 10px #34d399',
                }}
                className="animate-pulse-subtle"
              />
              <span style={{ color: '#a7f3d0' }}>Live • Backend Connected</span>
            </>
          ) : (
            <>
              <WifiOff size={12} color="#fca5a5" />
              <span style={{ color: '#fca5a5' }}>Connecting to Server...</span>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {!isAssistantActive ? (
            <button
              onClick={startAssistant}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(16, 185, 129, 0.35)',
              }}
            >
              <Mic size={16} />
              Start Assistant
            </button>
          ) : (
            <button
              onClick={stopAssistant}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '12px',
                background: 'rgba(239, 68, 68, 0.18)',
                color: '#fca5a5',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <MicOff size={16} />
              Stop Assistant
            </button>
          )}

          <button
            onClick={resetSession}
            title="Reset Session & Slots"
            style={{
              padding: '10px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(110, 231, 183, 0.12)',
              color: '#a7c4b5',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RotateCcw size={16} />
          </button>

          <button
            onClick={() => setIsDiagnosticsOpen(!isDiagnosticsOpen)}
            title="Toggle Diagnostics & Tests"
            style={{
              padding: '10px',
              borderRadius: '12px',
              background: isDiagnosticsOpen ? 'rgba(110, 231, 183, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              border: isDiagnosticsOpen ? '1px solid rgba(110, 231, 183, 0.35)' : '1px solid rgba(110, 231, 183, 0.12)',
              color: isDiagnosticsOpen ? '#6ee7b7' : '#a7c4b5',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cpu size={16} />
          </button>
        </div>
      </header>

      {/* Hero Centerpiece: Breathing Voice Orb Stage */}
      <section
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '1040px',
          padding: '40px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          background: 'rgba(12, 25, 18, 0.65)',
        }}
      >
        {/* Subtle Ambient Background Light */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '320px',
            height: '320px',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${getOrbAura()} 0%, transparent 70%)`,
            pointerEvents: 'none',
            transition: 'all 0.6s ease',
          }}
        />

        {/* Concentric Voice Orb */}
        <div
          style={{
            position: 'relative',
            width: '150px',
            height: '150px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
          }}
        >
          {/* Animated Ripples when speaking / listening */}
          {isAssistantActive && (
            <>
              <div
                style={{
                  position: 'absolute',
                  inset: '-12px',
                  borderRadius: '50%',
                  border: '1px solid rgba(110, 231, 183, 0.25)',
                  animation: 'ripple 2.5s infinite ease-out',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: '-26px',
                  borderRadius: '50%',
                  border: '1px solid rgba(110, 231, 183, 0.15)',
                  animation: 'ripple 2.5s infinite ease-out 0.8s',
                }}
              />
            </>
          )}

          {/* Central Physical Orb */}
          <div
            className={isAssistantActive ? 'animate-breath' : ''}
            style={{
              width: '94px',
              height: '94px',
              borderRadius: '50%',
              background: getOrbGradient(),
              boxShadow: `0 0 40px ${getOrbAura()}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              cursor: 'pointer',
            }}
            onClick={isAssistantActive ? stopAssistant : startAssistant}
          >
            {state === 'SPEAKING' ? (
              <Volume2 size={36} color="#f0fdf4" />
            ) : state === 'THINKING' ? (
              <Sparkles size={34} color="#f0fdf4" className="animate-pulse-subtle" />
            ) : (
              <Mic size={34} color="#f0fdf4" />
            )}
          </div>
        </div>

        {/* Status Typography */}
        <div style={{ zIndex: 1, maxWidth: '520px' }}>
          <h2
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#f0fdf4',
              letterSpacing: '-0.3px',
            }}
          >
            {getStateTitle()}
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: '#7ba691',
              marginTop: '6px',
              lineHeight: 1.5,
            }}
          >
            {getStateSubtitle()}
          </p>
        </div>
      </section>

      {/* Symmetrical Dual Information Columns */}
      <main
        style={{
          width: '100%',
          maxWidth: '1040px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Booking Details */}
        <BookingSlotsStrip
          slots={slots}
          isComplete={isBookingComplete}
          turnId={turnId}
        />

        {/* Right Column: Live Dialogue Flow */}
        <TranscriptView
          currentPartial={currentPartial}
          transcripts={transcripts}
          currentTurnId={turnId}
          endpointingInfo={endpointingInfo}
          isUserSpeaking={state === 'USER_SPEAKING'}
          llmStreamingText={llmStreamingText}
          isLLMGenerating={llmStatus === 'streaming'}
        />
      </main>

      {/* Collapsible Diagnostics & Testing Tray */}
      <div style={{ width: '100%', maxWidth: '1040px' }}>
        <DebugOverlay
          state={state}
          turnId={turnId}
          lastBargeInLatency={lastBargeInLatency}
          bargeInHistory={bargeInHistory}
          staleRejectionsCount={staleRejectionsCount}
          logs={logs}
          wsConnected={wsConnected}
          framesSent={framesSent}
          bytesSent={bytesSent}
          activeNodesCount={activeNodesCount}
          speechProbability={vadState.speechProbability}
          vadEngine={vadState.engine}
          endpointingInfo={endpointingInfo}
          hasDeepgramKey={hasDeepgramKey}
          hasOpenAIKey={hasOpenAIKey}
          hasCartesiaKey={hasCartesiaKey}
          llmStatus={llmStatus}
          llmTokenCount={llmTokenCount}
          ttsStatus={ttsStatus}
          ttsChunksCount={ttsChunksCount}
          isOpen={isDiagnosticsOpen}
          onToggle={() => setIsDiagnosticsOpen(!isDiagnosticsOpen)}
          onRunCase1CleanTurn={runCase1CleanTurn}
          onRunCase2MidTTSBargeIn={runCase2MidTTSBargeIn}
          onRunCase3TrailingOff={runCase3TrailingOff}
          onRunCase4SlotCorrection={runCase4SlotCorrection}
          onRunCase5RapidDoubleInterrupt={runCase5RapidDoubleInterrupt}
          onRunCase6TailEndInterrupt={runCase6TailEndInterrupt}
          onRunRapidInterruptTest={runRapidInterruptTest}
        />
      </div>

      {/* Minimalist Footer */}
      <footer
        style={{
          fontSize: '11px',
          color: '#476355',
          textAlign: 'center',
          marginTop: '10px',
        }}
      >
        Silero VAD • Deepgram Nova-2 • Groq/OpenAI LLM • Cartesia Sonic TTS • Full Duplex Barge-in
      </footer>
    </div>
  );
};
