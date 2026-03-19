import type { ImportedSample } from './trackerTypes';

export type SynthBackend = 'wasm' | 'mock' | 'unavailable';
export type SynthBackendStatus = 'ready' | 'debug-fallback' | 'error';
export type SynthId = 'core-sub' | 'acid303';
export type InputArmTarget = 'tracker' | 'synth';
export type SynthRecordState = 'idle' | 'recording' | 'captured';
export type SynthParamId =
  | 'masterGain'
  | 'waveform'
  | 'ampAttack'
  | 'ampDecay'
  | 'ampSustain'
  | 'ampRelease'
  | 'filterCutoff'
  | 'filterResonance'
  | 'filterEnvAmount'
  | 'drive'
  | 'oscMix'
  | 'subMix'
  | 'noiseMix'
  | 'detune'
  | 'lfoRate'
  | 'lfoAmount'
  | 'delayTime'
  | 'delayFeedback'
  | 'delayMix'
  | 'chorusDepth'
  | 'chorusMix'
  | 'accent'
  | 'slideTime'
  | 'pulseWidth';

export type SynthTelemetryTapId =
  | 'oscA'
  | 'oscB'
  | 'mix'
  | 'filter'
  | 'drive'
  | 'amp'
  | 'master';

export type SynthTelemetryCurveId =
  | 'ampEnv'
  | 'filterEnv'
  | 'lfo'
  | 'filterResponse';

export interface SynthTelemetryRuntime {
  cutoff: number;
  resonance: number;
  ampEnv: number;
  filterEnv: number;
  lfo: number;
  drive: number;
  velocity: number;
}

export interface SynthTelemetrySnapshot {
  version: number;
  focusedMidiNote: number | null;
  activeVoiceCount: number;
  sampleRate: number;
  peak: number;
  runtime: SynthTelemetryRuntime;
  taps: Record<SynthTelemetryTapId, Float32Array>;
  curves: Record<SynthTelemetryCurveId, Float32Array>;
}

export interface SynthParameterDefinition {
  id: SynthParamId;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  section: 'oscillators' | 'amp' | 'filter' | 'motion' | 'fx' | 'performance';
  formatter?: (value: number) => string;
}

export interface SynthPreset {
  id: string;
  name: string;
  synth: SynthId;
  patch: Partial<Record<SynthParamId, number>>;
}

export interface SynthDefinition {
  id: SynthId;
  label: string;
  description: string;
  keyboardMode: 'poly' | 'mono';
  parameterIds: SynthParamId[];
}

export interface RenderJob {
  midiNote: number;
  velocity: number;
  durationSeconds: number;
  tailSeconds: number;
  sampleRate: number;
  normalize: boolean;
  fadeOut: boolean;
  targetSlot: number;
  sampleName: string;
  volume: number;
  fineTune: number;
  loopStart: number;
  loopLength: number;
}

export interface RenderedSample extends ImportedSample {
  sampleRate: number;
  peak: number;
  midiNote: number;
}

export interface SynthSnapshot {
  backend: SynthBackend;
  backendStatus: SynthBackendStatus;
  backendError: string | null;
  ready: boolean;
  status: string;
  selectedSynth: SynthId;
  selectedPresetId: string;
  patch: Record<SynthParamId, number>;
  inputArm: InputArmTarget;
  targetSampleSlot: number;
  activeNotes: number[];
  midiAvailable: boolean;
  previewSampleRate: number | null;
  bakeSampleRate: number;
  recordState: SynthRecordState;
  recordedWaveform: Int8Array | null;
  recordedDurationSeconds: number;
  recordedPeak: number;
  lastRender: RenderedSample | null;
}

export type SynthCommand =
  | { type: 'synth/select'; synth: SynthId }
  | { type: 'preset/load'; presetId: string }
  | { type: 'param/set'; id: SynthParamId; value: number }
  | { type: 'preview/note-on'; midiNote: number; velocity?: number }
  | { type: 'preview/note-off'; midiNote: number }
  | { type: 'preview/panic' }
  | { type: 'bake-rate/set'; sampleRate: number }
  | { type: 'record/start' }
  | { type: 'record/stop' }
  | { type: 'record/discard' }
  | { type: 'target-slot/set'; slot: number }
  | { type: 'input-arm/set'; target: InputArmTarget }
  | { type: 'midi/set-available'; available: boolean };

export type SynthEvent =
  | { type: 'snapshot'; snapshot: SynthSnapshot }
  | { type: 'status'; level: 'info' | 'warn' | 'error'; message: string };
