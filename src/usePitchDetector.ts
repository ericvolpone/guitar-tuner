import { useState, useEffect, useRef, useCallback } from 'react';
import { detectPitch } from './pitchDetection';
import type { PitchResult } from './pitchDetection';

const FFT_SIZE = 2048;
const WINDOW_MS = 100;

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

  // Require the winning note to appear in at least 40% of frames to suppress noise
  if (best.length / window.length < 0.4) return null;

  const sorted = [...best].sort((a, b) => a.result.cents - b.result.cents);
  const mid = sorted[Math.floor(sorted.length / 2)].result;
  const avgFreq = Math.round((best.reduce((s, e) => s + e.result.frequency, 0) / best.length) * 10) / 10;

  return { ...mid, frequency: avgFreq };
}

export function usePitchDetector(rmsThreshold = 0.0025) {
  const [pitch, setPitch] = useState<PitchResult | null>(null);
  const [rmsDb, setRmsDb] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rmsThresholdRef = useRef(rmsThreshold);
  useEffect(() => { rmsThresholdRef.current = rmsThreshold; }, [rmsThreshold]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(FFT_SIZE));
  const windowRef = useRef<TimestampedResult[]>([]);

  const tick = useCallback(() => {
    if (!analyserRef.current) return;
    analyserRef.current.getFloatTimeDomainData(bufferRef.current);

    const buf = bufferRef.current;
    let sqSum = 0;
    for (let i = 0; i < buf.length; i++) sqSum += buf[i] * buf[i];
    const rms = Math.sqrt(sqSum / buf.length);
    setRmsDb(Math.round(20 * Math.log10(Math.max(rms, 1e-10))));

    const result = detectPitch(buf, audioCtxRef.current!.sampleRate, rmsThresholdRef.current);

    const now = performance.now();
    if (result) windowRef.current.push({ ts: now, result });
    windowRef.current = windowRef.current.filter(e => now - e.ts <= WINDOW_MS);

    setPitch(modeInWindow(windowRef.current));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
    setPitch(null);
    setRmsDb(null);
    setListening(false);
  }, []);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

  return { pitch, rmsDb, listening, error, start, stop };
}
