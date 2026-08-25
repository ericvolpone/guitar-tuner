import { usePitchDetector } from './usePitchDetector';
import './App.css';

const GUITAR_STRINGS = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
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
  const { pitch, listening, error, start, stop } = usePitchDetector();

  const inTune = pitch ? Math.abs(pitch.cents) <= 5 : false;
  const centsLabel = pitch
    ? pitch.cents === 0 ? '± 0¢' : pitch.cents > 0 ? `+${pitch.cents}¢` : `${pitch.cents}¢`
    : null;

  return (
    <div className="app">
      <h1 className="app-title">Guitar Tuner</h1>

      <div className="strings-bar">
        {GUITAR_STRINGS.map(s => (
          <span
            key={s}
            className={`string-chip ${pitch && `${pitch.note}${pitch.octave}` === s ? 'active' : ''}`}
          >
            {s}
          </span>
        ))}
      </div>

      <div className={`note-display ${inTune ? 'in-tune' : ''}`}>
        <span className="detected-note" style={{ visibility: pitch ? 'visible' : 'hidden' }}>
          {pitch ? pitch.note : 'E'}<sup>{pitch ? pitch.octave : '2'}</sup>
        </span>
        <span className="detected-freq" style={{ visibility: pitch ? 'visible' : 'hidden' }}>
          {pitch ? `${pitch.frequency} Hz` : '000.0 Hz'}
        </span>
        <span className="idle-text" style={{ visibility: pitch ? 'hidden' : 'visible' }}>
          {listening ? 'Listening…' : 'Press Start'}
        </span>
      </div>

      <CentsMeter cents={pitch?.cents ?? 0} visible={!!pitch} />
      <p
        className={`cents-value ${inTune ? 'in-tune' : pitch && pitch.cents < 0 ? 'flat' : 'sharp'}`}
        style={{ visibility: pitch ? 'visible' : 'hidden' }}
      >
        {inTune ? 'In Tune ✓' : pitch && pitch.cents < 0 ? `${centsLabel} flat` : `${centsLabel} sharp`}
      </p>

      <p className="error-msg" style={{ visibility: error ? 'visible' : 'hidden' }}>
        {error ?? ' '}
      </p>

      <button
        className={`start-btn ${listening ? 'active' : ''}`}
        onClick={listening ? stop : start}
      >
        {listening ? 'Stop' : 'Start'}
      </button>
    </div>
  );
}

export default App;
