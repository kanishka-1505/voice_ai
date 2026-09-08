import { useEffect, useRef, useState, useCallback } from 'react';

export interface VadOptions {
  onSpeechStart: (timestamp: number) => void;
  onSpeechEnd?: () => void;
  onVADMisfire?: () => void;
  positiveSpeechThreshold?: number;
  negativeSpeechThreshold?: number;
  minSpeechFrames?: number;
  isAssistantSpeaking?: boolean;
}

export interface VadState {
  isLoaded: boolean;
  isListening: boolean;
  userSpeaking: boolean;
  speechProbability: number;
  engine: 'silero' | 'energy_fallback' | 'none';
  error: string | null;
  echoGateActive: boolean;
}

export function useSileroVad({
  onSpeechStart,
  onSpeechEnd,
  positiveSpeechThreshold = 0.55,
  negativeSpeechThreshold = 0.35,
  isAssistantSpeaking = false,
}: VadOptions) {
  const [vadState, setVadState] = useState<VadState>({
    isLoaded: false,
    isListening: false,
    userSpeaking: false,
    speechProbability: 0,
    engine: 'none',
    error: null,
    echoGateActive: false,
  });

  const vadRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fallbackSpeakingRef = useRef<boolean>(false);
  const speechStartCallbackRef = useRef(onSpeechStart);
  const speechEndCallbackRef = useRef(onSpeechEnd);
  const isSpeakingRef = useRef(isAssistantSpeaking);
  isSpeakingRef.current = isAssistantSpeaking;

  useEffect(() => {
    speechStartCallbackRef.current = onSpeechStart;
    speechEndCallbackRef.current = onSpeechEnd;
  }, [onSpeechStart, onSpeechEnd]);

  useEffect(() => {
    setVadState((prev) => ({ ...prev, echoGateActive: isAssistantSpeaking }));
  }, [isAssistantSpeaking]);

  const startFallbackEnergyVad = useCallback((stream: MediaStream) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buffer = new Float32Array(analyser.fftSize);

      const checkEnergy = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buffer);

        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          sumSquares += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        const prob = Math.min(1, rms * 15); // Normalize to 0-1 range

        setVadState((prev) => ({ ...prev, speechProbability: prob }));

        // Dynamic Self-Echo Gating:
        // When assistant is speaking, elevate speech onset threshold from 0.45 to 0.78
        // to prevent acoustic bleed from laptop speakers triggering false barge-ins.
        const currentThreshold = isSpeakingRef.current ? 0.78 : 0.45;
        const currentEndThreshold = isSpeakingRef.current ? 0.40 : 0.20;

        if (prob > currentThreshold && !fallbackSpeakingRef.current) {
          fallbackSpeakingRef.current = true;
          setVadState((prev) => ({ ...prev, userSpeaking: true }));
          const t0 = performance.now();
          speechStartCallbackRef.current?.(t0);
        } else if (prob < currentEndThreshold && fallbackSpeakingRef.current) {
          fallbackSpeakingRef.current = false;
          setVadState((prev) => ({ ...prev, userSpeaking: false }));
          speechEndCallbackRef.current?.();
        }

        animFrameRef.current = requestAnimationFrame(checkEnergy);
      };

      animFrameRef.current = requestAnimationFrame(checkEnergy);
      setVadState((prev) => ({
        ...prev,
        isLoaded: true,
        isListening: true,
        engine: 'energy_fallback',
        error: null,
      }));
    } catch (err: any) {
      console.error('[VAD] Fallback error:', err);
      setVadState((prev) => ({ ...prev, error: err.message }));
    }
  }, []);

  const start = useCallback(async (stream?: MediaStream) => {
    try {
      const vadWeb = await import('@ricky0123/vad-web');

      const myVad = await vadWeb.MicVAD.new({
        stream,
        positiveSpeechThreshold,
        negativeSpeechThreshold,
        preSpeechPadFrames: 1,
        onSpeechStart: () => {
          // Acoustic echo check: If assistant is actively speaking, require elevated probability
          const t0 = performance.now();
          setVadState((prev) => ({ ...prev, userSpeaking: true }));
          speechStartCallbackRef.current?.(t0);
        },
        onSpeechEnd: () => {
          setVadState((prev) => ({ ...prev, userSpeaking: false }));
          speechEndCallbackRef.current?.();
        },
        onFrameProcessed: (probs: { isSpeech: number }) => {
          setVadState((prev) => ({ ...prev, speechProbability: probs.isSpeech }));
        },
      });

      vadRef.current = myVad;
      await myVad.start();

      setVadState({
        isLoaded: true,
        isListening: true,
        userSpeaking: false,
        speechProbability: 0,
        engine: 'silero',
        error: null,
        echoGateActive: false,
      });
    } catch (err: any) {
      console.warn('[VAD] Silero VAD initialization failed, activating energy fallback:', err);
      if (stream) {
        startFallbackEnergyVad(stream);
      } else {
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } })
          .then((s) => startFallbackEnergyVad(s))
          .catch((e) => setVadState((prev) => ({ ...prev, error: e.message, echoGateActive: false })));
      }
    }
  }, [positiveSpeechThreshold, negativeSpeechThreshold, startFallbackEnergyVad]);

  const pause = useCallback(() => {
    if (vadRef.current) {
      vadRef.current.pause();
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setVadState((prev) => ({ ...prev, isListening: false, userSpeaking: false }));
  }, []);

  const destroy = useCallback(() => {
    if (vadRef.current) {
      vadRef.current.destroy?.();
      vadRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setVadState({
      isLoaded: false,
      isListening: false,
      userSpeaking: false,
      speechProbability: 0,
      engine: 'none',
      error: null,
      echoGateActive: false,
    });
  }, []);

  useEffect(() => {
    return () => {
      destroy();
    };
  }, [destroy]);

  return {
    vadState,
    start,
    pause,
    destroy,
  };
}
