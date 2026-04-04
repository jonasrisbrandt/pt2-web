import type { SynthId, SynthParamId, SynthParameterDefinition, SynthPreset, SynthSnapshot, SynthDefinition } from './synthTypes';

const percent = (value: number): string => `${Math.round(value * 100)}%`;
const seconds = (value: number): string => `${value.toFixed(value < 1 ? 2 : 1)} s`;
const mix = (value: number): string => `${Math.round(value * 100)}%`;
const toggleLabel = (value: number): string => value >= 0.5 ? 'On' : 'Off';
const delayDivisionLabel = (value: number): string => ['1/16', '1/8', '1/8D', '1/4', '1/4D', '1/2'][Math.round(value)] ?? '1/4';

export const SYNTH_PARAM_ORDER: SynthParamId[] = [
  'masterGain',
  'waveform',
  'ampAttack',
  'ampDecay',
  'ampSustain',
  'ampRelease',
  'filterCutoff',
  'filterResonance',
  'filterEnvAmount',
  'drive',
  'oscMix',
  'subMix',
  'noiseMix',
  'detune',
  'lfoRate',
  'lfoAmount',
  'delaySync',
  'delayDivision',
  'delayTime',
  'delayFeedback',
  'delayMix',
  'chorusDepth',
  'chorusMix',
  'accent',
  'slideTime',
  'pulseWidth',
];

export const SYNTH_PARAM_INDEX = new Map<SynthParamId, number>(
  SYNTH_PARAM_ORDER.map((id, index) => [id, index]),
);

