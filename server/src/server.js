import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { evaluateEndpointing, SHORT_WINDOW_MS, LONG_WINDOW_MS } from './endpointing.js';
import { DeepgramLiveStream } from './deepgram.js';
import { BookingSession } from './domain/booking.js';
import { streamLLMResponse } from './llm.js';
import { streamTTSResponse } from './tts.js';

dotenv.config();

const PORT = process.env.PORT || 8080;
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || '';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const isSetAndNonEmpty = (val) => Boolean(val && typeof val === 'string' && val.trim().length > 0);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    phase: '3',
    hasGroqKey: isSetAndNonEmpty(process.env.GROQ_API_KEY),
    hasDeepgramKey: isSetAndNonEmpty(process.env.DEEPGRAM_API_KEY),
    hasCartesiaKey: isSetAndNonEmpty(process.env.CARTESIA_API_KEY),
    hasElevenLabsKey: isSetAndNonEmpty(process.env.ELEVENLABS_API_KEY),
    hasOpenAIKey: isSetAndNonEmpty(process.env.OPENAI_API_KEY),
    hasAnthropicKey: isSetAndNonEmpty(process.env.ANTHROPIC_API_KEY),
    clientsConnected: wss?.clients?.size ?? 0,
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.get('/api/health', (req, res) => {
  res.redirect(307, '/health');
});

app.get('/', (req, res) => {
  res.json({
    service: 'Voice AI Orchestrator',
    status: 'running',
    healthEndpoint: '/health',
    wsEndpoint: `ws://${req.headers.host || 'localhost:' + PORT}`
  });
});

let connectionCounter = 0;

