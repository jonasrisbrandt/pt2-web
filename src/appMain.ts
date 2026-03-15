import { createElement, ArrowLeft, ArrowLeftRight, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crop, FileUp, Focus, Monitor, Pause, PencilLine, Piano, Play, Repeat, Scissors, SlidersHorizontal, Square, View, Volume2, VolumeX } from 'lucide';
import { createTrackerEngine } from './core/createEngine';
import { translateClassicKeyboardEvent, type ClassicKeyTranslation } from './core/classicKeyboard';
import { getKeyboardNoteFromKey, interpretKeyboard, isEditableTarget } from './core/keyboard';
import type { TrackerEngine } from './core/trackerEngine';
import type {
  CursorField,
  EngineConfig,
  PatternCell,
  QuadrascopeState,
  SampleSlot,
  TransportMode,
  TrackerSnapshot,
} from './core/trackerTypes';
import {
  escapeHtml,
  formatCellNote,
  formatSampleLength,
} from './ui/formatters';
import {
  clamp,
  formatSongTime,
  getVisualizationLabel,
  MAX_OCTAVE,
  MIN_OCTAVE,
  noteToAbsolute,
  PIANO_END_ABSOLUTE,
  SAMPLE_PAGE_SIZE,
  VISUALIZATION_MODES,
  type VisualizationMode,
} from './ui/appShared';
import { bindTrackerApplicationEvents } from './ui-modern/controllers/eventBindings';
import {
  handleModernClickAction,
  type SampleEditorViewOverride,
} from './ui-modern/controllers/clickActionController';
import { loadModuleFromInput, loadSampleFromInput } from './ui-modern/controllers/fileController';
import { handleModernInputAction } from './ui-modern/controllers/inputController';
import {
  beginSampleEditorPointer,
  completeSampleEditorPointer,
  handleModernHexEntry as handleModernHexEntryInput,
  handlePatternCanvasPointer as handleModernPatternCanvasPointer,
  resolvePatternFieldFromPointer as resolveModernPatternFieldFromPointer,
  resolvePianoKeyFromPointer,
  scrollPatternFromWheel,
  type SampleEditorPointerState,
  updateSampleEditorPointer,
  zoomSampleEditorFromWheel,
} from './ui-modern/controllers/interactionController';
import {
  setLiveText as setModernLiveText,
  updateSamplePanel as updateModernSamplePanel,
  updateTrackMuteButtons as updateModernTrackMuteButtons,
} from './ui-modern/controllers/liveUiController';
import {
  getClassicLogicalPointerPosition as getModernClassicLogicalPointerPosition,
  handleClassicKeyDown as handleModernClassicKeyDown,
  releaseClassicKeys as releaseModernClassicKeys,
  updateClassicDebugPanel as updateModernClassicDebugPanel,
  updateClassicDomDebugPointer,
} from './ui-modern/classic/classicBridgeController';
import {
  renderAppShellMarkup,
  renderPatternEditorPanel,
} from './ui-modern/components/appShellRenderer';
import {
  getSampleCardLabel as getModernSampleCardLabel,
  getSamplePageCount as getModernSamplePageCount,
  getSamplePanelKey as getModernSamplePanelKey,
  getSelectedSampleHeading as getModernSelectedSampleHeading,
  renderClassicDebug as renderModernClassicDebug,
  renderModuleStepperCard as renderModernModuleStepperCard,
  renderModuleValueCard as renderModernModuleValueCard,
  renderModernPatternRow as renderModernPatternRowMarkup,
  renderPatternPaddingRow as renderModernPatternPaddingRow,
  renderSampleBank as renderModernSampleBank,
  renderSampleEditorPanel as renderModernSampleEditorPanel,
  renderSelectedSamplePanel as renderModernSelectedSamplePanel,
  renderToolIconButton as renderModernToolIconButton,
  renderToolbarButton as renderModernToolbarButton,
  renderTrackHeader as renderModernTrackHeader,
} from './ui-modern/components/markupRenderer';
import {
  drawPatternCanvas as drawModernPatternCanvas,
  getPatternCanvasLayout as getModernPatternCanvasLayout,
  getPatternFieldRects as getModernPatternFieldRects,
  getPatternViewportStartRow as getModernPatternViewportStartRow,
} from './ui-modern/components/patternCanvasRenderer';
import {
  drawSampleEditor as drawModernSampleEditor,
  drawSelectedSamplePreview as drawModernSelectedSamplePreview,
  getSampleEditorLayout as getModernSampleEditorLayout,
  sampleOffsetToEditorX as sampleOffsetToModernEditorX,
} from './ui-modern/components/sampleWaveformRenderer';
import {
  decayPianoGlowLevels,
  drawPianoVisualizer as drawModernPianoVisualizer,
  drawQuadrascopeClassic as drawModernQuadrascopeClassic,
  drawQuadrascopeStack as drawModernQuadrascopeStack,
  drawSignalTrails as drawModernSignalTrails,
  drawSpectrumAnalyzer as drawModernSpectrumAnalyzer,
  syncPianoNotes as syncModernPianoNotes,
  triggerPianoGlow as triggerModernPianoGlow,
} from './ui-modern/components/visualizationRenderer';
import { createTrackerAppDom } from './ui-modern/session/appDom';

declare const __APP_VERSION__: string;

const DEFAULT_STATUS = 'Initializing ProTracker 2 web clone...';
const SHOW_CLASSIC_DEBUG = false;
const MODERN_VISIBLE_PATTERN_ROWS = 15;
const PATTERN_ROW_HEIGHT = 30;
const PATTERN_GUTTER = 10;
const PATTERN_ROW_INDEX_WIDTH = 54;
const PATTERN_MIN_CHANNEL_WIDTH = 150;
const QUADRASCOPE_HEIGHT = 220;
const SPECTRUM_HEIGHT = 220;
const PIANO_HEIGHT = QUADRASCOPE_HEIGHT;
const SAMPLE_PREVIEW_HEIGHT = 182;
const SAMPLE_EDITOR_HEIGHT = 352;
const SAMPLE_PREVIEW_RATE = 8287;

type SectionKey = 'module' | 'visualization' | 'editor' | 'samples' | 'classic';
type MenuKey = 'file' | 'help';
type SampleEditorPopoverKey = 'volume' | 'fineTune';
type SampleEditorNumericField = 'volume' | 'fineTune';

interface InlineRenameState {
  kind: 'song' | 'sample';
  value: string;
}

interface InlineSampleNumberState {
  field: SampleEditorNumericField;
  value: string;
}

interface SamplePreviewSession {
  sample: number;
  mode: 'sample' | 'view' | 'selection';
  start: number;
  end: number;
  loopStart: number;
  loopEnd: number;
  looping: boolean;
  startedAt: number;
}

const iconMarkup = (iconNode: unknown): string =>
  createElement(iconNode as Parameters<typeof createElement>[0], {
    class: 'ui-icon',
    width: 14,
    height: 14,
    'stroke-width': 1.8,
    'aria-hidden': 'true',
  }).outerHTML;

export class TrackerApplication {
  private readonly root: HTMLElement;
  private readonly config: EngineConfig;
  private readonly moduleInput: HTMLInputElement;
  private readonly sampleInput: HTMLInputElement;
  private readonly patternCanvas: HTMLCanvasElement;
  private readonly samplePreviewCanvas: HTMLCanvasElement;
  private readonly sampleEditorCanvas: HTMLCanvasElement;
  private readonly quadrascopeCanvas: HTMLCanvasElement;
  private readonly spectrumCanvas: HTMLCanvasElement;
  private readonly trailsCanvas: HTMLCanvasElement;
  private readonly pianoCanvas: HTMLCanvasElement;
  private engine: TrackerEngine | null = null;
  private snapshot: TrackerSnapshot | null = null;
  private quadrascope: QuadrascopeState | null = null;
  private statusMessage = DEFAULT_STATUS;
  private keyboardOctave = 2;
  private viewMode: 'modern' | 'classic' = 'modern';
  private visualizationMode: VisualizationMode = 'quad-stack';
  private preferredTransportMode: TransportMode = 'song';
  private samplePage = 0;
  private lastSelectedSample = 0;
  private pendingSampleImportSlot: number | null = null;
  private layoutRefreshFrame: number | null = null;
  private snapshotPollTimer: number | null = null;
  private snapshotPollIntervalMs: number | null = null;
  private scopeFrame: number | null = null;
  private samplePanelKey: string | null = null;
  private sampleWaveform: Int8Array | null = null;
  private sampleWaveformKey: string | null = null;
  private samplePreviewPlaying = false;
  private samplePreviewSession: SamplePreviewSession | null = null;
  private syncingAutoEditMode = false;
  private sampleEditorViewOverride: SampleEditorViewOverride | null = null;
  private openMenu: MenuKey | null = null;
  private aboutOpen = false;
  private openSampleEditorPopover: SampleEditorPopoverKey | null = null;
  private sampleEditorNumberEdit: InlineSampleNumberState | null = null;
  private pendingSampleNumberFocus: SampleEditorNumericField | null = null;
  private suppressNextModernRender = false;
  private collapsedSections: Record<SectionKey, boolean> = {
    module: false,
    visualization: false,
    editor: false,
    samples: false,
    classic: false,
  };
  private renameState: InlineRenameState | null = null;
  private pendingRenameFocus: InlineRenameState['kind'] | null = null;
  private sampleEditorPointer: SampleEditorPointerState = {
    mode: 'idle',
    active: false,
    anchor: 0,
    current: 0,
  };
  private activePianoNotes: Array<number | null> = Array.from({ length: 4 }, () => null);
  private lastPianoTransportKey: string | null = null;
  private pianoGlowLevels: number[][] = Array.from({ length: 4 }, () => Array.from({ length: PIANO_END_ABSOLUTE + 1 }, () => 0));
  private pianoLastFrameAt: number | null = null;
  private modernNotePreviewActive = false;
  private readonly modernPressedNoteKeys = new Set<string>();
  private readonly modernRecentNoteKeyTimes = new Map<string, number>();
  private classicPressedKeys = new Map<string, ClassicKeyTranslation>();
  private classicDomDebug = {
    x: 0,
    y: 0,
    buttons: 0,
    inside: false,
    events: 0,
  };
  private trailColumns: number[][] = Array.from({ length: 4 }, () => []);

