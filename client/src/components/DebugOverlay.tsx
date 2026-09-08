import React from 'react';
import { AssistantState, DebugLogEntry, BargeInRecord } from '../state/useVoiceStateMachine';
import { EndpointingInfo } from './TranscriptView';
import { Activity, ShieldAlert, Zap, Clock, Bot, Volume2 } from 'lucide-react';

interface DebugOverlayProps {
  state: AssistantState;
  turnId: number;
  lastBargeInLatency: number | null;
  bargeInHistory: BargeInRecord[];
  staleRejectionsCount: number;
  logs: DebugLogEntry[];
  wsConnected: boolean;
  framesSent: number;
  bytesSent: number;
  activeNodesCount: number;
  speechProbability: number;
  vadEngine: string;
  endpointingInfo: EndpointingInfo | null;
  hasDeepgramKey?: boolean;
  hasOpenAIKey?: boolean;
  hasCartesiaKey?: boolean;
  llmStatus: 'idle' | 'streaming' | 'aborted' | 'complete';
  llmTokenCount: number;
  ttsStatus: 'idle' | 'streaming' | 'aborted' | 'complete';
  ttsChunksCount: number;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({
  state,
  turnId,
  lastBargeInLatency,
  bargeInHistory,
  staleRejectionsCount,
  logs,
  wsConnected,
  framesSent,
  bytesSent,
  activeNodesCount,
  speechProbability,
  vadEngine,
  endpointingInfo,
  hasDeepgramKey,
  hasOpenAIKey,
  hasCartesiaKey,
  llmStatus,
  llmTokenCount,
  ttsStatus,
  ttsChunksCount,
}) => {
  const getLatencyColor = (ms: number | null) => {
    if (ms === null) return 'text-slate-500';
    if (ms <= 120) return 'text-emerald-400';
    if (ms <= 200) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <aside aria-label="Debug telemetry overlay" style={{
      background: 'rgba(10, 15, 29, 0.95)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(56, 189, 248, 0.2)',
      borderRadius: '16px',
      padding: '20px',
      color: '#e2e8f0',
      boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 20px rgba(56, 189, 248, 0.1)',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      width: '100%',
      maxWidth: '1200px',
      margin: '0 auto',
      fontFamily: 'monospace'
    }}>
      {/* Header Bar: Full Chain Providers */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: '14px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: wsConnected ? '#10b981' : '#ef4444',
            boxShadow: wsConnected ? '0 0 10px #10b981' : '0 0 10px #ef4444'
          }} />
          <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '1px', color: '#38bdf8' }}>
            DEBUG OVERLAY v3
          </span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '999px',
            background: 'rgba(168, 85, 247, 0.15)',
            color: '#c084fc',
            border: '1px solid rgba(168, 85, 247, 0.3)'
          }}>
            PHASE 3 FULL LOOP (TTS ACTIVE)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>TTS:</span>
          <span style={{
            fontSize: '10px',
            padding: '2px 7px',
            borderRadius: '5px',
            background: hasCartesiaKey ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
            color: hasCartesiaKey ? '#34d399' : '#94a3b8',
            border: '1px solid currentColor'
          }}>
            {hasCartesiaKey ? 'CARTESIA' : 'STREAM SYNTH'}
          </span>

          <span style={{ fontSize: '11px', color: '#94a3b8' }}>LLM:</span>
          <span style={{
            fontSize: '10px',
            padding: '2px 7px',
            borderRadius: '5px',
            background: hasOpenAIKey ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
            color: hasOpenAIKey ? '#34d399' : '#94a3b8',
            border: '1px solid currentColor'
          }}>
            {hasOpenAIKey ? 'OPENAI' : 'DIALOG ENGINE'}
          </span>

          <span style={{ fontSize: '11px', color: '#94a3b8' }}>ASR:</span>
          <span style={{
            fontSize: '10px',
            padding: '2px 7px',
            borderRadius: '5px',
            background: hasDeepgramKey ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
            color: hasDeepgramKey ? '#34d399' : '#94a3b8',
            border: '1px solid currentColor'
          }}>
            {hasDeepgramKey ? 'DEEPGRAM' : 'SIMULATOR'}
          </span>

          <span style={{ fontSize: '11px', color: '#94a3b8' }}>VAD:</span>
          <span style={{
            fontSize: '10px',
            padding: '2px 7px',
            borderRadius: '5px',
            background: vadEngine === 'silero' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            color: vadEngine === 'silero' ? '#34d399' : '#fbbf24',
            border: '1px solid currentColor'
          }}>
            {vadEngine.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Primary Proof Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px'
      }}>
        {/* State Machine State */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            State Machine
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '18px',
            fontWeight: 800,
            padding: '6px 12px',
            borderRadius: '8px',
            width: 'fit-content',
            background: state === 'SPEAKING'
              ? 'rgba(168, 85, 247, 0.2)'
              : state === 'USER_SPEAKING'
              ? 'rgba(14, 165, 233, 0.2)'
              : state === 'THINKING'
              ? 'rgba(245, 158, 11, 0.2)'
              : state === 'LISTENING'
              ? 'rgba(16, 185, 129, 0.2)'
              : 'rgba(100, 116, 139, 0.2)',
            color: state === 'SPEAKING'
              ? '#c084fc'
              : state === 'USER_SPEAKING'
              ? '#38bdf8'
              : state === 'THINKING'
              ? '#fbbf24'
              : state === 'LISTENING'
              ? '#34d399'
              : '#94a3b8',
            border: '1px solid currentColor'
          }}>
            <Activity size={18} />
            {state}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '8px' }}>
            Active Playback Nodes: <strong style={{ color: activeNodesCount > 0 ? '#38bdf8' : '#94a3b8' }}>{activeNodesCount}</strong>
          </div>
        </div>

        {/* Turn ID Monotonic Counter */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Current Turn ID
          </div>
          <div style={{ fontSize: '32px', fontWeight: 900, color: '#38bdf8', textShadow: '0 0 15px rgba(56, 189, 248, 0.4)' }}>
            #{turnId}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>
            Invalidates turns &lt; #{turnId}
          </div>
        </div>

        {/* VAD Trigger -> Playback Stopped Latency */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Stop Latency (VAD ➔ Stop)
            </span>
            <Zap size={14} color="#f59e0b" />
          </div>
          <div style={{
            fontSize: '32px',
            fontWeight: 900,
            color: getLatencyColor(lastBargeInLatency) === 'text-emerald-400' ? '#34d399' : getLatencyColor(lastBargeInLatency) === 'text-amber-400' ? '#fbbf24' : '#64748b'
          }}>
            {lastBargeInLatency !== null ? `${lastBargeInLatency} ms` : '—'}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>
            Target: &lt; 150ms | Hard-stop .stop(0)
          </div>
        </div>

        {/* Stale Rejections Counter */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Stale Rejections Dropped
            </span>
            <ShieldAlert size={14} color="#f43f5e" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: 900, color: staleRejectionsCount > 0 ? '#f43f5e' : '#94a3b8' }}>
            {staleRejectionsCount}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b' }}>
            Audio & text chunks from older turns
          </div>
        </div>
      </div>

      {/* Phase 3: TTS Streaming Diagnostic Row */}
      <div style={{
        background: ttsStatus === 'aborted'
          ? 'rgba(239, 68, 68, 0.1)'
          : ttsStatus === 'streaming'
          ? 'rgba(168, 85, 247, 0.12)'
          : 'rgba(15, 23, 42, 0.6)',
        border: ttsStatus === 'aborted'
          ? '1px solid rgba(239, 68, 68, 0.4)'
          : ttsStatus === 'streaming'
          ? '1px solid rgba(168, 85, 247, 0.3)'
          : '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '12px',
        padding: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Volume2 size={18} color={ttsStatus === 'aborted' ? '#f87171' : ttsStatus === 'streaming' ? '#c084fc' : '#38bdf8'} />
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>
              TTS Audio Stream & Playback Queue
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: 800,
              color: ttsStatus === 'aborted' ? '#f87171' : ttsStatus === 'streaming' ? '#c084fc' : '#f8fafc'
            }}>
              {ttsStatus === 'streaming' ? 'STREAMING REAL AUDIO' : ttsStatus === 'aborted' ? '🛑 ABORTED MID-UTTERANCE' : ttsStatus === 'complete' ? 'PLAYBACK COMPLETE' : 'IDLE'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Audio Chunks: </span>
            <strong style={{
              fontSize: '15px',
              color: ttsStatus === 'aborted' ? '#f87171' : '#f8fafc'
            }}>
              {ttsChunksCount} chunks {ttsStatus === 'aborted' ? '(FROZEN)' : ''}
            </strong>
          </div>

          <div style={{
            fontSize: '11px',
            color: '#cbd5e1',
            background: 'rgba(255,255,255,0.05)',
            padding: '4px 10px',
            borderRadius: '6px'
          }}>
            {ttsStatus === 'aborted'
              ? '3-Way Abort Fan-Out: TTS + LLM + ASR stopped simultaneously'
              : ttsStatus === 'streaming'
              ? 'Streaming PCM into Phase 0 PlaybackQueue'
              : 'Waiting for LLM response'}
          </div>
        </div>
      </div>

      {/* Phase 2: LLM Streaming Diagnostic Row */}
      <div style={{
        background: llmStatus === 'aborted'
          ? 'rgba(239, 68, 68, 0.1)'
          : llmStatus === 'streaming'
          ? 'rgba(168, 85, 247, 0.12)'
          : 'rgba(15, 23, 42, 0.6)',
        border: llmStatus === 'aborted'
          ? '1px solid rgba(239, 68, 68, 0.4)'
          : llmStatus === 'streaming'
          ? '1px solid rgba(168, 85, 247, 0.3)'
          : '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '12px',
        padding: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bot size={18} color={llmStatus === 'aborted' ? '#f87171' : llmStatus === 'streaming' ? '#c084fc' : '#38bdf8'} />
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>
              LLM Generation & Abort Status
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: 800,
              color: llmStatus === 'aborted' ? '#f87171' : llmStatus === 'streaming' ? '#c084fc' : '#f8fafc'
            }}>
              {llmStatus === 'streaming' ? 'STREAMING ACTIVE' : llmStatus === 'aborted' ? '🛑 ABORTED MID-GENERATION' : llmStatus === 'complete' ? 'COMMITTED' : 'IDLE'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Tokens Streamed: </span>
            <strong style={{
              fontSize: '15px',
              color: llmStatus === 'aborted' ? '#f87171' : '#f8fafc'
            }}>
              {llmTokenCount} tokens {llmStatus === 'aborted' ? '(FROZEN)' : ''}
            </strong>
          </div>

          <div style={{
            fontSize: '11px',
            color: '#cbd5e1',
            background: 'rgba(255,255,255,0.05)',
            padding: '4px 10px',
            borderRadius: '6px'
          }}>
            {llmStatus === 'aborted'
              ? 'AbortController.abort() landed • Staged slots discarded'
              : 'Tokens stream directly into TTS synthesizer'}
          </div>
        </div>
      </div>

      {/* Adaptive Endpointing Row */}
      <div style={{
        background: endpointingInfo?.windowType === 'long' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(15, 23, 42, 0.6)',
        border: endpointingInfo?.windowType === 'long' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '12px',
        padding: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={18} color={endpointingInfo?.windowType === 'long' ? '#fbbf24' : '#38bdf8'} />
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>
              Adaptive Endpointing Window
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: endpointingInfo?.windowType === 'long' ? '#fbbf24' : '#38bdf8' }}>
              {endpointingInfo ? `${endpointingInfo.windowType.toUpperCase()} WINDOW (${endpointingInfo.windowMs} ms)` : 'SHORT WINDOW (500 ms)'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '600px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Reasoning:</span>
          <span style={{
            fontSize: '12px',
            color: '#f8fafc',
            fontWeight: 500,
            background: 'rgba(255,255,255,0.05)',
            padding: '4px 10px',
            borderRadius: '6px'
          }}>
            {endpointingInfo?.reason || 'Clean utterance / ready for speech'}
          </span>
        </div>
      </div>

      {/* Secondary Telemetry Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '10px',
        padding: '10px 14px',
        background: 'rgba(15, 23, 42, 0.4)',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.04)',
        fontSize: '11px'
      }}>
        <div>
          <span style={{ color: '#64748b' }}>PCM Frames Sent: </span>
          <strong style={{ color: '#f8fafc' }}>{framesSent.toLocaleString()}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>Audio Upload: </span>
          <strong style={{ color: '#f8fafc' }}>{(bytesSent / 1024).toFixed(1)} KB</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>Speech Prob: </span>
          <strong style={{ color: speechProbability > 0.5 ? '#34d399' : '#94a3b8' }}>
            {(speechProbability * 100).toFixed(0)}%
          </strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>Barge-In Events: </span>
          <strong style={{ color: '#38bdf8' }}>{bargeInHistory.length} recorded</strong>
        </div>
      </div>

      {/* Live Event Log Feed */}
      <div style={{
        background: 'rgba(5, 10, 20, 0.7)',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.5px' }}>
            LIVE EVENT LOG (CHRONOLOGICAL)
          </span>
          <span style={{ fontSize: '10px', color: '#64748b' }}>
            Showing last {logs.length} events
          </span>
        </div>

        <div style={{
          maxHeight: '160px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          fontSize: '11px'
        }}>
          {logs.length === 0 ? (
            <div style={{ color: '#64748b', fontStyle: 'italic', padding: '10px 0' }}>
              No events recorded yet. Click "Start Assistant" to begin.
            </div>
          ) : (
            logs.map((log) => {
              let tagColor = '#94a3b8';
              let badge = 'INFO';
              if (log.type === 'barge_in') {
                tagColor = '#f43f5e';
                badge = 'BARGE-IN';
              } else if (log.type === 'state') {
                tagColor = '#38bdf8';
                badge = 'STATE';
              } else if (log.type === 'stale_reject') {
                tagColor = '#f59e0b';
                badge = 'DROP';
              } else if (log.type === 'endpointing') {
                tagColor = '#a855f7';
                badge = 'ENDPOINT';
              } else if (log.type === 'transcript') {
                tagColor = '#10b981';
                badge = 'ASR';
              } else if (log.type === 'tts') {
                tagColor = '#ec4899';
                badge = 'TTS';
              }

              return (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '3px 6px',
                    borderRadius: '4px',
                    background: log.type === 'barge_in'
                      ? 'rgba(244, 63, 94, 0.1)'
                      : log.type === 'endpointing'
                      ? 'rgba(168, 85, 247, 0.08)'
                      : 'transparent',
                    borderLeft: log.type === 'barge_in'
                      ? '3px solid #f43f5e'
                      : log.type === 'endpointing'
                      ? '3px solid #a855f7'
                      : 'none'
                  }}
                >
                  <span style={{ color: '#64748b', minWidth: '75px' }}>{log.timestamp}</span>
                  <span style={{
                    fontSize: '9px',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(255,255,255,0.06)',
                    color: tagColor,
                    fontWeight: 700,
                    minWidth: '65px',
                    textAlign: 'center'
                  }}>
                    {badge}
                  </span>
                  <span style={{ color: '#f1f5f9', wordBreak: 'break-word', flex: 1 }}>{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
};
