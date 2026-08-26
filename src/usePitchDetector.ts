import { useState, useEffect, useRef, useCallback } from 'react';
import { detectPitch } from './pitchDetection';
import type { PitchResult } from './pitchDetection';

const FFT_SIZE = 2048;
const WINDOW_MS = 200;   // wider window reduces bouncing between notes
const HOLD_MS = 500;     // keep displaying the last note for this long after signal drops

interface TimestampedResult {
  ts: number;
  result: PitchResult;
}

/** Returns the most common note in the window, with median cents/freq for that note. */
function modeInWindow(window: TimestampedResult[]): PitchResult | null {
  if (window.length === 0) return null;

  const counts = new Map<string, TimestampedResult[]>();
  for (const entry of window) {
    const key = `${entry.result.note}${entry.result.octave}`;
    const bucket = counts.get(key) ?? [];
    bucket.push(entry);
    counts.set(key, bucket);
  }

  let best: TimestampedResult[] = [];
  for (const bucket of counts.values()) {
    if (bucket.length > best.length) best = bucket;
  }

  // Require the winning note to appear in at least 45% of frames to suppress noise
  if (best.length / window.length < 0.45) return null;

  const sorted = [...best].sort((a, b) => a.result.cents - b.result.cents);
  const mid = sorted[Math.floor(sorted.length / 2)].result;
  const avgFreq = Math.round((best.reduce((s, e) => s + e.result.frequency, 0) / best.length) * 10) / 10;

  return { ...mid, frequency: avgFreq };
}

export function usePitchDetector() {
  const [pitch, setPitch] = useState<PitchResult | null>(null);
  const [rmsDb, setRmsDb] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(FFT_SIZE));
  const windowRef = useRef<TimestampedResult[]>([]);
  const lastPitchRef = useRef<PitchResult | null>(null);
  const lastDetectTimeRef = useRef<number>(0);

  const tick = useCallback(() => {
    if (!analyserRef.current) return;
    analyserRef.current.getFloatTimeDomainData(bufferRef.current);

    // Compute live RMS level for dB display
    const buf = bufferRef.current;
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / buf.length);
    setRmsDb(rms > 1e-10 ? Math.round(20 * Math.log10(rms)) : null);

    const result = detectPitch(bufferRef.current, audioCtxRef.current!.sampleRate);

    const now = performance.now();
    if (result) {
      windowRef.current.push({ ts: now, result });
      lastDetectTimeRef.current = now;
    }
    windowRef.current = windowRef.current.filter(e => now - e.ts <= WINDOW_MS);

    const modeResult = modeInWindow(windowRef.current);
    if (modeResult) {
      lastPitchRef.current = modeResult;
      setPitch(modeResult);
    } else if (now - lastDetectTimeRef.current < HOLD_MS) {
      // Hold the last detected note while the string is still ringing but signal is weak
      setPitch(lastPitchRef.current);
    } else {
      setPitch(null);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    try {
      // Disable mobile audio processing that attenuates low-frequency strings (E2/A2)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0; // smoothing only affects FFT bins, not time-domain; keep 0 for clean frames
      ctx.createMediaStreamSource(stream).connect(analyser);

      streamRef.current = stream;
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;

      setError(null);
      setListening(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setError('Microphone access denied. Please allow microphone permissions and try again.');
    }
  }, [tick]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close();
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    windowRef.current = [];
    lastPitchRef.current = null;
    lastDetectTimeRef.current = 0;
    setPitch(null);
    setRmsDb(null);
    setListening(false);
  }, []);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

  return { pitch, rmsDb, listening, error, start, stop };
}