  constructor(root: HTMLElement, config: EngineConfig) {
    this.root = root;
    this.config = config;

    const dom = createTrackerAppDom(
      SAMPLE_PREVIEW_HEIGHT,
      SAMPLE_EDITOR_HEIGHT,
      QUADRASCOPE_HEIGHT,
      SPECTRUM_HEIGHT,
      PIANO_HEIGHT,
    );
    this.moduleInput = dom.moduleInput;
    this.sampleInput = dom.sampleInput;
    this.patternCanvas = dom.patternCanvas;
    this.samplePreviewCanvas = dom.samplePreviewCanvas;
    this.sampleEditorCanvas = dom.sampleEditorCanvas;
    this.quadrascopeCanvas = dom.quadrascopeCanvas;
    this.spectrumCanvas = dom.spectrumCanvas;
    this.trailsCanvas = dom.trailsCanvas;
    this.pianoCanvas = dom.pianoCanvas;

    this.root.append(this.moduleInput, this.sampleInput);

    bindTrackerApplicationEvents({
      root: this.root,
      config: this.config,
      dom,
      onPatternCanvasPointer: (event) => this.handlePatternCanvasPointer(event),
      onPatternCanvasWheel: (event) => this.handlePatternCanvasWheel(event),
      onSampleEditorPointerDown: (event) => this.handleSampleEditorPointerDown(event),
      onSampleEditorWheel: (event) => this.handleSampleEditorWheel(event),
      onPianoPointer: (event) => this.handlePianoPointer(event),
      onRootClick: (event) => this.handleClick(event),
      onRootDoubleClick: (event) => this.handleDoubleClick(event),
      onRootChange: (event) => this.handleChange(event),
      onRootInput: (event) => this.handleInput(event),
      onRootMouseOver: (event) => this.handleRootMouseOver(event),
      onWindowKeyDown: (event) => this.handleKeyDown(event),
      onWindowKeyPress: (event) => this.handleKeyPress(event),
      onWindowKeyUp: (event) => this.handleKeyUp(event),
      onWindowPointerDown: (event) => this.handleWindowPointerDown(event),
      onWindowBlur: () => {
        this.releaseClassicKeys();
        this.modernPressedNoteKeys.clear();
        this.modernRecentNoteKeyTimes.clear();
        this.stopModernNotePreview();
      },
      onClassicCanvasPointerMove: (event) => this.handleClassicCanvasPointerMove(event),
      onClassicCanvasPointerButtonDown: (event) => this.handleClassicCanvasPointerButton(event, true),
      onClassicCanvasPointerButtonUp: (event) => this.handleClassicCanvasPointerButton(event, false),
      onClassicCanvasPointerEnter: (event) => {
        this.classicDomDebug.inside = true;
        this.handleClassicCanvasPointer(event);
      },
      onClassicCanvasPointerLeave: () => {
        this.classicDomDebug.inside = false;
        this.updateClassicDebugPanel(this.snapshot);
      },
      onWindowResize: () => {
        if (this.snapshot && this.viewMode === 'modern') {
          this.drawPatternCanvas(this.snapshot);
          this.drawSelectedSamplePreview(this.snapshot);
          this.drawSampleEditor(this.snapshot);
          this.drawVisualization(this.snapshot);
          const view = this.getSampleEditorView(this.snapshot);
          this.updateSampleEditorScrollbarThumb(this.snapshot.sampleEditor.sampleLength, view.length);
        }
      },
      onWindowMouseMove: (event) => this.handleSampleEditorPointerMove(event),
      onWindowMouseUp: () => {
        this.handleSampleEditorPointerUp();
        this.stopModernNotePreview();
      },
    });
  }

  async init(): Promise<void> {
    const { engine, warning } = await createTrackerEngine(this.config);
    this.engine = engine;

    this.engine.subscribe((event) => {
      if (event.type === 'snapshot') {
        this.snapshot = event.snapshot;
        this.quadrascope = event.snapshot.quadrascope ?? this.quadrascope;
        this.statusMessage = event.snapshot.status;
        this.syncSamplePreviewSession(event.snapshot);

        const shouldEdit = !event.snapshot.transport.playing;
        if (!this.syncingAutoEditMode && this.engine && event.snapshot.editor.editMode !== shouldEdit) {
          this.syncingAutoEditMode = true;
          this.engine.dispatch({ type: 'editor/set-edit-mode', enabled: shouldEdit });
          this.syncingAutoEditMode = false;
          return;
        }

        if (
          this.viewMode === 'modern'
          && this.root.querySelector('.app-shell')
          && (event.snapshot.transport.playing || this.suppressNextModernRender)
        ) {
          this.suppressNextModernRender = false;
          this.updateModernLiveRegions(event.snapshot);
          this.syncSnapshotPolling();
          return;
        }
      } else {
        this.statusMessage = event.message;
      }

      this.render();
    });

    if (warning) {
      this.statusMessage = `Fell back to the mock engine: ${warning}`;
    }

    this.snapshot = this.engine.getSnapshot();
    this.quadrascope = this.snapshot.quadrascope ?? null;
    this.preferredTransportMode = this.snapshot.transport.mode;
    if (this.snapshot.editor.editMode !== !this.snapshot.transport.playing) {
      this.engine.dispatch({ type: 'editor/set-edit-mode', enabled: !this.snapshot.transport.playing });
      this.snapshot = this.engine.getSnapshot();
    }
    this.render();
    this.ensureScopeAnimation();
  }

  private render(): void {
    const snapshot = this.snapshot;
    if (!snapshot) {
      return;
    }

    this.syncSamplePreviewSession(snapshot);
    const selectedSample = snapshot.samples[snapshot.selectedSample];
    const samplePage = this.resolveSamplePage(snapshot);
    const sampleButtons = this.renderSampleBank(snapshot, samplePage);
    const sampleEditorOpen = snapshot.sampleEditor.open;
    if (!sampleEditorOpen) {
      this.openSampleEditorPopover = null;
      this.sampleEditorNumberEdit = null;
    }
    const shell = document.createElement('div');
    shell.className = `app-shell app-shell--${this.viewMode}`;
    const moduleCardsHtml = [
      this.renderModuleStepperCard('Position', String(snapshot.transport.position).padStart(2, '0'), 'position', 'song-position-down', 'song-position-up', this.canEditSnapshot(snapshot)),
      this.renderModuleStepperCard('Pattern', String(snapshot.pattern.index).padStart(2, '0'), 'pattern', 'song-pattern-down', 'song-pattern-up', this.canEditSnapshot(snapshot)),
      this.renderModuleStepperCard('Length', String(snapshot.song.length).padStart(2, '0'), 'length', 'song-length-down', 'song-length-up', this.canEditSnapshot(snapshot)),
      this.renderModuleStepperCard('BPM', String(snapshot.transport.bpm), 'bpm', 'song-bpm-down', 'song-bpm-up', this.canEditSnapshot(snapshot)),
      this.renderModuleValueCard('Time', formatSongTime(snapshot), 'time'),
      this.renderModuleValueCard('Size', `${snapshot.song.sizeBytes} bytes`, 'size'),
    ].join('');
    const viewToggleHtml = [
      this.renderToolbarButton('view-modern', Monitor, 'Modern', this.viewMode === 'modern'),
      this.renderToolbarButton('view-classic', View, 'Classic', this.viewMode === 'classic'),
    ].join('');
    const playbackMode = snapshot.transport.playing ? snapshot.transport.mode : this.preferredTransportMode;
    const transportControlsHtml = [
      this.renderToolIconButton(
        'transport-toggle-mode',
        ArrowLeftRight,
        playbackMode === 'pattern' ? 'Pattern playback' : 'Module playback',
        playbackMode === 'pattern',
        false,
        'module-transport-mode',
        playbackMode === 'pattern' ? 'P' : 'M',
      ),
      this.renderToolIconButton(
        'transport-toggle',
        snapshot.transport.playing ? Pause : Play,
        snapshot.transport.playing ? 'Pause playback' : (playbackMode === 'pattern' ? 'Play pattern' : 'Play module'),
        snapshot.transport.playing,
        false,
        'module-transport-toggle',
      ),
      this.renderToolIconButton('transport-stop', Square, 'Stop', false, false, 'module-transport-stop'),
      this.renderToolIconButton(
        'audio-toggle-stereo',
        Volume2,
        snapshot.audio.stereo ? 'Stereo playback' : 'Mono playback',
        !snapshot.audio.stereo,
        false,
        'module-audio-mode',
        snapshot.audio.stereo ? 'S' : 'M',
      ),
    ].join('');
    const trackHeadersHtml = [
      this.renderTrackHeader(0, snapshot),
      this.renderTrackHeader(1, snapshot),
      this.renderTrackHeader(2, snapshot),
      this.renderTrackHeader(3, snapshot),
    ].join('');
    const editorPanelHtml = sampleEditorOpen
      ? this.renderSampleEditorPanel(snapshot)
      : renderPatternEditorPanel({
        octave: this.keyboardOctave,
        octaveOneActive: this.keyboardOctave === 1,
        octaveTwoActive: this.keyboardOctave === 2,
        collapsed: this.collapsedSections.editor,
        collapseIconHtml: this.getSectionCollapseIcon('editor'),
        trackHeadersHtml,
      });

    shell.innerHTML = renderAppShellMarkup({
      viewMode: this.viewMode,
      viewToggleHtml,
      songTitleHtml: this.renderSongTitleHtml(snapshot),
      transportControlsHtml,
      moduleCardsHtml,
      moduleCollapsed: this.collapsedSections.module,
      moduleCollapseIconHtml: this.getSectionCollapseIcon('module'),
      visualizationLabel: escapeHtml(getVisualizationLabel(this.visualizationMode)),
      visualizationPianoIconHtml: iconMarkup(Piano),
      visualizationPrevIconHtml: iconMarkup(ChevronLeft),
      visualizationNextIconHtml: iconMarkup(ChevronRight),
      visualizationCollapsed: this.collapsedSections.visualization,
      visualizationCollapseIconHtml: this.getSectionCollapseIcon('visualization'),
      editorPanelHtml,
      sampleButtonsHtml: sampleButtons,
      selectedSamplePanelHtml: this.renderSelectedSamplePanel(selectedSample, snapshot),
      samplesCollapsed: this.collapsedSections.samples,
      samplesCollapseIconHtml: this.getSectionCollapseIcon('samples'),
      classicDebugHtml: this.renderClassicDebug(),
      classicCollapsed: this.collapsedSections.classic,
      classicCollapseIconHtml: this.getSectionCollapseIcon('classic'),
      samplePagePrevDisabled: samplePage <= 0,
      samplePageNextDisabled: samplePage >= this.getSamplePageCount(snapshot) - 1,
      samplePagePrevIconHtml: iconMarkup(ChevronLeft),
      samplePageNextIconHtml: iconMarkup(ChevronRight),
      fileMenuOpen: this.openMenu === 'file',
      helpMenuOpen: this.openMenu === 'help',
      aboutOpen: this.aboutOpen,
      appVersion: __APP_VERSION__,
      fileActionsDisabled: snapshot.transport.playing,
      importDisabled: !this.canEditSnapshot(snapshot),
    });

    this.root.querySelector('.app-shell')?.remove();
    this.root.prepend(shell);

    const canvasHost = shell.querySelector<HTMLElement>('.engine-canvas-host');
    if (canvasHost) {
      this.config.canvas.className = this.viewMode === 'classic'
        ? 'engine-canvas engine-canvas-classic'
        : 'engine-canvas';
      canvasHost.replaceChildren(this.config.canvas);
      this.scheduleLayoutRefresh();
      if (this.viewMode === 'classic') {
        window.requestAnimationFrame(() => this.config.canvas.focus());
      }
    }

    const patternHost = shell.querySelector<HTMLElement>('[data-role="pattern-host"]');
    if (patternHost) {
      patternHost.replaceChildren(this.patternCanvas);
      this.drawPatternCanvas(snapshot);
    }

    const samplePreviewHost = shell.querySelector<HTMLElement>('[data-role="sample-preview-host"]');
    this.mountVisualization(snapshot);

    if (samplePreviewHost) {
      samplePreviewHost.replaceChildren(this.samplePreviewCanvas);
      this.drawSelectedSamplePreview(snapshot);
    }

    const sampleEditorHost = shell.querySelector<HTMLElement>('[data-role="sample-editor-host"]');
    if (sampleEditorHost) {
      sampleEditorHost.replaceChildren(this.sampleEditorCanvas);
      this.drawSampleEditor(snapshot);
    }

    this.syncRenameFocus(shell);
    this.syncSampleNumberFocus(shell);
    this.updateModernLiveRegions(snapshot);
    this.updateClassicDebugPanel(snapshot);
    this.syncSnapshotPolling();
  }