wss.on('connection', (ws, req) => {
  const clientId = ++connectionCounter;
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Client #${clientId} connected from ${clientIp}`);

  let activeTurnId = 1;
  let pcmFramesCount = 0;
  let totalBytesReceived = 0;
  let lastLogTime = Date.now();
  let conversationHistory = [];

  const bookingSession = new BookingSession(clientId);

  let accumulatedTranscript = '';
  let endpointingTimer = null;
  let activeDeepgramStream = null;
  let activeLLMAbortController = null;
  let activeTTSAbortController = null;

  function initDeepgramForTurn(turnId) {
    if (activeDeepgramStream) {
      activeDeepgramStream.abort();
      activeDeepgramStream = null;
    }

    if (!DEEPGRAM_API_KEY) {
      return;
    }

    activeDeepgramStream = new DeepgramLiveStream(DEEPGRAM_API_KEY, turnId, {
      onTranscript: (text, isFinal) => {
        handleIncomingTranscript(text, isFinal, turnId);
      },
      onUtteranceEnd: () => {
        handleUtteranceEnd(turnId);
      },
      onError: (err) => {
        console.error(`[Deepgram:Turn #${turnId}] Stream error:`, err.message);
      }
    });
  }

  function handleIncomingTranscript(text, isFinal, turn) {
    if (turn !== activeTurnId) {
      console.warn(`[ASR] Dropped late transcript for stale Turn #${turn} (Active is #${activeTurnId}): "${text}"`);
      return;
    }

    if (endpointingTimer) {
      clearTimeout(endpointingTimer);
      endpointingTimer = null;
    }

    if (isFinal) {
      accumulatedTranscript = accumulatedTranscript ? `${accumulatedTranscript} ${text}` : text;
    } else {
      accumulatedTranscript = text;
    }

    const decision = evaluateEndpointing(accumulatedTranscript);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'transcript',
        turnId: activeTurnId,
        text: accumulatedTranscript,
        chunk: text,
        isFinal,
        timestamp: Date.now(),
        endpointingDecision: decision
      }));
    }
  }

  function handleUtteranceEnd(turn) {
    if (turn !== activeTurnId) return;

    const decision = evaluateEndpointing(accumulatedTranscript);
    console.log(`[Endpointing:Turn #${turn}] UtteranceEnd triggered -> ${decision.windowType.toUpperCase()} (${decision.windowMs}ms) - ${decision.reason}`);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'endpointing_decision',
        turnId: activeTurnId,
        windowType: decision.windowType,
        windowMs: decision.windowMs,
        reason: decision.reason,
        timestamp: Date.now()
      }));
    }

    if (endpointingTimer) clearTimeout(endpointingTimer);
    endpointingTimer = setTimeout(() => {
      if (turn !== activeTurnId) return;

      const finalizedTranscript = accumulatedTranscript;
      console.log(`\n========================================`);
      console.log(`🎯 [TURN FINALIZED] Turn #${activeTurnId}`);
      console.log(`Transcript: "${finalizedTranscript}"`);
      console.log(`Endpoint: ${decision.windowType} (${decision.windowMs}ms)`);
      console.log(`========================================\n`);

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'turn_finalized',
          turnId: activeTurnId,
          transcript: finalizedTranscript,
          windowUsed: decision.windowType,
          reason: decision.reason,
          timestamp: Date.now()
        }));
      }

      endpointingTimer = null;

      triggerLLMForTurn(finalizedTranscript, activeTurnId);
    }, decision.windowMs);
  }

  function triggerLLMForTurn(transcript, turn) {
    if (turn !== activeTurnId) return;

    if (activeLLMAbortController) {
      activeLLMAbortController.abort();
      activeLLMAbortController = null;
    }

    const abortController = new AbortController();
    activeLLMAbortController = abortController;

    console.log(`[LLM:Turn #${turn}] 🧠 Starting streaming LLM generation for: "${transcript}"`);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'llm_start',
        turnId: turn,
        timestamp: Date.now()
      }));
    }

    streamLLMResponse({
      userTranscript: transcript,
      conversationHistory,
      bookingSession,
      turnId: turn,
      signal: abortController.signal,
      onToken: (token, tokenCount) => {
        if (turn !== activeTurnId || abortController.signal.aborted) return;

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'llm_chunk',
            turnId: turn,
            token,
            tokenCount,
            timestamp: Date.now()
          }));
        }
      },
      onComplete: (fullReply, committedSlots, tokenCount) => {
        if (turn !== activeTurnId || abortController.signal.aborted) return;
        activeLLMAbortController = null;

        // Commit turn to multi-turn conversation memory
        conversationHistory.push({ role: 'user', content: transcript });
        conversationHistory.push({ role: 'assistant', content: fullReply });

        console.log(`[LLM:Turn #${turn}] Complete. History length: ${conversationHistory.length}. Slots:`, committedSlots);

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'llm_complete',
            turnId: turn,
            reply: fullReply,
            slots: committedSlots,
            tokenCount,
            timestamp: Date.now()
          }));

          ws.send(JSON.stringify({
            type: 'slots_updated',
            turnId: turn,
            slots: committedSlots,
            isComplete: bookingSession.isComplete(),
            timestamp: Date.now()
          }));
        }

        // Trigger Phase 3 Streaming TTS output
        triggerTTSForTurn(fullReply, turn);
      },
      onError: (err) => {
        console.error(`[LLM:Turn #${turn}] Error:`, err.message);
      }
    });
  }

  function triggerTTSForTurn(text, turn) {
    if (turn !== activeTurnId) return;

    if (activeTTSAbortController) {
      activeTTSAbortController.abort();
      activeTTSAbortController = null;
    }

    const ttsAbortController = new AbortController();
    activeTTSAbortController = ttsAbortController;

    console.log(`[TTS:Turn #${turn}] 🔊 Starting streaming TTS audio synthesis for: "${text.slice(0, 40)}..."`);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'tts_start',
        turnId: turn,
        text,
        timestamp: Date.now()
      }));
    }

    streamTTSResponse({
      text,
      turnId: turn,
      signal: ttsAbortController.signal,
      onAudioChunk: ({ pcmBase64, chunkIndex, durationSec, sampleRate }) => {
        if (turn !== activeTurnId || ttsAbortController.signal.aborted) {
          console.log(`[TTS:Turn #${turn}] Dropped generated chunk #${chunkIndex} (stale turn or aborted)`);
          return;
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'tts_chunk',
            turnId: turn,
            audioBase64: pcmBase64,
            chunkIndex,
            durationSec,
            sampleRate,
            timestamp: Date.now()
          }));
        }
      },
      onComplete: (totalChunks) => {
        if (turn !== activeTurnId || ttsAbortController.signal.aborted) return;
        activeTTSAbortController = null;

        console.log(`[TTS:Turn #${turn}] ✅ TTS playback queue stream fully transmitted (${totalChunks} chunks)\n`);

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'tts_complete',
            turnId: turn,
            totalChunks,
            timestamp: Date.now()
          }));
        }
      },
      onError: (err) => {
        console.error(`[TTS:Turn #${turn}] Error:`, err.message);
      }
    });
  }

  initDeepgramForTurn(activeTurnId);

  ws.send(JSON.stringify({
    type: 'session_init',
    clientId,
    turnId: activeTurnId,
    hasDeepgramKey: Boolean(DEEPGRAM_API_KEY),
    hasOpenAIKey: Boolean(OPENAI_API_KEY || GROQ_API_KEY),
    hasCartesiaKey: Boolean(CARTESIA_API_KEY || ELEVENLABS_API_KEY),
    slots: bookingSession.getSlots(),
    message: 'Phase 3 Full End-to-End Loop Active'
  }));

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      pcmFramesCount++;
      totalBytesReceived += data.length;

      if (activeDeepgramStream) {
        activeDeepgramStream.sendAudio(data);
      }

      const now = Date.now();
      if (now - lastLogTime >= 2000) {
        lastLogTime = now;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'audio_telemetry',
            framesCount: pcmFramesCount,
            bytesReceived: totalBytesReceived,
            turnId: activeTurnId
          }));
        }
      }
      return;
    }

    try {
      const msg = JSON.parse(data.toString());
      switch (msg.type) {
        case 'barge_in': {
          const { turnId, stopLatencyMs } = msg;

          // ==========================================
          // 🚀 THE 3-WAY ABORT FAN-OUT (Same Tick)
          // ==========================================
          // 1. Abort active TTS stream
          if (activeTTSAbortController) {
            console.log(`[Abort Fan-out] 🛑 1/3 Aborting active TTS stream for Turn #${turnId}`);
            activeTTSAbortController.abort();
            activeTTSAbortController = null;
          }

          // 2. Abort active LLM generation
          if (activeLLMAbortController) {
            console.log(`[Abort Fan-out] 🛑 2/3 Aborting active LLM call for Turn #${turnId}`);
            activeLLMAbortController.abort();
            activeLLMAbortController = null;
          }
          bookingSession.discardStaged();

          // 3. Abort active ASR stream
          if (activeDeepgramStream) {
            console.log(`[Abort Fan-out] 🛑 3/3 Aborting active Deepgram stream for Turn #${turnId}`);
            activeDeepgramStream.abort();
            activeDeepgramStream = null;
          }
          if (endpointingTimer) {
            clearTimeout(endpointingTimer);
            endpointingTimer = null;
          }

          const previousTurn = turnId;
          activeTurnId = turnId + 1;
          accumulatedTranscript = '';

          console.log(`\n========================================`);
          console.log(`🚨 [BARGE-IN] Client #${clientId} interrupted Turn #${previousTurn} ➔ Turn #${activeTurnId}`);
          console.log(`Stop Latency: ${stopLatencyMs ?? 'N/A'} ms`);
          console.log(`3-Way Abort Fan-out: ASR + LLM + TTS all aborted in same tick.`);
          console.log(`Preserved Slots:`, bookingSession.getSlots());
          console.log(`========================================\n`);

          initDeepgramForTurn(activeTurnId);

          ws.send(JSON.stringify({
            type: 'barge_in_ack',
            previousTurnId: previousTurn,
            newTurnId: activeTurnId,
            preservedSlots: bookingSession.getSlots(),
            serverTimestamp: Date.now(),
            stopLatencyMs
          }));
          break;
        }

        case 'new_turn': {
          if (activeTTSAbortController) { activeTTSAbortController.abort(); activeTTSAbortController = null; }
          if (activeLLMAbortController) { activeLLMAbortController.abort(); activeLLMAbortController = null; }
          bookingSession.discardStaged();
          if (endpointingTimer) { clearTimeout(endpointingTimer); endpointingTimer = null; }

          activeTurnId = msg.turnId || (activeTurnId + 1);
          accumulatedTranscript = '';
          initDeepgramForTurn(activeTurnId);

          ws.send(JSON.stringify({
            type: 'turn_ack',
            turnId: activeTurnId
          }));
          break;
        }

        case 'simulate_speech': {
          const { words, trailingOff } = msg;
          const turn = activeTurnId;
          console.log(`[SimulateSpeech] Turn #${turn}: "${words.join(' ')}" (trailingOff: ${trailingOff})`);

          let partialWords = [];
          words.forEach((word, idx) => {
            setTimeout(() => {
              if (turn !== activeTurnId) return;
              partialWords.push(word);
              const isLast = idx === words.length - 1;
              handleIncomingTranscript(partialWords.join(' '), isLast, turn);

              if (isLast) {
                setTimeout(() => {
                  if (turn === activeTurnId) {
                    handleUtteranceEnd(turn);
                  }
                }, 200);
              }
            }, idx * 100);
          });
          break;
        }

        case 'reset_booking': {
          bookingSession.reset();
          conversationHistory = [];
          console.log(`[Booking] Reset slots and conversation history for Client #${clientId}`);
          ws.send(JSON.stringify({
            type: 'slots_updated',
            turnId: activeTurnId,
            slots: bookingSession.getSlots(),
            isComplete: false
          }));
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({
            type: 'pong',
            clientTimestamp: msg.timestamp,
            serverTimestamp: Date.now()
          }));
          break;
        }

        default:
          console.log(`[WS:Message] Message from client #${clientId}:`, msg.type);
      }
    } catch (err) {
      console.error(`[WS:Error] Message parse error:`, err.message);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[WS] Client #${clientId} disconnected. Total frames: ${pcmFramesCount}`);
    if (activeTTSAbortController) activeTTSAbortController.abort();
    if (activeLLMAbortController) activeLLMAbortController.abort();
    if (endpointingTimer) clearTimeout(endpointingTimer);
    if (activeDeepgramStream) activeDeepgramStream.abort();
  });

  ws.on('error', (err) => {
    console.error(`[WS:Error] Socket error:`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Voice AI Server running on http://localhost:${PORT}`);
  console.log(`🎙️  WebSocket Server listening on ws://localhost:${PORT}`);
  console.log(`⚡ Phase 3 Streaming TTS & Full End-to-End Loop Active\n`);
});
