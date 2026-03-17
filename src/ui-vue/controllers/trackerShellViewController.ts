import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Monitor,
  Pause,
  Piano,
  Play,
  Square,
  View,
  Volume2,
  VolumeX,
} from 'lucide';
import type { TransportMode, TrackerSnapshot } from '../../core/trackerTypes';
import { formatSongTime, getVisualizationLabel, type VisualizationMode } from '../../ui/appShared';
import type {
  AppShellRenderOptions,
  ClassicDebugRenderOptions,
  IconButtonRenderOptions,
  ModuleCardRenderOptions,
  PatternPanelRenderOptions,
  SampleCreatorRenderOptions,
  SampleBankRenderOptions,
  ToolIconButtonRenderOptions,
  ToolbarButtonRenderOptions,
  TrackHeaderRenderOptions,
} from '../../ui-modern/components/appShellRenderer';
import type { SampleEditorPanelRenderOptions, SelectedSamplePanelRenderOptions } from '../../ui-modern/components/markupRenderer';
import type { InlineNameFieldRenderOptions } from '../../ui-modern/components/viewModels';

type SectionKey = 'module' | 'visualization' | 'editor' | 'samples';
type MenuKey = 'file' | 'help';
type ViewMode = 'modern' | 'classic';
type WorkspaceMode = 'tracker' | 'sample-creator';

interface BuildTrackerShellViewStateOptions {
  snapshot: TrackerSnapshot;
  viewMode: ViewMode;
  workspaceMode: WorkspaceMode;
  keyboardOctave: number;
  visualizationMode: VisualizationMode;
  preferredTransportMode: TransportMode;
  samplePage: number;
  samplePageCount: number;
  sampleEditorOpen: boolean;
  collapsedSections: Record<SectionKey, boolean>;
  openMenu: MenuKey | null;
  aboutOpen: boolean;
  songTitle: InlineNameFieldRenderOptions;
  sampleBankOptions: SampleBankRenderOptions;
  selectedSamplePanelOptions: SelectedSamplePanelRenderOptions;
  sampleEditorPanelOptions: SampleEditorPanelRenderOptions | null;
  classicDebugOptions: ClassicDebugRenderOptions;
  appVersion: string;
  fileActionsDisabled: boolean;
  importDisabled: boolean;
  sampleCreatorOptions: SampleCreatorRenderOptions | null;
  canEditSnapshot: (snapshot: TrackerSnapshot) => boolean;
  getSectionCollapseIcon: (section: SectionKey) => string;
  renderIcon: (iconNode: unknown) => string;
}

const buildViewToggleOptions = (
  viewMode: ViewMode,
  renderIcon: (iconNode: unknown) => string,
): ToolbarButtonRenderOptions[] => [
  {
    action: 'view-modern',
    iconHtml: renderIcon(Monitor),
    label: 'Modern',
    active: viewMode === 'modern',
  },
  {
    action: 'view-classic',
    iconHtml: renderIcon(View),
    label: 'Classic',
    active: viewMode === 'classic',
  },
];

export const buildTrackerModuleTransportOptions = (
  snapshot: TrackerSnapshot,
  playbackMode: TransportMode,
  getAudioModeLabel: (snapshot: TrackerSnapshot) => string,
  getAudioModeValue: (snapshot: TrackerSnapshot) => 'C' | 'M' | 'A',
  renderIcon: (iconNode: unknown) => string,
): ToolIconButtonRenderOptions[] => [
  {
    action: 'transport-toggle-mode',
    iconHtml: renderIcon(ArrowLeftRight),
    label: playbackMode === 'pattern' ? 'Pattern playback' : 'Module playback',
    active: playbackMode === 'pattern',
    disabled: false,
    role: 'module-transport-mode',
    valueText: playbackMode === 'pattern' ? 'P' : 'M',
  },
  {
    action: 'transport-toggle',
    iconHtml: renderIcon(snapshot.transport.playing ? Pause : Play),
    label: snapshot.transport.playing ? 'Pause playback' : (playbackMode === 'pattern' ? 'Play pattern' : 'Play module'),
    active: snapshot.transport.playing,
    disabled: false,
    role: 'module-transport-toggle',
  },
  {
    action: 'transport-stop',
    iconHtml: renderIcon(Square),
    label: 'Stop',
    active: false,
    disabled: false,
    role: 'module-transport-stop',
  },
  {
    action: 'audio-cycle-mode',
    iconHtml: renderIcon(Volume2),
    label: getAudioModeLabel(snapshot),
    active: snapshot.audio.mode !== 'custom',
    disabled: false,
    role: 'module-audio-mode',
    valueText: getAudioModeValue(snapshot),
  },
];

