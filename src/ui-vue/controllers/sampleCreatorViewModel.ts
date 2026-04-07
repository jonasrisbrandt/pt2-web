import { SYNTH_DEFINITIONS, SYNTH_PRESETS, getParameterDefinitionForSynth } from '../../core/synthConfig';
import type { SampleSlot } from '../../core/trackerTypes';
import type { SynthId, SynthSnapshot, SynthTelemetrySnapshot } from '../../core/synthTypes';
import type {
  SampleCreatorBakeViewModel,
  SampleCreatorCaptureViewModel,
  SampleCreatorParamSectionViewModel,
  SampleCreatorPianoViewModel,
  SampleCreatorRenderControlViewModel,
  SampleCreatorRenderOptions,
  SampleCreatorSynthViewModel,
  SampleCreatorTargetViewModel,
} from '../../ui-modern/components/appShellRenderer';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SECTION_LABELS: Record<string, string> = {
  oscillators: 'Oscillators',
  amp: 'Amp',
  filter: 'Filter',
  motion: 'Motion',
  fx: 'FX',
  performance: 'Performance',
};

interface SampleCreatorViewModelBuildOptions {
  snapshot: SynthSnapshot | null;
  telemetry: SynthTelemetrySnapshot | null;
  sampleSlots: SampleSlot[];
  keyboardOctave: number;
  piano: Omit<SampleCreatorPianoViewModel, 'keyboardOctave' | 'activeNotes'> & { activeNotes: readonly number[] };
  targetSlot: number;
  bakeSampleRate: number;
  renderState: {
    midiNote: number;
    velocity: number;
    durationSeconds: number;
    tailSeconds: number;
    normalize: boolean;
    fadeOut: boolean;
    volume: number;
    fineTune: number;
  };
  bakeLearnEnabled: boolean;
  capturedSample: SampleCreatorCaptureViewModel['capturedSample'];
  icons: {
    play: string;
    stop: string;
    record: string;
    bake: string;
    delete: string;
  };
  callbacks: Pick<
    SampleCreatorRenderOptions,
    | 'onClose'
    | 'onTargetSlotChange'
    | 'onBakeRateChange'
    | 'onSynthSelect'
    | 'onPresetSelect'
    | 'onBakeControlChange'
    | 'onBakeNormalizeChange'
    | 'onBakeFadeOutChange'
    | 'onBakePreview'
    | 'onBakeLearnToggle'
    | 'onBakeCommit'
    | 'onCaptureToggle'
    | 'onCapturePlay'
    | 'onCaptureCommit'
    | 'onCaptureDiscard'
    | 'onPianoRangeShift'
    | 'onPianoNoteDown'
    | 'onSynthParamChange'
  >;
}

const formatSlotNumber = (slot: number): string => String(slot + 1).padStart(2, '0');

const formatSlotLabel = (slot: number, name: string): string => `Slot ${formatSlotNumber(slot)} ${name || 'Empty slot'}`;

const formatSampleSlotDisplay = (sample: SampleSlot | null, slotNumber: string): string => {
  if (!sample) {
    return 'Empty slot';
  }

  const trimmedName = sample.name.trim();
  if (trimmedName.length > 0) {
    return trimmedName;
  }

  return sample.length > 0 ? `SAMPLE ${slotNumber}` : 'Empty slot';
};

const formatMidiNote = (value: number): string => {
  const midiNote = Math.max(0, Math.min(127, Math.round(value)));
  const octave = Math.floor(midiNote / 12);
  return `${NOTE_NAMES[midiNote % 12] ?? 'C'}${octave}`;
};