export const SYNTH_PARAMETERS: Record<SynthParamId, SynthParameterDefinition> = {
  masterGain: { id: 'masterGain', label: 'Master', min: 0, max: 1.25, step: 0.01, defaultValue: 0.72, section: 'amp', formatter: mix },
  waveform: { id: 'waveform', label: 'Wave', min: 0, max: 2, step: 1, defaultValue: 1, section: 'oscillators', formatter: (value) => ['Saw', 'Pulse', 'Tri'][Math.round(value)] ?? 'Saw' },
  ampAttack: { id: 'ampAttack', label: 'Attack', min: 0.001, max: 2, step: 0.001, defaultValue: 0.006, section: 'amp', formatter: seconds },
  ampDecay: { id: 'ampDecay', label: 'Decay', min: 0.01, max: 2.5, step: 0.01, defaultValue: 0.22, section: 'amp', formatter: seconds },
  ampSustain: { id: 'ampSustain', label: 'Sustain', min: 0, max: 1, step: 0.01, defaultValue: 0.62, section: 'amp', formatter: percent },
  ampRelease: { id: 'ampRelease', label: 'Release', min: 0.01, max: 3.5, step: 0.01, defaultValue: 0.28, section: 'amp', formatter: seconds },
  filterCutoff: { id: 'filterCutoff', label: 'Cutoff', min: 0.02, max: 0.98, step: 0.01, defaultValue: 0.68, section: 'filter', formatter: percent },
  filterResonance: { id: 'filterResonance', label: 'Reso', min: 0, max: 0.95, step: 0.01, defaultValue: 0.22, section: 'filter', formatter: percent },
  filterEnvAmount: { id: 'filterEnvAmount', label: 'Env Amt', min: -1, max: 1, step: 0.01, defaultValue: 0.28, section: 'filter', formatter: percent },
  drive: { id: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01, defaultValue: 0.18, section: 'fx', formatter: percent },
  oscMix: { id: 'oscMix', label: 'Osc Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.72, section: 'oscillators', formatter: percent },
  subMix: { id: 'subMix', label: 'Sub', min: 0, max: 1, step: 0.01, defaultValue: 0.44, section: 'oscillators', formatter: percent },
  noiseMix: { id: 'noiseMix', label: 'Noise', min: 0, max: 1, step: 0.01, defaultValue: 0.06, section: 'oscillators', formatter: percent },
  detune: { id: 'detune', label: 'Detune', min: 0, max: 0.5, step: 0.01, defaultValue: 0.12, section: 'oscillators', formatter: (value) => value.toFixed(2) },
  lfoRate: { id: 'lfoRate', label: 'LFO Rate', min: 0, max: 18, step: 0.1, defaultValue: 3.6, section: 'motion', formatter: (value) => `${value.toFixed(1)} Hz` },
  lfoAmount: { id: 'lfoAmount', label: 'LFO Amt', min: 0, max: 1, step: 0.01, defaultValue: 0.16, section: 'motion', formatter: percent },
  delaySync: { id: 'delaySync', label: 'Delay Sync', min: 0, max: 1, step: 1, defaultValue: 0, section: 'fx', formatter: toggleLabel },
  delayDivision: { id: 'delayDivision', label: 'Delay Div', min: 0, max: 5, step: 1, defaultValue: 3, section: 'fx', formatter: delayDivisionLabel },
  delayTime: { id: 'delayTime', label: 'Delay Time', min: 0.02, max: 0.8, step: 0.01, defaultValue: 0.33, section: 'fx', formatter: seconds },
  delayFeedback: { id: 'delayFeedback', label: 'Delay FB', min: 0, max: 0.92, step: 0.01, defaultValue: 0.24, section: 'fx', formatter: percent },
  delayMix: { id: 'delayMix', label: 'Delay Mix', min: 0, max: 1, step: 0.01, defaultValue: 0.18, section: 'fx', formatter: percent },
  chorusDepth: { id: 'chorusDepth', label: 'Chorus D', min: 0, max: 1, step: 0.01, defaultValue: 0.38, section: 'fx', formatter: percent },
  chorusMix: { id: 'chorusMix', label: 'Chorus M', min: 0, max: 1, step: 0.01, defaultValue: 0.2, section: 'fx', formatter: percent },
  accent: { id: 'accent', label: 'Accent', min: 0, max: 1, step: 0.01, defaultValue: 0, section: 'performance', formatter: percent },
  slideTime: { id: 'slideTime', label: 'Slide', min: 0, max: 0.8, step: 0.01, defaultValue: 0, section: 'performance', formatter: seconds },
  pulseWidth: { id: 'pulseWidth', label: 'Pulse Width', min: 0.08, max: 0.92, step: 0.01, defaultValue: 0.5, section: 'oscillators', formatter: percent },
};

export const SYNTH_DEFINITIONS: Record<SynthId, SynthDefinition> = {
  'core-sub': {
    id: 'core-sub',
    label: 'CoreSub',
    description: 'A flexible reference subtractive synth for sample design.',
    keyboardMode: 'poly',
    parameterIds: [
      'waveform',
      'oscMix',
      'subMix',
      'noiseMix',
      'detune',
      'pulseWidth',
      'ampAttack',
      'ampDecay',
      'ampSustain',
      'ampRelease',
      'filterCutoff',
      'filterResonance',
      'filterEnvAmount',
      'lfoRate',
      'lfoAmount',
      'drive',
      'chorusDepth',
      'chorusMix',
      'delaySync',
      'delayDivision',
      'delayTime',
      'delayFeedback',
      'delayMix',
      'masterGain',
    ],
  },
  acid303: {
    id: 'acid303',
    label: 'Acid303',
    description: 'A mono acid line synth with accent, slide, bite, and delay.',
    keyboardMode: 'mono',
    parameterIds: [
      'waveform',
      'pulseWidth',
      'ampDecay',
      'ampSustain',
      'ampRelease',
      'filterCutoff',
      'filterResonance',
      'filterEnvAmount',
      'accent',
      'slideTime',
      'drive',
      'delaySync',
      'delayDivision',
      'delayTime',
      'delayFeedback',
      'delayMix',
      'masterGain',
    ],
  },
};

export const SYNTH_PRESETS: SynthPreset[] = [
  { id: 'core-sub:init', name: 'Init Stack', synth: 'core-sub', patch: {} },
  {
    id: 'core-sub:glass-pad',
    name: 'Glass Pad',
    synth: 'core-sub',
    patch: {
      waveform: 2,
      ampAttack: 0.18,
      ampDecay: 0.42,
      ampSustain: 0.78,
      ampRelease: 0.64,
      filterCutoff: 0.44,
      filterResonance: 0.32,
      chorusDepth: 0.64,
      chorusMix: 0.48,
      delayMix: 0.22,
      lfoAmount: 0.22,
    },
  },
  {
    id: 'acid303:init',
    name: 'Acid Init',
    synth: 'acid303',
    patch: {
      waveform: 0,
      filterCutoff: 0.42,
      filterResonance: 0.74,
      filterEnvAmount: 0.85,
      drive: 0.48,
      accent: 0.5,
      slideTime: 0.12,
      delaySync: 1,
      delayDivision: 3,
      delayMix: 0.12,
    },
  },
  {
    id: 'acid303:squelch',
    name: 'Squelch Run',
    synth: 'acid303',
    patch: {
      waveform: 1,
      filterCutoff: 0.3,
      filterResonance: 0.86,
      filterEnvAmount: 0.92,
      drive: 0.62,
      accent: 0.82,
      slideTime: 0.18,
      delaySync: 1,
      delayDivision: 2,
      delayMix: 0.18,
    },
  },
];

export const createPatchForSynth = (synthId: SynthId): Record<SynthParamId, number> => {
  const patch = Object.fromEntries(
    SYNTH_PARAM_ORDER.map((id) => [id, SYNTH_PARAMETERS[id].defaultValue]),
  ) as Record<SynthParamId, number>;

  if (synthId === 'acid303') {
    patch.waveform = 0;
    patch.ampDecay = 0.18;
    patch.ampSustain = 0.05;
    patch.ampRelease = 0.12;
    patch.filterCutoff = 0.42;
    patch.filterResonance = 0.74;
    patch.filterEnvAmount = 0.85;
    patch.drive = 0.48;
    patch.oscMix = 1;
    patch.subMix = 0;
    patch.noiseMix = 0;
    patch.detune = 0;
    patch.delaySync = 1;
    patch.delayDivision = 3;
    patch.delayTime = 0.26;
    patch.delayFeedback = 0.28;
    patch.delayMix = 0.12;
    patch.chorusDepth = 0;
    patch.chorusMix = 0;
    patch.accent = 0.5;
    patch.slideTime = 0.12;
  }

  return patch;
};

export const getDefaultPresetId = (synthId: SynthId): string =>
  SYNTH_PRESETS.find((preset) => preset.synth === synthId)?.id ?? `${synthId}:init`;

export const applyPresetToPatch = (
  synthId: SynthId,
  presetId: string,
): { patch: Record<SynthParamId, number>; presetId: string } => {
  const base = createPatchForSynth(synthId);
  const preset = SYNTH_PRESETS.find((entry) => entry.id === presetId && entry.synth === synthId);
  if (!preset) {
    return { patch: base, presetId: getDefaultPresetId(synthId) };
  }

  for (const [paramId, value] of Object.entries(preset.patch) as Array<[SynthParamId, number]>) {
    base[paramId] = value;
  }

  return { patch: base, presetId: preset.id };
};

export const createInitialSynthSnapshot = (): SynthSnapshot => {
  const synth = 'acid303' as const;
  const initial = applyPresetToPatch(synth, getDefaultPresetId(synth));
  return {
    backend: 'unavailable',
    backendStatus: 'error',
    backendError: null,
    ready: false,
    status: 'Initializing Sample Creator...',
    selectedSynth: synth,
    selectedPresetId: initial.presetId,
    patch: initial.patch,
    inputArm: 'synth',
    targetSampleSlot: 0,
    activeNotes: [],
    midiAvailable: false,
    previewSampleRate: null,
    bakeSampleRate: 22050,
    recordState: 'idle',
    recordedWaveform: null,
    recordedDurationSeconds: 0,
    recordedPeak: 0,
    lastRender: null,
  };
};

export const getParameterDefinitionForSynth = (
  synthId: SynthId,
  paramId: SynthParamId,
): SynthParameterDefinition => {
  const definition = SYNTH_PARAMETERS[paramId];
  if (synthId === 'acid303' && paramId === 'waveform') {
    return {
      ...definition,
      max: 1,
      defaultValue: 0,
      formatter: (value) => ['Saw', 'Square'][Math.round(value)] ?? 'Saw',
    };
  }

  return definition;
};
