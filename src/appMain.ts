import { createElement, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, FilePlus, FolderOpen, Monitor, PencilLine, Play, Square, View, Volume2, VolumeX } from 'lucide';
import { createTrackerEngine } from './core/createEngine';
import { translateClassicKeyboardEvent, type ClassicKeyTranslation } from './core/classicKeyboard';
import { interpretKeyboard, isEditableTarget } from './core/keyboard';
import type { TrackerEngine } from './core/trackerEngine';
import type {
  CursorField,
  EngineConfig,
  PatternCell,
  QuadrascopeState,
  SampleSlot,
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
  handlePianoPointer as handleModernPianoPointer,
  resolvePatternFieldFromPointer as resolveModernPatternFieldFromPointer,
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
  renderToolbarButton as renderModernToolbarButton,
  renderTrackHeader as renderModernTrackHeader,
  renderTransportButtonContent as renderModernTransportButtonContent,
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
const SAMPLE_EDITOR_HEIGHT = 280;

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
  private syncingAutoEditMode = false;
  private sampleEditorViewOverride: SampleEditorViewOverride | null = null;
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
      onSampleEditorPointerDown: (event) => this.handleSampleEditorPointerDown(event),
      onSampleEditorWheel: (event) => this.handleSampleEditorWheel(event),
      onPianoPointer: (event) => this.handlePianoPointer(event),
      onRootClick: (event) => this.handleClick(event),
      onRootChange: (event) => this.handleChange(event),
      onRootInput: (event) => this.handleInput(event),
      onWindowKeyDown: (event) => this.handleKeyDown(event),
      onWindowKeyUp: (event) => this.handleKeyUp(event),
      onWindowBlur: () => this.releaseClassicKeys(),
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
        }
      },
      onWindowMouseMove: (event) => this.handleSampleEditorPointerMove(event),
      onWindowMouseUp: () => this.handleSampleEditorPointerUp(),
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
        if (!event.snapshot.transport.playing) {
          this.samplePreviewPlaying = false;
        }

        const shouldEdit = !event.snapshot.transport.playing;
        if (!this.syncingAutoEditMode && this.engine && event.snapshot.editor.editMode !== shouldEdit) {
          this.syncingAutoEditMode = true;
          this.engine.dispatch({ type: 'editor/set-edit-mode', enabled: shouldEdit });
          this.syncingAutoEditMode = false;
          return;
        }

        if (this.viewMode === 'modern' && event.snapshot.transport.playing && this.root.querySelector('.app-shell')) {
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

    const selectedSample = snapshot.samples[snapshot.selectedSample];
    const samplePage = this.resolveSamplePage(snapshot);
    const sampleButtons = this.renderSampleBank(snapshot, samplePage);
    const samplePageCount = this.getSamplePageCount(snapshot);
    const sampleEditorOpen = snapshot.sampleEditor.open;
    const shell = document.createElement('div');
    shell.className = `app-shell app-shell--${this.viewMode}`;
    const moduleCardsHtml = [
      this.renderModuleStepperCard('Position', String(snapshot.transport.position).padStart(2, '0'), 'position', 'song-position-down', 'song-position-up', this.canEditSnapshot(snapshot)),
      this.renderModuleStepperCard('Pattern', String(snapshot.pattern.index).padStart(2, '0'), 'pattern', 'song-pattern-down', 'song-pattern-up', this.canEditSnapshot(snapshot)),
      this.renderModuleStepperCard('Length', String(snapshot.song.length).padStart(2, '0'), 'length', 'song-length-down', 'song-length-up', this.canEditSnapshot(snapshot)),
      this.renderModuleStepperCard('BPM', String(snapshot.transport.bpm), 'bpm', 'song-bpm-down', 'song-bpm-up', this.canEditSnapshot(snapshot)),
      this.renderModuleValueCard('Time', formatSongTime(snapshot), 'time'),
    ].join('');
    const toolbarPrimaryHtml = [
      this.renderToolbarButton('new-song', FilePlus, 'New'),
      this.renderToolbarButton('load-module', FolderOpen, 'Load'),
      this.renderToolbarButton('save-module', Download, 'Export'),
    ].join('');
    const viewToggleHtml = [
      this.renderToolbarButton('view-modern', Monitor, 'Modern', this.viewMode === 'modern'),
      this.renderToolbarButton('view-classic', View, 'Classic', this.viewMode === 'classic'),
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
        octaveDownIconHtml: iconMarkup(ChevronLeft),
        octaveUpIconHtml: iconMarkup(ChevronRight),
        trackHeadersHtml,
      });

    shell.innerHTML = renderAppShellMarkup({
      viewMode: this.viewMode,
      toolbarPrimaryHtml,
      viewToggleHtml,
      songTitle: escapeHtml(snapshot.song.title || 'UNTITLED'),
      transportAction: snapshot.transport.playing ? 'stop' : 'toggle-play',
      transportButtonContentHtml: this.renderTransportButtonContent(snapshot),
      moduleCardsHtml,
      visualizationLabel: escapeHtml(getVisualizationLabel(this.visualizationMode)),
      visualizationPrevIconHtml: iconMarkup(ChevronLeft),
      visualizationNextIconHtml: iconMarkup(ChevronRight),
      editorPanelHtml,
      samplePage,
      samplePageCount,
      sampleButtonsHtml: sampleButtons,
      selectedSamplePanelHtml: this.renderSelectedSamplePanel(selectedSample, snapshot),
      classicDebugHtml: this.renderClassicDebug(),
      samplePagePrevDisabled: samplePage <= 0,
      samplePageNextDisabled: samplePage >= samplePageCount - 1,
      samplePagePrevIconHtml: iconMarkup(ChevronLeft),
      samplePageNextIconHtml: iconMarkup(ChevronRight),
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

    this.updateModernLiveRegions(snapshot);
    this.updateClassicDebugPanel(snapshot);
    this.syncSnapshotPolling();
  }

  private renderToolbarButton(action: string, iconNode: unknown, label: string, active = false): string {
    return renderModernToolbarButton(action, iconMarkup(iconNode), label, active);
  }

  private renderTransportButtonContent(snapshot: TrackerSnapshot): string {
    return renderModernTransportButtonContent(snapshot.transport.playing, iconMarkup(snapshot.transport.playing ? Square : Play));
  }

  private canEditSnapshot(snapshot: TrackerSnapshot | null): boolean {
    return !!snapshot && !snapshot.transport.playing;
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

      if (this.engine) {
        this.quadrascope = this.engine.getQuadrascope() ?? this.quadrascope;
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
    void snapshot;
    return renderModernSelectedSamplePanel({
      sample,
      samplePreviewPlaying: this.samplePreviewPlaying,
      playIconHtml: iconMarkup(Play),
      stopIconHtml: iconMarkup(Square),
      editIconHtml: iconMarkup(PencilLine),
    });
  }

  private renderSampleEditorPanel(snapshot: TrackerSnapshot): string {
    return renderModernSampleEditorPanel({
      snapshot,
      editable: this.canEditSnapshot(snapshot),
      samplePreviewPlaying: this.samplePreviewPlaying,
      selectedSampleHeading: this.getSelectedSampleHeading(snapshot.samples[snapshot.selectedSample]),
      view: this.getSampleEditorView(snapshot),
      playIconHtml: iconMarkup(Play),
      stopIconHtml: iconMarkup(Square),
    });
  }

  private renderClassicDebug(): string {
    return renderModernClassicDebug(this.viewMode === 'classic' && SHOW_CLASSIC_DEBUG);
  }

  private async handleClick(event: Event): Promise<void> {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') as HTMLElement | null : null;
    if (!target || !this.engine || !this.snapshot) {
      return;
    }
    await handleModernClickAction({
      target,
      engine: this.engine,
      snapshot: this.snapshot,
      moduleInput: this.moduleInput,
      sampleInput: this.sampleInput,
      keyboardOctave: this.keyboardOctave,
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
      setKeyboardOctave: (value) => { this.keyboardOctave = value; },
      setLastSelectedSample: (value) => { this.lastSelectedSample = value; },
      setPendingSampleImportSlot: (value) => { this.pendingSampleImportSlot = value; },
      setSampleEditorViewOverride: (value) => { this.sampleEditorViewOverride = value; },
      setSamplePage: (value) => { this.samplePage = value; },
      setSamplePreviewPlaying: (value) => { this.samplePreviewPlaying = value; },
      setSnapshot: (snapshot) => { this.snapshot = snapshot; },
      setViewMode: (mode) => { this.viewMode = mode; },
      shiftVisualization: (direction) => this.shiftVisualization(direction),
      updateModernLiveRegions: (snapshot) => this.updateModernLiveRegions(snapshot),
    });
  }

  private async handleChange(event: Event): Promise<void> {
    if (!(event.target instanceof HTMLInputElement) || !this.engine) {
      return;
    }

    if (event.target === this.moduleInput) {
      await loadModuleFromInput(this.engine, this.moduleInput);
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
          this.render();
        },
      });
      this.pendingSampleImportSlot = null;
      return;
    }

    this.handleInput(event);
  }

  private handleInput(event: Event): void {
    if (!(event.target instanceof HTMLInputElement) || !this.engine || !this.snapshot) {
      return;
    }

    handleModernInputAction({
      target: event.target,
      engine: this.engine,
      snapshot: this.snapshot,
      canEditSnapshot: (snapshot) => this.canEditSnapshot(snapshot),
      getSampleEditorView: (snapshot) => this.getSampleEditorView(snapshot),
      refreshSelectedSampleWaveform: (snapshot, force) => this.refreshSelectedSampleWaveform(snapshot, force),
      setSampleEditorViewOverride: (value) => { this.sampleEditorViewOverride = value; },
      setSnapshot: (snapshot) => { this.snapshot = snapshot; },
      updateModernLiveRegions: (snapshot) => this.updateModernLiveRegions(snapshot),
    });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.viewMode === 'classic') {
      this.handleClassicKeyDown(event);
      return;
    }

    if (!this.engine || !this.snapshot || isEditableTarget(event.target)) {
      return;
    }

    if (this.snapshot.sampleEditor.open) {
      return;
    }

    const outcome = interpretKeyboard(event, this.snapshot, this.keyboardOctave);
    if (!outcome) {
      this.handleModernHexEntry(event);
      return;
    }

    event.preventDefault();

    if (typeof outcome.octave === 'number') {
      this.keyboardOctave = outcome.octave;
      this.updateModernLiveRegions(this.snapshot);
    }

    if (outcome.transport) {
      this.engine.setTransport(outcome.transport);
    }

    if (outcome.command) {
      this.engine.dispatch(outcome.command);
      if (outcome.command.type === 'pattern/set-cell' && outcome.command.patch.note) {
        this.engine.dispatch({ type: 'cursor/move', rowDelta: 1 });
      }
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
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
    this.setLiveText('song-title', snapshot.song.title || 'UNTITLED');
    this.setLiveText('metric-position', String(snapshot.transport.position).padStart(2, '0'));
    this.setLiveText('metric-pattern', String(snapshot.pattern.index).padStart(2, '0'));
    this.setLiveText('metric-length', String(snapshot.song.length).padStart(2, '0'));
    this.setLiveText('metric-bpm', String(snapshot.transport.bpm));
    this.setLiveText('metric-time', formatSongTime(snapshot));
    this.setLiveText('octave-value', `Octave ${this.keyboardOctave}`);
    this.setLiveText('visualization-label', getVisualizationLabel(this.visualizationMode));
    this.updateSamplePanel(snapshot);
    this.updateTrackMuteButtons(snapshot);

    const transportToggle = this.root.querySelector<HTMLButtonElement>('[data-role="transport-toggle"]');
    if (transportToggle) {
      transportToggle.dataset.action = snapshot.transport.playing ? 'stop' : 'toggle-play';
      transportToggle.innerHTML = this.renderTransportButtonContent(snapshot);
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

    const samplePreviewToggle = this.root.querySelector<HTMLButtonElement>('[data-role="sample-preview-toggle"]');
    if (samplePreviewToggle) {
      samplePreviewToggle.disabled = snapshot.samples[snapshot.selectedSample]?.length <= 0;
      samplePreviewToggle.dataset.action = this.samplePreviewPlaying ? 'sample-preview-stop' : 'sample-preview-play';
      samplePreviewToggle.innerHTML = `${iconMarkup(this.samplePreviewPlaying ? Square : Play)}<span>${this.samplePreviewPlaying ? 'Stop' : 'Play'}</span>`;
    }

    const sampleEditorPreviewToggle = this.root.querySelector<HTMLButtonElement>('[data-role="sample-editor-preview-toggle"]');
    if (sampleEditorPreviewToggle) {
      sampleEditorPreviewToggle.disabled = snapshot.samples[snapshot.selectedSample]?.length <= 0;
      sampleEditorPreviewToggle.dataset.action = this.samplePreviewPlaying ? 'sample-editor-stop' : 'sample-editor-preview';
      sampleEditorPreviewToggle.innerHTML = `${iconMarkup(this.samplePreviewPlaying ? Square : Play)}<span>${this.samplePreviewPlaying ? 'Stop' : 'Play'}</span>`;
    }

    const sampleEditorShowSelectionButton = this.root.querySelector<HTMLButtonElement>('[data-action="sample-editor-show-selection"]');
    if (sampleEditorShowSelectionButton) {
      sampleEditorShowSelectionButton.disabled = snapshot.sampleEditor.selectionStart === null;
    }

    const sampleEditorCropButton = this.root.querySelector<HTMLButtonElement>('[data-action="sample-editor-crop"]');
    if (sampleEditorCropButton) {
      sampleEditorCropButton.disabled = !this.canEditSnapshot(snapshot) || snapshot.sampleEditor.selectionStart === null;
    }

    const sampleEditorCutButton = this.root.querySelector<HTMLButtonElement>('[data-action="sample-editor-cut"]');
    if (sampleEditorCutButton) {
      sampleEditorCutButton.disabled = !this.canEditSnapshot(snapshot) || snapshot.sampleEditor.selectionStart === null;
    }

    const sampleLoopEnabled = this.root.querySelector<HTMLInputElement>('[data-input="sample-loop-enabled"]');
    const loopEnabled = snapshot.samples[snapshot.selectedSample].loopLength > 2 && snapshot.samples[snapshot.selectedSample].length > 2;
    if (sampleLoopEnabled) {
      sampleLoopEnabled.checked = loopEnabled;
      sampleLoopEnabled.disabled = !this.canEditSnapshot(snapshot);
    }

    const sampleLoopStart = this.root.querySelector<HTMLInputElement>('[data-input="sample-loop-start"]');
    if (sampleLoopStart) {
      sampleLoopStart.value = String(snapshot.samples[snapshot.selectedSample].loopStart);
      sampleLoopStart.disabled = !this.canEditSnapshot(snapshot) || !loopEnabled;
    }

    const sampleLoopEnd = this.root.querySelector<HTMLInputElement>('[data-input="sample-loop-end"]');
    if (sampleLoopEnd) {
      sampleLoopEnd.value = String(snapshot.samples[snapshot.selectedSample].loopStart + snapshot.samples[snapshot.selectedSample].loopLength);
      sampleLoopEnd.disabled = !this.canEditSnapshot(snapshot) || !loopEnabled;
    }

    const view = this.getSampleEditorView(snapshot);
    const sampleEditorScroll = this.root.querySelector<HTMLInputElement>('[data-input="sample-editor-scroll"]');
    if (sampleEditorScroll) {
      const max = Math.max(0, snapshot.sampleEditor.sampleLength - view.length);
      sampleEditorScroll.max = String(max);
      sampleEditorScroll.value = String(clamp(view.start, 0, max));
      sampleEditorScroll.disabled = view.length >= snapshot.sampleEditor.sampleLength;
      sampleEditorScroll.closest('.sample-editor-scrollbar-wrap')?.classList.toggle('is-hidden', view.length >= snapshot.sampleEditor.sampleLength || snapshot.sampleEditor.sampleLength <= 0);
    }

    this.setLiveText('sample-editor-visible', `Visible ${view.start} - ${view.end}`);
    this.setLiveText('sample-editor-loop', `Loop ${snapshot.sampleEditor.loopStart} - ${snapshot.sampleEditor.loopEnd}`);

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
    });
  }

  private setLiveText(role: string, value: string): void {
    setModernLiveText(this.root, role, value);
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
    handleModernPianoPointer({
      event,
      engine: this.engine,
      snapshot: this.snapshot,
      canvas: this.pianoCanvas,
      canEditSnapshot: (snapshot) => this.canEditSnapshot(snapshot),
      onGlow: (channel, absolute) => this.triggerPianoGlow(channel, absolute),
      onActiveNote: (channel, absolute) => { this.activePianoNotes[channel] = absolute; },
      onAfterCommit: (snapshot) => {
        this.snapshot = snapshot;
        this.drawPatternCanvas(snapshot);
      },
    });
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
