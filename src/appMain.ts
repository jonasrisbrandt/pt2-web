import { createElement, ArrowLeft, ArrowLeftRight, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crop, FileUp, Focus, Monitor, Pause, PencilLine, Piano, Play, Repeat, Scissors, SlidersHorizontal, Square, View, Volume2, VolumeX } from 'lucide';
import { featureFlags } from './config/featureFlags';
import { translateClassicKeyboardEvent, type ClassicKeyTranslation } from './core/classicKeyboard';
import { getKeyboardNoteFromKey, interpretKeyboard, isEditableTarget } from './core/keyboard';
import { RenderedAudioPreview } from './core/renderedAudioPreview';
import type { SynthEngine } from './core/synthEngine';
import type { TrackerEngine } from './core/trackerEngine';
import type {
  CursorField,
  EngineConfig,
  PatternCell,
  QuadrascopeState,
  SampleSlot,
  TrackerLiveState,
  TransportMode,
  TrackerSnapshot,
} from './core/trackerTypes';
import type { RenderJob, SynthId, SynthParamId, SynthSnapshot } from './core/synthTypes';
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
  getClassicLogicalPointerPosition as getModernClassicLogicalPointerPosition,
  handleClassicKeyDown as handleModernClassicKeyDown,
  releaseClassicKeys as releaseModernClassicKeys,
  updateClassicDebugPanel as updateModernClassicDebugPanel,
  updateClassicDomDebugPointer,
} from './ui-modern/classic/classicBridgeController';
import {
  type ClassicDebugRenderOptions,
  type SampleCreatorRenderOptions,
  type SampleBankRenderOptions,
} from './ui-modern/components/appShellRenderer';
import {
  getSampleCardLabel as getModernSampleCardLabel,
  getSamplePageCount as getModernSamplePageCount,
  getSamplePanelKey as getModernSamplePanelKey,
  getSelectedSampleHeading as getModernSelectedSampleHeading,
  renderModernPatternRow as renderModernPatternRowMarkup,
  renderPatternPaddingRow as renderModernPatternPaddingRow,
  type SampleEditorPanelRenderOptions,
  type SelectedSamplePanelRenderOptions,
} from './ui-modern/components/markupRenderer';
import type { InlineNameFieldRenderOptions } from './ui-modern/components/viewModels';
import {
  buildTrackerModuleTransportOptions,
  buildTrackerShellLiveLabels,
  buildTrackerShellViewState,
} from './ui-vue/controllers/trackerShellViewController';
import {
  buildTrackerSampleBankOptions,
  buildTrackerSampleEditorPanelOptions,
  buildTrackerSelectedSamplePanelOptions,
} from './ui-vue/controllers/trackerSampleViewController';
import { renderAppShellView } from './ui-vue/renderers/renderAppShellView';
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
  syncPianoNotes as syncModernPianoNotes,
  triggerPianoGlow as triggerModernPianoGlow,
} from './ui-modern/components/visualizationRenderer';
import { createTrackerAppDom } from './ui-modern/session/appDom';
import { TrackerSignalTrailsFrameSource, TrackerSpectrumFrameSource } from './visualization-adapters/trackerVisualizationAdapter';
import { VisualizationEngine } from './visualization-engine/engine';
import { TrackerRuntime } from './trackerRuntime';

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

type SectionKey = 'module' | 'visualization' | 'editor' | 'samples';
type MenuKey = 'file' | 'help';
type SampleEditorPopoverKey = 'volume' | 'fineTune';
type SampleEditorNumericField = 'volume' | 'fineTune';
type WorkspaceMode = 'tracker' | 'sample-creator';

interface SampleCreatorRenderState extends RenderJob {}

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

interface SampleCacheEntry {
  revision: number;
  data: Int8Array;
}

type ModernRedrawReason = 'full' | 'layout-change' | 'transport' | 'sample-preview' | 'sample-change' | 'ui';

