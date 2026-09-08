import React from 'react';
import { MessageSquare, Clock, Zap, CheckCircle, Bot, AlertTriangle } from 'lucide-react';

export interface TranscriptItem {
  id: string;
  turnId: number;
  text: string;
  isFinal: boolean;
  timestamp: string;
  speaker: 'user' | 'assistant';
  wasAborted?: boolean;
}

export interface EndpointingInfo {
  turnId: number;
  windowType: 'short' | 'long';
  windowMs: number;
  reason: string;
}

interface TranscriptViewProps {
  currentPartial: string;
  transcripts: TranscriptItem[];
  currentTurnId: number;
  endpointingInfo: EndpointingInfo | null;
  isUserSpeaking: boolean;
  llmStreamingText: string;
  isLLMGenerating: boolean;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  currentPartial,
  transcripts,
  currentTurnId,
  endpointingInfo,
  isUserSpeaking,
  llmStreamingText,
  isLLMGenerating,
}) => {
  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.7)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '16px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
      minHeight: '300px',
      justifyContent: 'space-between'
    }}>
      {/* Header & Status Indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        paddingBottom: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={16} color="#38bdf8" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.5px' }}>
            CONVERSATION & STREAMING DIALOGUE
          </span>
          <span style={{
            fontSize: '10px',
            padding: '2px 7px',
            borderRadius: '4px',
            background: 'rgba(56, 189, 248, 0.1)',
            color: '#38bdf8',
            fontWeight: 700
          }}>
            TURN #{currentTurnId}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isUserSpeaking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 8px #10b981',
                animation: 'pulse 1.5s infinite'
              }} />
              <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 600 }}>USER SPEAKING</span>
            </div>
          )}

          {isLLMGenerating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#a855f7',
                boxShadow: '0 0 8px #a855f7',
                animation: 'pulse 1.5s infinite'
              }} />
              <span style={{ fontSize: '11px', color: '#c084fc', fontWeight: 600 }}>LLM STREAMING</span>
            </div>
          )}
        </div>
      </div>

      {/* Transcript & Response Area */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxHeight: '220px',
        overflowY: 'auto',
        paddingRight: '4px'
      }}>
        {transcripts.length === 0 && !currentPartial && !llmStreamingText ? (
          <div style={{ color: '#64748b', fontSize: '13px', fontStyle: 'italic', padding: '24px 0', textAlign: 'center' }}>
            Speak into your microphone or click a test button to start the reservation dialogue.
          </div>
        ) : (
          transcripts.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '8px',
                background: item.speaker === 'user' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(168, 85, 247, 0.08)',
                border: item.wasAborted
                  ? '1px dashed rgba(245, 158, 11, 0.4)'
                  : item.speaker === 'user'
                  ? '1px solid rgba(255, 255, 255, 0.04)'
                  : '1px solid rgba(168, 85, 247, 0.2)'
              }}
            >
              {item.speaker === 'user' ? (
                <CheckCircle size={14} color="#10b981" style={{ marginTop: '3px', flexShrink: 0 }} />
              ) : item.wasAborted ? (
                <AlertTriangle size={14} color="#fbbf24" style={{ marginTop: '3px', flexShrink: 0 }} />
              ) : (
                <Bot size={14} color="#c084fc" style={{ marginTop: '3px', flexShrink: 0 }} />
              )}

              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '13px',
                  color: item.wasAborted ? '#fbbf24' : '#f8fafc',
                  fontWeight: item.speaker === 'user' ? 500 : 400
                }}>
                  {item.speaker === 'user' ? `"${item.text}"` : item.text}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{item.speaker === 'user' ? 'User' : 'Assistant'} • Turn #{item.turnId}</span>
                  {item.wasAborted && (
                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>[ABORTED MID-GENERATION]</span>
                  )}
                  <span>{item.timestamp}</span>
                </div>
              </div>
            </div>
          ))
        )}

        {/* In-flight Interim User Partial */}
        {currentPartial && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px dashed rgba(56, 189, 248, 0.4)',
            animation: 'pulse 2s infinite'
          }}>
            <Zap size={14} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', color: '#7dd3fc', fontStyle: 'italic' }}>
                "{currentPartial}"
              </div>
              <div style={{ fontSize: '10px', color: '#38bdf8', marginTop: '2px' }}>
                streaming user speech...
              </div>
            </div>
          </div>
        )}

        {/* In-flight Streaming Assistant Response */}
        {llmStreamingText && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            background: 'rgba(168, 85, 247, 0.12)',
            border: '1px dashed rgba(168, 85, 247, 0.5)'
          }}>
            <Bot size={14} color="#c084fc" style={{ marginTop: '3px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', color: '#e9d5ff' }}>
                {llmStreamingText}
                <span style={{ display: 'inline-block', width: '6px', height: '14px', background: '#c084fc', marginLeft: '4px', verticalAlign: 'middle', animation: 'pulse 0.8s infinite' }} />
              </div>
              <div style={{ fontSize: '10px', color: '#c084fc', marginTop: '2px' }}>
                LLM streaming tokens live (cancellable via barge-in)...
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Adaptive Endpointing Active Window Bar */}
      <div style={{
        marginTop: 'auto',
        padding: '10px 14px',
        borderRadius: '8px',
        background: endpointingInfo?.windowType === 'long' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(56, 189, 248, 0.08)',
        border: endpointingInfo?.windowType === 'long' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(56, 189, 248, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={14} color={endpointingInfo?.windowType === 'long' ? '#fbbf24' : '#38bdf8'} />
          <span style={{ color: '#94a3b8' }}>Endpoint Window:</span>
          <span style={{
            fontWeight: 800,
            color: endpointingInfo?.windowType === 'long' ? '#fbbf24' : '#38bdf8',
            textTransform: 'uppercase'
          }}>
            {endpointingInfo ? `${endpointingInfo.windowType} (${endpointingInfo.windowMs}ms)` : 'DEFAULT (500ms)'}
          </span>
        </div>

        <div style={{
          color: '#cbd5e1',
          fontSize: '11px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '300px'
        }}>
          {endpointingInfo?.reason || 'Monitoring user utterance completeness...'}
        </div>
      </div>
    </div>
  );
};