  private renderToolbarButton(action: string, iconNode: unknown, label: string, active = false): string {
    return renderModernToolbarButton(action, iconMarkup(iconNode), label, active);
  }

  private renderToolIconButton(
    action: string,
    iconNode: unknown,
    label: string,
    active = false,
    disabled = false,
    role = '',
    valueText = '',
  ): string {
    return renderModernToolIconButton(action, iconMarkup(iconNode), label, active, disabled, role, valueText);
  }

  private canEditSnapshot(snapshot: TrackerSnapshot | null): boolean {
    return !!snapshot && !snapshot.transport.playing;
  }

  private getSectionCollapseIcon(section: SectionKey): string {
    return iconMarkup(this.collapsedSections[section] ? ChevronRight : ChevronDown);
  }

  private toggleSection(section: SectionKey): void {
    this.collapsedSections[section] = !this.collapsedSections[section];
    this.render();
  }

  private toggleSampleEditorPopover(popover: SampleEditorPopoverKey): void {
    this.openSampleEditorPopover = this.openSampleEditorPopover === popover ? null : popover;
    this.sampleEditorNumberEdit = null;
    this.pendingSampleNumberFocus = null;
    this.render();
  }

  private toggleMenu(menu: MenuKey): void {
    this.openMenu = this.openMenu === menu ? null : menu;
    this.render();
  }

  private closeMenus(): void {
    if (!this.openMenu) {
      return;
    }

    this.openMenu = null;
    this.render();
  }

  private getDisplaySongTitle(snapshot: TrackerSnapshot): string {
    return (snapshot.song.title || 'UNTITLED').toUpperCase();
  }

  private getDisplaySampleTitle(snapshot: TrackerSnapshot): string {
    return this.getSelectedSampleHeading(snapshot.samples[snapshot.selectedSample]);
  }

  private renderSongTitleHtml(snapshot: TrackerSnapshot): string {
    if (this.renameState?.kind === 'song') {
      return `<input class="inline-rename-input" data-inline-rename="song" maxlength="20" value="${escapeHtml(this.renameState.value)}" />`;
    }

    return `<button type="button" class="inline-name-display" data-rename-target="song">${escapeHtml(this.getDisplaySongTitle(snapshot))}</button>`;
  }

  private renderSampleTitleHtml(snapshot: TrackerSnapshot): string {
    if (this.renameState?.kind === 'sample') {
      return `<input class="inline-rename-input" data-inline-rename="sample" maxlength="22" value="${escapeHtml(this.renameState.value)}" />`;
    }

    return `<button type="button" class="inline-name-display" data-rename-target="sample">${escapeHtml(this.getDisplaySampleTitle(snapshot))}</button>`;
  }

  private startInlineRename(kind: InlineRenameState['kind']): void {
    if (!this.snapshot || !this.canEditSnapshot(this.snapshot)) {
      return;
    }

    this.renameState = {
      kind,
      value: kind === 'song'
        ? this.snapshot.song.title
        : this.snapshot.samples[this.snapshot.selectedSample]?.name ?? '',
    };
    this.openMenu = null;
    this.pendingRenameFocus = kind;
    this.render();
  }

  private cancelInlineRename(): void {
    if (!this.renameState) {
      return;
    }

    this.renameState = null;
    this.pendingRenameFocus = null;
    this.render();
  }

  private commitInlineRename(): void {
    if (!this.engine || !this.snapshot || !this.renameState || !this.canEditSnapshot(this.snapshot)) {
      this.renameState = null;
      return;
    }

    if (this.renameState.kind === 'song') {
      this.engine.dispatch({ type: 'song/set-title', title: this.renameState.value.trim().slice(0, 20) });
    } else {
      this.engine.dispatch({
        type: 'sample/update',
        sample: this.snapshot.selectedSample,
        patch: { name: this.renameState.value.slice(0, 22) },
      });
    }

    this.snapshot = this.engine.getSnapshot();
    this.renameState = null;
    this.pendingRenameFocus = null;
    this.render();
  }