export const buildTrackerModuleGridOptions = (
  snapshot: TrackerSnapshot,
  editable: boolean,
  renderIcon: (iconNode: unknown) => string,
): { cards: ModuleCardRenderOptions[] } => ({
  cards: [
    {
      kind: 'stepper',
      label: 'Position',
      value: String(snapshot.transport.position).padStart(2, '0'),
      role: 'position',
      downAction: 'song-position-down',
      upAction: 'song-position-up',
      enabled: editable,
      downIconHtml: renderIcon(ChevronDown),
      upIconHtml: renderIcon(ChevronUp),
    },
    {
      kind: 'stepper',
      label: 'Pattern',
      value: String(snapshot.pattern.index).padStart(2, '0'),
      role: 'pattern',
      downAction: 'song-pattern-down',
      upAction: 'song-pattern-up',
      enabled: editable,
      downIconHtml: renderIcon(ChevronDown),
      upIconHtml: renderIcon(ChevronUp),
    },
    {
      kind: 'stepper',
      label: 'Length',
      value: String(snapshot.song.length).padStart(2, '0'),
      role: 'length',
      downAction: 'song-length-down',
      upAction: 'song-length-up',
      enabled: editable,
      downIconHtml: renderIcon(ChevronDown),
      upIconHtml: renderIcon(ChevronUp),
    },
    {
      kind: 'stepper',
      label: 'BPM',
      value: String(snapshot.transport.bpm),
      role: 'bpm',
      downAction: 'song-bpm-down',
      upAction: 'song-bpm-up',
      enabled: editable,
      downIconHtml: renderIcon(ChevronDown),
      upIconHtml: renderIcon(ChevronUp),
    },
    {
      kind: 'value',
      label: 'Time',
      value: formatSongTime(snapshot),
      role: 'time',
    },
    {
      kind: 'value',
      label: 'Size',
      value: `${snapshot.song.sizeBytes} bytes`,
      role: 'size',
    },
  ],
});

export const buildTrackerVisualizationControlOptions = (
  renderIcon: (iconNode: unknown) => string,
): IconButtonRenderOptions[] => [
  {
    action: 'visualization-piano',
    iconHtml: renderIcon(Piano),
    label: 'Show piano visualization',
  },
  {
    action: 'visualization-prev',
    iconHtml: renderIcon(ChevronLeft),
    label: 'Previous visualization',
  },
  {
    action: 'visualization-next',
    iconHtml: renderIcon(ChevronRight),
    label: 'Next visualization',
  },
];

export const buildTrackerSamplePageControlOptions = (
  samplePage: number,
  samplePageCount: number,
  renderIcon: (iconNode: unknown) => string,
): IconButtonRenderOptions[] => [
  {
    action: 'sample-page-prev',
    iconHtml: renderIcon(ChevronLeft),
    label: 'Previous sample page',
    disabled: samplePage <= 0,
  },
  {
    action: 'sample-page-next',
    iconHtml: renderIcon(ChevronRight),
    label: 'Next sample page',
    disabled: samplePage >= samplePageCount - 1,
  },
];

export const buildTrackerTrackHeaderOptions = (
  snapshot: TrackerSnapshot,
  renderIcon: (iconNode: unknown) => string,
): TrackHeaderRenderOptions[] => Array.from({ length: 4 }, (_, channel) => ({
  channel,
  muted: snapshot.editor.muted[channel] ?? false,
  muteIconHtml: renderIcon((snapshot.editor.muted[channel] ?? false) ? VolumeX : Volume2),
}));

export interface TrackerShellLiveLabels {
  position: string;
  pattern: string;
  length: string;
  bpm: string;
  time: string;
  size: string;
  octave: string;
  visualization: string;
}

