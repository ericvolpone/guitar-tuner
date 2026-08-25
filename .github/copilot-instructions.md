# Guitar Tuner - Copilot Instructions

- React + Vite + TypeScript PWA
- Uses Web Audio API (getUserMedia + AnalyserNode) for microphone input
- Pitch detection via autocorrelation (no external pitch libraries)
- Displays: detected note, cents deviation from perfect pitch, raw frequency in Hz
- Targets standard guitar tuning (E2 A2 D3 G3 B3 E4) but shows any detected note
- Keep audio processing in a dedicated utility module, not inside React components

## Project Checklist
- [x] Create copilot-instructions.md
- [x] Scaffold Vite React TypeScript project
- [x] Implement pitch detection and tuner UI
- [x] Compile and verify no errors
- [x] Create dev task and launch
