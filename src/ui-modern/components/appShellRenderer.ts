import type { SampleSlot } from '../../core/trackerTypes';
import type { SelectedSamplePanelRenderOptions } from './markupRenderer';
import type { InlineNameFieldRenderOptions } from './viewModels';
import type {
  InputArmTarget,
  RenderedSample,
  SynthId,
  SynthParamId,
  SynthSnapshot,
  SynthTelemetrySnapshot,
} from '../../core/synthTypes';

export interface SampleBankRenderItem {
  sample: SampleSlot;
  selectedSample: number;
  previewValues: ArrayLike<number>;
}

export interface SampleBankRenderOptions {
  items: SampleBankRenderItem[];
}

export interface ToolbarButtonRenderOptions {
  action: string;
  iconHtml: string;
  label: string;
  active: boolean;
}

export interface ToolIconButtonRenderOptions {
  action: string;
  iconHtml: string;
  label: string;
  active: boolean;
  disabled: boolean;
  role?: string;
  valueText?: string;
}

export interface IconButtonRenderOptions {
  action: string;
  iconHtml: string;
  label: string;
  disabled?: boolean;
  small?: boolean;
  active?: boolean;
}

export interface ModuleStepperCardRenderOptions {
  kind: 'stepper';
  label: string;
  value: string;
  role: string;
  downAction: string;
  upAction: string;
  enabled: boolean;
  downIconHtml: string;
  upIconHtml: string;
}

export interface ModuleValueCardRenderOptions {
  kind: 'value';
  label: string;
  value: string;
  role: string;
}

export type ModuleCardRenderOptions =
  | ModuleStepperCardRenderOptions
  | ModuleValueCardRenderOptions;

export interface ModuleGridRenderOptions {
  cards: ModuleCardRenderOptions[];
}

export interface TrackHeaderRenderOptions {
  channel: number;
  muted: boolean;
  muteIconHtml: string;
}

export interface ClassicDebugRenderOptions {
  enabled: boolean;
}

export interface SampleCreatorSelectOption {
  value: number | string;
  label: string;
}

export interface SampleCreatorRenderControlViewModel {
  id: 'midiNote' | 'velocity' | 'durationSeconds' | 'tailSeconds' | 'volume' | 'fineTune';
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  helperText?: string;
}

export interface SampleCreatorTargetViewModel {
  slotNumber: string;
  sampleLabel: string;
  hint: string;
  selectedSlot: number;
  selectedBakeRate: number;
  slotOptions: SampleCreatorSelectOption[];
  bakeRateOptions: SampleCreatorSelectOption[];
}

export interface SampleCreatorSynthViewModel {
  selectedSynth: SynthId;
  midiInputLabel: string;
  selectedPresetId: string;
  presetOptions: SampleCreatorSelectOption[];
}

export interface SampleCreatorBakeViewModel {
  slotNumber: string;
  learnEnabled: boolean;
  controls: SampleCreatorRenderControlViewModel[];
  normalize: boolean;
  fadeOut: boolean;
  lastRenderName: string;
  lastRenderSummary: string;
  lastRenderPeak: string;
  playIconHtml: string;
  recordIconHtml: string;
  bakeIconHtml: string;
}

export interface SampleCreatorCaptureViewModel {
  stateLabel: string;
  inputLabel: string;
  summary: string;
  status: string;
  recording: boolean;
  capturedSample: RenderedSample | null;
  playIconHtml: string;
  stopIconHtml: string;
  recordIconHtml: string;
  bakeIconHtml: string;
  deleteIconHtml: string;
}

export interface SampleCreatorPianoViewModel {
  keyboardOctave: number;
  startAbsolute: number;
  endAbsolute: number;
  rangeLabel: string;
  canShiftDown: boolean;
  canShiftUp: boolean;
  activeNotes: ReadonlySet<number>;
  flashNote: number | null;
  flashToken: number;
}

export interface SampleCreatorParamControlViewModel {
  synthId: SynthId;
  paramId: SynthParamId;
  value: number;
}

export interface SampleCreatorParamSectionViewModel {
  id: string;
  label: string;
  controls: SampleCreatorParamControlViewModel[];
}

export interface SampleCreatorRenderOptions {
  snapshot: SynthSnapshot | null;
  title: string;
  description: string;
  telemetry: SynthTelemetrySnapshot | null;
  target: SampleCreatorTargetViewModel;
  synth: SampleCreatorSynthViewModel;
  bake: SampleCreatorBakeViewModel;
  capture: SampleCreatorCaptureViewModel;
  piano: SampleCreatorPianoViewModel;
  parameterSections: SampleCreatorParamSectionViewModel[];
  onClose: () => void;
  onTargetSlotChange: (slot: number) => void;
  onBakeRateChange: (sampleRate: number) => void;
  onSynthSelect: (synth: SynthId) => void;
  onPresetSelect: (presetId: string) => void;
  onBakeControlChange: (id: SampleCreatorRenderControlViewModel['id'], value: number) => void;
  onBakeNormalizeChange: (enabled: boolean) => void;
  onBakeFadeOutChange: (enabled: boolean) => void;
  onBakePreview: () => void;
  onBakeLearnToggle: () => void;
  onBakeCommit: () => void;
  onCaptureToggle: () => void;
  onCapturePlay: () => void;
  onCaptureCommit: () => void;
  onCaptureDiscard: () => void;
  onPianoRangeShift: (direction: -1 | 1) => void;
  onPianoNoteDown: (midiNote: number) => void;
  onSynthParamChange: (paramId: SynthParamId, value: number) => void;
}

export interface AppShellRenderOptions {
  viewMode: 'modern' | 'classic';
  workspaceMode?: 'tracker' | 'sample-creator';
  viewToggleOptions: ToolbarButtonRenderOptions[];
  songTitle: InlineNameFieldRenderOptions;
  moduleCollapsed: boolean;
  moduleCollapseIconHtml: string;
  visualizationLabel: string;
  visualizationControlOptions: IconButtonRenderOptions[];
  visualizationCollapsed: boolean;
  visualizationCollapseIconHtml: string;
  patternEditorPanelOptions?: PatternPanelRenderOptions | null;
  sampleEditorPanelOptions?: import('./markupRenderer').SampleEditorPanelRenderOptions | null;
  sampleBankOptions: SampleBankRenderOptions;
  selectedSamplePanelOptions: SelectedSamplePanelRenderOptions;
  samplesCollapsed: boolean;
  samplesCollapseIconHtml: string;
  classicDebugOptions: ClassicDebugRenderOptions;
  samplePageControlOptions: IconButtonRenderOptions[];
  fileMenuOpen: boolean;
  settingsMenuOpen: boolean;
  helpMenuOpen: boolean;
  synthInputArm: InputArmTarget | null;
  synthSettingsAvailable: boolean;
  aboutOpen: boolean;
  appVersion: string;
  fileActionsDisabled: boolean;
  importDisabled: boolean;
  sampleCreatorOptions?: SampleCreatorRenderOptions | null;
}

export interface PatternPanelRenderOptions {
  octave: number;
  octaveOneActive: boolean;
  octaveTwoActive: boolean;
  collapsed: boolean;
  collapseIconHtml: string;
}
