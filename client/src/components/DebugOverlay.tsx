import React, { useState } from 'react';
import { AssistantState, DebugLogEntry, BargeInRecord } from '../state/useVoiceStateMachine';
import { EndpointingInfo } from './TranscriptView';
import {
  Activity,
  Zap,
  Clock,
  ChevronUp,
  Cpu,
  Flame,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';

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
  isOpen: boolean;
  onToggle: () => void;
  // Test suite triggers
  onRunCase1CleanTurn?: () => void;
  onRunCase2MidTTSBargeIn?: () => void;
  onRunCase3TrailingOff?: () => void;
  onRunCase4SlotCorrection?: () => void;
  onRunCase5RapidDoubleInterrupt?: () => void;
  onRunCase6TailEndInterrupt?: () => void;
  onRunRapidInterruptTest?: () => void;
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
  isOpen,
  onToggle,
  onRunCase1CleanTurn,
  onRunCase2MidTTSBargeIn,
  onRunCase3TrailingOff,
  onRunCase4SlotCorrection,
  onRunCase5RapidDoubleInterrupt,
  onRunCase6TailEndInterrupt,
  onRunRapidInterruptTest,
}) => {
  const [activeTab, setActiveTab] = useState<'tests' | 'metrics' | 'logs'>('tests');

  if (!isOpen) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
        <button
          onClick={onToggle}
          className="glass-pill"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 18px',
            fontSize: '12px',
            cursor: 'pointer',
            background: 'rgba(18, 35, 26, 0.6)',
            border: '1px solid rgba(110, 231, 183, 0.2)',
            color: '#a7f3d0',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          }}
        >
          <Cpu size={14} color="#6ee7b7" />
          <span>Diagnostics & Test Suite</span>
          <ChevronUp size={14} color="#6ee7b7" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="glass-card"
      style={{
        marginTop: '16px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: 'rgba(12, 24, 18, 0.85)',
        border: '1px solid rgba(110, 231, 183, 0.2)',
        boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.7)',
      }}
    >
      {/* Top Bar with Tabs and Close Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(110, 231, 183, 0.1)',
          paddingBottom: '12px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('tests')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              background: activeTab === 'tests' ? 'rgba(110, 231, 183, 0.18)' : 'transparent',
              border: activeTab === 'tests' ? '1px solid rgba(110, 231, 183, 0.3)' : '1px solid transparent',
              color: activeTab === 'tests' ? '#f0fdf4' : '#7ba691',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Zap size={14} color="#6ee7b7" />
            Proof Test Cases (6)
          </button>

          <button
            onClick={() => setActiveTab('metrics')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              background: activeTab === 'metrics' ? 'rgba(110, 231, 183, 0.18)' : 'transparent',
              border: activeTab === 'metrics' ? '1px solid rgba(110, 231, 183, 0.3)' : '1px solid transparent',
              color: activeTab === 'metrics' ? '#f0fdf4' : '#7ba691',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Activity size={14} color="#6ee7b7" />
            Live Telemetry
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              background: activeTab === 'logs' ? 'rgba(110, 231, 183, 0.18)' : 'transparent',
              border: activeTab === 'logs' ? '1px solid rgba(110, 231, 183, 0.3)' : '1px solid transparent',
              color: activeTab === 'logs' ? '#f0fdf4' : '#7ba691',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Terminal size={14} color="#6ee7b7" />
            Event Log ({logs.length})
          </button>
        </div>

        <button
          onClick={onToggle}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#7ba691',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Minimize Diagnostics"
        >
          <X size={18} />
        </button>
      </div>

      {/* Tab 1: Proof Suite Test Cases */}
      {activeTab === 'tests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '12px', color: '#a7c4b5' }}>
            Run canonical end-to-end test scenarios directly over the WebSocket pipeline:
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '10px',
            }}
          >
            <button
              onClick={onRunCase1CleanTurn}
              disabled={!wsConnected}
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(110, 231, 183, 0.08)',
                border: '1px solid rgba(110, 231, 183, 0.25)',
                color: '#f0fdf4',
                cursor: wsConnected ? 'pointer' : 'not-allowed',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <MessageSquare size={16} color="#6ee7b7" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '12px' }}>1. Clean Turn</div>
                <div style={{ fontSize: '10px', color: '#7ba691', marginTop: '2px' }}>
                  ASR ➔ Short Window ➔ LLM ➔ Full TTS
                </div>
              </div>
            </button>

            <button
              onClick={onRunCase2MidTTSBargeIn}
              disabled={!wsConnected}
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(252, 165, 165, 0.08)',
                border: '1px solid rgba(252, 165, 165, 0.25)',
                color: '#f0fdf4',
                cursor: wsConnected ? 'pointer' : 'not-allowed',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <Flame size={16} color="#fca5a5" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '12px' }}>2. Mid-TTS Barge-In</div>
                <div style={{ fontSize: '10px', color: '#fca5a5', marginTop: '2px' }}>
                  &lt;150ms hard-stop, aborts ASR/LLM/TTS
                </div>
              </div>
            </button>

            <button
              onClick={onRunCase3TrailingOff}
              disabled={!wsConnected}
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(253, 230, 138, 0.08)',
                border: '1px solid rgba(253, 230, 138, 0.25)',
                color: '#f0fdf4',
                cursor: wsConnected ? 'pointer' : 'not-allowed',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <Clock size={16} color="#fde68a" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '12px' }}>3. Trailing Off ("...um...")</div>
                <div style={{ fontSize: '10px', color: '#fde68a', marginTop: '2px' }}>
                  Long window (1800ms) adaptive hold
                </div>
              </div>
            </button>

            <button
              onClick={onRunCase4SlotCorrection}
              disabled={!wsConnected}
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(167, 243, 208, 0.08)',
                border: '1px solid rgba(167, 243, 208, 0.25)',
                color: '#f0fdf4',
                cursor: wsConnected ? 'pointer' : 'not-allowed',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <RefreshCw size={16} color="#a7f3d0" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '12px' }}>4. Slot Correction</div>
                <div style={{ fontSize: '10px', color: '#a7f3d0', marginTop: '2px' }}>
                  "Make that 7" mutates partySize cleanly
                </div>
              </div>
            </button>

            <button
              onClick={onRunCase5RapidDoubleInterrupt}
              disabled={!wsConnected}
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(110, 231, 183, 0.08)',
                border: '1px solid rgba(110, 231, 183, 0.25)',
                color: '#f0fdf4',
                cursor: wsConnected ? 'pointer' : 'not-allowed',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <Zap size={16} color="#6ee7b7" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '12px' }}>5. Rapid Double Interrupt</div>
                <div style={{ fontSize: '10px', color: '#6ee7b7', marginTop: '2px' }}>
                  Two interrupts in 350ms, monotonic turns
                </div>
              </div>
            </button>

            <button
              onClick={onRunCase6TailEndInterrupt}
              disabled={!wsConnected}
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(52, 211, 153, 0.08)',
                border: '1px solid rgba(52, 211, 153, 0.25)',
                color: '#f0fdf4',
                cursor: wsConnected ? 'pointer' : 'not-allowed',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <Sparkles size={16} color="#34d399" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '12px' }}>6. Tail-End Interrupt</div>
                <div style={{ fontSize: '10px', color: '#34d399', marginTop: '2px' }}>
                  Halts at final chunk with zero race conditions
                </div>
              </div>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              onClick={onRunRapidInterruptTest}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                background: 'rgba(110, 231, 183, 0.12)',
                border: '1px solid rgba(110, 231, 183, 0.3)',
                color: '#a7f3d0',
                fontWeight: 600,
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              ⚡ Run 5x Rapid Barge-In Stress Test
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Live Telemetry */}
      {activeTab === 'metrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Provider Badges */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span
              className="glass-pill"
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                background: hasCartesiaKey ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                color: hasCartesiaKey ? '#6ee7b7' : '#5e8271',
              }}
            >
              TTS: {hasCartesiaKey ? 'CARTESIA SONIC' : 'SYNTHESIZER'} ({ttsStatus.toUpperCase()}, {ttsChunksCount} chunks)
            </span>

            <span
              className="glass-pill"
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                background: hasOpenAIKey ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                color: hasOpenAIKey ? '#6ee7b7' : '#5e8271',
              }}
            >
              LLM: {hasOpenAIKey ? 'GROQ / OPENAI' : 'DIALOG ENGINE'} ({llmStatus.toUpperCase()}, {llmTokenCount} tokens)
            </span>

            <span
              className="glass-pill"
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                background: hasDeepgramKey ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                color: hasDeepgramKey ? '#6ee7b7' : '#5e8271',
              }}
            >
              ASR: {hasDeepgramKey ? 'DEEPGRAM NOVA-2' : 'OFFLINE'}
            </span>

            <span
              className="glass-pill"
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                background: 'rgba(52, 211, 153, 0.15)',
                color: '#6ee7b7',
              }}
            >
              VAD: {vadEngine.toUpperCase()} ONNX
            </span>
          </div>

          {/* Metric Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px',
            }}
          >
            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(110, 231, 183, 0.08)' }}>
              <div style={{ fontSize: '10px', color: '#5e8271' }}>TURN / STATE</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#f0fdf4' }}>
                Turn #{turnId} • {state}
              </div>
            </div>

            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(110, 231, 183, 0.08)' }}>
              <div style={{ fontSize: '10px', color: '#5e8271' }}>LAST BARGE-IN</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: lastBargeInLatency && lastBargeInLatency <= 150 ? '#6ee7b7' : '#fde68a' }}>
                {lastBargeInLatency ? `${lastBargeInLatency}ms` : '—'} ({bargeInHistory.length} total)
              </div>
            </div>

            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(110, 231, 183, 0.08)' }}>
              <div style={{ fontSize: '10px', color: '#5e8271' }}>SPEECH PROB / VAD</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#f0fdf4' }}>
                {(speechProbability * 100).toFixed(0)}%
              </div>
            </div>

            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(110, 231, 183, 0.08)' }}>
              <div style={{ fontSize: '10px', color: '#5e8271' }}>PCM AUDIO SENT</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#f0fdf4' }}>
                {framesSent.toLocaleString()} frames ({(bytesSent / 1024).toFixed(0)} KB)
              </div>
            </div>

            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(110, 231, 183, 0.08)' }}>
              <div style={{ fontSize: '10px', color: '#5e8271' }}>AUDIO QUEUE NODES</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#f0fdf4' }}>
                {activeNodesCount} active
              </div>
            </div>

            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(110, 231, 183, 0.08)' }}>
              <div style={{ fontSize: '10px', color: '#5e8271' }}>STALE DROPS</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#f0fdf4' }}>
                {staleRejectionsCount}
              </div>
            </div>

            {endpointingInfo && (
              <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(110, 231, 183, 0.08)' }}>
                <div style={{ fontSize: '10px', color: '#5e8271' }}>ENDPOINTING</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#a7f3d0' }}>
                  {endpointingInfo.windowType.toUpperCase()} ({endpointingInfo.windowMs}ms)
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Event Log */}
      {activeTab === 'logs' && (
        <div
          style={{
            maxHeight: '220px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontFamily: 'monospace',
            fontSize: '11px',
            paddingRight: '6px',
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#5e8271', padding: '10px 0' }}>No event logs recorded yet.</div>
          ) : (
            logs.slice(-40).map((log, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  color: log.type === 'barge_in'
                    ? '#fca5a5'
                    : log.type === 'warn'
                    ? '#fde68a'
                    : '#a7c4b5',
                }}
              >
                <span style={{ color: '#5e8271', flexShrink: 0 }}>{log.timestamp}</span>
                <span>{log.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