  private syncRenameFocus(shell: HTMLElement): void {
    if (!this.pendingRenameFocus) {
      return;
    }

    const selector = `[data-inline-rename="${this.pendingRenameFocus}"]`;
    const input = shell.querySelector<HTMLInputElement>(selector);
    this.pendingRenameFocus = null;
    if (!input) {
      return;
    }

    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  private syncSampleNumberFocus(shell: HTMLElement): void {
    if (!this.pendingSampleNumberFocus) {
      return;
    }

    const selector = `[data-inline-sample-number="${this.pendingSampleNumberFocus}"]`;
    const input = shell.querySelector<HTMLInputElement>(selector);
    this.pendingSampleNumberFocus = null;
    if (!input) {
      return;
    }

    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  private startSamplePreviewSession(snapshot: TrackerSnapshot, mode: 'sample' | 'view' | 'selection'): void {
    const sample = snapshot.samples[snapshot.selectedSample];
    if (!sample || sample.length <= 0) {
      this.stopSamplePreviewSession(false);
      return;
    }

    let start = 0;
    let end = sample.length;
    let loopStart = 0;
    let loopEnd = sample.length;
    let looping = false;

    if (mode === 'view') {
      const view = this.getSampleEditorView(snapshot);
      start = view.start;
      end = view.end;
    } else if (mode === 'selection' && snapshot.sampleEditor.selectionStart !== null && snapshot.sampleEditor.selectionEnd !== null) {
      start = snapshot.sampleEditor.selectionStart;
      end = snapshot.sampleEditor.selectionEnd;
    } else if (mode === 'sample' && sample.loopLength > 2 && sample.length > 2) {
      loopStart = sample.loopStart;
      loopEnd = Math.min(sample.length, sample.loopStart + sample.loopLength);
      end = Math.max(loopEnd, 2);
      looping = true;
    }

    if (end - start <= 0) {
      this.stopSamplePreviewSession(false);
      return;
    }

    this.samplePreviewSession = {
      sample: snapshot.selectedSample,
      mode,
      start,
      end,
      loopStart,
      loopEnd,
      looping,
      startedAt: performance.now(),
    };
    this.samplePreviewPlaying = true;
  }

  private stopSamplePreviewSession(redraw = true): void {
    const wasPlaying = this.samplePreviewPlaying || this.samplePreviewSession !== null;
    this.samplePreviewSession = null;
    this.samplePreviewPlaying = false;
    if (redraw && wasPlaying && this.snapshot && this.viewMode === 'modern') {
      this.updateModernLiveRegions(this.snapshot);
    }
  }

  private syncSamplePreviewSession(snapshot: TrackerSnapshot): void {
    if (!this.samplePreviewSession) {
      return;
    }

    if (snapshot.transport.playing || snapshot.selectedSample !== this.samplePreviewSession.sample) {
      this.stopSamplePreviewSession(false);
      return;
    }

    const playhead = this.getSamplePreviewPlayheadOffset();
    if (playhead === null) {
      return;
    }

    if (!this.samplePreviewSession.looping && playhead >= this.samplePreviewSession.end) {
      this.stopSamplePreviewSession(true);
    }
  }

  private getSamplePreviewPlayheadOffset(): number | null {
    if (!this.samplePreviewSession) {
      return null;
    }

    const elapsedSamples = Math.floor(((performance.now() - this.samplePreviewSession.startedAt) / 1000) * SAMPLE_PREVIEW_RATE);
    if (!this.samplePreviewSession.looping) {
      return clamp(
        this.samplePreviewSession.start + elapsedSamples,
        this.samplePreviewSession.start,
        this.samplePreviewSession.end,
      );
    }

    const introLength = Math.max(0, this.samplePreviewSession.loopStart - this.samplePreviewSession.start);
    if (elapsedSamples <= introLength) {
      return clamp(
        this.samplePreviewSession.start + elapsedSamples,
        this.samplePreviewSession.start,
        this.samplePreviewSession.end,
      );
    }

    const loopLength = Math.max(2, this.samplePreviewSession.loopEnd - this.samplePreviewSession.loopStart);
    return this.samplePreviewSession.loopStart + ((elapsedSamples - introLength) % loopLength);
  }

  private getSampleEditorView(snapshot: TrackerSnapshot): { start: number; length: number; end: number } {
    if (
      this.sampleEditorViewOverride
      && this.sampleEditorViewOverride.sample === snapshot.selectedSample
    ) {
      const sampleLength = snapshot.samples[snapshot.selectedSample]?.length ?? 0;
      const length = clamp(this.sampleEditorViewOverride.length, sampleLength > 0 ? 2 : 0, sampleLength || 0);
      const start = clamp(this.sampleEditorViewOverride.start, 0, Math.max(0, sampleLength - Math.max(1, length)));
      return {
        start,
        length,
        end: start + length,
      };
    }

    return {
      start: snapshot.sampleEditor.visibleStart,
      length: snapshot.sampleEditor.visibleLength,
      end: snapshot.sampleEditor.visibleStart + snapshot.sampleEditor.visibleLength,
    };
  }

  private clearSampleEditorViewOverride(): void {
    this.sampleEditorViewOverride = null;
  }

  private formatFineTuneValue(value: number): string {
    return value > 0 ? `+${value}` : String(value);
  }

  private startSampleEditorNumberEdit(field: SampleEditorNumericField): void {
    if (!this.snapshot || !this.canEditSnapshot(this.snapshot)) {
      return;
    }

    const sample = this.snapshot.samples[this.snapshot.selectedSample];
    this.sampleEditorNumberEdit = {
      field,
      value: field === 'volume' ? String(sample.volume) : String(sample.fineTune),
    };
    this.pendingSampleNumberFocus = field;
    this.render();
  }

  private cancelSampleEditorNumberEdit(): void {
    if (!this.sampleEditorNumberEdit) {
      return;
    }

    this.sampleEditorNumberEdit = null;
    this.pendingSampleNumberFocus = null;
    this.render();
  }

  private commitSampleEditorNumberEdit(): void {
    if (!this.engine || !this.snapshot || !this.sampleEditorNumberEdit || !this.canEditSnapshot(this.snapshot)) {
      this.sampleEditorNumberEdit = null;
      this.pendingSampleNumberFocus = null;
      return;
    }

    const { field, value } = this.sampleEditorNumberEdit;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      this.suppressNextModernRender = true;
      this.engine.dispatch({
        type: 'sample/update',
        sample: this.snapshot.selectedSample,
        patch: field === 'volume'
          ? { volume: clamp(Math.round(numeric), 0, 64) }
          : { fineTune: clamp(Math.round(numeric), -8, 7) },
      });
      this.snapshot = this.engine.getSnapshot();
      this.refreshSelectedSampleWaveform(this.snapshot, true);
      this.updateModernLiveRegions(this.snapshot);
    }

    this.sampleEditorNumberEdit = null;
    this.pendingSampleNumberFocus = null;
    this.render();
  }

  private renderModuleStepperCard(
    label: string,
    value: string,
    role: string,
    downAction: string,
    upAction: string,
    enabled: boolean,
  ): string {
    return renderModernModuleStepperCard(label, value, role, downAction, upAction, enabled, iconMarkup(ChevronDown), iconMarkup(ChevronUp));
  }

  private renderModuleValueCard(label: string, value: string, role: string): string {
    return renderModernModuleValueCard(label, value, role);
  }

  private renderTrackHeader(channel: number, snapshot: TrackerSnapshot): string {
    const muted = snapshot.editor.muted[channel] ?? false;
    return renderModernTrackHeader(channel, muted, iconMarkup(muted ? VolumeX : Volume2));
  }

  private mountVisualization(snapshot: TrackerSnapshot): void {
    const host = this.root.querySelector<HTMLElement>('[data-role="visualization-host"]');
    if (!host) {
      return;
    }

    host.className = `visualization-host visualization-host--${this.visualizationMode}`;

    const createSlot = (canvas: HTMLCanvasElement, className = ''): HTMLDivElement => {
      const slot = document.createElement('div');
      slot.className = className ? `visualization-slot ${className}` : 'visualization-slot';
      slot.append(canvas);
      return slot;
    };

    if (this.visualizationMode === 'split') {
      host.replaceChildren(
        createSlot(this.quadrascopeCanvas, 'visualization-slot--scope'),
        createSlot(this.spectrumCanvas, 'visualization-slot--spectrum'),
      );
    } else if (this.visualizationMode === 'piano') {
      host.replaceChildren(createSlot(this.pianoCanvas, 'visualization-slot--piano'));
    } else if (this.visualizationMode === 'spectrum') {
      host.replaceChildren(createSlot(this.spectrumCanvas, 'visualization-slot--spectrum'));
    } else if (this.visualizationMode === 'signal-trails') {
      host.replaceChildren(createSlot(this.trailsCanvas, 'visualization-slot--trails'));
    } else {
      host.replaceChildren(createSlot(this.quadrascopeCanvas, 'visualization-slot--scope'));
    }

    this.drawVisualization(snapshot);
    window.requestAnimationFrame(() => {
      if (this.snapshot === snapshot && this.viewMode === 'modern') {
        this.drawVisualization(snapshot);
      }
    });
  }

  private drawVisualization(snapshot: TrackerSnapshot): void {
    const quadrascope = this.quadrascope ?? snapshot.quadrascope ?? null;
    switch (this.visualizationMode) {
      case 'quad-stack':
        this.drawQuadrascopeStack(quadrascope);
        break;
      case 'quad-classic':
        this.drawQuadrascopeClassic(quadrascope);
        break;
      case 'spectrum':
        this.drawSpectrumAnalyzer(quadrascope);
        break;
      case 'split':
        this.drawQuadrascopeStack(quadrascope);
        this.drawSpectrumAnalyzer(quadrascope);
        break;
      case 'signal-trails':
        this.drawSignalTrails(quadrascope);
        break;
      case 'piano':
        this.syncPianoNotes(snapshot, quadrascope);
        this.drawPianoVisualizer(snapshot, quadrascope);
        break;
    }
  }

  private getSampleWaveformKey(snapshot: TrackerSnapshot): string {
    const sample = snapshot.samples[snapshot.selectedSample];
    const previewKey = (sample.preview ?? []).slice(0, 8).join(',');
    return `${snapshot.selectedSample}:${sample.length}:${previewKey}`;
  }

  private refreshSelectedSampleWaveform(snapshot: TrackerSnapshot, force = false): void {
    if (!this.engine) {
      return;
    }

    const sample = snapshot.samples[snapshot.selectedSample];
    const key = this.getSampleWaveformKey(snapshot);
    if (!force && this.sampleWaveformKey === key && this.sampleWaveform && this.sampleWaveform.length > 0) {
      return;
    }

    try {
      this.sampleWaveform = this.engine.getSampleWaveform(snapshot.selectedSample);
    } catch {
      this.sampleWaveform = null;
    }

    if (this.sampleWaveform && this.sampleWaveform.length > 0) {
      this.sampleWaveformKey = key;
      return;
    }

    this.sampleWaveformKey = null;
  }

  private getWaveformSource(sample: SampleSlot): Int8Array {
    if (this.sampleWaveform && this.sampleWaveform.length > 0) {
      return this.sampleWaveform;
    }

    return Int8Array.from(sample.preview ?? []);
  }

  private drawSelectedSamplePreview(snapshot: TrackerSnapshot): void {
    if (this.viewMode !== 'modern') {
      return;
    }

    this.refreshSelectedSampleWaveform(snapshot);
    drawModernSelectedSamplePreview({
      canvas: this.samplePreviewCanvas,
      snapshot,
      height: SAMPLE_PREVIEW_HEIGHT,
      previewPlayheadOffset: this.getSamplePreviewPlayheadOffset(),
      getWaveformSource: (sample) => this.getWaveformSource(sample),
      drawRoundedRect: (ctx, x, y, width, height, radius) => this.drawRoundedRect(ctx, x, y, width, height, radius),
    });
  }

  private drawSampleEditor(snapshot: TrackerSnapshot): void {
    if (this.viewMode !== 'modern' || !snapshot.sampleEditor.open) {
      return;
    }

    this.refreshSelectedSampleWaveform(snapshot);
    drawModernSampleEditor({
      canvas: this.sampleEditorCanvas,
      snapshot,
      height: SAMPLE_EDITOR_HEIGHT,
      previewPlayheadOffset: this.getSamplePreviewPlayheadOffset(),
      getWaveformSource: (sample) => this.getWaveformSource(sample),
      getSampleEditorView: (nextSnapshot) => this.getSampleEditorView(nextSnapshot),
      getDraftSampleSelection: (nextSnapshot) => this.getDraftSampleSelection(nextSnapshot),
      getDraftSampleLoop: (nextSnapshot) => this.getDraftSampleLoop(nextSnapshot),
      drawRoundedRect: (ctx, x, y, width, height, radius) => this.drawRoundedRect(ctx, x, y, width, height, radius),
    });
  }

  private getSampleEditorLayout(width: number, height: number): { left: number; top: number; width: number; height: number } {
    return getModernSampleEditorLayout(width, height);
  }

  private sampleOffsetToEditorX(offset: number, snapshot: TrackerSnapshot, layout: { left: number; top: number; width: number; height: number }): number {
    return sampleOffsetToModernEditorX(offset, this.getSampleEditorView(snapshot), layout);
  }

  private sampleEditorXToOffset(clientX: number, snapshot: TrackerSnapshot): number {
    const rect = this.sampleEditorCanvas.getBoundingClientRect();
    const layout = this.getSampleEditorLayout(rect.width, rect.height);
    const localX = clamp(clientX - rect.left - layout.left, 0, layout.width);
    const ratio = localX / Math.max(1, layout.width);
    const view = this.getSampleEditorView(snapshot);
    return Math.round(view.start + (ratio * Math.max(1, view.length)));
  }

  private getDraftSampleSelection(snapshot: TrackerSnapshot): { start: number | null; end: number | null } {
    if (this.sampleEditorPointer.active && this.sampleEditorPointer.mode === 'select') {
      const start = Math.min(this.sampleEditorPointer.anchor, this.sampleEditorPointer.current);
      const end = Math.max(this.sampleEditorPointer.anchor, this.sampleEditorPointer.current);
      return { start, end };
    }

    return {
      start: snapshot.sampleEditor.selectionStart,
      end: snapshot.sampleEditor.selectionEnd,
    };
  }

  private getDraftSampleLoop(snapshot: TrackerSnapshot): { start: number; end: number } {
    if (this.sampleEditorPointer.active) {
      if (this.sampleEditorPointer.mode === 'loop-start') {
        return {
          start: Math.min(this.sampleEditorPointer.current, snapshot.sampleEditor.loopEnd - 2),
          end: snapshot.sampleEditor.loopEnd,
        };
      }

      if (this.sampleEditorPointer.mode === 'loop-end') {
        return {
          start: snapshot.sampleEditor.loopStart,
          end: Math.max(this.sampleEditorPointer.current, snapshot.sampleEditor.loopStart + 2),
        };
      }
    }

    return {
      start: snapshot.sampleEditor.loopStart,
      end: snapshot.sampleEditor.loopEnd,
    };
  }

  private ensureScopeAnimation(): void {
    if (this.scopeFrame !== null) {
      return;
    }

    const tick = (): void => {
      this.scopeFrame = window.requestAnimationFrame(tick);
      if (!this.snapshot || this.viewMode !== 'modern') {
        return;
      }

      this.syncSamplePreviewSession(this.snapshot);
      if (this.engine) {
        this.quadrascope = this.engine.getQuadrascope() ?? this.quadrascope;
      }

      if (this.samplePreviewSession) {
        this.drawSelectedSamplePreview(this.snapshot);
        this.drawSampleEditor(this.snapshot);
      }
      this.drawVisualization(this.snapshot);
    };

    this.scopeFrame = window.requestAnimationFrame(tick);
  }

  private drawQuadrascopeStack(quadrascope: QuadrascopeState | null): void {
    if (this.viewMode !== 'modern') {
      return;
    }
    drawModernQuadrascopeStack({
      canvas: this.quadrascopeCanvas,
      quadrascope,
      height: QUADRASCOPE_HEIGHT,
      drawRoundedRect: (ctx, x, y, width, height, radius) => this.drawRoundedRect(ctx, x, y, width, height, radius),
    });
  }

  private drawQuadrascopeClassic(quadrascope: QuadrascopeState | null): void {
    if (this.viewMode !== 'modern') {
      return;
    }
    drawModernQuadrascopeClassic({
      canvas: this.quadrascopeCanvas,
      quadrascope,
      height: QUADRASCOPE_HEIGHT,
      drawRoundedRect: (ctx, x, y, width, height, radius) => this.drawRoundedRect(ctx, x, y, width, height, radius),
    });
  }

  private drawSpectrumAnalyzer(quadrascope: QuadrascopeState | null): void {
    if (this.viewMode !== 'modern') {
      return;
    }
    drawModernSpectrumAnalyzer({
      canvas: this.spectrumCanvas,
      quadrascope,
      height: SPECTRUM_HEIGHT,
      compact: this.visualizationMode === 'split',
      drawRoundedRect: (ctx, x, y, width, height, radius) => this.drawRoundedRect(ctx, x, y, width, height, radius),
    });
  }

  private drawSignalTrails(quadrascope: QuadrascopeState | null): void {
    if (this.viewMode !== 'modern') {
      return;
    }
    drawModernSignalTrails({
      canvas: this.trailsCanvas,
      quadrascope,
      trailColumns: this.trailColumns,
      height: QUADRASCOPE_HEIGHT,
      drawRoundedRect: (ctx, x, y, width, height, radius) => this.drawRoundedRect(ctx, x, y, width, height, radius),
    });
  }

  private syncPianoNotes(snapshot: TrackerSnapshot, quadrascope: QuadrascopeState | null): void {
    void quadrascope;
    this.lastPianoTransportKey = syncModernPianoNotes(
      snapshot,
      this.lastPianoTransportKey,
      this.activePianoNotes,
      this.pianoGlowLevels,
    );
  }

  private triggerPianoGlow(channel: number, absolute: number): void {
    triggerModernPianoGlow(this.pianoGlowLevels, channel, absolute);
  }

  private decayPianoGlow(): void {
    this.pianoLastFrameAt = decayPianoGlowLevels(this.pianoGlowLevels, this.pianoLastFrameAt);
  }

  private drawPianoVisualizer(snapshot: TrackerSnapshot, quadrascope: QuadrascopeState | null): void {
    if (this.viewMode !== 'modern') {
      return;
    }
    this.decayPianoGlow();
    void snapshot;
    void quadrascope;
    drawModernPianoVisualizer({
      canvas: this.pianoCanvas,
      pianoGlowLevels: this.pianoGlowLevels,
      height: PIANO_HEIGHT,
      drawRoundedRect: (ctx, x, y, width, height, radius) => this.drawRoundedRect(ctx, x, y, width, height, radius),
    });
  }

  private drawPatternCanvas(snapshot: TrackerSnapshot): void {
    if (this.viewMode !== 'modern') {
      return;
    }

    const host = this.root.querySelector<HTMLElement>('[data-role="pattern-host"]');
    if (!host) {
      return;
    }

    drawModernPatternCanvas({
      canvas: this.patternCanvas,
      snapshot,
      hostWidth: host.clientWidth || host.getBoundingClientRect().width || 960,
      visibleRowCount: MODERN_VISIBLE_PATTERN_ROWS,
      rowHeight: PATTERN_ROW_HEIGHT,
      gutter: PATTERN_GUTTER,
      rowIndexWidth: PATTERN_ROW_INDEX_WIDTH,
      minChannelWidth: PATTERN_MIN_CHANNEL_WIDTH,
      drawRoundedRect: (ctx, x, y, width, height, radius) => this.drawRoundedRect(ctx, x, y, width, height, radius),
    });
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  private getPatternViewportStartRow(snapshot: TrackerSnapshot): number {
    return getModernPatternViewportStartRow(snapshot, MODERN_VISIBLE_PATTERN_ROWS);
  }

  private getPatternCanvasLayout(width: number): { gridLeft: number; channelWidth: number } {
    return getModernPatternCanvasLayout(width, PATTERN_ROW_INDEX_WIDTH, PATTERN_GUTTER, PATTERN_MIN_CHANNEL_WIDTH);
  }

  private getPatternFieldRects(x: number, width: number): Record<CursorField, { x: number; width: number }> {
    return getModernPatternFieldRects(x, width);
  }

  private renderCenteredPatternRows(snapshot: TrackerSnapshot): string {
    const anchorOffset = Math.floor(MODERN_VISIBLE_PATTERN_ROWS / 2);
    const anchorRow = snapshot.transport.playing ? snapshot.transport.row : snapshot.cursor.row;
    const rows: string[] = [];

    for (let visibleIndex = 0; visibleIndex < MODERN_VISIBLE_PATTERN_ROWS; visibleIndex += 1) {
      const rowIndex = anchorRow + visibleIndex - anchorOffset;
      const row = snapshot.pattern.rows[rowIndex];

      if (!row) {
        rows.push(this.renderPatternPaddingRow(snapshot.pattern.rows[0]?.channels.length ?? 4));
        continue;
      }

      rows.push(this.renderModernPatternRow(row.index, row.channels, snapshot, visibleIndex === anchorOffset));
    }

    return rows.join('');
  }

  private renderPatternPaddingRow(channelCount: number): string {
    return renderModernPatternPaddingRow(channelCount);
  }

  private renderModernPatternRow(
    rowIndex: number,
    cells: PatternCell[],
    snapshot: TrackerSnapshot,
    centered: boolean,
  ): string {
    return renderModernPatternRowMarkup(rowIndex, cells, snapshot, centered);
  }

  private getSampleCardLabel(sample: SampleSlot): string {
    return getModernSampleCardLabel(sample);
  }

  private getSelectedSampleHeading(sample: SampleSlot): string {
    return getModernSelectedSampleHeading(sample);
  }

  private getSamplePageCount(snapshot: TrackerSnapshot): number {
    return getModernSamplePageCount(snapshot.samples.length, SAMPLE_PAGE_SIZE);
  }

  private resolveSamplePage(snapshot: TrackerSnapshot): number {
    const pageCount = this.getSamplePageCount(snapshot);
    let page = clamp(this.samplePage, 0, pageCount - 1);

    if (snapshot.selectedSample !== this.lastSelectedSample) {
      page = clamp(Math.floor(snapshot.selectedSample / SAMPLE_PAGE_SIZE), 0, pageCount - 1);
      this.lastSelectedSample = snapshot.selectedSample;
    }

    this.samplePage = page;
    return page;
  }

  private getSamplePanelKey(snapshot: TrackerSnapshot, samplePage: number): string {
    return getModernSamplePanelKey(snapshot, samplePage, SAMPLE_PAGE_SIZE);
  }

  private renderSampleBank(snapshot: TrackerSnapshot, samplePage: number): string {
    return renderModernSampleBank(snapshot, samplePage, SAMPLE_PAGE_SIZE);
  }

  private getSampleEditorZoomAnchor(): number {
    if (!this.snapshot) {
      return 0;
    }

    if (this.snapshot.sampleEditor.selectionStart !== null && this.snapshot.sampleEditor.selectionEnd !== null) {
      return Math.round((this.snapshot.sampleEditor.selectionStart + this.snapshot.sampleEditor.selectionEnd) / 2);
    }

    const view = this.getSampleEditorView(this.snapshot);
    return Math.round(view.start + (view.length / 2));
  }

  private renderSelectedSamplePanel(sample: SampleSlot, snapshot: TrackerSnapshot): string {
    return renderModernSelectedSamplePanel({
      sample,
      editable: this.canEditSnapshot(snapshot),
      samplePreviewPlaying: this.samplePreviewPlaying,
      sampleTitleHtml: this.renderSampleTitleHtml(snapshot),
      playIconHtml: iconMarkup(Play),
      stopIconHtml: iconMarkup(Square),
      editIconHtml: iconMarkup(PencilLine),
      replaceIconHtml: iconMarkup(FileUp),
    });
  }

  private renderSampleEditorPanel(snapshot: TrackerSnapshot): string {
    return renderModernSampleEditorPanel({
      snapshot,
      editable: this.canEditSnapshot(snapshot),
      samplePreviewPlaying: this.samplePreviewPlaying,
      collapsed: this.collapsedSections.editor,
      collapseIconHtml: this.getSectionCollapseIcon('editor'),
      selectedSampleTitleHtml: this.renderSampleTitleHtml(snapshot),
      view: this.getSampleEditorView(snapshot),
      showAllIconHtml: iconMarkup(ArrowLeftRight),
      showSelectionIconHtml: iconMarkup(Focus),
      playIconHtml: iconMarkup(Play),
      stopIconHtml: iconMarkup(Square),
      loopIconHtml: iconMarkup(Repeat),
      volumeIconHtml: iconMarkup(SlidersHorizontal),
      fineTuneIconHtml: iconMarkup(ArrowUpDown),
      cropIconHtml: iconMarkup(Crop),
      cutIconHtml: iconMarkup(Scissors),
      backIconHtml: iconMarkup(ArrowLeft),
      volumePopoverOpen: this.openSampleEditorPopover === 'volume',
      fineTunePopoverOpen: this.openSampleEditorPopover === 'fineTune',
      volumeEditOpen: this.sampleEditorNumberEdit?.field === 'volume',
      fineTuneEditOpen: this.sampleEditorNumberEdit?.field === 'fineTune',
      volumeEditValue: this.sampleEditorNumberEdit?.field === 'volume' ? this.sampleEditorNumberEdit.value : String(snapshot.samples[snapshot.selectedSample].volume),
      fineTuneEditValue: this.sampleEditorNumberEdit?.field === 'fineTune' ? this.sampleEditorNumberEdit.value : String(snapshot.samples[snapshot.selectedSample].fineTune),
    });
  }

  private renderClassicDebug(): string {
    return renderModernClassicDebug(this.viewMode === 'classic' && SHOW_CLASSIC_DEBUG);
  }

  private async handleClick(event: Event): Promise<void> {
    const element = event.target instanceof Element ? event.target : null;
    if (this.aboutOpen && element?.classList.contains('modal-overlay')) {
      this.aboutOpen = false;
      this.render();
      return;
    }

    const target = element?.closest('[data-action]') as HTMLElement | null;
    if (!target) {
      if (this.openMenu && !element?.closest('.menubar-shell')) {
        this.openMenu = null;
        this.render();
      }
      return;
    }

    switch (target.dataset.action) {
      case 'toggle-menu-file':
        this.toggleMenu('file');
        return;
      case 'toggle-menu-help':
        this.toggleMenu('help');
        return;
      case 'toggle-section-module':
        this.toggleSection('module');
        return;
      case 'toggle-section-visualization':
        this.toggleSection('visualization');
        return;
      case 'toggle-section-editor':
        this.toggleSection('editor');
        return;
      case 'toggle-section-samples':
        this.toggleSection('samples');
        return;
      case 'toggle-section-classic':
        this.toggleSection('classic');
        return;
      case 'sample-editor-open-volume':
        this.toggleSampleEditorPopover('volume');
        return;
      case 'sample-editor-open-finetune':
        this.toggleSampleEditorPopover('fineTune');
        return;
      case 'open-about':
        this.openMenu = null;
        this.aboutOpen = true;
        this.render();
        return;
      case 'close-about':
        this.aboutOpen = false;
        this.render();
        return;
    }

    if (!this.engine || !this.snapshot) {
      return;
    }

    if (
      this.openSampleEditorPopover
      && target.dataset.action !== 'sample-editor-open-volume'
      && target.dataset.action !== 'sample-editor-open-finetune'
    ) {
      this.openSampleEditorPopover = null;
      this.sampleEditorNumberEdit = null;
      this.pendingSampleNumberFocus = null;
    }

    const menuWasOpen = this.openMenu !== null;
    await handleModernClickAction({
      target,
      engine: this.engine,
      snapshot: this.snapshot,
      moduleInput: this.moduleInput,
      sampleInput: this.sampleInput,
        keyboardOctave: this.keyboardOctave,
        preferredTransportMode: this.preferredTransportMode,
        sampleEditorViewOverride: this.sampleEditorViewOverride,
      canEditSnapshot: (snapshot) => this.canEditSnapshot(snapshot),
      clearSampleEditorViewOverride: () => this.clearSampleEditorViewOverride(),
      getSampleEditorView: (snapshot) => this.getSampleEditorView(snapshot),
      getSampleEditorZoomAnchor: () => this.getSampleEditorZoomAnchor(),
      getSamplePageCount: (snapshot) => this.getSamplePageCount(snapshot),
      refreshSelectedSampleWaveform: (snapshot, force) => this.refreshSelectedSampleWaveform(snapshot, force),
      releaseClassicKeys: () => this.releaseClassicKeys(),
      render: () => this.render(),
      resolveSamplePage: (snapshot) => this.resolveSamplePage(snapshot),
      startSamplePreviewSession: (nextSnapshot, mode) => this.startSamplePreviewSession(nextSnapshot, mode),
      stopSamplePreviewSession: () => this.stopSamplePreviewSession(false),
      setKeyboardOctave: (value) => { this.keyboardOctave = value; },
        setLastSelectedSample: (value) => { this.lastSelectedSample = value; },
        setPendingSampleImportSlot: (value) => { this.pendingSampleImportSlot = value; },
        setPreferredTransportMode: (value) => { this.preferredTransportMode = value; },
        setSampleEditorViewOverride: (value) => { this.sampleEditorViewOverride = value; },
        setSamplePage: (value) => { this.samplePage = value; },
        setSamplePreviewPlaying: (value) => { this.samplePreviewPlaying = value; },
        setSnapshot: (snapshot) => { this.snapshot = snapshot; },
        setViewMode: (mode) => { this.viewMode = mode; },
        setVisualizationMode: (mode) => { this.visualizationMode = mode; },
        shiftVisualization: (direction) => this.shiftVisualization(direction),
        updateModernLiveRegions: (snapshot) => this.updateModernLiveRegions(snapshot),
      });
    if (menuWasOpen) {
      this.openMenu = null;
      this.render();
    }
  }

  private async handleChange(event: Event): Promise<void> {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    if (event.target.dataset.inlineRename) {
      this.commitInlineRename();
      return;
    }

    if (event.target.dataset.inlineSampleNumber) {
      this.commitSampleEditorNumberEdit();
      return;
    }

    if (!this.engine) {
      return;
    }

    if (event.target === this.moduleInput) {
      await loadModuleFromInput(this.engine, this.moduleInput);
      this.stopSamplePreviewSession(false);
      return;
    }

    if (event.target === this.sampleInput) {
      await loadSampleFromInput({
        engine: this.engine,
        input: this.sampleInput,
        pendingSampleImportSlot: this.pendingSampleImportSlot,
        onLoaded: (snapshot) => {
          this.snapshot = snapshot;
          this.refreshSelectedSampleWaveform(snapshot, true);
          this.stopSamplePreviewSession(false);
          this.render();
        },
      });
      this.pendingSampleImportSlot = null;
      return;
    }

    this.handleInput(event);
  }

  private handleInput(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    if (event.target.dataset.inlineRename) {
      if (this.renameState) {
        this.renameState = {
          ...this.renameState,
          value: event.target.value,
        };
      }
      return;
    }

    if (event.target.dataset.inlineSampleNumber) {
      if (this.sampleEditorNumberEdit) {
        this.sampleEditorNumberEdit = {
          ...this.sampleEditorNumberEdit,
          value: event.target.value,
        };
      }
      return;
    }

    if (!this.engine || !this.snapshot) {
      return;
    }

    handleModernInputAction({
      target: event.target,
      engine: this.engine,
      snapshot: this.snapshot,
      canEditSnapshot: (snapshot) => this.canEditSnapshot(snapshot),
      getSampleEditorView: (snapshot) => this.getSampleEditorView(snapshot),
      refreshSelectedSampleWaveform: (snapshot, force) => this.refreshSelectedSampleWaveform(snapshot, force),
      setSuppressNextModernRender: (value) => { this.suppressNextModernRender = value; },
      setSampleEditorViewOverride: (value) => { this.sampleEditorViewOverride = value; },
      setSnapshot: (snapshot) => { this.snapshot = snapshot; },
      updateModernLiveRegions: (snapshot) => this.updateModernLiveRegions(snapshot),
    });
  }

  private handleDoubleClick(event: Event): void {
    const element = event.target instanceof Element ? event.target : null;
    const sampleNumberTarget = element?.closest('[data-popover-value-edit]') as HTMLElement | null;
    if (sampleNumberTarget) {
      const field = sampleNumberTarget.dataset.popoverValueEdit;
      if (field === 'volume' || field === 'fineTune') {
        this.startSampleEditorNumberEdit(field);
        return;
      }
    }

    const renameTarget = element?.closest('[data-rename-target]') as HTMLElement | null;
    if (!renameTarget) {
      return;
    }

    const kind = renameTarget.dataset.renameTarget === 'song' ? 'song' : 'sample';
    this.startInlineRename(kind);
  }

  private handleRootMouseOver(event: MouseEvent): void {
    if (!this.openMenu) {
      return;
    }

    const target = event.target instanceof Element ? event.target.closest('[data-menu-trigger]') as HTMLElement | null : null;
    if (!target) {
      return;
    }

    const menu = target.dataset.menuTrigger;
    if ((menu === 'file' || menu === 'help') && menu !== this.openMenu) {
      this.openMenu = menu;
      this.render();
    }
  }

  private handleWindowPointerDown(event: MouseEvent): void {
    if (!this.openMenu && !this.aboutOpen && !this.openSampleEditorPopover && !this.sampleEditorNumberEdit) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (this.openMenu && target && !target.closest('.menubar-shell')) {
      this.openMenu = null;
      this.render();
      return;
    }

    if (this.aboutOpen && target && !target.closest('.modal-card') && !target.closest('[data-action="open-about"]')) {
      this.aboutOpen = false;
      this.render();
    }

    if (
      this.openSampleEditorPopover
      && target
      && !target.closest('.tool-popover')
      && !target.closest('[data-action="sample-editor-open-volume"]')
      && !target.closest('[data-action="sample-editor-open-finetune"]')
    ) {
      this.openSampleEditorPopover = null;
      this.sampleEditorNumberEdit = null;
      this.render();
    }
  }

  private moveModernCursor(row: number, channel: number, field: CursorField): void {
    if (!this.engine || !this.snapshot) {
      return;
    }

    this.engine.dispatch({
      type: 'cursor/set',
      row: clamp(row, 0, Math.max(0, this.snapshot.pattern.rows.length - 1)),
      channel: clamp(channel, 0, Math.max(0, (this.snapshot.pattern.rows[0]?.channels.length ?? 4) - 1)),
      field,
    });
    this.snapshot = this.engine.getSnapshot();
  }

  private previewModernNote(note: string, channel: number): void {
    if (!this.engine) {
      return;
    }

    this.engine.dispatch({ type: 'note-preview/play', note, channel });
    this.modernNotePreviewActive = true;
  }

  private stopModernNotePreview(): void {
    if (!this.engine || !this.modernNotePreviewActive) {
      return;
    }

    this.engine.dispatch({ type: 'note-preview/stop' });
    this.modernNotePreviewActive = false;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement && event.target.dataset.inlineRename) {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.commitInlineRename();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.cancelInlineRename();
      }
      return;
    }

    if (event.target instanceof HTMLInputElement && event.target.dataset.inlineSampleNumber) {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.commitSampleEditorNumberEdit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.cancelSampleEditorNumberEdit();
      }
      return;
    }

