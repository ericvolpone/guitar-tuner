import { useState } from 'react';
import { usePitchDetector } from './usePitchDetector';
import './App.css';

interface StringDef { display: string; note: string; octave: number; }
interface TuningDef  { name: string; strings: StringDef[]; }

const FLAT_TO_SHARP: Record<string, string> = { Eb: 'D#', Ab: 'G#', Db: 'C#', Gb: 'F#', Bb: 'A#' };

function str(display: string): StringDef {
  const m = display.match(/^([A-G][b#]?)(\d)$/);
  if (!m) throw new Error(`Invalid note: ${display}`);
  return { display, note: FLAT_TO_SHARP[m[1]] ?? m[1], octave: Number(m[2]) };
}

const TUNINGS: TuningDef[] = [
  { name: 'Standard',    strings: ['E2','A2','D3','G3','B3','E4'].map(str) },
  { name: 'Drop D',      strings: ['D2','A2','D3','G3','B3','E4'].map(str) },
  { name: 'Eb Standard', strings: ['Eb2','Ab2','Db3','Gb3','Bb3','Eb4'].map(str) },
  { name: 'Open G',      strings: ['D2','G2','D3','G3','B3','D4'].map(str) },
  { name: 'Open D',      strings: ['D2','A2','D3','F#3','A3','D4'].map(str) },
  { name: 'Open E',      strings: ['E2','B2','E3','G#3','B3','E4'].map(str) },
];

// Step 0 = any volume (lowest threshold), step 8 = loud notes only (highest threshold)
const THRESHOLD_STEPS = [0.0001, 0.0002, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.02, 0.04];
const DEFAULT_THRESHOLD_STEP = 4; // 0.0025 — the original hardcoded default

const CENTS_RANGE = 50;

function CentsMeter({ cents, visible }: { cents: number; visible: boolean }) {
  const clamped = Math.max(-CENTS_RANGE, Math.min(CENTS_RANGE, cents));
  const pct = ((clamped + CENTS_RANGE) / (CENTS_RANGE * 2)) * 100;
  const inTune = Math.abs(cents) <= 5;

  return (
    <div className="cents-meter" aria-label={`${cents} cents`} style={{ visibility: visible ? 'visible' : 'hidden' }}>
      <div className="cents-track">
        <div className="cents-center-line" />
        <div
          className={`cents-needle ${inTune ? 'in-tune' : cents < 0 ? 'flat' : 'sharp'}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="cents-labels">
        <span>-50</span>
        <span>0</span>
        <span>+50</span>
      </div>
    </div>
  );
}

function App() {
  const [selectedTuning, setSelectedTuning] = useState('Standard');
  const [thresholdStep, setThresholdStep] = useState(DEFAULT_THRESHOLD_STEP);

  const tuning = TUNINGS.find(t => t.name === selectedTuning) ?? TUNINGS[0];
  const { pitch, rmsDb, listening, error, start, stop } = usePitchDetector(THRESHOLD_STEPS[thresholdStep]);

  const activeIdx = pitch
    ? tuning.strings.findIndex(s => s.note === pitch.note && s.octave === pitch.octave)
    : -1;

  const inTune = pitch ? Math.abs(pitch.cents) <= 5 : false;
  const centsLabel = pitch
    ? pitch.cents === 0 ? '± 0¢' : pitch.cents > 0 ? `+${pitch.cents}¢` : `${pitch.cents}¢`
    : null;

  // Invert so slider top = Loud Only, bottom = Any Volume
  const displayStep = THRESHOLD_STEPS.length - 1 - thresholdStep;

  return (
    <div className="layout">
      <nav className="sidebar">
        <span className="sidebar-title">Tuning</span>
        {TUNINGS.map(t => (
          <button
            key={t.name}
            className={`tuning-btn${selectedTuning === t.name ? ' active' : ''}`}
            onClick={() => setSelectedTuning(t.name)}
          >
            {t.name}
          </button>
        ))}
      </nav>

      <div className="app">
        <h1 className="app-title">Guitar Tuner by VOLPWN</h1>

        <div className="strings-bar">
          {tuning.strings.map((s, i) => (
            <span key={s.display} className={`string-chip${i === activeIdx ? ' active' : ''}`}>
              {s.display}
            </span>
          ))}
        </div>

        <div className={`note-display${inTune ? ' in-tune' : ''}`}>
          <div className="note-readings" style={{ visibility: pitch ? 'visible' : 'hidden' }}>
            <span className="detected-note">
              {pitch ? pitch.note : 'E'}<sup>{pitch ? pitch.octave : '2'}</sup>
            </span>
            <span className="detected-freq">
              {pitch ? `${pitch.frequency} Hz` : '—'}
            </span>
          </div>
          <span className="idle-text" style={{ visibility: pitch ? 'hidden' : 'visible' }}>
            {listening ? 'Listening…' : 'Press Start'}
          </span>
          <span className="detected-db" style={{ visibility: listening ? 'visible' : 'hidden' }}>
            {rmsDb !== null ? `${rmsDb} dBFS` : '—'}
          </span>
        </div>

        <div className="meter-row">
          <CentsMeter cents={pitch?.cents ?? 0} visible={!!pitch} />
          <button
            className={`start-btn${listening ? ' active' : ''}`}
            onClick={listening ? stop : start}
          >
            {listening ? 'Stop' : 'Start'}
          </button>
        </div>

        <p
          className={`cents-value${inTune ? ' in-tune' : pitch && pitch.cents < 0 ? ' flat' : ' sharp'}`}
          style={{ visibility: pitch ? 'visible' : 'hidden' }}
        >
          {inTune ? 'In Tune ✓' : pitch && pitch.cents < 0 ? `${centsLabel} flat` : `${centsLabel} sharp`}
        </p>

        <p className="error-msg" style={{ visibility: error ? 'visible' : 'hidden' }}>
          {error ?? ' '}
        </p>
      </div>

      <div className="threshold-panel">
        <span className="threshold-cap">Loud</span>
        <input
          type="range"
          min={0}
          max={THRESHOLD_STEPS.length - 1}
          step={1}
          value={displayStep}
          onChange={e => setThresholdStep(THRESHOLD_STEPS.length - 1 - Number(e.target.value))}
          className="threshold-slider-v"
          aria-label="Volume threshold"
        />
        <span className="threshold-cap">Any</span>
        <span className="threshold-title-v">Vol</span>
      </div>
    </div>
  );
}

export default App;
