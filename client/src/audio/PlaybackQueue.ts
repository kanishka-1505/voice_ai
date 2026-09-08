/**
 * PlaybackQueue - Web Audio API queue manager with hard-stop barge-in primitive
 *
 * Requirements:
 * 1. Sequential, seamless scheduling of AudioBuffer chunks on AudioContext timeline.
 * 2. Hard-stop primitive: immediate .stop(0) and .disconnect() on all active/scheduled nodes.
 * 3. Strict turnId tagging: any chunk arriving with a stale turnId is dropped immediately.
 * 4. Zero orphaned audio: flushed queue never bleeds into new turns.
 * 5. Memory leak prevention: onended listeners cleared, nodes unreferenced.
 */

export interface EnqueuedChunk {
  id: string;
  turnId: number;
  buffer: AudioBuffer;
  duration: number;
}

export type PlaybackStateListener = (isPlaying: boolean, activeCount: number) => void;
export type StaleDropListener = (rejectedTurnId: number, currentTurnId: number) => void;

export class PlaybackQueue {
  private audioContext: AudioContext;
  private masterGain: GainNode;
  private activeNodes: Set<AudioBufferSourceNode> = new Set();
  private nextPlayTime: number = 0;
  private currentTurnId: number = 1;
  private stateListeners: Set<PlaybackStateListener> = new Set();
  private staleDropListeners: Set<StaleDropListener> = new Set();

  constructor(audioContext?: AudioContext) {
    this.audioContext = audioContext || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.audioContext.destination);
  }

  public getAudioContext(): AudioContext {
    return this.audioContext;
  }

  public getCurrentTurnId(): number {
    return this.currentTurnId;
  }

  public setTurnId(turnId: number) {
    this.currentTurnId = turnId;
  }

  public subscribeState(listener: PlaybackStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.activeNodes.size > 0, this.activeNodes.size);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeStaleDrop(listener: StaleDropListener): () => void {
    this.staleDropListeners.add(listener);
    return () => this.staleDropListeners.delete(listener);
  }

  private notifyState() {
    const isPlaying = this.activeNodes.size > 0;
    const count = this.activeNodes.size;
    this.stateListeners.forEach((l) => l(isPlaying, count));
  }

  /**
   * Enqueue an AudioBuffer chunk tagged with turnId.
   * If turnId does not match currentTurnId, the chunk is dropped immediately.
   */
  public enqueue(buffer: AudioBuffer, turnId: number): boolean {
    if (turnId !== this.currentTurnId) {
      console.warn(`[PlaybackQueue] Stale chunk dropped! Chunk turnId: ${turnId} != Active turnId: ${this.currentTurnId}`);
      this.staleDropListeners.forEach((l) => l(turnId, this.currentTurnId));
      return false;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);

    const now = this.audioContext.currentTime;
    const startTime = Math.max(now, this.nextPlayTime);
    this.nextPlayTime = startTime + buffer.duration;

    this.activeNodes.add(source);
    this.notifyState();

    source.onended = () => {
      this.activeNodes.delete(source);
      try {
        source.disconnect();
      } catch {
        // disconnected
      }
      this.notifyState();
    };

    source.start(startTime);
    return true;
  }

  /**
   * Enqueue raw 16-bit linear PCM base64 bytes into the playback queue, tagged with turnId.
   */
  public enqueueRawPcmBase64(base64: string, turnId: number, sampleRate: number = 16000): boolean {
    if (turnId !== this.currentTurnId) {
      console.warn(`[PlaybackQueue] Stale TTS audio chunk rejected! Turn #${turnId} != Active #${this.currentTurnId}`);
      this.staleDropListeners.forEach((l) => l(turnId, this.currentTurnId));
      return false;
    }

    try {
      const binaryString = window.atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, sampleRate);
      audioBuffer.copyToChannel(float32Array, 0);

      return this.enqueue(audioBuffer, turnId);
    } catch (err: any) {
      console.error('[PlaybackQueue] Failed to decode PCM base64 chunk:', err);
      return false;
    }
  }

  /**
   * The Hard-Stop Primitive:
   * 1. Stops all currently playing and scheduled AudioBufferSourceNodes immediately (no fade).
   * 2. Clears onended handlers to prevent cascading state bugs.
   * 3. Disconnects nodes immediately.
   * 4. Resets timeline scheduling cursor.
   * 5. Measures and returns the execution duration in ms.
   */
  public hardStop(): number {
    const t0 = performance.now();

    for (const node of this.activeNodes) {
      try {
        node.onended = null;
        node.stop(0);
        node.disconnect();
      } catch {
        // Node might have already finished
      }
    }

    this.activeNodes.clear();
    this.nextPlayTime = 0;

    const stopLatencyMs = performance.now() - t0;
    this.notifyState();

    return stopLatencyMs;
  }

  public isPlaying(): boolean {
    return this.activeNodes.size > 0;
  }

  public getActiveNodeCount(): number {
    return this.activeNodes.size;
  }
}