export const buildTrackerShellLiveLabels = (
  snapshot: TrackerSnapshot,
  keyboardOctave: number,
  visualizationMode: VisualizationMode,
): TrackerShellLiveLabels => ({
  position: String(snapshot.transport.position).padStart(2, '0'),
  pattern: String(snapshot.pattern.index).padStart(2, '0'),
  length: String(snapshot.song.length).padStart(2, '0'),
  bpm: String(snapshot.transport.bpm),
  time: formatSongTime(snapshot),
  size: `${snapshot.song.sizeBytes} bytes`,
  octave: `Octave ${keyboardOctave}`,
  visualization: getVisualizationLabel(visualizationMode),
});

export const buildTrackerShellViewState = ({
  snapshot,
  viewMode,
  workspaceMode,
  keyboardOctave,
  visualizationMode,
  preferredTransportMode,
  samplePage,
  samplePageCount,
  sampleEditorOpen,
  collapsedSections,
  openMenu,
  aboutOpen,
  songTitle,
  sampleBankOptions,
  selectedSamplePanelOptions,
  sampleEditorPanelOptions,
  classicDebugOptions,
  appVersion,
  fileActionsDisabled,
  importDisabled,
  sampleCreatorOptions,
  canEditSnapshot,
  getSectionCollapseIcon,
  renderIcon,
}: BuildTrackerShellViewStateOptions): AppShellRenderOptions => {
  const editable = canEditSnapshot(snapshot);
  const playbackMode = snapshot.transport.playing ? snapshot.transport.mode : preferredTransportMode;
  const moduleGridOptions = buildTrackerModuleGridOptions(snapshot, editable, renderIcon);
  const patternEditorPanelOptions: PatternPanelRenderOptions | null = sampleEditorOpen
    ? null
    : {
      octave: keyboardOctave,
      octaveOneActive: keyboardOctave === 1,
      octaveTwoActive: keyboardOctave === 2,
      collapsed: collapsedSections.editor,
      collapseIconHtml: getSectionCollapseIcon('editor'),
      trackHeaders: buildTrackerTrackHeaderOptions(snapshot, renderIcon),
    };

  const getAudioModeLabel = (nextSnapshot: TrackerSnapshot): string => {
    if (nextSnapshot.audio.mode === 'mono') {
      return 'Mono playback';
    }
    if (nextSnapshot.audio.mode === 'amiga') {
      return 'Amiga stereo playback';
    }
    return 'Custom panning playback';
  };

  const getAudioModeValue = (nextSnapshot: TrackerSnapshot): 'C' | 'M' | 'A' => {
    if (nextSnapshot.audio.mode === 'mono') {
      return 'M';
    }
    if (nextSnapshot.audio.mode === 'amiga') {
      return 'A';
    }
    return 'C';
  };

  return {
    viewMode,
    workspaceMode,
    viewToggleOptions: buildViewToggleOptions(viewMode, renderIcon),
    songTitle,
    moduleTransportOptions: buildTrackerModuleTransportOptions(snapshot, playbackMode, getAudioModeLabel, getAudioModeValue, renderIcon),
    moduleGridOptions,
    moduleCollapsed: collapsedSections.module,
    moduleCollapseIconHtml: getSectionCollapseIcon('module'),
    visualizationLabel: getVisualizationLabel(visualizationMode),
    visualizationControlOptions: buildTrackerVisualizationControlOptions(renderIcon),
    visualizationCollapsed: collapsedSections.visualization,
    visualizationCollapseIconHtml: getSectionCollapseIcon('visualization'),
    patternEditorPanelOptions,
    sampleEditorPanelOptions,
    sampleBankOptions,
    selectedSamplePanelOptions,
    samplesCollapsed: collapsedSections.samples,
    samplesCollapseIconHtml: getSectionCollapseIcon('samples'),
    classicDebugOptions,
    samplePageControlOptions: buildTrackerSamplePageControlOptions(samplePage, samplePageCount, renderIcon),
    fileMenuOpen: openMenu === 'file',
    helpMenuOpen: openMenu === 'help',
    aboutOpen,
    appVersion,
    fileActionsDisabled,
    importDisabled,
    sampleCreatorOptions,
  };
};