interface ModernMountRefs {
  appShell: HTMLElement | null;
  patternHost: HTMLElement | null;
  visualizationHost: HTMLElement | null;
  samplePreviewHost: HTMLElement | null;
  sampleEditorHost: HTMLElement | null;
  metricPosition: HTMLElement | null;
  metricPattern: HTMLElement | null;
  metricLength: HTMLElement | null;
  metricBpm: HTMLElement | null;
  metricTime: HTMLElement | null;
  metricSize: HTMLElement | null;
  octaveValue: HTMLElement | null;
  visualizationLabel: HTMLElement | null;
  transportToggle: HTMLButtonElement | null;
  transportMode: HTMLButtonElement | null;
  transportModeValue: HTMLElement | null;
  audioMode: HTMLButtonElement | null;
  songStepperButtons: HTMLButtonElement[];
  trackMuteButtons: Array<HTMLButtonElement | null>;
  trackMuteLabels: Array<HTMLElement | null>;
  sampleEditorScroll: HTMLInputElement | null;
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
  private readonly runtime: TrackerRuntime;
  private readonly moduleInput: HTMLInputElement;
  private readonly sampleInput: HTMLInputElement;
  private readonly patternCanvas: HTMLCanvasElement;
  private readonly samplePreviewCanvas: HTMLCanvasElement;
  private readonly sampleEditorCanvas: HTMLCanvasElement;
  private readonly quadrascopeCanvas: HTMLCanvasElement;
  private readonly spectrumCanvas: HTMLCanvasElement;
  private readonly trailsCanvas: HTMLCanvasElement;
  private readonly pianoCanvas: HTMLCanvasElement;
  private readonly spectrumVisualizationEngine: VisualizationEngine;
  private readonly signalTrailsVisualizationEngine: VisualizationEngine;
  private readonly spectrumFrameSource = new TrackerSpectrumFrameSource();
  private readonly signalTrailsFrameSource = new TrackerSignalTrailsFrameSource();
  private engine: TrackerEngine | null = null;
  private synthEngine: SynthEngine | null = null;
  private snapshot: TrackerSnapshot | null = null;
  private synthSnapshot: SynthSnapshot | null = null;
  private quadrascope: QuadrascopeState | null = null;
  private statusMessage = DEFAULT_STATUS;
  private keyboardOctave = 2;
  private viewMode: 'modern' | 'classic' = 'modern';
  private workspaceMode: WorkspaceMode = 'tracker';
  private visualizationMode: VisualizationMode = 'quad-classic';
  private preferredTransportMode: TransportMode = 'song';
  private samplePage = 0;
  private lastSelectedSample = 0;
  private pendingSampleImportSlot: number | null = null;
  private shellHost: HTMLElement | null = null;
  private layoutRefreshFrame: number | null = null;
  private playbackFrame: number | null = null;
  private playbackTickActive = false;
  private lastPlaybackCoordinatorAt: number | null = null;
  private lastLiveStateVersion = -1;
  private lastAppliedLiveStateVersion = -1;
  private mountedVisualizationMode: VisualizationMode | null = null;
  private domRefs: ModernMountRefs | null = null;
  private samplePreviewCache = new Map<number, SampleCacheEntry>();
  private sampleWaveformCache = new Map<number, SampleCacheEntry>();
  private samplePreviewPlaying = false;
  private samplePreviewSession: SamplePreviewSession | null = null;
  private syncingAutoEditMode = false;
  private sampleEditorViewOverride: SampleEditorViewOverride | null = null;
  private openMenu: MenuKey | null = null;
  private aboutOpen = false;
  private openSampleEditorPopover: SampleEditorPopoverKey | null = null;
  private sampleEditorNumberEdit: InlineSampleNumberState | null = null;
  private pendingSampleNumberFocus: SampleEditorNumericField | null = null;
  private sampleCreatorState: SampleCreatorRenderState = {
    midiNote: 48,
    velocity: 1,
    durationSeconds: 0.7,
    tailSeconds: 0.25,
    sampleRate: 22050,
    normalize: true,
    fadeOut: true,
    targetSlot: 0,
    sampleName: 'core-sub',
    volume: 64,
    fineTune: 0,
    loopStart: 0,
    loopLength: 2,
  };
  private collapsedSections: Record<SectionKey, boolean> = {
    module: false,
    visualization: false,
    editor: false,
    samples: false,
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
  private readonly synthPressedNoteKeys = new Map<string, number>();
  private readonly synthRenderedPreview = new RenderedAudioPreview();
  private sampleCreatorPointerNote: number | null = null;
  private readonly modernPressedNoteKeys = new Set<string>();
  private readonly modernRecentNoteKeyTimes = new Map<string, number>();
  private classicPressedKeys = new Map<string, ClassicKeyTranslation>();
  private midiAccess: MIDIAccess | null = null;
  private midiInputHandler: ((event: MIDIMessageEvent) => void) | null = null;
  private classicDomDebug = {
    x: 0,
    y: 0,
    buttons: 0,
    inside: false,
    events: 0,
  };

  constructor(root: HTMLElement, config: EngineConfig) {
    this.root = root;
    this.config = config;
    this.runtime = new TrackerRuntime(config, {
      onTrackerSnapshot: (snapshot, quadrascope) => {
        const previousPlaying = this.snapshot?.transport.playing ?? false;
        this.snapshot = snapshot;
        this.quadrascope = quadrascope ?? this.quadrascope;
        if (previousPlaying && !snapshot.transport.playing) {
          this.resetVisualizationState();
        }
        this.statusMessage = snapshot.status;
        this.syncSamplePreviewSession(snapshot);
        this.syncPlaybackCoordinator();

        const shouldEdit = !snapshot.transport.playing;
        if (!this.syncingAutoEditMode && this.engine && snapshot.editor.editMode !== shouldEdit) {
          this.syncingAutoEditMode = true;
          this.engine.dispatch({ type: 'editor/set-edit-mode', enabled: shouldEdit });
          this.syncingAutoEditMode = false;
          return;
        }

        if (this.viewMode === 'modern' && this.domRefs?.appShell && snapshot.transport.playing) {
          this.syncModernPlaybackUi(snapshot, 'transport');
          return;
        }

        this.lastLiveStateVersion = -1;
        this.lastAppliedLiveStateVersion = -1;
        this.render();
      },
      onTrackerStatus: (message) => {
        this.statusMessage = message;
        this.lastLiveStateVersion = -1;
        this.lastAppliedLiveStateVersion = -1;
        this.render();
      },
      onSynthSnapshot: (snapshot) => {
        this.synthSnapshot = snapshot;
        this.sampleCreatorState.targetSlot = snapshot.targetSampleSlot;
        this.sampleCreatorState.sampleRate = snapshot.bakeSampleRate;

        if (featureFlags.sample_composer && this.workspaceMode === 'sample-creator') {
          this.render();
        }
      },
    });

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
    this.spectrumVisualizationEngine = new VisualizationEngine({
      canvas: this.spectrumCanvas,
      minWidth: 220,
      logicalHeight: SPECTRUM_HEIGHT,
      preferredBackend: 'webgl2',
    });
    this.signalTrailsVisualizationEngine = new VisualizationEngine({
      canvas: this.trailsCanvas,
      minWidth: 220,
      logicalHeight: QUADRASCOPE_HEIGHT,
      preferredBackend: 'webgl2',
    });

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
        this.synthPressedNoteKeys.clear();
        this.stopModernNotePreview();
        this.stopSynthPreview();
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
          this.redrawModernCanvases(this.snapshot, 'layout-change');
          const view = this.getSampleEditorView(this.snapshot);
          this.updateSampleEditorScrollbarThumb(this.snapshot.sampleEditor.sampleLength, view.length);
        }
      },
      onWindowMouseMove: (event) => this.handleSampleEditorPointerMove(event),
      onWindowMouseUp: () => {
        this.handleSampleEditorPointerUp();
        this.stopModernNotePreview();
        this.stopSampleCreatorPointerNote();
      },
    });
  }

  async init(): Promise<void> {
    const initResult = await this.runtime.init();
    this.engine = this.runtime.getTrackerEngine();
    this.synthEngine = this.runtime.getSynthEngine();
    this.snapshot = initResult.snapshot;
    this.synthSnapshot = initResult.synthSnapshot;
    this.sampleCreatorState.sampleRate = initResult.synthSnapshot.bakeSampleRate;
    this.quadrascope = initResult.quadrascope;
    if (initResult.trackerWarning) {
      this.statusMessage = `Fell back to the mock engine: ${initResult.trackerWarning}`;
    }
    if (initResult.synthWarning && this.synthSnapshot) {
      this.synthSnapshot.status = this.synthSnapshot.backend === 'mock'
        ? `Debug fallback active: ${initResult.synthWarning}`
        : initResult.synthWarning;
    }
    this.preferredTransportMode = this.snapshot.transport.mode;
    if (this.engine && this.snapshot.editor.editMode !== !this.snapshot.transport.playing) {
      this.engine.dispatch({ type: 'editor/set-edit-mode', enabled: !this.snapshot.transport.playing });
      this.snapshot = this.engine.getSnapshot();
    }
    this.syncClassicRenderingState();
    this.render();
    this.syncPlaybackCoordinator();
    await this.initMidiAccess();
  }

  private render(): void {
    const snapshot = this.snapshot;
    if (!snapshot) {
      return;
    }

    this.syncSamplePreviewSession(snapshot);
    const selectedSample = snapshot.samples[snapshot.selectedSample];
    const samplePage = this.resolveSamplePage(snapshot);
    const sampleBankOptions = this.getSampleBankOptions(snapshot, samplePage);
    const workspaceMode = featureFlags.sample_composer ? this.workspaceMode : 'tracker';
    const sampleEditorOpen = snapshot.sampleEditor.open;
    if (!sampleEditorOpen) {
      this.openSampleEditorPopover = null;
      this.sampleEditorNumberEdit = null;
    }
    const shell = this.ensureShellHost();
    shell.className = `app-shell app-shell--${this.viewMode}`;
    document.body.dataset.viewMode = this.viewMode;
    const sampleEditorPanelOptions = sampleEditorOpen
      ? this.getSampleEditorPanelOptions(snapshot)
      : null;
    const selectedSamplePanelOptions = this.getSelectedSamplePanelOptions(selectedSample, snapshot);

    renderAppShellView(shell, buildTrackerShellViewState({
      viewMode: this.viewMode,
      workspaceMode,
      snapshot,
      keyboardOctave: this.keyboardOctave,
      visualizationMode: this.visualizationMode,
      preferredTransportMode: this.preferredTransportMode,
      samplePage,
      samplePageCount: this.getSamplePageCount(snapshot),
      sampleEditorOpen,
      collapsedSections: this.collapsedSections,
      openMenu: this.openMenu,
      aboutOpen: this.aboutOpen,
      songTitle: this.getSongTitleOptions(snapshot),
      sampleEditorPanelOptions,
      sampleBankOptions,
      selectedSamplePanelOptions,
      classicDebugOptions: this.getClassicDebugOptions(),
      appVersion: __APP_VERSION__,
      fileActionsDisabled: snapshot.transport.playing,
      importDisabled: !this.canEditSnapshot(snapshot),
      sampleCreatorOptions: workspaceMode === 'sample-creator' ? this.getSampleCreatorOptions(snapshot) : null,
      canEditSnapshot: (nextSnapshot) => this.canEditSnapshot(nextSnapshot),
      getSectionCollapseIcon: (section) => this.getSectionCollapseIcon(section),
      renderIcon: (iconNode) => iconMarkup(iconNode),
    }));

    this.syncModernMountRefs(shell);

    const canvasHost = shell.querySelector<HTMLElement>('.engine-canvas-host');
    if (canvasHost) {
      this.config.canvas.className = this.viewMode === 'classic'
        ? 'engine-canvas engine-canvas-classic'
        : 'engine-canvas';
      if (this.config.canvas.parentElement !== canvasHost) {
        canvasHost.replaceChildren(this.config.canvas);
        this.scheduleLayoutRefresh();
      }
      if (this.viewMode === 'classic') {
        window.requestAnimationFrame(() => this.config.canvas.focus());
      }
    }

    const patternHost = this.domRefs?.patternHost ?? null;
    if (patternHost) {
      if (this.patternCanvas.parentElement !== patternHost) {
        patternHost.replaceChildren(this.patternCanvas);
      }
      this.drawPatternCanvas(snapshot);
    }

    const samplePreviewHost = this.domRefs?.samplePreviewHost ?? null;
    this.mountVisualization(snapshot);

    if (samplePreviewHost) {
      if (this.samplePreviewCanvas.parentElement !== samplePreviewHost) {
        samplePreviewHost.replaceChildren(this.samplePreviewCanvas);
      }
      this.drawSelectedSamplePreview(snapshot);
    }

    const sampleEditorHost = this.domRefs?.sampleEditorHost ?? null;
    if (sampleEditorHost) {
      if (this.sampleEditorCanvas.parentElement !== sampleEditorHost) {
        sampleEditorHost.replaceChildren(this.sampleEditorCanvas);
      }
      this.drawSampleEditor(snapshot);
      const view = this.getSampleEditorView(snapshot);
      this.updateSampleEditorScrollbarThumb(snapshot.sampleEditor.sampleLength, view.length);
    }

    this.syncRenameFocus(shell);
    this.syncSampleNumberFocus(shell);
    this.updateClassicDebugPanel(snapshot);
    this.lastAppliedLiveStateVersion = -1;
    this.syncClassicRenderingState();
    this.syncPlaybackCoordinator();
  }

  private ensureShellHost(): HTMLElement {
    if (this.shellHost && this.shellHost.isConnected) {
      return this.shellHost;
    }

    const shell = document.createElement('div');
    this.shellHost = shell;
    this.root.prepend(shell);
    return shell;
  }

  private syncModernMountRefs(shell: HTMLElement): void {
    const selectActionButton = (action: string): HTMLButtonElement | null =>
      shell.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    const selectRole = <T extends HTMLElement>(role: string): T | null =>
      shell.querySelector<T>(`[data-role="${role}"]`);
    const trackMuteButtons = Array.from({ length: 4 }, (_, channel) =>
      selectRole<HTMLButtonElement>(`track-mute-${channel}`));

    this.domRefs = {
      appShell: shell,
      patternHost: selectRole<HTMLElement>('pattern-host'),
      visualizationHost: selectRole<HTMLElement>('visualization-host'),
      samplePreviewHost: shell.querySelector<HTMLElement>('[data-role="sample-preview-host"]'),
      sampleEditorHost: shell.querySelector<HTMLElement>('[data-role="sample-editor-host"]'),
      metricPosition: selectRole<HTMLElement>('metric-position'),
      metricPattern: selectRole<HTMLElement>('metric-pattern'),
      metricLength: selectRole<HTMLElement>('metric-length'),
      metricBpm: selectRole<HTMLElement>('metric-bpm'),
      metricTime: selectRole<HTMLElement>('metric-time'),
      metricSize: selectRole<HTMLElement>('metric-size'),
      octaveValue: selectRole<HTMLElement>('octave-value'),
      visualizationLabel: selectRole<HTMLElement>('visualization-label'),
      transportToggle: selectRole<HTMLButtonElement>('module-transport-toggle'),
      transportMode: selectRole<HTMLButtonElement>('module-transport-mode'),
      transportModeValue: shell.querySelector<HTMLElement>('[data-role="module-transport-mode"] .tool-icon-button__value'),
      audioMode: selectRole<HTMLButtonElement>('module-audio-mode'),
      songStepperButtons: [
        'song-position-down',
        'song-position-up',
        'song-pattern-down',
        'song-pattern-up',
        'song-length-down',
        'song-length-up',
        'song-bpm-down',
        'song-bpm-up',
      ].flatMap((action) => {
        const button = selectActionButton(action);
        return button ? [button] : [];
      }),
      trackMuteButtons,
      trackMuteLabels: trackMuteButtons.map((button) => button?.closest('.track-label') as HTMLElement | null),
      sampleEditorScroll: shell.querySelector<HTMLInputElement>('[data-input="sample-editor-scroll"]'),
    };
  }

  private setElementText(element: HTMLElement | null, value: string): void {
    if (element && element.textContent !== value) {
      element.textContent = value;
    }
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

  private getAudioModeLabel(snapshot: TrackerSnapshot): string {
    if (snapshot.audio.mode === 'mono') {
      return 'Mono playback';
    }

    if (snapshot.audio.mode === 'amiga') {
      return 'Amiga stereo playback';
    }

    return 'Custom panning playback';
  }

  private getAudioModeValue(snapshot: TrackerSnapshot): 'C' | 'M' | 'A' {
    if (snapshot.audio.mode === 'mono') {
      return 'M';
    }

    if (snapshot.audio.mode === 'amiga') {
      return 'A';
    }

    return 'C';
  }

  private getDisplaySampleTitle(snapshot: TrackerSnapshot): string {
    return this.getSelectedSampleHeading(snapshot.samples[snapshot.selectedSample]);
  }

  private getSongTitleOptions(snapshot: TrackerSnapshot): InlineNameFieldRenderOptions {
    return {
      target: 'song',
      editing: this.renameState?.kind === 'song',
      value: this.renameState?.kind === 'song' ? this.renameState.value : snapshot.song.title,
      displayValue: this.getDisplaySongTitle(snapshot),
      maxLength: 20,
    };
  }

  private getSampleTitleOptions(snapshot: TrackerSnapshot): InlineNameFieldRenderOptions {
    return {
      target: 'sample',
      editing: this.renameState?.kind === 'sample',
      value: this.renameState?.kind === 'sample'
        ? this.renameState.value
        : (snapshot.samples[snapshot.selectedSample]?.name ?? ''),
      displayValue: this.getDisplaySampleTitle(snapshot),
      maxLength: 22,
    };
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
    this.syncPlaybackCoordinator();
  }

  private stopSamplePreviewSession(redraw = true): void {
    const wasPlaying = this.samplePreviewPlaying || this.samplePreviewSession !== null;
    this.samplePreviewSession = null;
    this.samplePreviewPlaying = false;
    this.syncPlaybackCoordinator();
    if (redraw && wasPlaying && this.snapshot && this.viewMode === 'modern') {
      this.render();
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
      this.engine.dispatch({
        type: 'sample/update',
        sample: this.snapshot.selectedSample,
        patch: field === 'volume'
          ? { volume: clamp(Math.round(numeric), 0, 64) }
          : { fineTune: clamp(Math.round(numeric), -8, 7) },
      });
      this.snapshot = this.engine.getSnapshot();
    }

    this.sampleEditorNumberEdit = null;
    this.pendingSampleNumberFocus = null;
    this.render();
  }

  private mountVisualization(snapshot: TrackerSnapshot): void {
    const host = this.domRefs?.visualizationHost ?? null;
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

    const shouldRemount = this.mountedVisualizationMode !== this.visualizationMode || host.childElementCount === 0;
    if (shouldRemount && this.visualizationMode === 'split') {
      host.replaceChildren(
        createSlot(this.quadrascopeCanvas, 'visualization-slot--scope'),
        createSlot(this.spectrumCanvas, 'visualization-slot--spectrum'),
      );
    } else if (shouldRemount && this.visualizationMode === 'piano') {
      host.replaceChildren(createSlot(this.pianoCanvas, 'visualization-slot--piano'));
    } else if (shouldRemount && this.visualizationMode === 'spectrum') {
      host.replaceChildren(createSlot(this.spectrumCanvas, 'visualization-slot--spectrum'));
    } else if (shouldRemount && this.visualizationMode === 'signal-trails') {
      host.replaceChildren(createSlot(this.trailsCanvas, 'visualization-slot--trails'));
    } else if (shouldRemount) {
      host.replaceChildren(createSlot(this.quadrascopeCanvas, 'visualization-slot--scope'));
    }

    this.mountedVisualizationMode = this.visualizationMode;
    this.drawVisualization(snapshot);
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

  private resetVisualizationState(redraw = false): void {
    this.quadrascope = null;
    if (this.snapshot) {
      this.snapshot.quadrascope = undefined;
    }
    this.lastPianoTransportKey = null;
    this.pianoLastFrameAt = null;

    for (let channel = 0; channel < this.activePianoNotes.length; channel += 1) {
      this.activePianoNotes[channel] = null;
    }

    for (let channel = 0; channel < this.pianoGlowLevels.length; channel += 1) {
      const levels = this.pianoGlowLevels[channel];
      for (let note = 0; note < levels.length; note += 1) {
        levels[note] = 0;
      }
    }

    this.signalTrailsFrameSource.reset();

    if (redraw && this.snapshot && this.viewMode === 'modern') {
      this.drawVisualization(this.snapshot);
    }
  }

  private needsLiveQuadrascope(): boolean {
    return this.visualizationMode !== 'piano';
  }

  private hasPlaybackActivity(snapshot: TrackerSnapshot | null = this.snapshot): boolean {
    return !!snapshot && (snapshot.transport.playing || this.samplePreviewSession !== null);
  }

  private stopPlaybackCoordinator(): void {
    if (this.playbackFrame !== null) {
      window.cancelAnimationFrame(this.playbackFrame);
      this.playbackFrame = null;
    }

    this.playbackTickActive = false;
    this.lastPlaybackCoordinatorAt = null;
  }

  private syncPlaybackCoordinator(): void {
    if (this.hasPlaybackActivity()) {
      this.ensurePlaybackCoordinator();
      return;
    }

    this.stopPlaybackCoordinator();
  }

  private redrawModernCanvases(snapshot: TrackerSnapshot, reason: ModernRedrawReason): void {
    if (this.viewMode !== 'modern') {
      return;
    }

    switch (reason) {
      case 'transport':
        if (!snapshot.sampleEditor.open) {
          this.drawPatternCanvas(snapshot);
        }
        break;
      case 'sample-preview':
        this.drawSelectedSamplePreview(snapshot);
        this.drawSampleEditor(snapshot);
        break;
      case 'sample-change':
        if (snapshot.sampleEditor.open) {
          this.drawSampleEditor(snapshot);
        }
        this.drawSelectedSamplePreview(snapshot);
        break;
      case 'layout-change':
      case 'full':
      case 'ui':
        if (snapshot.sampleEditor.open) {
          this.drawSampleEditor(snapshot);
        } else {
          this.drawPatternCanvas(snapshot);
        }
        this.drawSelectedSamplePreview(snapshot);
        this.drawVisualization(snapshot);
        break;
    }
  }

  private syncModernPlaybackUi(snapshot: TrackerSnapshot, reason: ModernRedrawReason = 'transport'): void {
    if (this.viewMode !== 'modern' || !this.domRefs) {
      return;
    }

    const refs = this.domRefs;
    const liveLabels = buildTrackerShellLiveLabels(snapshot, this.keyboardOctave, this.visualizationMode);
    this.setElementText(refs.metricPosition, liveLabels.position);
    this.setElementText(refs.metricPattern, liveLabels.pattern);
    this.setElementText(refs.metricLength, liveLabels.length);
    this.setElementText(refs.metricBpm, liveLabels.bpm);
    this.setElementText(refs.metricTime, liveLabels.time);
    this.setElementText(refs.metricSize, liveLabels.size);
    this.setElementText(refs.octaveValue, liveLabels.octave);
    this.setElementText(refs.visualizationLabel, liveLabels.visualization);

    const playbackMode = snapshot.transport.playing ? snapshot.transport.mode : this.preferredTransportMode;
    const moduleTransportOptions = buildTrackerModuleTransportOptions(
      snapshot,
      playbackMode,
      (nextSnapshot) => this.getAudioModeLabel(nextSnapshot),
      (nextSnapshot) => this.getAudioModeValue(nextSnapshot),
      (iconNode) => iconMarkup(iconNode),
    );
    const transportModeOption = moduleTransportOptions.find((option) => option.role === 'module-transport-mode') ?? null;
    const transportToggleOption = moduleTransportOptions.find((option) => option.role === 'module-transport-toggle') ?? null;
    const audioModeOption = moduleTransportOptions.find((option) => option.role === 'module-audio-mode') ?? null;

    if (refs.transportToggle && transportToggleOption) {
      const label = transportToggleOption.label;
      refs.transportToggle.disabled = transportToggleOption.disabled;
      refs.transportToggle.classList.toggle('is-active', transportToggleOption.active);
      refs.transportToggle.dataset.action = transportToggleOption.action;
      const nextToggleState = `${snapshot.transport.playing}:${playbackMode}`;
      if (refs.transportToggle.dataset.toggleState !== nextToggleState) {
        refs.transportToggle.dataset.toggleState = nextToggleState;
        refs.transportToggle.innerHTML = `${transportToggleOption.iconHtml}<span class="sr-only">${label}</span>`;
      }
    }

    if (refs.transportMode && transportModeOption) {
      refs.transportMode.classList.toggle('is-active', transportModeOption.active);
      if (refs.transportModeValue) {
        refs.transportModeValue.textContent = transportModeOption.valueText ?? '';
      }
    }

    if (refs.audioMode && audioModeOption) {
      const label = audioModeOption.label;
      refs.audioMode.classList.toggle('is-active', audioModeOption.active);
      const nextAudioState = snapshot.audio.mode;
      if (refs.audioMode.dataset.audioState !== nextAudioState) {
        refs.audioMode.dataset.audioState = nextAudioState;
        refs.audioMode.innerHTML = `${audioModeOption.iconHtml}<span class="tool-icon-button__value" aria-hidden="true">${audioModeOption.valueText ?? ''}</span><span class="sr-only">${label}</span>`;
      }
    }

    const canEdit = this.canEditSnapshot(snapshot);
    for (const button of refs.songStepperButtons) {
      button.disabled = !canEdit;
    }

    for (let channel = 0; channel < 4; channel += 1) {
      const muted = snapshot.editor.muted[channel] ?? false;
      const button = refs.trackMuteButtons[channel] ?? null;
      if (button) {
        button.classList.toggle('is-muted', muted);
        button.setAttribute('aria-pressed', muted ? 'true' : 'false');
        if (button.dataset.mutedState !== String(muted)) {
          button.dataset.mutedState = String(muted);
          button.innerHTML = iconMarkup(muted ? VolumeX : Volume2);
        }
      }
      refs.trackMuteLabels[channel]?.classList.toggle('is-muted', muted);
    }

    this.redrawModernCanvases(snapshot, reason);
  }

  private applyLiveState(liveState: TrackerLiveState): boolean {
    if (!this.snapshot) {
      return false;
    }

    if (this.lastAppliedLiveStateVersion === liveState.version) {
      return false;
    }

    this.lastAppliedLiveStateVersion = liveState.version;
    const snapshot = this.snapshot;
    const previousPlaying = snapshot.transport.playing;
    snapshot.audio.mode = liveState.audioMode;
    snapshot.audio.stereo = liveState.stereo;
    snapshot.transport.playing = liveState.playing;
    snapshot.transport.mode = liveState.mode;
    snapshot.transport.bpm = liveState.bpm;
    snapshot.transport.speed = liveState.speed;
    snapshot.transport.elapsedSeconds = liveState.elapsedSeconds;
    snapshot.transport.row = liveState.row;
    snapshot.transport.pattern = liveState.pattern;
    snapshot.transport.position = liveState.position;
    snapshot.song.currentPattern = liveState.pattern;
    snapshot.song.currentPosition = liveState.position;
    snapshot.pattern.index = liveState.pattern;

    for (let channel = 0; channel < 4; channel += 1) {
      snapshot.editor.muted[channel] = ((liveState.mutedMask >> channel) & 1) !== 0;
    }

    if (previousPlaying && !liveState.playing) {
      this.resetVisualizationState(true);
    }

    return true;
  }

  private buildSamplePreview(data: Int8Array): Int8Array {
    if (data.length === 0) {
      return new Int8Array(0);
    }

    const preview = new Int8Array(256);
    for (let index = 0; index < preview.length; index += 1) {
      const start = Math.floor((index * data.length) / preview.length);
      const end = Math.max(start + 1, Math.floor(((index + 1) * data.length) / preview.length));
      let peak = 0;

      for (let sampleIndex = start; sampleIndex < end && sampleIndex < data.length; sampleIndex += 1) {
        const sample = data[sampleIndex] ?? 0;
        if (Math.abs(sample) >= Math.abs(peak)) {
          peak = sample;
        }
      }

      preview[index] = peak;
    }

    return preview;
  }

  private invalidateAllSampleCaches(): void {
    this.samplePreviewCache.clear();
    this.sampleWaveformCache.clear();
  }

  private invalidateSampleCache(sample: number): void {
    this.samplePreviewCache.delete(sample);
    this.sampleWaveformCache.delete(sample);
  }

  private ensureSampleWaveformEntry(sample: SampleSlot, force = false): SampleCacheEntry {
    const cached = this.sampleWaveformCache.get(sample.index);
    if (!force && cached && cached.revision === sample.dataRevision) {
      return cached;
    }

    let data = new Int8Array(0);
    if (sample.length > 0 && this.engine) {
      try {
        const waveform = this.engine.getSampleWaveform(sample.index);
        data = waveform ? (waveform as unknown as Int8Array<ArrayBuffer>) : new Int8Array(0);
      } catch {
        data = new Int8Array(0);
      }
    }

    const entry = { revision: sample.dataRevision, data };
    this.sampleWaveformCache.set(sample.index, entry);
    this.samplePreviewCache.set(sample.index, {
      revision: sample.dataRevision,
      data: this.buildSamplePreview(data),
    });
    return entry;
  }

  private ensureSamplePreviewEntry(sample: SampleSlot): SampleCacheEntry {
    const cached = this.samplePreviewCache.get(sample.index);
    if (cached && cached.revision === sample.dataRevision) {
      return cached;
    }

    const waveform = this.ensureSampleWaveformEntry(sample);
    const preview = {
      revision: sample.dataRevision,
      data: this.buildSamplePreview(waveform.data),
    };
    this.samplePreviewCache.set(sample.index, preview);
    return preview;
  }

  private refreshSelectedSampleWaveform(snapshot: TrackerSnapshot, force = false): void {
    const sample = snapshot.samples[snapshot.selectedSample];
    if (!sample) {
      return;
    }

    this.ensureSampleWaveformEntry(sample, force);
  }

  private getWaveformSource(sample: SampleSlot): Int8Array {
    return this.ensureSampleWaveformEntry(sample).data;
  }

  private getPreviewSource(sample: SampleSlot): Int8Array {
    return this.ensureSamplePreviewEntry(sample).data;
  }

  private drawSelectedSamplePreview(snapshot: TrackerSnapshot): void {
    if (this.viewMode !== 'modern') {
      return;
    }

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

  private ensurePlaybackCoordinator(): void {
    if (this.playbackFrame !== null || this.playbackTickActive || !this.hasPlaybackActivity()) {
      return;
    }

    const tick = (now: number): void => {
      this.playbackTickActive = true;
      this.playbackFrame = null;
      if (!this.snapshot || !this.engine) {
        this.playbackTickActive = false;
        this.stopPlaybackCoordinator();
        return;
      }

      this.syncSamplePreviewSession(this.snapshot);
      if (!this.hasPlaybackActivity()) {
        this.playbackTickActive = false;
        this.stopPlaybackCoordinator();
        return;
      }

      const liveCadenceMs = 50;
      const shouldSyncLiveState = this.snapshot.transport.playing;
      if (
        shouldSyncLiveState
        && (this.lastPlaybackCoordinatorAt === null || now - this.lastPlaybackCoordinatorAt >= liveCadenceMs)
      ) {
        this.lastPlaybackCoordinatorAt = now;
        const liveState = this.engine.getLiveState();
        if (liveState && liveState.version !== this.lastLiveStateVersion) {
          const previousPattern = this.snapshot.pattern.index;
          this.lastLiveStateVersion = liveState.version;
          if (liveState.pattern !== previousPattern) {
            this.snapshot = this.engine.getSnapshot();
            this.lastAppliedLiveStateVersion = liveState.version;
            if (this.viewMode === 'modern') {
              this.syncModernPlaybackUi(this.snapshot, 'transport');
            }
          } else if (this.applyLiveState(liveState) && this.viewMode === 'modern') {
            this.syncModernPlaybackUi(this.snapshot, 'transport');
          }
        }
      }

      if (this.viewMode === 'modern') {
        if (this.snapshot.transport.playing && this.needsLiveQuadrascope()) {
          this.quadrascope = this.engine.getQuadrascope() ?? this.quadrascope;
        }

        if (this.samplePreviewSession) {
          this.redrawModernCanvases(this.snapshot, 'sample-preview');
        }
        if (this.snapshot.transport.playing) {
          this.drawVisualization(this.snapshot);
        }
      }

      if (this.hasPlaybackActivity()) {
        this.playbackTickActive = false;
        this.playbackFrame = window.requestAnimationFrame(tick);
      } else {
        this.playbackTickActive = false;
        this.stopPlaybackCoordinator();
      }
    };

    this.playbackFrame = window.requestAnimationFrame(tick);
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
    this.spectrumVisualizationEngine.render(
      this.spectrumFrameSource.buildFrame(quadrascope, this.visualizationMode === 'split'),
    );
  }

  private drawSignalTrails(quadrascope: QuadrascopeState | null): void {
    if (this.viewMode !== 'modern') {
      return;
    }
    this.signalTrailsVisualizationEngine.render(
      this.signalTrailsFrameSource.buildFrame(quadrascope),
    );
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

    const host = this.domRefs?.patternHost ?? null;
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

  private getSampleBankOptions(snapshot: TrackerSnapshot, samplePage: number): SampleBankRenderOptions {
    return buildTrackerSampleBankOptions({
      snapshot,
      samplePage,
      pageSize: SAMPLE_PAGE_SIZE,
      getPreviewValues: (sample) => this.getPreviewSource(sample),
    });
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

  private getSelectedSamplePanelOptions(
    sample: SampleSlot,
    snapshot: TrackerSnapshot,
  ): SelectedSamplePanelRenderOptions {
    return buildTrackerSelectedSamplePanelOptions({
      sample,
      snapshot,
      editable: this.canEditSnapshot(snapshot),
      samplePreviewPlaying: this.samplePreviewPlaying,
      sampleTitle: this.getSampleTitleOptions(snapshot),
      renderIcon: (iconNode) => iconMarkup(iconNode),
    });
  }

  private getSampleCreatorOptions(snapshot: TrackerSnapshot): SampleCreatorRenderOptions | null {
    if (!featureFlags.sample_composer) {
      return null;
    }

    const synthSnapshot = this.synthSnapshot;
    const targetSample = synthSnapshot
      ? (snapshot.samples[synthSnapshot.targetSampleSlot] ?? snapshot.samples[snapshot.selectedSample])
      : null;

    return {
      snapshot: synthSnapshot,
      targetSample,
      keyboardOctave: this.keyboardOctave,
      renderJob: this.sampleCreatorState,
    };
  }

  private getSampleEditorPanelOptions(snapshot: TrackerSnapshot): SampleEditorPanelRenderOptions {
    return buildTrackerSampleEditorPanelOptions({
      snapshot,
      editable: this.canEditSnapshot(snapshot),
      samplePreviewPlaying: this.samplePreviewPlaying,
      collapsed: this.collapsedSections.editor,
      collapseIconHtml: this.getSectionCollapseIcon('editor'),
      selectedSampleTitle: this.getSampleTitleOptions(snapshot),
      view: this.getSampleEditorView(snapshot),
      volumePopoverOpen: this.openSampleEditorPopover === 'volume',
      fineTunePopoverOpen: this.openSampleEditorPopover === 'fineTune',
      volumeEditOpen: this.sampleEditorNumberEdit?.field === 'volume',
      fineTuneEditOpen: this.sampleEditorNumberEdit?.field === 'fineTune',
      volumeEditValue: this.sampleEditorNumberEdit?.field === 'volume' ? this.sampleEditorNumberEdit.value : String(snapshot.samples[snapshot.selectedSample].volume),
      fineTuneEditValue: this.sampleEditorNumberEdit?.field === 'fineTune' ? this.sampleEditorNumberEdit.value : String(snapshot.samples[snapshot.selectedSample].fineTune),
      renderIcon: (iconNode) => iconMarkup(iconNode),
    });
  }

  private getClassicDebugOptions(): ClassicDebugRenderOptions {
    return {
      enabled: this.viewMode === 'classic' && SHOW_CLASSIC_DEBUG,
    };
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
      case 'sample-creator-open':
        if (!featureFlags.sample_composer) {
          return;
        }
        if (this.snapshot && this.synthSnapshot) {
          this.workspaceMode = 'sample-creator';
          this.sampleCreatorState.targetSlot = this.snapshot.selectedSample;
          this.sampleCreatorState.sampleName = (this.snapshot.samples[this.snapshot.selectedSample]?.name || this.synthSnapshot.selectedSynth).slice(0, 22);
          this.synthEngine?.dispatch({ type: 'target-slot/set', slot: this.snapshot.selectedSample });
          this.synthEngine?.dispatch({ type: 'bake-rate/set', sampleRate: this.sampleCreatorState.sampleRate });
          this.render();
        }
        return;
      case 'sample-creator-close':
        this.workspaceMode = 'tracker';
        this.stopSynthPreview();
        this.render();
        return;
    }

    if (!this.engine || !this.snapshot) {
      return;
    }

    if (this.synthEngine && this.synthSnapshot) {
      switch (target.dataset.action) {
        case 'sample-creator-arm-synth':
          this.synthEngine.dispatch({ type: 'input-arm/set', target: 'synth' });
          return;
        case 'sample-creator-arm-tracker':
          this.synthEngine.dispatch({ type: 'input-arm/set', target: 'tracker' });
          return;
        case 'sample-creator-select-synth': {
          const synth = (target.dataset.synth === 'acid303' ? 'acid303' : 'core-sub') as SynthId;
          this.synthEngine.dispatch({ type: 'synth/select', synth });
          this.sampleCreatorState.sampleName = synth.slice(0, 22);
          return;
        }
        case 'sample-creator-preview-note':
          if (this.synthSnapshot.inputArm === 'tracker') {
            this.recordTrackerMidiNote(this.sampleCreatorState.midiNote, this.sampleCreatorState.velocity);
          } else {
            void this.previewRenderedSynthNote();
          }
          return;
        case 'sample-creator-stop':
          this.stopSynthPreview();
          return;
        case 'sample-creator-record':
          this.synthEngine.dispatch({ type: this.synthSnapshot.recordState === 'recording' ? 'record/stop' : 'record/start' });
          return;
        case 'sample-creator-discard-recording':
          this.synthEngine.dispatch({ type: 'record/discard' });
          return;
        case 'sample-creator-commit-recording':
          this.commitRecordedSampleCreatorSample();
          return;
        case 'sample-creator-bake':
          await this.bakeSampleCreatorSample();
          return;
        case 'sample-creator-piano-note':
          return;
      }
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
      invalidateAllSampleCaches: () => this.invalidateAllSampleCaches(),
      invalidateSampleCache: (sample) => this.invalidateSampleCache(sample),
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
      });
    if (this.synthEngine && this.snapshot) {
      this.sampleCreatorState.targetSlot = this.snapshot.selectedSample;
      this.synthEngine.dispatch({ type: 'target-slot/set', slot: this.snapshot.selectedSample });
    }
    if (menuWasOpen) {
      this.openMenu = null;
      this.render();
    }
  }

  private async handleChange(event: Event): Promise<void> {
    if (!(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement)) {
      return;
    }

    if (event.target instanceof HTMLInputElement && event.target.dataset.inlineRename) {
      this.commitInlineRename();
      return;
    }

    if (event.target instanceof HTMLInputElement && event.target.dataset.inlineSampleNumber) {
      this.commitSampleEditorNumberEdit();
      return;
    }

    if (!this.engine) {
      return;
    }

    if (event.target === this.moduleInput) {
      this.invalidateAllSampleCaches();
      await loadModuleFromInput(this.engine, this.moduleInput);
      this.stopSamplePreviewSession(false);
      this.snapshot = this.engine.getSnapshot();
      this.render();
      return;
    }

    if (event.target === this.sampleInput) {
      this.invalidateAllSampleCaches();
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
    if (!(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement)) {
      return;
    }

    if (event.target instanceof HTMLInputElement && event.target.dataset.inlineRename) {
      if (this.renameState) {
        this.renameState = {
          ...this.renameState,
          value: event.target.value,
        };
      }
      return;
    }

    if (event.target instanceof HTMLInputElement && event.target.dataset.inlineSampleNumber) {
      if (this.sampleEditorNumberEdit) {
        this.sampleEditorNumberEdit = {
          ...this.sampleEditorNumberEdit,
          value: event.target.value,
        };
      }
      return;
    }

    if (this.synthEngine && event.target.dataset.input?.startsWith('sample-creator')) {
      const inputKey = event.target.dataset.input;
      switch (inputKey) {
        case 'sample-creator-param':
          if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.param) {
            return;
          }
          this.synthEngine.dispatch({
            type: 'param/set',
            id: event.target.dataset.param as SynthParamId,
            value: Number(event.target.value),
          });
          return;
        case 'sample-creator-preset':
          if (!(event.target instanceof HTMLSelectElement)) {
            return;
          }
          this.synthEngine.dispatch({ type: 'preset/load', presetId: event.target.value });
          this.sampleCreatorState.sampleName = event.target.value.split(':')[1]?.slice(0, 22) ?? this.sampleCreatorState.sampleName;
          return;
        case 'sample-creator-name':
          if (event.target instanceof HTMLInputElement) {
            this.sampleCreatorState.sampleName = event.target.value.slice(0, 22);
          }
          return;
        case 'sample-creator-duration':
          if (event.target instanceof HTMLInputElement) {
            this.sampleCreatorState.durationSeconds = clamp(Number(event.target.value), 0.05, 6);
          }
          return;
        case 'sample-creator-tail':
          if (event.target instanceof HTMLInputElement) {
            this.sampleCreatorState.tailSeconds = clamp(Number(event.target.value), 0, 4);
          }
          return;
        case 'sample-creator-note':
          if (event.target instanceof HTMLInputElement) {
            this.sampleCreatorState.midiNote = clamp(Number(event.target.value), 24, 96);
          }
          return;
        case 'sample-creator-volume':
          if (event.target instanceof HTMLInputElement) {
            this.sampleCreatorState.volume = clamp(Number(event.target.value), 0, 64);
          }
          return;
        case 'sample-creator-finetune':
          if (event.target instanceof HTMLInputElement) {
            this.sampleCreatorState.fineTune = clamp(Number(event.target.value), -8, 7);
          }
          return;
        case 'sample-creator-normalize':
          if (event.target instanceof HTMLInputElement) {
            this.sampleCreatorState.normalize = event.target.checked;
          }
          return;
        case 'sample-creator-fadeout':
          if (event.target instanceof HTMLInputElement) {
            this.sampleCreatorState.fadeOut = event.target.checked;
          }
          return;
        case 'sample-creator-samplerate':
          if (event.target instanceof HTMLSelectElement) {
            const sampleRate = clamp(Number(event.target.value), 11025, 48000);
            this.sampleCreatorState.sampleRate = sampleRate;
            this.synthEngine.dispatch({ type: 'bake-rate/set', sampleRate });
          }
          return;
      }
    }

    if (!this.engine || !this.snapshot) {
      return;
    }

    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    handleModernInputAction({
      target: event.target,
      engine: this.engine,
      snapshot: this.snapshot,
      canEditSnapshot: (snapshot) => this.canEditSnapshot(snapshot),
      getSampleEditorView: (snapshot) => this.getSampleEditorView(snapshot),
      invalidateSampleCache: (sample) => this.invalidateSampleCache(sample),
      refreshSelectedSampleWaveform: (snapshot, force) => this.refreshSelectedSampleWaveform(snapshot, force),
      setSampleEditorViewOverride: (value) => { this.sampleEditorViewOverride = value; },
      setSnapshot: (snapshot) => { this.snapshot = snapshot; },
      render: () => this.render(),
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
    const target = event.target instanceof Element ? event.target : null;
    const sampleCreatorPianoTarget = target?.closest('[data-action="sample-creator-piano-note"]') as HTMLElement | null;
    if (featureFlags.sample_composer && sampleCreatorPianoTarget && this.workspaceMode === 'sample-creator' && this.synthEngine && this.synthSnapshot) {
      const midiNote = Number(sampleCreatorPianoTarget.dataset.midi);
      if (Number.isFinite(midiNote)) {
        event.preventDefault();
        this.sampleCreatorPointerNote = midiNote;
        if (this.synthSnapshot.inputArm === 'tracker') {
          this.recordTrackerMidiNote(midiNote, this.sampleCreatorState.velocity);
        } else {
          void this.playSynthMidiNote(midiNote, this.sampleCreatorState.velocity);
        }
      }
      return;
    }

    if (!this.openMenu && !this.aboutOpen && !this.openSampleEditorPopover && !this.sampleEditorNumberEdit) {
      return;
    }
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

  private stopSynthPreview(): void {
    this.synthRenderedPreview.stopAll();
    this.sampleCreatorPointerNote = null;
    this.synthEngine?.dispatch({ type: 'preview/panic' });
  }

  private absoluteToTrackerNote(absolute: number): string {
    const noteNames = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
    const clamped = clamp(absolute, 12, 47);
    return `${noteNames[clamped % 12]}${Math.floor(clamped / 12)}`;
  }

  private async playSynthMidiNote(midiNote: number, velocity = 1): Promise<void> {
    if (!this.synthEngine) {
      return;
    }

    try {
      this.synthEngine.dispatch({ type: 'preview/note-on', midiNote, velocity });
    } catch (error) {
      console.error('Synth preview failed.', error);
    }
  }

  private stopSynthMidiNote(midiNote: number): void {
    this.synthEngine?.dispatch({ type: 'preview/note-off', midiNote });
  }

  private stopSampleCreatorPointerNote(): void {
    if (this.sampleCreatorPointerNote === null) {
      return;
    }

    const midiNote = this.sampleCreatorPointerNote;
    this.sampleCreatorPointerNote = null;
    if (this.synthSnapshot?.inputArm === 'synth') {
      this.stopSynthMidiNote(midiNote);
    }
  }

  private async previewRenderedSynthNote(): Promise<void> {
    if (!this.synthEngine || !this.synthSnapshot) {
      return;
    }

    try {
      await this.synthRenderedPreview.prepare();
      const rendered = await this.synthEngine.renderSample({
        ...this.sampleCreatorState,
        sampleRate: this.synthSnapshot.previewSampleRate ?? 48000,
        normalize: false,
        fadeOut: true,
        sampleName: 'preview',
      });
      if (rendered.data.length === 0) {
        console.warn('Synth one-shot preview returned no samples.');
        return;
      }
      await this.synthRenderedPreview.play('sample-creator-one-shot', rendered);
    } catch (error) {
      console.error('Synth one-shot preview failed.', error);
    }
  }

  private recordTrackerMidiNote(midiNote: number, velocity = 1): void {
    if (!this.engine || !this.snapshot || this.snapshot.sampleEditor.open || !this.canEditSnapshot(this.snapshot)) {
      return;
    }

    const note = this.absoluteToTrackerNote(midiNote);
    const channel = this.snapshot.cursor.channel;
    this.engine.dispatch({
      type: 'pattern/set-cell',
      row: this.snapshot.cursor.row,
      channel,
      patch: { note },
    });
    this.previewModernNote(note, channel);
    const absolute = noteToAbsolute(note);
    if (absolute !== null) {
      this.triggerPianoGlow(channel, absolute);
    }
    this.snapshot = this.engine.getSnapshot();
    this.moveModernCursor(this.snapshot.cursor.row + 1, channel, 'note');
    this.render();
    void velocity;
  }

  private async bakeSampleCreatorSample(): Promise<void> {
    if (!this.synthEngine || !this.engine || !this.snapshot || !this.synthSnapshot) {
      return;
    }

    const rendered = await this.synthEngine.renderSample({
      ...this.sampleCreatorState,
      sampleRate: this.synthSnapshot.bakeSampleRate,
    });
    this.engine.importSample(this.synthSnapshot.targetSampleSlot, rendered);
    this.snapshot = this.engine.getSnapshot();
    this.lastSelectedSample = this.snapshot.selectedSample;
    this.invalidateSampleCache(this.snapshot.selectedSample);
    this.refreshSelectedSampleWaveform(this.snapshot, true);
    this.render();
  }

  private commitRecordedSampleCreatorSample(): void {
    if (!this.synthEngine || !this.engine || !this.snapshot || !this.synthSnapshot) {
      return;
    }

    const rendered = this.synthEngine.getRecordedSample({
      ...this.sampleCreatorState,
      sampleRate: this.synthSnapshot.bakeSampleRate,
    });
    if (!rendered) {
      return;
    }

    this.engine.importSample(this.synthSnapshot.targetSampleSlot, rendered);
    this.snapshot = this.engine.getSnapshot();
    this.lastSelectedSample = this.snapshot.selectedSample;
    this.invalidateSampleCache(this.snapshot.selectedSample);
    this.refreshSelectedSampleWaveform(this.snapshot, true);
    this.render();
  }

  private async initMidiAccess(): Promise<void> {
    const requestMidi = (navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> }).requestMIDIAccess;
    if (!requestMidi || !this.synthEngine) {
      return;
    }

    try {
      this.midiAccess = await requestMidi.call(navigator);
      this.midiInputHandler = (event: MIDIMessageEvent) => this.handleMidiMessage(event);
      for (const input of this.midiAccess.inputs.values()) {
        input.onmidimessage = this.midiInputHandler;
      }
      this.midiAccess.onstatechange = () => {
        if (!this.midiAccess || !this.midiInputHandler) {
          return;
        }

        for (const input of this.midiAccess.inputs.values()) {
          input.onmidimessage = this.midiInputHandler;
        }
        this.synthEngine?.dispatch({ type: 'midi/set-available', available: this.midiAccess.inputs.size > 0 });
      };
      this.synthEngine.dispatch({ type: 'midi/set-available', available: this.midiAccess.inputs.size > 0 });
    } catch (error) {
      console.warn('MIDI initialization failed.', error);
      this.synthEngine.dispatch({ type: 'midi/set-available', available: false });
    }
  }

  private handleMidiMessage(event: MIDIMessageEvent): void {
    if (!this.synthSnapshot) {
      return;
    }

    const message = event.data ?? new Uint8Array(0);
    const [status = 0, data1 = 0, data2 = 0] = message;
    const command = status & 0xf0;
    const velocity = clamp(data2 / 127, 0.05, 1);

    if (command === 0x90 && data2 > 0) {
      if (this.synthSnapshot.inputArm === 'synth') {
        this.playSynthMidiNote(data1, velocity);
      } else {
        this.recordTrackerMidiNote(data1, velocity);
      }
      return;
    }

    if (command === 0x80 || (command === 0x90 && data2 === 0)) {
      if (this.synthSnapshot.inputArm === 'synth') {
        this.stopSynthMidiNote(data1);
      } else {
        this.stopModernNotePreview();
      }
    }
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

    if (featureFlags.sample_composer && this.workspaceMode === 'sample-creator' && this.synthEngine && this.synthSnapshot?.inputArm === 'synth') {
      const note = getKeyboardNoteFromKey(event.key, this.keyboardOctave);
      if (note) {
        const absolute = noteToAbsolute(note);
        if (absolute !== null && !this.synthPressedNoteKeys.has(event.code)) {
          event.preventDefault();
          this.synthPressedNoteKeys.set(event.code, absolute);
          this.playSynthMidiNote(absolute, this.sampleCreatorState.velocity);
        }
        return;
      }
    }

    if (this.snapshot.sampleEditor.open) {
      return;
    }

    const outcome = interpretKeyboard(event, this.snapshot, this.keyboardOctave);
    if (!outcome) {
      if (this.handleModernHexEntry(event)) {
        this.snapshot = this.engine.getSnapshot();
        this.render();
      }
      return;
    }

    event.preventDefault();

    if (typeof outcome.octave === 'number') {
      this.keyboardOctave = outcome.octave;
      this.render();
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
      this.render();
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
        this.engine.dispatch(outcome.command);
        this.previewModernNote(outcome.command.patch.note, channel);
        const absolute = noteToAbsolute(outcome.command.patch.note);
        if (absolute !== null) {
          this.triggerPianoGlow(channel, absolute);
        }
        this.snapshot = this.engine.getSnapshot();
        this.moveModernCursor(this.snapshot.cursor.row + 1, channel, 'note');
        this.render();
        return;
      }

      this.engine.dispatch(outcome.command);
      this.snapshot = this.engine.getSnapshot();
      this.render();
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (this.viewMode === 'modern' && !isEditableTarget(event.target)) {
      event.stopPropagation();
      event.stopImmediatePropagation();
      const synthMidiNote = this.synthPressedNoteKeys.get(event.code);
      if (typeof synthMidiNote === 'number') {
        this.synthPressedNoteKeys.delete(event.code);
        this.stopSynthMidiNote(synthMidiNote);
        return;
      }
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

  private updateSampleEditorScrollbarThumb(sampleLength: number, viewLength: number): void {
    const scrollbar = this.domRefs?.sampleEditorScroll ?? null;
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
    this.render();
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
    this.render();
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
    this.render();
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
    this.render();
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

  private syncClassicRenderingState(): void {
    this.engine?.setClassicRenderingActive(this.viewMode === 'classic');
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
