/**
 * AudioCaptureProcessor - Web Audio Worklet for capturing microphone audio
 * Downsamples from AudioContext sampleRate to 16,000 Hz 16-bit Linear PCM
 * and sends transferable ArrayBuffers to the main thread.
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.bufferSize = 512; // ~32ms chunks at 16kHz
    this.outputBuffer = new Int16Array(this.bufferSize);
    this.outputIndex = 0;
    this.resampleRatio = currentFrame ? 1 : 1; // calculated on first process
    this.sourceSampleRate = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    // Detect actual sample rate if not set
    if (!this.sourceSampleRate) {
      // In AudioWorkletGlobalScope, sampleRate is a global variable
      this.sourceSampleRate = sampleRate;
      this.resampleRatio = this.sourceSampleRate / this.targetSampleRate;
    }

    if (this.resampleRatio === 1) {
      // Direct 16kHz capture
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        this.outputBuffer[this.outputIndex++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

        if (this.outputIndex >= this.bufferSize) {
          this.flush();
        }
      }
    } else {
      // Simple linear downsampling from sourceSampleRate to 16kHz
      const step = this.resampleRatio;
      for (let i = 0; i < channelData.length; i += step) {
        const index = Math.floor(i);
        const s = Math.max(-1, Math.min(1, channelData[index]));
        this.outputBuffer[this.outputIndex++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

        if (this.outputIndex >= this.bufferSize) {
          this.flush();
        }
      }
    }

    return true;
  }

  flush() {
    // Send copy of buffer to main thread
    const chunk = new Int16Array(this.outputBuffer);
    this.port.postMessage(chunk.buffer, [chunk.buffer]);
    this.outputIndex = 0;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