    if (event.key === 'Escape') {
      if (this.sampleEditorNumberEdit) {
        this.cancelSampleEditorNumberEdit();
        return;
      }

      if (this.openSampleEditorPopover) {
        this.openSampleEditorPopover = null;
        this.render();
        return;
      }

      if (this.aboutOpen) {
        this.aboutOpen = false;
        this.render();
        return;
      }

      if (this.openMenu) {
        this.openMenu = null;
        this.render();
        return;
      }
    }

    if (this.viewMode === 'classic') {
      this.handleClassicKeyDown(event);
      return;
    }

    if (!isEditableTarget(event.target)) {
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    if (!this.engine || !this.snapshot || isEditableTarget(event.target)) {
      return;
    }

    if (this.snapshot.sampleEditor.open) {
      return;
    }

    const outcome = interpretKeyboard(event, this.snapshot, this.keyboardOctave);
    if (!outcome) {
      if (this.handleModernHexEntry(event)) {
        this.snapshot = this.engine.getSnapshot();
        this.updateModernLiveRegions(this.snapshot);
      }
      return;
    }

    event.preventDefault();

    if (typeof outcome.octave === 'number') {
      this.keyboardOctave = outcome.octave;
      this.updateModernLiveRegions(this.snapshot);
    }

    if (outcome.transport) {
      if (outcome.transport.type === 'transport/toggle') {
        const playMode = this.preferredTransportMode;
        this.engine.setTransport({
          type: this.snapshot.transport.playing
            ? 'transport/pause'
            : playMode === 'pattern'
              ? 'transport/play-pattern'
              : 'transport/play-song',
        });
      } else {
        if (outcome.transport.type === 'transport/play-song') {
          this.preferredTransportMode = 'song';
        } else if (outcome.transport.type === 'transport/play-pattern') {
          this.preferredTransportMode = 'pattern';
        }
        this.engine.setTransport(outcome.transport);
      }
      this.snapshot = this.engine.getSnapshot();
      this.updateModernLiveRegions(this.snapshot);
    }

    if (outcome.command) {
      if (outcome.command.type === 'pattern/set-cell' && outcome.command.patch.note) {
        const lastAcceptedAt = this.modernRecentNoteKeyTimes.get(event.code) ?? -Infinity;
        if (event.repeat || this.modernPressedNoteKeys.has(event.code) || (event.timeStamp - lastAcceptedAt) < 40) {
          return;
        }

        this.modernPressedNoteKeys.add(event.code);
        this.modernRecentNoteKeyTimes.set(event.code, event.timeStamp);
        const channel = this.snapshot.cursor.channel;
        this.suppressNextModernRender = true;
        this.engine.dispatch(outcome.command);
        this.previewModernNote(outcome.command.patch.note, channel);
        const absolute = noteToAbsolute(outcome.command.patch.note);
        if (absolute !== null) {
          this.triggerPianoGlow(channel, absolute);
        }
        this.snapshot = this.engine.getSnapshot();
        this.suppressNextModernRender = true;
        this.moveModernCursor(this.snapshot.cursor.row + 1, channel, 'note');
        this.updateModernLiveRegions(this.snapshot);
        return;
      }

      this.engine.dispatch(outcome.command);
      this.snapshot = this.engine.getSnapshot();
      this.updateModernLiveRegions(this.snapshot);
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (this.viewMode === 'modern' && !isEditableTarget(event.target)) {
      event.stopPropagation();
      event.stopImmediatePropagation();
      const note = getKeyboardNoteFromKey(event.key, this.keyboardOctave);
      if (note) {
        this.modernPressedNoteKeys.delete(event.code);
        this.stopModernNotePreview();
      }
    }

    if (this.viewMode !== 'classic' || !this.engine || isEditableTarget(event.target)) {
      return;
    }

    const translation = translateClassicKeyboardEvent(event) ?? this.classicPressedKeys.get(event.code);
    if (!translation) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.classicPressedKeys.delete(event.code);
    this.engine.forwardClassicKeyUp(
      translation.scancode,
      translation.keycode,
      event.shiftKey,
      event.ctrlKey,
      event.altKey,
      event.metaKey,
    );
  }

  private handleKeyPress(event: KeyboardEvent): void {
    if (this.viewMode !== 'modern' || isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  private applyCellPatch(row: number, channel: number, patch: Partial<PatternCell>): void {
    if (!this.engine) {
      return;
    }

    this.engine.dispatch({
      type: 'pattern/set-cell',
      row,
      channel,
      patch,
    });
  }

  private scheduleLayoutRefresh(): void {
    if (!this.engine) {
      return;
    }

    if (this.layoutRefreshFrame !== null) {
      window.cancelAnimationFrame(this.layoutRefreshFrame);
    }

    this.layoutRefreshFrame = window.requestAnimationFrame(() => {
      this.layoutRefreshFrame = null;
      this.engine?.refreshLayout();
    });
  }

  private syncSnapshotPolling(): void {
    const shouldPoll = Boolean(
      this.engine &&
      this.snapshot &&
      (
        this.viewMode === 'classic' ||
        this.snapshot.transport.playing
      ),
    );
    const targetIntervalMs = this.viewMode === 'classic' ? 50 : 33;

    if (!shouldPoll) {
      if (this.snapshotPollTimer !== null) {
        window.clearInterval(this.snapshotPollTimer);
        this.snapshotPollTimer = null;
      }
      this.snapshotPollIntervalMs = null;
      return;
    }

    if (this.snapshotPollTimer !== null && this.snapshotPollIntervalMs === targetIntervalMs) {
      return;
    }

    if (this.snapshotPollTimer !== null) {
      window.clearInterval(this.snapshotPollTimer);
      this.snapshotPollTimer = null;
    }

    this.snapshotPollIntervalMs = targetIntervalMs;
    this.snapshotPollTimer = window.setInterval(() => {
      if (!this.engine || !this.snapshot) {
        return;
      }

      this.snapshot = this.engine.getSnapshot();
      if (this.viewMode === 'classic') {
        this.updateClassicDebugPanel(this.snapshot);
        return;
      }

      this.updateModernLiveRegions(this.snapshot);
    }, targetIntervalMs);
  }

  private updateModernLiveRegions(snapshot: TrackerSnapshot): void {
    if (this.viewMode !== 'modern') {
      return;
    }

    this.refreshSelectedSampleWaveform(snapshot);
    if (this.renameState?.kind !== 'song') {
      this.setLiveHtml('song-title', this.renderSongTitleHtml(snapshot));
    }
    this.setLiveText('metric-position', String(snapshot.transport.position).padStart(2, '0'));
    this.setLiveText('metric-pattern', String(snapshot.pattern.index).padStart(2, '0'));
    this.setLiveText('metric-length', String(snapshot.song.length).padStart(2, '0'));
    this.setLiveText('metric-bpm', String(snapshot.transport.bpm));
    this.setLiveText('metric-time', formatSongTime(snapshot));
    this.setLiveText('metric-size', `${snapshot.song.sizeBytes} bytes`);
    this.setLiveText('octave-value', `Octave ${this.keyboardOctave}`);
    this.setLiveText('visualization-label', getVisualizationLabel(this.visualizationMode));
    this.updateSamplePanel(snapshot);
    this.updateTrackMuteButtons(snapshot);

    const playbackMode = snapshot.transport.playing ? snapshot.transport.mode : this.preferredTransportMode;
    const transportToggle = this.root.querySelector<HTMLButtonElement>('[data-role="module-transport-toggle"]');
    if (transportToggle) {
      transportToggle.disabled = false;
      transportToggle.classList.toggle('is-active', snapshot.transport.playing);
      transportToggle.dataset.action = 'transport-toggle';
      transportToggle.title = snapshot.transport.playing ? 'Pause playback' : (playbackMode === 'pattern' ? 'Play pattern' : 'Play module');
      transportToggle.setAttribute('aria-label', transportToggle.title);
      transportToggle.innerHTML = `${iconMarkup(snapshot.transport.playing ? Pause : Play)}<span class="sr-only">${transportToggle.title}</span>`;
    }

    const transportMode = this.root.querySelector<HTMLButtonElement>('[data-role="module-transport-mode"]');
    if (transportMode) {
      transportMode.classList.toggle('is-active', playbackMode === 'pattern');
      transportMode.title = playbackMode === 'pattern' ? 'Pattern playback' : 'Module playback';
      transportMode.setAttribute('aria-label', transportMode.title);
      const modeValue = transportMode.querySelector<HTMLElement>('.tool-icon-button__value');
      if (modeValue) {
        modeValue.textContent = playbackMode === 'pattern' ? 'P' : 'M';
      }
    }

    const audioMode = this.root.querySelector<HTMLButtonElement>('[data-role="module-audio-mode"]');
    if (audioMode) {
      audioMode.classList.toggle('is-active', !snapshot.audio.stereo);
      audioMode.title = snapshot.audio.stereo ? 'Stereo playback' : 'Mono playback';
      audioMode.setAttribute('aria-label', audioMode.title);
      audioMode.innerHTML = `${iconMarkup(Volume2)}<span class="tool-icon-button__value" aria-hidden="true">${snapshot.audio.stereo ? 'S' : 'M'}</span><span class="sr-only">${audioMode.title}</span>`;
    }

    for (const action of [
      'song-position-down',
      'song-position-up',
      'song-pattern-down',
      'song-pattern-up',
      'song-length-down',
      'song-length-up',
      'song-bpm-down',
      'song-bpm-up',
    ]) {
      const button = this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      if (button) {
        button.disabled = !this.canEditSnapshot(snapshot);
      }
    }

    for (const [action, active] of [['octave-set-1', this.keyboardOctave === 1], ['octave-set-2', this.keyboardOctave === 2]] as const) {
      const button = this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      if (button) {
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }

    const samplePreviewToggle = this.root.querySelector<HTMLButtonElement>('[data-role="sample-preview-toggle"]');
    if (samplePreviewToggle) {
      samplePreviewToggle.disabled = snapshot.samples[snapshot.selectedSample]?.length <= 0;
      samplePreviewToggle.dataset.action = this.samplePreviewPlaying ? 'sample-preview-stop' : 'sample-preview-play';
      samplePreviewToggle.innerHTML = `${iconMarkup(this.samplePreviewPlaying ? Square : Play)}<span class="sr-only">${this.samplePreviewPlaying ? 'Stop preview' : 'Play preview'}</span>`;
    }

    const sampleLoadSelected = this.root.querySelector<HTMLButtonElement>('[data-action="sample-load-selected"]');
    if (sampleLoadSelected) {
      sampleLoadSelected.disabled = !this.canEditSnapshot(snapshot);
      sampleLoadSelected.title = snapshot.samples[snapshot.selectedSample]?.length > 0 ? 'Replace sample' : 'Load sample';
      sampleLoadSelected.setAttribute('aria-label', sampleLoadSelected.title);
    }

    const sampleEditorPreviewToggle = this.root.querySelector<HTMLButtonElement>('[data-role="sample-editor-preview-toggle"]');
    if (sampleEditorPreviewToggle) {
      sampleEditorPreviewToggle.disabled = snapshot.samples[snapshot.selectedSample]?.length <= 0;
      sampleEditorPreviewToggle.dataset.action = this.samplePreviewPlaying ? 'sample-editor-stop' : 'sample-editor-preview';
      sampleEditorPreviewToggle.innerHTML = `${iconMarkup(this.samplePreviewPlaying ? Square : Play)}<span class="sr-only">${this.samplePreviewPlaying ? 'Stop preview' : 'Play preview'}</span>`;
    }

    const hasSampleSelection = snapshot.sampleEditor.selectionStart !== null
      && snapshot.sampleEditor.selectionEnd !== null
      && snapshot.sampleEditor.selectionEnd - snapshot.sampleEditor.selectionStart >= 2;

    const sampleEditorShowSelectionButton = this.root.querySelector<HTMLButtonElement>('[data-action="sample-editor-show-selection"]');
    if (sampleEditorShowSelectionButton) {
      sampleEditorShowSelectionButton.disabled = !hasSampleSelection;
    }

    const sampleEditorCropButton = this.root.querySelector<HTMLButtonElement>('[data-action="sample-editor-crop"]');
    if (sampleEditorCropButton) {
      sampleEditorCropButton.disabled = !this.canEditSnapshot(snapshot) || !hasSampleSelection;
    }

    const sampleEditorCutButton = this.root.querySelector<HTMLButtonElement>('[data-action="sample-editor-cut"]');
    if (sampleEditorCutButton) {
      sampleEditorCutButton.disabled = !this.canEditSnapshot(snapshot) || !hasSampleSelection;
    }
    const loopEnabled = snapshot.samples[snapshot.selectedSample].loopLength > 2 && snapshot.samples[snapshot.selectedSample].length > 2;
    const sampleEditorLoopToggle = this.root.querySelector<HTMLButtonElement>('[data-action="sample-editor-toggle-loop"]');
    if (sampleEditorLoopToggle) {
      sampleEditorLoopToggle.disabled = !this.canEditSnapshot(snapshot) || snapshot.samples[snapshot.selectedSample].length <= 1;
      sampleEditorLoopToggle.classList.toggle('is-active', loopEnabled);
      sampleEditorLoopToggle.setAttribute('aria-pressed', loopEnabled ? 'true' : 'false');
    }

    const sample = snapshot.samples[snapshot.selectedSample];
    const sampleEditorVolumeButton = this.root.querySelector<HTMLButtonElement>('[data-action="sample-editor-open-volume"]');
    if (sampleEditorVolumeButton) {
      sampleEditorVolumeButton.disabled = !this.canEditSnapshot(snapshot) || sample.length <= 0;
      sampleEditorVolumeButton.classList.toggle('is-active', this.openSampleEditorPopover === 'volume');
      sampleEditorVolumeButton.title = `Volume ${sample.volume}`;
      sampleEditorVolumeButton.setAttribute('aria-label', `Volume ${sample.volume}`);
      const volumeValue = sampleEditorVolumeButton.querySelector<HTMLElement>('.tool-icon-button__value');
      if (volumeValue) {
        volumeValue.textContent = String(sample.volume);
      }
    }

    const sampleEditorFineTuneButton = this.root.querySelector<HTMLButtonElement>('[data-action="sample-editor-open-finetune"]');
    if (sampleEditorFineTuneButton) {
      const fineTuneText = this.formatFineTuneValue(sample.fineTune);
      sampleEditorFineTuneButton.disabled = !this.canEditSnapshot(snapshot) || sample.length <= 0;
      sampleEditorFineTuneButton.classList.toggle('is-active', this.openSampleEditorPopover === 'fineTune');
      sampleEditorFineTuneButton.title = `Fine tune ${fineTuneText}`;
      sampleEditorFineTuneButton.setAttribute('aria-label', `Fine tune ${fineTuneText}`);
      const fineTuneValue = sampleEditorFineTuneButton.querySelector<HTMLElement>('.tool-icon-button__value');
      if (fineTuneValue) {
        fineTuneValue.textContent = fineTuneText;
      }
    }

    this.setLiveText('sample-editor-length', String(sample.length));
    if (this.sampleEditorNumberEdit?.field !== 'volume') {
      this.setLiveText('sample-editor-volume-display', String(sample.volume));
    }
    this.syncInputValues('sample-volume', String(sample.volume));
    if (this.sampleEditorNumberEdit?.field !== 'fineTune') {
      this.setLiveText('sample-editor-finetune-display', this.formatFineTuneValue(sample.fineTune));
    }
    this.syncInputValues('sample-finetune', String(sample.fineTune));

    const view = this.getSampleEditorView(snapshot);
    const sampleEditorScroll = this.root.querySelector<HTMLInputElement>('[data-input="sample-editor-scroll"]');
    if (sampleEditorScroll) {
      const max = Math.max(0, snapshot.sampleEditor.sampleLength - view.length);
      sampleEditorScroll.max = String(max);
      sampleEditorScroll.value = String(clamp(view.start, 0, max));
      sampleEditorScroll.disabled = snapshot.sampleEditor.sampleLength <= 0;
    }
    this.updateSampleEditorScrollbarThumb(snapshot.sampleEditor.sampleLength, view.length);

    this.setLiveText('sample-editor-visible', `${view.start} - ${view.end}`);
    this.setLiveText('sample-editor-loop', `${snapshot.sampleEditor.loopStart} - ${snapshot.sampleEditor.loopEnd}`);

    if (snapshot.sampleEditor.open) {
      this.drawSampleEditor(snapshot);
    } else {
      this.drawPatternCanvas(snapshot);
    }
    this.drawSelectedSamplePreview(snapshot);
    this.drawVisualization(snapshot);
  }

  private updateTrackMuteButtons(snapshot: TrackerSnapshot): void {
    updateModernTrackMuteButtons({
      root: this.root,
      snapshot,
      renderMuteIcon: (muted) => iconMarkup(muted ? VolumeX : Volume2),
    });
  }

  private updateSamplePanel(snapshot: TrackerSnapshot): void {
    this.samplePanelKey = updateModernSamplePanel({
      root: this.root,
      snapshot,
      samplePanelKey: this.samplePanelKey,
      samplePreviewCanvas: this.samplePreviewCanvas,
      formatSelectedSampleHint: (sample) => formatSampleLength(sample),
      resolveSamplePage: (nextSnapshot) => this.resolveSamplePage(nextSnapshot),
      getSamplePageCount: (nextSnapshot) => this.getSamplePageCount(nextSnapshot),
      getSamplePanelKey: (nextSnapshot, samplePage) => this.getSamplePanelKey(nextSnapshot, samplePage),
      getSelectedSampleHeading: (sample) => this.getSelectedSampleHeading(sample),
      renderSampleBank: (nextSnapshot, samplePage) => this.renderSampleBank(nextSnapshot, samplePage),
      renderSelectedSamplePanel: (sample, nextSnapshot) => this.renderSelectedSamplePanel(sample, nextSnapshot),
      renderSelectedSampleTitle: (_sample) => this.renderSampleTitleHtml(snapshot),
      syncSelectedSampleTitle: this.renameState?.kind !== 'sample',
    });
  }

  private setLiveText(role: string, value: string): void {
    setModernLiveText(this.root, role, value);
  }

  private setLiveHtml(role: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(`[data-role="${role}"]`);
    if (element) {
      element.innerHTML = value;
    }
  }

  private syncInputValues(inputKey: string, value: string): void {
    for (const input of this.root.querySelectorAll<HTMLInputElement>(`[data-input="${inputKey}"]`)) {
      if (input.value !== value) {
        input.value = value;
      }
    }
  }

  private updateSampleEditorScrollbarThumb(sampleLength: number, viewLength: number): void {
    const scrollbar = this.root.querySelector<HTMLInputElement>('[data-input="sample-editor-scroll"]');
    if (!scrollbar) {
      return;
    }

    const trackWidth = scrollbar.clientWidth || scrollbar.getBoundingClientRect().width;
    if (trackWidth <= 0) {
      return;
    }

    const ratio = sampleLength <= 0 ? 1 : clamp(viewLength / sampleLength, 0, 1);
    const thumbWidth = Math.max(24, Math.round(trackWidth * ratio));
    scrollbar.style.setProperty('--sample-editor-thumb-width', `${Math.min(trackWidth, thumbWidth)}px`);
  }

  private handleModernHexEntry(event: KeyboardEvent): boolean {
    if (!this.engine || !this.snapshot) {
      return false;
    }
    return handleModernHexEntryInput(
      event,
      this.engine,
      this.snapshot,
      (snapshot) => this.canEditSnapshot(snapshot),
      (row, channel, patch) => this.applyCellPatch(row, channel, patch),
    );
  }

  private handlePatternCanvasPointer(event: MouseEvent): void {
    if (!this.engine || !this.snapshot || this.viewMode !== 'modern') {
      return;
    }
    handleModernPatternCanvasPointer({
      event,
      engine: this.engine,
      snapshot: this.snapshot,
      canvas: this.patternCanvas,
      visibleRowCount: MODERN_VISIBLE_PATTERN_ROWS,
      rowHeight: PATTERN_ROW_HEIGHT,
      gutter: PATTERN_GUTTER,
      getPatternViewportStartRow: (snapshot) => this.getPatternViewportStartRow(snapshot),
      getPatternCanvasLayout: (width) => this.getPatternCanvasLayout(width),
      getPatternFieldRects: (x, width) => this.getPatternFieldRects(x, width),
    });
  }

  private handlePatternCanvasWheel(event: WheelEvent): void {
    if (!this.engine || !this.snapshot || this.viewMode !== 'modern' || this.snapshot.sampleEditor.open) {
      return;
    }

    const nextCursor = scrollPatternFromWheel(event, this.snapshot);
    if (!nextCursor) {
      return;
    }

    this.moveModernCursor(nextCursor.row, nextCursor.channel, nextCursor.field);
    this.updateModernLiveRegions(this.snapshot);
  }

  private handleSampleEditorPointerDown(event: MouseEvent): void {
    if (!this.engine || !this.snapshot || this.viewMode !== 'modern' || !this.snapshot.sampleEditor.open || !this.canEditSnapshot(this.snapshot)) {
      return;
    }

    const nextPointer = beginSampleEditorPointer({
      event,
      snapshot: this.snapshot,
      canvas: this.sampleEditorCanvas,
      canEditSnapshot: (snapshot) => this.canEditSnapshot(snapshot),
      getSampleEditorLayout: (width, height) => this.getSampleEditorLayout(width, height),
      sampleEditorXToOffset: (clientX, snapshot) => this.sampleEditorXToOffset(clientX, snapshot),
      sampleOffsetToEditorX: (offset, snapshot, layout) => this.sampleOffsetToEditorX(offset, snapshot, layout),
    });
    if (!nextPointer) {
      return;
    }

    this.sampleEditorPointer = nextPointer;

    event.preventDefault();
    this.drawSampleEditor(this.snapshot);
  }

  private handleSampleEditorPointerMove(event: MouseEvent): void {
    if (!this.snapshot || this.viewMode !== 'modern' || !this.sampleEditorPointer.active || !this.canEditSnapshot(this.snapshot)) {
      return;
    }

    const nextPointer = updateSampleEditorPointer(
      event,
      this.snapshot,
      this.sampleEditorPointer,
      (snapshot) => this.canEditSnapshot(snapshot),
      (clientX, snapshot) => this.sampleEditorXToOffset(clientX, snapshot),
    );
    if (!nextPointer) {
      return;
    }

    this.sampleEditorPointer = nextPointer;
    this.drawSampleEditor(this.snapshot);
  }

  private handleSampleEditorPointerUp(): void {
    if (!this.engine || !this.snapshot || !this.sampleEditorPointer.active || !this.canEditSnapshot(this.snapshot)) {
      return;
    }

    const pointer = { ...this.sampleEditorPointer };
    this.sampleEditorPointer = {
      mode: 'idle',
      active: false,
      anchor: 0,
      current: 0,
    };

    const nextSnapshot = completeSampleEditorPointer(
      this.engine,
      this.snapshot,
      pointer,
      (snapshot) => this.canEditSnapshot(snapshot),
    );
    if (!nextSnapshot) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.refreshSelectedSampleWaveform(this.snapshot, true);
    this.updateModernLiveRegions(this.snapshot);
  }

  private handleSampleEditorWheel(event: WheelEvent): void {
    if (!this.engine || !this.snapshot || this.viewMode !== 'modern' || !this.snapshot.sampleEditor.open) {
      return;
    }

    this.clearSampleEditorViewOverride();
    this.snapshot = zoomSampleEditorFromWheel(
      event,
      this.engine,
      this.snapshot,
      (clientX, snapshot) => this.sampleEditorXToOffset(clientX, snapshot),
    );
    this.updateModernLiveRegions(this.snapshot);
  }

  private resolvePatternFieldFromPointer(
    x: number,
    fieldRects: Record<CursorField, { x: number; width: number }>,
  ): CursorField {
    return resolveModernPatternFieldFromPointer(x, fieldRects);
  }

  private handleClassicCanvasPointer(event: MouseEvent): void {
    updateClassicDomDebugPointer(this.classicDomDebug, this.config.canvas, event);
    this.updateClassicDebugPanel(this.snapshot);
  }

  private handlePianoPointer(event: MouseEvent): void {
    if (!this.engine || !this.snapshot || this.viewMode !== 'modern') {
      return;
    }
    const targetKey = resolvePianoKeyFromPointer(event, this.pianoCanvas);
    if (!targetKey || !this.canEditSnapshot(this.snapshot) || this.snapshot.cursor.field !== 'note') {
      return;
    }

    event.preventDefault();

    const channel = this.snapshot.cursor.channel;
    this.engine.dispatch({
      type: 'pattern/set-cell',
      row: this.snapshot.cursor.row,
      channel,
      patch: { note: targetKey.note },
    });
    this.previewModernNote(targetKey.note, channel);
    this.triggerPianoGlow(channel, targetKey.absolute);
    this.activePianoNotes[channel] = targetKey.absolute;
    this.snapshot = this.engine.getSnapshot();
    this.moveModernCursor(this.snapshot.cursor.row + 1, channel, 'note');
    this.updateModernLiveRegions(this.snapshot);
  }

  private handleClassicCanvasPointerMove(event: MouseEvent): void {
    this.handleClassicCanvasPointer(event);

    if (this.viewMode !== 'classic' || !this.engine) {
      return;
    }

    const { x, y } = this.getClassicLogicalPointerPosition();
    this.engine.forwardClassicPointerMove(x, y, event.buttons);
  }

  private handleClassicCanvasPointerButton(event: MouseEvent, pressed: boolean): void {
    event.preventDefault();
    this.handleClassicCanvasPointer(event);

    if (this.viewMode !== 'classic' || !this.engine) {
      return;
    }

    const { x, y } = this.getClassicLogicalPointerPosition();
    this.engine.forwardClassicPointerButton(
      x,
      y,
      event.button,
      pressed,
      event.buttons,
    );
  }

  private handleClassicKeyDown(event: KeyboardEvent): void {
    if (!this.engine || isEditableTarget(event.target)) {
      return;
    }
    handleModernClassicKeyDown(event, this.engine, this.classicPressedKeys);
  }

  private releaseClassicKeys(): void {
    releaseModernClassicKeys(this.engine, this.classicPressedKeys);
  }

  private getClassicLogicalPointerPosition(): { x: number; y: number } {
    return getModernClassicLogicalPointerPosition(this.config.canvas, this.classicDomDebug);
  }

  private updateClassicDebugPanel(snapshot: TrackerSnapshot | null): void {
    if (this.viewMode !== 'classic') {
      return;
    }
    updateModernClassicDebugPanel(this.root, this.config.canvas, this.classicDomDebug, snapshot);
  }

  private shiftVisualization(direction: -1 | 1): void {
    const currentIndex = VISUALIZATION_MODES.indexOf(this.visualizationMode);
    const nextIndex = (currentIndex + direction + VISUALIZATION_MODES.length) % VISUALIZATION_MODES.length;
    this.visualizationMode = VISUALIZATION_MODES[nextIndex];
    if (this.snapshot) {
      this.render();
    }
  }
}