const buildTargetModel = (
  sampleSlots: SampleSlot[],
  targetSlot: number,
  bakeSampleRate: number,
): SampleCreatorTargetViewModel => {
  const slotNumber = formatSlotNumber(targetSlot);
  const selectedTargetSample = sampleSlots[targetSlot] ?? null;
  const sampleLabel = formatSampleSlotDisplay(selectedTargetSample, slotNumber);
  const hint = selectedTargetSample
    ? selectedTargetSample.length > 0
      ? `Bake and capture both write to this slot. Current length ${selectedTargetSample.length} bytes.`
      : 'Bake and capture both write to this slot. Slot is currently empty.'
    : 'Bake and capture both write to this slot.';

  return {
    slotNumber,
    sampleLabel,
    hint,
    selectedSlot: targetSlot,
    selectedBakeRate: bakeSampleRate,
    slotOptions: sampleSlots.map((slot) => ({
      value: slot.index,
      label: formatSlotLabel(slot.index, slot.name),
    })),
    bakeRateOptions: [
      { value: 48000, label: '48 kHz' },
      { value: 44100, label: '44.1 kHz' },
      { value: 22050, label: '22.05 kHz' },
      { value: 11025, label: '11.025 kHz' },
    ],
  };
};

const buildSynthModel = (snapshot: SynthSnapshot | null): SampleCreatorSynthViewModel => ({
  selectedSynth: snapshot?.selectedSynth ?? 'acid303',
  midiInputLabel: snapshot?.midiAvailable ? 'MIDI connected' : 'MIDI not connected',
  selectedPresetId: snapshot?.selectedPresetId ?? 'acid303:init',
  presetOptions: SYNTH_PRESETS
    .filter((preset) => preset.synth === (snapshot?.selectedSynth ?? 'acid303'))
    .map((preset) => ({ value: preset.id, label: preset.name })),
});

const buildBakeControls = (renderState: SampleCreatorViewModelBuildOptions['renderState']): SampleCreatorRenderControlViewModel[] => [
  {
    id: 'midiNote',
    label: 'Render Note',
    value: renderState.midiNote,
    min: 24,
    max: 96,
    step: 1,
    displayValue: formatMidiNote(renderState.midiNote),
    helperText: `MIDI ${Math.round(renderState.midiNote)}`,
  },
  {
    id: 'velocity',
    label: 'Velocity',
    value: renderState.velocity,
    min: 0.05,
    max: 1,
    step: 0.01,
    displayValue: `${Math.round(renderState.velocity * 100)}%`,
  },
  {
    id: 'durationSeconds',
    label: 'Hold Time',
    value: renderState.durationSeconds,
    min: 0.05,
    max: 6,
    step: 0.05,
    displayValue: `${renderState.durationSeconds.toFixed(renderState.durationSeconds < 1 ? 2 : 1)} s`,
  },
  {
    id: 'tailSeconds',
    label: 'Release Tail',
    value: renderState.tailSeconds,
    min: 0,
    max: 4,
    step: 0.05,
    displayValue: `${renderState.tailSeconds.toFixed(renderState.tailSeconds < 1 ? 2 : 1)} s`,
  },
  {
    id: 'volume',
    label: 'Volume',
    value: renderState.volume,
    min: 0,
    max: 64,
    step: 1,
    displayValue: String(Math.round(renderState.volume)),
  },
  {
    id: 'fineTune',
    label: 'Fine Tune',
    value: renderState.fineTune,
    min: -8,
    max: 7,
    step: 1,
    displayValue: renderState.fineTune > 0 ? `+${Math.round(renderState.fineTune)}` : String(Math.round(renderState.fineTune)),
  },
];

const buildBakeModel = (
  snapshot: SynthSnapshot | null,
  slotNumber: string,
  renderState: SampleCreatorViewModelBuildOptions['renderState'],
  bakeLearnEnabled: boolean,
  icons: SampleCreatorViewModelBuildOptions['icons'],
): SampleCreatorBakeViewModel => ({
  slotNumber,
  learnEnabled: bakeLearnEnabled,
  controls: buildBakeControls(renderState),
  normalize: renderState.normalize,
  fadeOut: renderState.fadeOut,
  lastRenderName: snapshot?.lastRender?.name ?? 'No baked sample yet',
  lastRenderSummary: snapshot?.lastRender
    ? `${snapshot.lastRender.data.length} samples at ${snapshot.lastRender.sampleRate} Hz into Slot ${slotNumber}`
    : `Bake a sample to import it into Slot ${slotNumber}.`,
  lastRenderPeak: snapshot?.lastRender ? `Peak ${Math.round(snapshot.lastRender.peak * 100)}%` : '',
  playIconHtml: icons.play,
  recordIconHtml: icons.record,
  bakeIconHtml: icons.bake,
});

