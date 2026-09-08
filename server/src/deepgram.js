import WebSocket from 'ws';

/**
 * DeepgramLiveStream manages a live streaming WebSocket to Deepgram for a specific client turn.
 */
export class DeepgramLiveStream {
  /**
   * @param {string} apiKey
   * @param {number} turnId
   * @param {object} callbacks
   * @param {(text: string, isFinal: boolean) => void} callbacks.onTranscript
   * @param {() => void} callbacks.onUtteranceEnd
   * @param {(err: any) => void} callbacks.onError
   */
  constructor(apiKey, turnId, { onTranscript, onUtteranceEnd, onError }) {
    this.apiKey = apiKey;
    this.turnId = turnId;
    this.onTranscript = onTranscript;
    this.onUtteranceEnd = onUtteranceEnd;
    this.onError = onError;
    this.isClosed = false;
    this.ws = null;
    this.connect();
  }

  connect() {
    if (!this.apiKey) return;

    const url = 'wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&interim_results=true&endpointing=300&utterance_end_ms=1000';
    try {
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${this.apiKey}`
        }
      });

      this.ws.on('open', () => {
        console.log(`[Deepgram:Turn #${this.turnId}] 🌐 LIVE OUTBOUND WEBSOCKET: Connected to wss://api.deepgram.com/v1/listen (Deepgram Live ASR)`);
      });

      this.ws.on('message', (raw) => {
        if (this.isClosed) return;
        try {
          const data = JSON.parse(raw.toString());

          // Handle speech transcription results
          if (data.channel?.alternatives?.[0]) {
            const alt = data.channel.alternatives[0];
            const transcript = alt.transcript || '';
            const isFinal = Boolean(data.is_final);

            if (transcript.trim().length > 0) {
              this.onTranscript(transcript, isFinal);
            }
          }

          // Handle Deepgram native UtteranceEnd event
          if (data.type === 'UtteranceEnd') {
            console.log(`[Deepgram:Turn #${this.turnId}] Native UtteranceEnd signal received`);
            this.onUtteranceEnd();
          }
        } catch (err) {
          console.error(`[Deepgram:Turn #${this.turnId}] Error parsing message:`, err.message);
        }
      });

      this.ws.on('error', (err) => {
        if (this.isClosed) return;
        console.error(`[Deepgram:Turn #${this.turnId}] Socket error:`, err.message);
        this.onError?.(err);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[Deepgram:Turn #${this.turnId}] Stream closed (code: ${code})`);
      });
    } catch (err) {
      console.error(`[Deepgram:Turn #${this.turnId}] Failed to initialize socket:`, err.message);
      this.onError?.(err);
    }
  }

  /**
   * Send a raw PCM audio chunk to Deepgram
   * @param {Buffer} pcmBuffer
   */
  sendAudio(pcmBuffer) {
    if (this.isClosed || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(pcmBuffer);
  }

  /**
   * Close the Deepgram stream immediately and cancel upstream processing
   */
  abort() {
    this.isClosed = true;
    if (this.ws) {
      try {
        // Send close frame and terminate
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'CloseStream' }));
        }
        this.ws.close();
      } catch (err) {
        // ignore on abort
      }
      this.ws = null;
    }
    console.log(`[Deepgram:Turn #${this.turnId}] Upstream stream aborted cleanly`);
  }
}
