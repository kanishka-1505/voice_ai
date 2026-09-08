import React, { useEffect, useRef } from 'react';
import { MessageSquare, Clock, Bot, User, AlertCircle } from 'lucide-react';

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
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, currentPartial, llmStreamingText]);

  return (
    <div
      className="glass-card"
      style={{
        padding: '22px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        minHeight: '340px',
        maxHeight: '440px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(110, 231, 183, 0.1)',
          paddingBottom: '14px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: 'rgba(110, 231, 183, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6ee7b7',
            }}
          >
            <MessageSquare size={16} />
          </div>
          <div>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#f0fdf4',
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
              }}
            >
              Live Dialogue
            </span>
          </div>
          <span
            className="glass-pill"
            style={{
              fontSize: '10px',
              padding: '2px 8px',
              fontWeight: 700,
            }}
          >
            Turn #{currentTurnId}
          </span>
        </div>

        {/* Dynamic Activity Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isUserSpeaking && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: '999px',
                background: 'rgba(110, 231, 183, 0.15)',
                border: '1px solid rgba(110, 231, 183, 0.3)',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#6ee7b7',
                  boxShadow: '0 0 8px #6ee7b7',
                }}
                className="animate-pulse-subtle"
              />
              <span style={{ fontSize: '11px', color: '#a7f3d0', fontWeight: 600 }}>Speaking</span>
            </div>
          )}

          {isLLMGenerating && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: '999px',
                background: 'rgba(52, 211, 153, 0.15)',
                border: '1px solid rgba(52, 211, 153, 0.3)',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#34d399',
                  boxShadow: '0 0 8px #34d399',
                }}
                className="animate-pulse-subtle"
              />
              <span style={{ fontSize: '11px', color: '#6ee7b7', fontWeight: 600 }}>Thinking</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          overflowY: 'auto',
          paddingRight: '6px',
        }}
      >
        {transcripts.length === 0 && !currentPartial && !llmStreamingText ? (
          <div
            style={{
              margin: 'auto',
              color: '#5e8271',
              fontSize: '13px',
              textAlign: 'center',
              padding: '30px 20px',
              maxWidth: '360px',
            }}
          >
            Press <strong style={{ color: '#a7f3d0' }}>Start Voice Assistant</strong> and speak freely. Interrupt the assistant at any time to test real-time barge-in.
          </div>
        ) : (
          transcripts.map((item) => {
            const isUser = item.speaker === 'user';
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  gap: '4px',
                }}
              >
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: isUser
                      ? 'rgba(110, 231, 183, 0.12)'
                      : item.wasAborted
                      ? 'rgba(253, 230, 138, 0.08)'
                      : 'rgba(255, 255, 255, 0.04)',
                    border: isUser
                      ? '1px solid rgba(110, 231, 183, 0.25)'
                      : item.wasAborted
                      ? '1px solid rgba(253, 230, 138, 0.25)'
                      : '1px solid rgba(255, 255, 255, 0.06)',
                    color: item.wasAborted ? '#fef3c7' : '#f0fdf4',
                    fontSize: '14px',
                    lineHeight: '1.5',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    {isUser ? (
                      <User size={12} color="#a7f3d0" />
                    ) : item.wasAborted ? (
                      <AlertCircle size={12} color="#fde68a" />
                    ) : (
                      <Bot size={12} color="#6ee7b7" />
                    )}
                    <span
                      style={{
                        fontSize: '10px',
                        color: isUser ? '#a7c4b5' : '#7ba691',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {isUser ? 'You' : 'Assistant'}
                    </span>
                    {item.wasAborted && (
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: 'rgba(253, 230, 138, 0.15)',
                          color: '#fde68a',
                          fontWeight: 700,
                        }}
                      >
                        INTERRUPTED
                      </span>
                    )}
                  </div>
                  <div>{item.text}</div>
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#5e8271',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    padding: '0 4px',
                  }}
                >
                  {item.timestamp}
                </div>
              </div>
            );
          })
        )}

        {/* Interim In-flight User Speech */}
        {currentPartial && (
          <div
            style={{
              alignSelf: 'flex-end',
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: '16px 16px 4px 16px',
              background: 'rgba(110, 231, 183, 0.06)',
              border: '1px dashed rgba(110, 231, 183, 0.3)',
              color: '#a7f3d0',
              fontStyle: 'italic',
              fontSize: '13px',
            }}
          >
            <div style={{ fontSize: '10px', color: '#6ee7b7', fontWeight: 600, marginBottom: '2px' }}>
              Transcribing live...
            </div>
            "{currentPartial}"
          </div>
        )}

        {/* Streaming In-flight Assistant Tokens */}
        {llmStreamingText && (
          <div
            style={{
              alignSelf: 'flex-start',
              maxWidth: '85%',
              padding: '12px 16px',
              borderRadius: '16px 16px 16px 4px',
              background: 'rgba(52, 211, 153, 0.08)',
              border: '1px dashed rgba(52, 211, 153, 0.3)',
              color: '#ecfdf5',
              fontSize: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Bot size={12} color="#34d399" />
              <span style={{ fontSize: '10px', color: '#6ee7b7', fontWeight: 600 }}>Streaming Response</span>
            </div>
            <div>
              {llmStreamingText}
              <span
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '14px',
                  background: '#6ee7b7',
                  marginLeft: '4px',
                  verticalAlign: 'middle',
                }}
                className="animate-pulse-subtle"
              />
            </div>
          </div>
        )}
      </div>

      {/* Adaptive Endpointing Window Pill */}
      <div
        style={{
          marginTop: 'auto',
          padding: '8px 14px',
          borderRadius: '10px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(110, 231, 183, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#7ba691',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={13} color="#6ee7b7" />
          <span>Endpoint Window:</span>
          <span style={{ color: '#a7f3d0', fontWeight: 600 }}>
            {endpointingInfo ? `${endpointingInfo.windowType.toUpperCase()} (${endpointingInfo.windowMs}ms)` : 'ADAPTIVE'}
          </span>
        </div>
        <div style={{ fontSize: '10px', color: '#5e8271', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {endpointingInfo?.reason || 'Speech boundary detection active'}
        </div>
      </div>
    </div>
  );
};