const buildCaptureModel = (
  snapshot: SynthSnapshot | null,
  slotNumber: string,
  capturedSample: SampleCreatorCaptureViewModel['capturedSample'],
  icons: SampleCreatorViewModelBuildOptions['icons'],
): SampleCreatorCaptureViewModel => {
  const stateLabel = (() => {
    switch (snapshot?.recordState) {
      case 'recording':
        return 'Capturing live performance';
      case 'captured':
        return `Ready for Slot ${slotNumber}`;
      default:
        return 'Idle';
    }
  })();

  const summary = (() => {
    if (!snapshot) {
      return 'Waiting for synth engine.';
    }
    if (capturedSample) {
      return `${snapshot.recordedDurationSeconds.toFixed(2)} s | Peak ${Math.round(snapshot.recordedPeak * 100)}%`;
    }
    if (snapshot.recordState === 'recording') {
      return 'Recording live synth output now.';
    }
    if (snapshot.recordState === 'captured') {
      return 'Captured audio is empty after trim.';
    }
    return `Capture a live performance, then commit it to Slot ${slotNumber}.`;
  })();

  return {
    stateLabel,
    inputLabel: `MIDI ${snapshot?.midiAvailable ? 'connected' : 'not connected'} | Input armed to ${snapshot?.inputArm ?? 'synth'}`,
    summary,
    status: snapshot?.status ?? 'Initializing synth engine...',
    recording: snapshot?.recordState === 'recording',
    capturedSample,
    playIconHtml: icons.play,
    stopIconHtml: icons.stop,
    recordIconHtml: icons.record,
    bakeIconHtml: icons.bake,
    deleteIconHtml: icons.delete,
  };
};

const buildParameterSections = (snapshot: SynthSnapshot | null): SampleCreatorParamSectionViewModel[] => {
  const synthId = snapshot?.selectedSynth ?? 'acid303';
  const definition = SYNTH_DEFINITIONS[synthId];
  return ['oscillators', 'amp', 'filter', 'motion', 'fx', 'performance']
    .map((sectionId) => ({
      id: sectionId,
      label: SECTION_LABELS[sectionId] ?? sectionId,
      controls: definition.parameterIds
        .filter((paramId) => getParameterDefinitionForSynth(synthId, paramId).section === sectionId)
        .map((paramId) => ({
          synthId,
          paramId,
          value: snapshot?.patch[paramId] ?? getParameterDefinitionForSynth(synthId, paramId).defaultValue,
        })),
    }))
    .filter((section) => section.controls.length > 0);
};

export const buildSampleCreatorViewModel = ({
  snapshot,
  telemetry,
  sampleSlots,
  keyboardOctave,
  piano,
  targetSlot,
  bakeSampleRate,
  renderState,
  bakeLearnEnabled,
  capturedSample,
  icons,
  callbacks,
}: SampleCreatorViewModelBuildOptions): SampleCreatorRenderOptions => {
  const target = buildTargetModel(sampleSlots, targetSlot, bakeSampleRate);
  const synth = buildSynthModel(snapshot);
  const bake = buildBakeModel(snapshot, target.slotNumber, renderState, bakeLearnEnabled, icons);
  const capture = buildCaptureModel(snapshot, target.slotNumber, capturedSample, icons);

  return {
    snapshot,
    title: SYNTH_DEFINITIONS[snapshot?.selectedSynth ?? 'acid303'].label,
    description: SYNTH_DEFINITIONS[snapshot?.selectedSynth ?? 'acid303'].description,
    telemetry,
    target,
    synth,
    bake,
    capture,
    piano: {
      keyboardOctave,
      startAbsolute: piano.startAbsolute,
      endAbsolute: piano.endAbsolute,
      rangeLabel: piano.rangeLabel,
      canShiftDown: piano.canShiftDown,
      canShiftUp: piano.canShiftUp,
      activeNotes: new Set(piano.activeNotes),
      flashNote: piano.flashNote,
      flashToken: piano.flashToken,
    },
    parameterSections: buildParameterSections(snapshot),
    ...callbacks,
  };
};
