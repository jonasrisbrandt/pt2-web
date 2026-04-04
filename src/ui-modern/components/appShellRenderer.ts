import type { SampleSlot } from '../../core/trackerTypes';
import type { SelectedSamplePanelRenderOptions } from './markupRenderer';
import type { InlineNameFieldRenderOptions } from './viewModels';
import type { RenderJob, SynthSnapshot, SynthTelemetrySnapshot } from '../../core/synthTypes';

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

export interface SampleCreatorRenderOptions {
  snapshot: SynthSnapshot | null;
  telemetry: SynthTelemetrySnapshot | null;
  targetSample: SampleSlot | null;
  sampleSlots: SampleSlot[];
  keyboardOctave: number;
  renderJob: RenderJob;
  pianoStartAbsolute: number;
  pianoEndAbsolute: number;
  pianoRangeLabel: string;
  pianoCanShiftDown: boolean;
  pianoCanShiftUp: boolean;
  pianoFlashNote: number | null;
  pianoFlashToken: number;
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
  helpMenuOpen: boolean;
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
