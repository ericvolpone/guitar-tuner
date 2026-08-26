const NOTE_STRINGS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface PitchResult {
  frequency: number;
  note: string;
  octave: number;
  cents: number;
}

function corrAtLag(buffer: Float32Array, maxSamples: number, lag: number): number {
  let sum = 0;
  for (let j = 0; j < maxSamples; j++) sum += buffer[j] * buffer[j + lag];
  return sum;
}

/** Autocorrelation-based pitch detection. Returns null if no clear pitch found. */
export function detectPitch(buffer: Float32Array, sampleRate: number): PitchResult | null {
  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);

  // RMS silence gate
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null; // gate at -40 dBFS; ambient noise sits around -45 to -55

  const selfEnergy = corrAtLag(buffer, MAX_SAMPLES, 0);
  if (selfEnergy === 0) return null;

  // Restrict search to guitar pitch range (E2 82 Hz – high fret ~1400 Hz)
  // This avoids computing ~1M multiplications on every frame (important on mobile)
  const minLag = Math.floor(sampleRate / 1400);
  const maxLag = Math.min(Math.ceil(sampleRate / 60), MAX_SAMPLES - 2);

  let maxCorr = -Infinity;
  let maxIndex = -1;
  for (let i = minLag; i <= maxLag; i++) {
    const c = corrAtLag(buffer, MAX_SAMPLES, i) / selfEnergy;
    if (c > maxCorr) { maxCorr = c; maxIndex = i; }
  }

  // Guitar strings score ~0.65–0.80; random/noisy sounds rarely exceed 0.67
  if (maxIndex < 1 || maxCorr < 0.67) return null;

  // Parabolic interpolation for sub-sample accuracy
  const x1 = corrAtLag(buffer, MAX_SAMPLES, maxIndex - 1) / selfEnergy;
  const x2 = maxCorr;
  const x3 = corrAtLag(buffer, MAX_SAMPLES, maxIndex + 1) / selfEnergy;
  const shift = (x3 - x1) / (2 * (2 * x2 - x1 - x3));
  const period = maxIndex + shift;

  const frequency = sampleRate / period;
  if (frequency < 60 || frequency > 1400) return null;

  // Convert frequency to MIDI note number
  const midiNote = 12 * Math.log2(frequency / 440) + 69;
  const roundedMidi = Math.round(midiNote);
  const cents = Math.round((midiNote - roundedMidi) * 100);
  const octave = Math.floor((roundedMidi - 12) / 12);
  const note = NOTE_STRINGS[roundedMidi % 12];

  return { frequency: Math.round(frequency * 10) / 10, note, octave, cents };
}
