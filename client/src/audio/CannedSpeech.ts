/**
 * CannedSpeech - Synthesizes realistic, structured speech audio buffers
 * for feeding the AudioBufferSourceNode playback queue in Phase 0.
 *
 * Provides a conversational assistant utterance split into 4 successive chunks (~10s total):
 * Chunk 1: "Welcome to Bella Vista Italian Kitchen." (~2.5s)
 * Chunk 2: "I'd be glad to help you book a table today." (~2.5s)
 * Chunk 3: "How many guests will be in your party this evening?" (~2.5s)
 * Chunk 4: "And what time would you prefer for your reservation?" (~2.5s)
 */

export interface SpeechChunk {
  label: string;
  buffer: AudioBuffer;
}

export function createAssistantSpeechChunks(ctx: AudioContext): SpeechChunk[] {
  const sampleRate = ctx.sampleRate;

  const sentences = [
    { text: "Welcome to Bella Vista Italian Kitchen.", duration: 2.6, basePitch: 145 },
    { text: "I'd be delighted to help you book a table today.", duration: 2.7, basePitch: 155 },
    { text: "How many guests will be in your party this evening?", duration: 2.6, basePitch: 150 },
    { text: "And what time would you prefer for your reservation?", duration: 2.8, basePitch: 140 }
  ];

  return sentences.map((item) => {
    const totalSamples = Math.floor(sampleRate * item.duration);
    const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);

    // Formant parameters for speech-like vocal tract resonance
    const f1 = 650;  // First formant (Hz)
    const f2 = 1250; // Second formant (Hz)
    const f3 = 2400; // Third formant (Hz)

    // Syllable rhythm (~4 syllables per second)
    const syllableRate = 4.2;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;

      // Syllable envelope (rise & decay of vocal pulses)
      const syllableEnv = Math.pow(Math.sin(Math.PI * (t * syllableRate) % Math.PI), 1.5);

      // Pitch inflection over the sentence (slight drop at end of sentence)
      const pitchDrift = item.basePitch * (1 - 0.15 * (t / item.duration));

      // Human glottal pulse source (sawtooth / impulse train)
      const glottalPhase = (t * pitchDrift) % 1.0;
      const glottalSource = glottalPhase < 0.1 ? Math.sin(glottalPhase * 10 * Math.PI) : 0;

      // Vocal tract resonance filter simulation
      const formant1 = Math.sin(2 * Math.PI * f1 * t) * 0.45;
      const formant2 = Math.sin(2 * Math.PI * f2 * t) * 0.3;
      const formant3 = Math.sin(2 * Math.PI * f3 * t) * 0.15;
      const resonance = formant1 + formant2 + formant3;

      // Soft white noise component simulating fricatives/consonants
      const noise = (Math.random() * 2 - 1) * 0.08 * (Math.sin(t * 18) > 0.6 ? 1 : 0.1);

      // Edge fading to prevent pops
      let edgeFade = 1.0;
      const fadeTime = 0.04;
      if (t < fadeTime) edgeFade = t / fadeTime;
      else if (t > item.duration - fadeTime) edgeFade = (item.duration - t) / fadeTime;

      // Composite speech sample
      const sample = (glottalSource * 0.5 + resonance * 0.4 + noise) * syllableEnv * edgeFade * 0.4;
      data[i] = sample;
    }

    return {
      label: item.text,
      buffer
    };
  });
}
