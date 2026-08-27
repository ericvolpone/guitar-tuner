const NOTE_STRINGS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface PitchResult {
  frequency: number;
  note: string;
  octave: number;
  cents: number;
}

/** Autocorrelation-based pitch detection. Returns null if no clear pitch found. */
export function detectPitch(buffer: Float32Array, sampleRate: number, rmsThreshold = 0.0025): PitchResult | null {
  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);

  // RMS silence gate
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < rmsThreshold) return null;

  // Autocorrelation
  const correlations = new Float32Array(MAX_SAMPLES);
  for (let i = 0; i < MAX_SAMPLES; i++) {
    let sum = 0;
    for (let j = 0; j < MAX_SAMPLES; j++) sum += buffer[j] * buffer[j + i];
    correlations[i] = sum;
  }

  // Normalize by self-energy so confidence is amplitude-independent (0–1)
  const selfEnergy = correlations[0];
  if (selfEnergy === 0) return null;
  const norm = correlations.map(v => v / selfEnergy);

  // Find first dip then first peak after it
  let d = 0;
  while (d < MAX_SAMPLES && norm[d] > norm[d + 1]) d++;

  let maxCorr = -Infinity;
  let maxIndex = -1;
  for (let i = d; i < MAX_SAMPLES; i++) {
    if (norm[i] > maxCorr) {
      maxCorr = norm[i];
      maxIndex = i;
    }
  }

  // Guitar strings score ~0.65–0.80; pure sine (hum) scores ~0.95+
  if (maxIndex < 1 || maxCorr < 0.6) return null;

  // Parabolic interpolation for sub-sample accuracy
  const x1 = norm[maxIndex - 1];
  const x2 = norm[maxIndex];
  const x3 = norm[maxIndex + 1] ?? x2;
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
