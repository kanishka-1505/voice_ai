/**
 * Streaming TTS Adapter with AbortController Mid-Utterance Cancellation
 *
 * Requirements:
 * 1. Incrementally streams turnId-tagged 16kHz audio chunks.
 * 2. Instant AbortController cancellation: halts generation and closes network stream mid-stream.
 * 3. Supports Cartesia / ElevenLabs API when keys are configured, with embedded chunked audio streaming fallback.
 */

/**
 * Procedurally synthesizes a 16kHz 16-bit PCM audio chunk for speech simulation.
 * @param {string} clause
 * @param {number} durationSec
 * @returns {Buffer} 16kHz 16-bit Linear PCM Buffer
 */
function synthesizePcmChunk(clause, durationSec = 0.4) {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = Buffer.alloc(numSamples * 2); // 2 bytes per sample (Int16)

  const f0 = 140; // Base pitch (Hz)
  const f1 = 650; // First formant (Hz)
  const f2 = 1200; // Second formant (Hz)

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const pulse = (t * f0) % 1.0 < 0.15 ? Math.sin((t * f0 % 1.0) * 8 * Math.PI) : 0;
    const resonance = Math.sin(2 * Math.PI * f1 * t) * 0.4 + Math.sin(2 * Math.PI * f2 * t) * 0.25;
    const syllableEnv = Math.sin((t * 4 * Math.PI) % Math.PI);
    const sample = (pulse * 0.5 + resonance * 0.4) * syllableEnv * 0.35;

    const clamped = Math.max(-1, Math.min(1, sample));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    buffer.writeInt16LE(int16, i * 2);
  }

  return buffer;
}

export async function streamTTSResponse({
  text,
  turnId,
  signal,
  onAudioChunk,
  onComplete,
  onError
}) {
  const cartesiaKey = process.env.CARTESIA_API_KEY;
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

  // --- Real Cartesia Streaming TTS Path if CARTESIA_API_KEY is configured ---
  if (cartesiaKey) {
    try {
      console.log(`[TTS:Turn #${turnId}] 🌐 LIVE OUTBOUND REQUEST: POST https://api.cartesia.ai/tts/bytes (Cartesia Sonic)`);
      const response = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': cartesiaKey,
          'Cartesia-Version': '2024-06-10'
        },
        signal,
        body: JSON.stringify({
          model_id: 'sonic-2',
          transcript: text,
          voice: {
            mode: 'id',
            id: '79a125e8-cd45-4c13-8a67-188112f4dd22'
          },
          output_format: {
            container: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: 16000
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Cartesia HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      let chunkIndex = 0;

      while (true) {
        if (signal.aborted) {
          reader.cancel().catch(() => {});
          console.log(`[TTS:Turn #${turnId}] 🛑 Cartesia TTS stream aborted mid-utterance. Live connection closed.`);
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        if (value && value.length > 0) {
          chunkIndex++;
          const pcmBase64 = Buffer.from(value).toString('base64');
          const durationSec = value.length / (16000 * 2);
          onAudioChunk({
            pcmBase64,
            chunkIndex,
            durationSec,
            sampleRate: 16000
          });

          // Pace streaming to match conversational audio playback rate (prevents socket buffer flooding)
          await new Promise(resolve => setTimeout(resolve, Math.max(30, Math.floor(durationSec * 500))));
        }
      }

      if (!signal.aborted) {
        console.log(`[TTS:Turn #${turnId}] ✅ Cartesia streaming completed (${chunkIndex} chunks).`);
        onComplete(chunkIndex);
      }
      return;
    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) {
        console.log(`[TTS:Turn #${turnId}] 🛑 Cartesia request cancelled cleanly via AbortController.`);
        return;
      }
      console.warn(`[TTS:Turn #${turnId}] Cartesia call failed, falling back:`, err.message);
    }
  }

  // --- Real ElevenLabs Streaming TTS Path if ELEVENLABS_API_KEY is configured ---
  if (elevenLabsKey) {
    try {
      const voiceId = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
      console.log(`[TTS:Turn #${turnId}] 🌐 LIVE OUTBOUND REQUEST: POST https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream (ElevenLabs)`);
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_16000`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsKey
        },
        signal,
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5'
        })
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      let chunkIndex = 0;

      while (true) {
        if (signal.aborted) {
          reader.cancel().catch(() => {});
          console.log(`[TTS:Turn #${turnId}] 🛑 ElevenLabs TTS stream aborted mid-utterance. Live connection closed.`);
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        if (value && value.length > 0) {
          chunkIndex++;
          const pcmBase64 = Buffer.from(value).toString('base64');
          const durationSec = value.length / (16000 * 2);
          onAudioChunk({
            pcmBase64,
            chunkIndex,
            durationSec,
            sampleRate: 16000
          });

          // Pace streaming to match conversational audio playback rate (prevents socket buffer flooding)
          await new Promise(resolve => setTimeout(resolve, Math.max(30, Math.floor(durationSec * 500))));
        }
      }

      if (!signal.aborted) {
        console.log(`[TTS:Turn #${turnId}] ✅ ElevenLabs streaming completed (${chunkIndex} chunks).`);
        onComplete(chunkIndex);
      }
      return;
    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) {
        console.log(`[TTS:Turn #${turnId}] 🛑 ElevenLabs request cancelled cleanly via AbortController.`);
        return;
      }
      console.warn(`[TTS:Turn #${turnId}] ElevenLabs call failed, falling back to embedded streaming audio:`, err.message);
    }
  }

  // --- Embedded High-Performance Streaming Audio Engine (Offline / Local Mode) ---
  // Split text into natural conversational clauses (~4-6 words each)
  const words = text.split(' ');
  const clauses = [];
  let currentClause = [];

  for (let i = 0; i < words.length; i++) {
    currentClause.push(words[i]);
    if (currentClause.length >= 4 || i === words.length - 1 || words[i].endsWith(',') || words[i].endsWith('.')) {
      clauses.push(currentClause.join(' '));
      currentClause = [];
    }
  }

  let chunkIndex = 0;
  let currentIndex = 0;
  let isCancelled = false;

  const onAbort = () => {
    isCancelled = true;
    console.log(`[TTS:Turn #${turnId}] 🛑 TTS stream aborted mid-utterance. Chunk count frozen at ${chunkIndex}.`);
  };

  signal.addEventListener('abort', onAbort, { once: true });

  function emitNextChunk() {
    if (signal.aborted || isCancelled) {
      return;
    }

    if (currentIndex >= clauses.length) {
      signal.removeEventListener('abort', onAbort);
      console.log(`[TTS:Turn #${turnId}] ✅ TTS audio streaming complete (${chunkIndex} chunks).`);
      onComplete(chunkIndex);
      return;
    }

    const clause = clauses[currentIndex];
    const chunkDuration = 0.35 + (clause.split(' ').length * 0.08);
    const pcmBuffer = synthesizePcmChunk(clause, chunkDuration);
    chunkIndex++;
    currentIndex++;

    onAudioChunk({
      pcmBase64: pcmBuffer.toString('base64'),
      chunkIndex,
      clause,
      durationSec: chunkDuration,
      sampleRate: 16000
    });

    // Schedule next chunk at natural cadence (~180ms intervals)
    setTimeout(emitNextChunk, 200);
  }

  // Initial time-to-first-audio latency (~80ms)
  setTimeout(() => {
    if (!signal.aborted && !isCancelled) {
      emitNextChunk();
    }
  }, 80);
}
