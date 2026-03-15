import { createElement, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, FilePlus, FolderOpen, Monitor, PencilLine, Play, Square, View, Volume2, VolumeX } from 'lucide';
import { createTrackerEngine } from './core/createEngine';
import { translateClassicKeyboardEvent, type ClassicKeyTranslation } from './core/classicKeyboard';
import { interpretKeyboard, isEditableTarget } from './core/keyboard';
import type { TrackerEngine } from './core/trackerEngine';
import type {
  CursorField,
  EngineConfig,
  ExportedFile,
  PatternCell,
  QuadrascopeState,
  SampleSlot,
  TrackerSnapshot,
} from './core/trackerTypes';
import {
  escapeHtml,
  formatCellEffect,
  formatCellNote,
  formatCellParam,
  formatCellSample,
  formatSampleLength,
} from './ui/formatters';

const DEFAULT_STATUS = 'Initializing ProTracker 2 web clone...';
const SHOW_CLASSIC_DEBUG = false;
const MODERN_VISIBLE_PATTERN_ROWS = 15;
const MIN_OCTAVE = 1;
const MAX_OCTAVE = 2;
const SAMPLE_PAGE_SIZE = 12;
const CURSOR_FIELDS: CursorField[] = ['note', 'sampleHigh', 'sampleLow', 'effect', 'paramHigh', 'paramLow'];
const PATTERN_ROW_HEIGHT = 30;
const PATTERN_GUTTER = 10;
const PATTERN_ROW_INDEX_WIDTH = 54;
const PATTERN_MIN_CHANNEL_WIDTH = 150;
const QUADRASCOPE_HEIGHT = 220;
const SPECTRUM_HEIGHT = 220;
const PIANO_HEIGHT = QUADRASCOPE_HEIGHT;
const SAMPLE_PREVIEW_HEIGHT = 182;
const SAMPLE_EDITOR_HEIGHT = 280;
const CHANNEL_COLORS = ['#deff5a', '#43f7af', '#5ab8ff', '#ffad46'];
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const VISUALIZATION_MODES = ['quad-stack', 'quad-classic', 'spectrum', 'split', 'signal-trails', 'piano'] as const;
type VisualizationMode = (typeof VISUALIZATION_MODES)[number];
const PIANO_START_ABSOLUTE = 12;
const PIANO_END_ABSOLUTE = 47;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const value = hex.replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map((char) => `${char}${char}`).join('')
    : value;

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const mixRgb = (
  left: { r: number; g: number; b: number },
  right: { r: number; g: number; b: number },
  amount: number,
): { r: number; g: number; b: number } => ({
  r: Math.round(left.r + ((right.r - left.r) * amount)),
  g: Math.round(left.g + ((right.g - left.g) * amount)),
  b: Math.round(left.b + ((right.b - left.b) * amount)),
});

const rgba = (color: { r: number; g: number; b: number }, alpha = 1): string =>
  `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;

const brighten = (color: { r: number; g: number; b: number }, amount: number): { r: number; g: number; b: number } =>
  mixRgb(color, { r: 255, g: 255, b: 255 }, amount);

const darken = (color: { r: number; g: number; b: number }, amount: number): { r: number; g: number; b: number } =>
  mixRgb(color, { r: 8, g: 13, b: 10 }, amount);

const spectrumColorAt = (t: number): { r: number; g: number; b: number } => {
  const clamped = clamp(t, 0, 1);
  const scaled = clamped * (CHANNEL_COLORS.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(CHANNEL_COLORS.length - 1, leftIndex + 1);
  const localT = scaled - leftIndex;
  return mixRgb(hexToRgb(CHANNEL_COLORS[leftIndex]), hexToRgb(CHANNEL_COLORS[rightIndex]), localT);
};

const iconMarkup = (iconNode: unknown): string =>
  createElement(iconNode as Parameters<typeof createElement>[0], {
    class: 'ui-icon',
    width: 14,
    height: 14,
    'stroke-width': 1.8,
    'aria-hidden': 'true',
  }).outerHTML;

const triggerDownload = (file: ExportedFile): void => {
  const blob = new Blob([Uint8Array.from(file.bytes)], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(url);
};

const moveCursorHorizontally = (
  cursor: TrackerSnapshot['cursor'],
  channelCount: number,
  direction: -1 | 1,
): { channel: number; field: CursorField } => {
  const maxChannel = Math.max(0, channelCount - 1);
  let fieldIndex = CURSOR_FIELDS.indexOf(cursor.field);
  let channel = cursor.channel;

  fieldIndex += direction;

  if (fieldIndex < 0) {
    if (channel > 0) {
      channel -= 1;
      fieldIndex = CURSOR_FIELDS.length - 1;
    } else {
      fieldIndex = 0;
    }
  } else if (fieldIndex >= CURSOR_FIELDS.length) {
    if (channel < maxChannel) {
      channel += 1;
      fieldIndex = 0;
    } else {
      fieldIndex = CURSOR_FIELDS.length - 1;
    }
  }

  return {
    channel,
    field: CURSOR_FIELDS[fieldIndex],
  };
};

const getVisualizationLabel = (mode: VisualizationMode): string => {
  switch (mode) {
    case 'quad-stack':
      return 'Quadrascope';
    case 'quad-classic':
      return 'Classic quadrascope';
    case 'spectrum':
      return 'Spectrum analyzer';
    case 'split':
      return 'Scope + spectrum';
    case 'signal-trails':
      return 'Signal trails';
    case 'piano':
      return 'Tracker piano';
  }
};

const formatSongTime = (snapshot: TrackerSnapshot): string => {
  const secondsPerRow = (snapshot.transport.speed * 2.5) / Math.max(1, snapshot.transport.bpm);
  const totalRows = (snapshot.transport.position * 64) + snapshot.transport.row;
  const totalSeconds = Math.max(0, Math.floor(totalRows * secondsPerRow));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

interface PianoKey {
  note: string;
  absolute: number;
  black: boolean;
  x: number;
  width: number;
}

const noteToAbsolute = (note: string | null | undefined): number | null => {
  if (!note || note === '---' || note.length < 3) {
    return null;
  }

  const pitch = note.slice(0, 2);
  const octave = Number.parseInt(note.slice(2), 10);
  const pitchIndex = NOTE_NAMES.indexOf(pitch);
  if (pitchIndex < 0 || Number.isNaN(octave)) {
    return null;
  }

  return (octave * 12) + pitchIndex;
};

const absoluteToNote = (absolute: number): string => {
  const clamped = clamp(absolute, PIANO_START_ABSOLUTE, PIANO_END_ABSOLUTE);
  return `${NOTE_NAMES[clamped % 12]}${Math.floor(clamped / 12)}`;
};

const isBlackSemitone = (absolute: number): boolean => [1, 3, 6, 8, 10].includes(absolute % 12);

const buildPianoKeys = (width: number, startAbsolute = PIANO_START_ABSOLUTE, endAbsolute = PIANO_END_ABSOLUTE): PianoKey[] => {
  const whiteKeys = Array.from({ length: endAbsolute - startAbsolute + 1 }, (_, offset) => startAbsolute + offset)
    .filter((absolute) => !isBlackSemitone(absolute));
  const whiteKeyWidth = width / Math.max(1, whiteKeys.length);
  const whiteKeyMap = new Map<number, number>();

  whiteKeys.forEach((absolute, index) => {
    whiteKeyMap.set(absolute, index);
  });

  return Array.from({ length: endAbsolute - startAbsolute + 1 }, (_, offset) => {
    const absolute = startAbsolute + offset;
    const black = isBlackSemitone(absolute);
    if (!black) {
      const whiteIndex = whiteKeyMap.get(absolute) ?? 0;
      return {
        note: absoluteToNote(absolute),
        absolute,
        black,
        x: whiteIndex * whiteKeyWidth,
        width: whiteKeyWidth,
      };
    }

    const leftWhite = whiteKeyMap.get(absolute - 1) ?? 0;
    return {
      note: absoluteToNote(absolute),
      absolute,
      black,
      x: ((leftWhite + 1) * whiteKeyWidth) - (whiteKeyWidth * 0.32),
      width: whiteKeyWidth * 0.64,
    };
  });
};

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
  private sampleEditorViewOverride: { sample: number; start: number; length: number } | null = null;
  private sampleEditorPointer: {
    mode: 'idle' | 'select' | 'loop-start' | 'loop-end';
    active: boolean;
    anchor: number;
    current: number;
  } = {
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

    this.moduleInput = document.createElement('input');
    this.moduleInput.type = 'file';
    this.moduleInput.accept = '.mod,.m15,.stk,.nst,.ust,.pp,.nt';
    this.moduleInput.hidden = true;

    this.sampleInput = document.createElement('input');
    this.sampleInput.type = 'file';
    this.sampleInput.accept = '.wav,.iff,.aiff,.aif,.raw';
    this.sampleInput.hidden = true;

    this.patternCanvas = document.createElement('canvas');
    this.patternCanvas.className = 'pattern-canvas';
    this.patternCanvas.width = 960;
    this.patternCanvas.height = 470;
    this.patternCanvas.tabIndex = 0;
    this.patternCanvas.setAttribute('aria-label', 'Modern pattern editor');
    this.patternCanvas.addEventListener('mousedown', (event) => this.handlePatternCanvasPointer(event));

    this.samplePreviewCanvas = document.createElement('canvas');
    this.samplePreviewCanvas.className = 'sample-preview-canvas';
    this.samplePreviewCanvas.width = 480;
    this.samplePreviewCanvas.height = SAMPLE_PREVIEW_HEIGHT;
    this.samplePreviewCanvas.setAttribute('aria-label', 'Selected sample preview');

    this.sampleEditorCanvas = document.createElement('canvas');
    this.sampleEditorCanvas.className = 'sample-editor-canvas';
    this.sampleEditorCanvas.width = 960;
    this.sampleEditorCanvas.height = SAMPLE_EDITOR_HEIGHT;
    this.sampleEditorCanvas.setAttribute('aria-label', 'Sample editor');
    this.sampleEditorCanvas.addEventListener('mousedown', (event) => this.handleSampleEditorPointerDown(event));
    this.sampleEditorCanvas.addEventListener('wheel', (event) => this.handleSampleEditorWheel(event), { passive: false });

    this.quadrascopeCanvas = document.createElement('canvas');
    this.quadrascopeCanvas.className = 'quadrascope-canvas';
    this.quadrascopeCanvas.width = 960;
    this.quadrascopeCanvas.height = QUADRASCOPE_HEIGHT;
    this.quadrascopeCanvas.setAttribute('aria-label', 'Quadrascope visualizer');

    this.spectrumCanvas = document.createElement('canvas');
    this.spectrumCanvas.className = 'spectrum-canvas';
    this.spectrumCanvas.width = 960;
    this.spectrumCanvas.height = SPECTRUM_HEIGHT;
    this.spectrumCanvas.setAttribute('aria-label', 'Spectrum analyzer');

    this.trailsCanvas = document.createElement('canvas');
    this.trailsCanvas.className = 'trails-canvas';
    this.trailsCanvas.width = 960;
    this.trailsCanvas.height = QUADRASCOPE_HEIGHT;
    this.trailsCanvas.setAttribute('aria-label', 'Signal trails visualizer');

    this.pianoCanvas = document.createElement('canvas');
    this.pianoCanvas.className = 'piano-canvas';
    this.pianoCanvas.width = 960;
    this.pianoCanvas.height = PIANO_HEIGHT;
    this.pianoCanvas.setAttribute('aria-label', 'Tracker piano visualizer');
    this.pianoCanvas.addEventListener('mousedown', (event) => this.handlePianoPointer(event));

    this.root.append(this.moduleInput, this.sampleInput);

    this.root.addEventListener('click', (event) => void this.handleClick(event));
    this.root.addEventListener('change', (event) => void this.handleChange(event));
    this.root.addEventListener('input', (event) => this.handleInput(event));
    window.addEventListener('keydown', (event) => this.handleKeyDown(event));
    window.addEventListener('keyup', (event) => this.handleKeyUp(event));
    window.addEventListener('blur', () => this.releaseClassicKeys());
    this.config.canvas.addEventListener('mousemove', (event) => this.handleClassicCanvasPointerMove(event));
    this.config.canvas.addEventListener('mousedown', (event) => this.handleClassicCanvasPointerButton(event, true));
    this.config.canvas.addEventListener('mouseup', (event) => this.handleClassicCanvasPointerButton(event, false));
    this.config.canvas.addEventListener('mouseenter', (event) => {
      this.classicDomDebug.inside = true;
      this.handleClassicCanvasPointer(event);
    });
    this.config.canvas.addEventListener('mouseleave', () => {
      this.classicDomDebug.inside = false;
      this.updateClassicDebugPanel(this.snapshot);
    });
    window.addEventListener('resize', () => {
      if (this.snapshot && this.viewMode === 'modern') {
        this.drawPatternCanvas(this.snapshot);
        this.drawSelectedSamplePreview(this.snapshot);
        this.drawSampleEditor(this.snapshot);
        this.drawVisualization(this.snapshot);
      }
    });
    window.addEventListener('mousemove', (event) => this.handleSampleEditorPointerMove(event));
    window.addEventListener('mouseup', () => this.handleSampleEditorPointerUp());
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
    shell.innerHTML = `
      <section class="toolbar">
        <div class="toolbar-group">
          ${this.renderToolbarButton('new-song', FilePlus, 'New')}
          ${this.renderToolbarButton('load-module', FolderOpen, 'Load')}
          ${this.renderToolbarButton('save-module', Download, 'Export')}
        </div>
        <div class="toolbar-group toolbar-group--views">
          <div class="view-toggle" role="tablist" aria-label="View mode">
            ${this.renderToolbarButton('view-modern', Monitor, 'Modern', this.viewMode === 'modern')}
            ${this.renderToolbarButton('view-classic', View, 'Classic', this.viewMode === 'classic')}
          </div>
        </div>
      </section>

      <main class="workspace">
        <section class="tracker-stack">
          <article class="panel module-panel">
            <div class="panel-head compact module-head">
              <div>
                <p class="panel-label">Module</p>
                <h2 class="panel-title--subtle" data-role="song-title">${escapeHtml(snapshot.song.title || 'UNTITLED')}</h2>
              </div>
              <div class="module-actions">
                <button type="button" class="toolbar-button toolbar-button--primary module-action-button" data-role="transport-toggle" data-action="${snapshot.transport.playing ? 'stop' : 'toggle-play'}">${this.renderTransportButtonContent(snapshot)}</button>
              </div>
            </div>
            <div class="module-grid">
              ${this.renderModuleStepperCard('Position', String(snapshot.transport.position).padStart(2, '0'), 'position', 'song-position-down', 'song-position-up', this.canEditSnapshot(snapshot))}
              ${this.renderModuleStepperCard('Pattern', String(snapshot.pattern.index).padStart(2, '0'), 'pattern', 'song-pattern-down', 'song-pattern-up', this.canEditSnapshot(snapshot))}
              ${this.renderModuleStepperCard('Length', String(snapshot.song.length).padStart(2, '0'), 'length', 'song-length-down', 'song-length-up', this.canEditSnapshot(snapshot))}
              ${this.renderModuleStepperCard('BPM', String(snapshot.transport.bpm), 'bpm', 'song-bpm-down', 'song-bpm-up', this.canEditSnapshot(snapshot))}
              ${this.renderModuleValueCard('Time', formatSongTime(snapshot), 'time')}
            </div>
          </article>

          <article class="panel visualization-panel">
            <div class="panel-head compact">
              <div>
                <p class="panel-label">Visualization</p>
                <h2 class="panel-title--subtle" data-role="visualization-label">${escapeHtml(getVisualizationLabel(this.visualizationMode))}</h2>
              </div>
              <div class="visualization-controls">
                <button type="button" class="icon-button" data-action="visualization-prev">${iconMarkup(ChevronLeft)}<span class="sr-only">Previous visualization</span></button>
                <button type="button" class="icon-button" data-action="visualization-next">${iconMarkup(ChevronRight)}<span class="sr-only">Next visualization</span></button>
              </div>
            </div>
            <div class="visualization-host" data-role="visualization-host"></div>
          </article>

          ${sampleEditorOpen ? this.renderSampleEditorPanel(snapshot) : `
            <article class="panel pattern-panel editor-panel-shell">
              <div class="panel-head compact">
                <div>
                  <p class="panel-label">Pattern editor</p>
                </div>
                <div class="octave-control">
                  <button type="button" class="icon-button" data-action="octave-down">${iconMarkup(ChevronLeft)}<span class="sr-only">Lower octave</span></button>
                  <span class="octave-value" data-role="octave-value">Octave ${this.keyboardOctave}</span>
                  <button type="button" class="icon-button" data-action="octave-up">${iconMarkup(ChevronRight)}<span class="sr-only">Raise octave</span></button>
                </div>
              </div>
              <div class="pattern-header">
                <span>Row</span>
                ${this.renderTrackHeader(0, snapshot)}
                ${this.renderTrackHeader(1, snapshot)}
                ${this.renderTrackHeader(2, snapshot)}
                ${this.renderTrackHeader(3, snapshot)}
              </div>
              <div class="pattern-canvas-host" data-role="pattern-host"></div>
            </article>
          `}
        </section>

        <aside class="inspector-stack">
          <section class="panel inspector-panel">
            <div class="panel-head compact">
              <div>
                <p class="panel-label">Samples</p>
              </div>
              <div class="visualization-controls">
                <span class="panel-title--subtle" data-role="sample-page-label">Page ${samplePage + 1} / ${samplePageCount}</span>
                <button type="button" class="icon-button" data-action="sample-page-prev" ${samplePage <= 0 ? 'disabled' : ''}>${iconMarkup(ChevronLeft)}<span class="sr-only">Previous sample page</span></button>
                <button type="button" class="icon-button" data-action="sample-page-next" ${samplePage >= samplePageCount - 1 ? 'disabled' : ''}>${iconMarkup(ChevronRight)}<span class="sr-only">Next sample page</span></button>
              </div>
            </div>
            <div class="sample-bank" data-role="sample-bank">${sampleButtons}</div>
            <div data-role="sample-detail-content">${this.renderSelectedSamplePanel(selectedSample, snapshot)}</div>
          </section>

          <section class="panel canvas-panel">
            <div class="panel-head compact">
              <div>
                <p class="panel-label">Classic</p>
                <h2>Original ProTracker UI</h2>
              </div>
            </div>
            ${this.renderClassicDebug()}
            <div class="engine-canvas-host"></div>
          </section>
        </aside>
      </main>
    `;

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
    return `<button type="button" class="toolbar-button${active ? ' is-active' : ''}" data-action="${action}">${iconMarkup(iconNode)}<span>${escapeHtml(label)}</span></button>`;
  }

  private renderTransportButtonContent(snapshot: TrackerSnapshot): string {
    return `${iconMarkup(snapshot.transport.playing ? Square : Play)}<span>${snapshot.transport.playing ? 'Stop' : 'Play'}</span>`;
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
    return `
      <div class="module-card module-card--stepper">
        <span class="metric-label">${escapeHtml(label)}</span>
        <div class="module-stepper">
          <strong class="module-stepper__value" data-role="metric-${role}">${escapeHtml(value)}</strong>
          <div class="module-stepper__buttons">
            <button type="button" class="icon-button icon-button--small" data-action="${downAction}" ${enabled ? '' : 'disabled'}>${iconMarkup(ChevronDown)}<span class="sr-only">Decrease ${escapeHtml(label)}</span></button>
            <button type="button" class="icon-button icon-button--small" data-action="${upAction}" ${enabled ? '' : 'disabled'}>${iconMarkup(ChevronUp)}<span class="sr-only">Increase ${escapeHtml(label)}</span></button>
          </div>
        </div>
      </div>
    `;
  }

  private renderModuleValueCard(label: string, value: string, role: string): string {
    return `
      <div class="module-card module-card--readout">
        <span class="metric-label">${escapeHtml(label)}</span>
        <div class="module-readout">
          <strong class="module-readout__value" data-role="metric-${role}">${escapeHtml(value)}</strong>
        </div>
      </div>
    `;
  }

  private renderTrackHeader(channel: number, snapshot: TrackerSnapshot): string {
    const muted = snapshot.editor.muted[channel] ?? false;
    return `
      <span class="track-label track-label--${channel + 1}${muted ? ' is-muted' : ''}">
        <button
          type="button"
          class="track-mute-button${muted ? ' is-muted' : ''}"
          data-role="track-mute-${channel}"
          data-action="toggle-track-mute"
          data-channel="${channel}"
          aria-pressed="${muted ? 'true' : 'false'}"
          aria-label="${muted ? 'Unmute track' : 'Mute track'} ${channel + 1}"
        >${iconMarkup(muted ? VolumeX : Volume2)}</button>
        <span>Track ${channel + 1}</span>
      </span>
    `;
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

    const widthSource = this.samplePreviewCanvas.parentElement?.clientWidth
      || this.samplePreviewCanvas.getBoundingClientRect().width
      || 420;
    if (widthSource <= 0) {
      return;
    }

    const width = Math.max(280, Math.round(widthSource));
    const height = SAMPLE_PREVIEW_HEIGHT;
    const dpr = window.devicePixelRatio || 1;

    if (this.samplePreviewCanvas.width !== Math.round(width * dpr) || this.samplePreviewCanvas.height !== Math.round(height * dpr)) {
      this.samplePreviewCanvas.width = Math.round(width * dpr);
      this.samplePreviewCanvas.height = Math.round(height * dpr);
      this.samplePreviewCanvas.style.width = '100%';
      this.samplePreviewCanvas.style.height = `${height}px`;
    }

    const ctx = this.samplePreviewCanvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const sample = snapshot.samples[snapshot.selectedSample];
    const data = this.getWaveformSource(sample);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
    this.drawRoundedRect(ctx, 0, 0, width, height, 18);
    ctx.fill();

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(212, 255, 117, 0.06)');
    gradient.addColorStop(0.5, 'rgba(120, 240, 191, 0.12)');
    gradient.addColorStop(1, 'rgba(90, 184, 255, 0.08)');
    ctx.fillStyle = gradient;
    this.drawRoundedRect(ctx, 0, 0, width, height, 18);
    ctx.fill();

    if (sample.length <= 0 || data.length <= 0) {
      ctx.fillStyle = 'rgba(239, 248, 231, 0.52)';
      ctx.font = '15px "Trebuchet MS", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Select an empty slot to load a sample', width / 2, height / 2);
      return;
    }

    const plotLeft = 14;
    const plotTop = 14;
    const plotWidth = width - 28;
    const plotHeight = height - 28;
    this.drawWaveformPath(ctx, data, 0, data.length, plotLeft, plotTop, plotWidth, plotHeight, 'rgba(120, 240, 191, 0.95)', 'rgba(120, 240, 191, 0.12)');

    if (sample.loopLength > 2) {
      const loopStartX = plotLeft + ((sample.loopStart / Math.max(1, sample.length)) * plotWidth);
      const loopEndX = plotLeft + (((sample.loopStart + sample.loopLength) / Math.max(1, sample.length)) * plotWidth);
      ctx.fillStyle = 'rgba(90, 184, 255, 0.08)';
      this.drawRoundedRect(ctx, loopStartX, plotTop + 8, Math.max(2, loopEndX - loopStartX), plotHeight - 16, 8);
      ctx.fill();
      this.drawSampleMarker(ctx, loopStartX, plotTop, plotHeight, '#5ab8ff');
      this.drawSampleMarker(ctx, loopEndX, plotTop, plotHeight, '#5ab8ff');
    }
  }

  private drawSampleEditor(snapshot: TrackerSnapshot): void {
    if (this.viewMode !== 'modern' || !snapshot.sampleEditor.open) {
      return;
    }

    this.refreshSelectedSampleWaveform(snapshot);

    const widthSource = this.sampleEditorCanvas.parentElement?.clientWidth
      || this.sampleEditorCanvas.getBoundingClientRect().width
      || 960;
    if (widthSource <= 0) {
      return;
    }

    const width = Math.max(420, Math.round(widthSource));
    const height = SAMPLE_EDITOR_HEIGHT;
    const dpr = window.devicePixelRatio || 1;

    if (this.sampleEditorCanvas.width !== Math.round(width * dpr) || this.sampleEditorCanvas.height !== Math.round(height * dpr)) {
      this.sampleEditorCanvas.width = Math.round(width * dpr);
      this.sampleEditorCanvas.height = Math.round(height * dpr);
      this.sampleEditorCanvas.style.width = '100%';
      this.sampleEditorCanvas.style.height = `${height}px`;
    }

    const ctx = this.sampleEditorCanvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const sample = snapshot.samples[snapshot.selectedSample];
    const data = this.getWaveformSource(sample);
    const layout = this.getSampleEditorLayout(width, height);
    const selection = this.getDraftSampleSelection(snapshot);
    const loop = this.getDraftSampleLoop(snapshot);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
    this.drawRoundedRect(ctx, 0, 0, width, height, 18);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    this.drawRoundedRect(ctx, layout.left, layout.top, layout.width, layout.height, 14);
    ctx.fill();

    const view = this.getSampleEditorView(snapshot);
    if (sample.length <= 0 || data.length <= 0 || view.length <= 0) {
      ctx.fillStyle = 'rgba(239, 248, 231, 0.52)';
      ctx.font = '15px "Trebuchet MS", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('The selected sample is empty', width / 2, height / 2);
      return;
    }

    const visibleStart = view.start;
    const visibleEnd = view.end;
    this.drawWaveformPath(ctx, data, visibleStart, visibleEnd, layout.left, layout.top, layout.width, layout.height, 'rgba(120, 240, 191, 0.98)', 'rgba(120, 240, 191, 0.1)');

    const selectionStart = selection.start;
    const selectionEnd = selection.end;
    if (selectionStart !== null && selectionEnd !== null) {
      const x1 = this.sampleOffsetToEditorX(selectionStart, snapshot, layout);
      const x2 = this.sampleOffsetToEditorX(selectionEnd, snapshot, layout);
      ctx.fillStyle = 'rgba(212, 255, 117, 0.14)';
      this.drawRoundedRect(ctx, Math.min(x1, x2), layout.top + 10, Math.max(2, Math.abs(x2 - x1)), layout.height - 20, 10);
      ctx.fill();
    }

    if (sample.loopLength > 2) {
      const loopStartX = this.sampleOffsetToEditorX(loop.start, snapshot, layout);
      const loopEndX = this.sampleOffsetToEditorX(loop.end, snapshot, layout);
      ctx.fillStyle = 'rgba(90, 184, 255, 0.1)';
      this.drawRoundedRect(ctx, Math.min(loopStartX, loopEndX), layout.top + 10, Math.max(2, Math.abs(loopEndX - loopStartX)), layout.height - 20, 10);
      ctx.fill();
      this.drawSampleMarker(ctx, loopStartX, layout.top, layout.height, '#5ab8ff');
      this.drawSampleMarker(ctx, loopEndX, layout.top, layout.height, '#5ab8ff');
    }

    ctx.fillStyle = 'rgba(239, 248, 231, 0.72)';
    ctx.font = '13px Consolas, "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Start ${visibleStart}`, layout.left, layout.top + layout.height + 8);
    ctx.fillText(`End ${visibleEnd}`, layout.left + layout.width - 92, layout.top + layout.height + 8);
  }

  private drawWaveformPath(
    ctx: CanvasRenderingContext2D,
    data: Int8Array,
    start: number,
    end: number,
    left: number,
    top: number,
    width: number,
    height: number,
    stroke: string,
    fill: string,
  ): void {
    const safeStart = clamp(start, 0, Math.max(0, data.length - 1));
    const safeEnd = clamp(end, safeStart + 1, data.length);
    const span = Math.max(1, safeEnd - safeStart);
    const centerY = top + (height / 2);
    const samplesPerPixel = span / Math.max(1, width);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(left, centerY);
    ctx.lineTo(left + width, centerY);
    ctx.stroke();

    if (samplesPerPixel > 1.25) {
      const barGradient = ctx.createLinearGradient(left, top, left + width, top);
      barGradient.addColorStop(0, 'rgba(212, 255, 117, 0.9)');
      barGradient.addColorStop(0.55, stroke);
      barGradient.addColorStop(1, 'rgba(90, 184, 255, 0.82)');

      const glowGradient = ctx.createLinearGradient(left, top, left + width, top);
      glowGradient.addColorStop(0, 'rgba(212, 255, 117, 0.08)');
      glowGradient.addColorStop(0.55, fill);
      glowGradient.addColorStop(1, 'rgba(90, 184, 255, 0.07)');

      ctx.fillStyle = glowGradient;
      let previousTopY = centerY;
      let previousBottomY = centerY;
      for (let pixel = 0; pixel < width; pixel += 1) {
        const from = safeStart + Math.floor((pixel / width) * span);
        const to = Math.min(safeEnd, safeStart + Math.max(1, Math.floor(((pixel + 1) / width) * span)));
        let minValue = 127;
        let maxValue = -128;

        for (let index = from; index < to; index += 1) {
          const value = data[index] ?? 0;
          if (value < minValue) {
            minValue = value;
          }
          if (value > maxValue) {
            maxValue = value;
          }
        }

        if (minValue > maxValue) {
          minValue = 0;
          maxValue = 0;
        }

        const x = left + pixel;
        const topY = centerY - ((maxValue / 128) * (height * 0.42));
        const bottomY = centerY - ((minValue / 128) * (height * 0.42));
        const glowY = Math.round(Math.min(topY, bottomY)) - 1;
        const glowH = Math.max(3, Math.round(Math.abs(bottomY - topY)) + 2);
        ctx.fillRect(x, glowY, 1, glowH);

        if (pixel > 0) {
          if (topY > previousBottomY) {
            const bridgeY = Math.round(previousBottomY);
            const bridgeH = Math.max(1, Math.round(topY - previousBottomY));
            ctx.fillRect(x, bridgeY, 1, bridgeH);
          }

          if (bottomY < previousTopY) {
            const bridgeY = Math.round(bottomY);
            const bridgeH = Math.max(1, Math.round(previousTopY - bottomY));
            ctx.fillRect(x, bridgeY, 1, bridgeH);
          }
        }

        previousTopY = topY;
        previousBottomY = bottomY;
      }

      ctx.fillStyle = barGradient;
      previousTopY = centerY;
      previousBottomY = centerY;
      for (let pixel = 0; pixel < width; pixel += 1) {
        const from = safeStart + Math.floor((pixel / width) * span);
        const to = Math.min(safeEnd, safeStart + Math.max(1, Math.floor(((pixel + 1) / width) * span)));
        let minValue = 127;
        let maxValue = -128;

        for (let index = from; index < to; index += 1) {
          const value = data[index] ?? 0;
          if (value < minValue) {
            minValue = value;
          }
          if (value > maxValue) {
            maxValue = value;
          }
        }

        if (minValue > maxValue) {
          minValue = 0;
          maxValue = 0;
        }

        const x = left + pixel;
        const topY = centerY - ((maxValue / 128) * (height * 0.42));
        const bottomY = centerY - ((minValue / 128) * (height * 0.42));
        const y = Math.round(Math.min(topY, bottomY));
        const h = Math.max(1, Math.round(Math.abs(bottomY - topY)));
        ctx.fillRect(x, y, 1, h);

        if (pixel > 0) {
          if (topY > previousBottomY) {
            const bridgeY = Math.round(previousBottomY);
            const bridgeH = Math.max(1, Math.round(topY - previousBottomY));
            ctx.fillRect(x, bridgeY, 1, bridgeH);
          }

          if (bottomY < previousTopY) {
            const bridgeY = Math.round(bottomY);
            const bridgeH = Math.max(1, Math.round(previousTopY - bottomY));
            ctx.fillRect(x, bridgeY, 1, bridgeH);
          }
        }

        previousTopY = topY;
        previousBottomY = bottomY;
      }

      return;
    }

    const points: Array<{ x: number; y: number }> = [];
    for (let pixel = 0; pixel < width; pixel += 1) {
      const samplePos = safeStart + Math.floor((pixel / Math.max(1, width - 1)) * Math.max(0, span - 1));
      const value = data[samplePos] ?? 0;
      const x = left + pixel;
      points.push({
        x,
        y: centerY - ((value / 128) * (height * 0.42)),
      });
    }

    if (points.length === 0) {
      return;
    }

    const strokeGradient = ctx.createLinearGradient(left, top, left + width, top);
    strokeGradient.addColorStop(0, 'rgba(212, 255, 117, 0.34)');
    strokeGradient.addColorStop(0.55, stroke);
    strokeGradient.addColorStop(1, 'rgba(138, 199, 255, 0.28)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.strokeStyle = strokeGradient;
    ctx.lineWidth = 1.15;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(points[0].x, centerY);
    for (const point of points) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.lineTo(points[points.length - 1].x, centerY);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  private drawSampleMarker(ctx: CanvasRenderingContext2D, x: number, top: number, height: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, top + 8);
    ctx.lineTo(x, top + height - 8);
    ctx.stroke();

    ctx.fillStyle = color;
    this.drawRoundedRect(ctx, x - 5, top + 4, 10, 10, 4);
    ctx.fill();
  }

  private getSampleEditorLayout(width: number, height: number): { left: number; top: number; width: number; height: number } {
    return {
      left: 18,
      top: 18,
      width: width - 36,
      height: height - 56,
    };
  }

  private sampleOffsetToEditorX(offset: number, snapshot: TrackerSnapshot, layout: { left: number; top: number; width: number; height: number }): number {
    const view = this.getSampleEditorView(snapshot);
    const visibleStart = view.start;
    const visibleLength = Math.max(1, view.length);
    const normalized = (offset - visibleStart) / visibleLength;
    return layout.left + (clamp(normalized, 0, 1) * layout.width);
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

    const widthSource = this.quadrascopeCanvas.parentElement?.clientWidth
      || this.quadrascopeCanvas.getBoundingClientRect().width
      || 960;
    if (widthSource <= 0) {
      return;
    }

    const width = Math.max(220, Math.round(widthSource));
    const height = QUADRASCOPE_HEIGHT;
    const dpr = window.devicePixelRatio || 1;

    if (this.quadrascopeCanvas.width !== Math.round(width * dpr) || this.quadrascopeCanvas.height !== Math.round(height * dpr)) {
      this.quadrascopeCanvas.width = Math.round(width * dpr);
      this.quadrascopeCanvas.height = Math.round(height * dpr);
      this.quadrascopeCanvas.style.width = '100%';
      this.quadrascopeCanvas.style.height = `${height}px`;
    }

    const ctx = this.quadrascopeCanvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
    this.drawRoundedRect(ctx, 0, 0, width, height, 18);
    ctx.fill();
    ctx.font = '14px Consolas, "Courier New", monospace';
    ctx.textBaseline = 'middle';

    const laneHeight = (height - 36) / 4;
    const scopeChannels = quadrascope?.channels ?? [];

    for (let channel = 0; channel < 4; channel += 1) {
      const laneTop = 16 + (channel * laneHeight);
      const laneMid = laneTop + (laneHeight / 2);
      const scopeChannel = scopeChannels[channel];
      const samplePoints = scopeChannel?.sample ?? [];
      const volume = scopeChannel?.volume ?? 0;
      const active = scopeChannel?.active ?? false;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      this.drawRoundedRect(ctx, 10, laneTop, width - 20, laneHeight - 10, 12);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(16, laneMid);
      ctx.lineTo(width - 16, laneMid);
      ctx.stroke();

      ctx.strokeStyle = CHANNEL_COLORS[channel];
      ctx.lineWidth = 2;
      ctx.beginPath();

      const pointCount = samplePoints.length > 0 ? samplePoints.length : 64;
      for (let index = 0; index < pointCount; index += 1) {
        const normalizedX = index / Math.max(1, pointCount - 1);
        const sampleValue = samplePoints[index] ?? 0;
        const normalizedSample = clamp(sampleValue, -128, 127) / 128;
        const y = laneMid + (normalizedSample * laneHeight * 0.36);
        const x = 16 + (normalizedX * (width - 32));

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      ctx.fillStyle = CHANNEL_COLORS[channel];
      ctx.fillText(`CH${channel + 1}`, 18, laneTop + 14);
      ctx.fillStyle = 'rgba(239, 248, 231, 0.72)';
      ctx.fillText(active ? `VOL ${String(volume).padStart(2, '0')}` : 'IDLE', width - 86, laneTop + 14);
    }
  }

  private drawQuadrascopeClassic(quadrascope: QuadrascopeState | null): void {
    if (this.viewMode !== 'modern') {
      return;
    }

    const widthSource = this.quadrascopeCanvas.parentElement?.clientWidth
      || this.quadrascopeCanvas.getBoundingClientRect().width
      || 960;
    if (widthSource <= 0) {
      return;
    }

    const width = Math.max(220, Math.round(widthSource));
    const height = QUADRASCOPE_HEIGHT;
    const dpr = window.devicePixelRatio || 1;

    if (this.quadrascopeCanvas.width !== Math.round(width * dpr) || this.quadrascopeCanvas.height !== Math.round(height * dpr)) {
      this.quadrascopeCanvas.width = Math.round(width * dpr);
      this.quadrascopeCanvas.height = Math.round(height * dpr);
      this.quadrascopeCanvas.style.width = '100%';
      this.quadrascopeCanvas.style.height = `${height}px`;
    }

    const ctx = this.quadrascopeCanvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
    this.drawRoundedRect(ctx, 0, 0, width, height, 18);
    ctx.fill();
    ctx.font = '13px Consolas, "Courier New", monospace';
    ctx.textBaseline = 'middle';

    const columnWidth = (width - 30) / 4;
    const scopeChannels = quadrascope?.channels ?? [];

    for (let channel = 0; channel < 4; channel += 1) {
      const x = 10 + (channel * columnWidth);
      const y = 14;
      const w = columnWidth - 8;
      const h = height - 28;
      const midY = y + (h / 2);
      const scopeChannel = scopeChannels[channel];
      const samplePoints = scopeChannel?.sample ?? [];

      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      this.drawRoundedRect(ctx, x, y, w, h, 12);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(x + 8, midY);
      ctx.lineTo(x + w - 8, midY);
      ctx.stroke();

      ctx.strokeStyle = CHANNEL_COLORS[channel];
      ctx.lineWidth = 2;
      ctx.beginPath();

      const pointCount = samplePoints.length > 0 ? samplePoints.length : 64;
      for (let index = 0; index < pointCount; index += 1) {
        const t = index / Math.max(1, pointCount - 1);
        const sampleValue = samplePoints[index] ?? 0;
        const normalizedSample = clamp(sampleValue, -128, 127) / 128;
        const pointX = x + 8 + (t * (w - 16));
        const pointY = midY + (normalizedSample * h * 0.34);
        if (index === 0) {
          ctx.moveTo(pointX, pointY);
        } else {
          ctx.lineTo(pointX, pointY);
        }
      }

      ctx.stroke();
      ctx.fillStyle = CHANNEL_COLORS[channel];
      ctx.fillText(`CH${channel + 1}`, x + 10, y + 14);
    }
  }

  private drawSpectrumAnalyzer(quadrascope: QuadrascopeState | null): void {
    if (this.viewMode !== 'modern') {
      return;
    }

    const widthSource = this.spectrumCanvas.parentElement?.clientWidth
      || this.spectrumCanvas.getBoundingClientRect().width
      || 960;
    if (widthSource <= 0) {
      return;
    }

    const width = Math.max(220, Math.round(widthSource));
    const height = SPECTRUM_HEIGHT;
    const dpr = window.devicePixelRatio || 1;

    if (this.spectrumCanvas.width !== Math.round(width * dpr) || this.spectrumCanvas.height !== Math.round(height * dpr)) {
      this.spectrumCanvas.width = Math.round(width * dpr);
      this.spectrumCanvas.height = Math.round(height * dpr);
      this.spectrumCanvas.style.width = '100%';
      this.spectrumCanvas.style.height = `${height}px`;
    }

    const ctx = this.spectrumCanvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
    this.drawRoundedRect(ctx, 0, 0, width, height, 18);
    ctx.fill();

    const bgGradient = ctx.createLinearGradient(0, 0, width, 0);
    bgGradient.addColorStop(0, 'rgba(212, 255, 117, 0.05)');
    bgGradient.addColorStop(0.35, 'rgba(120, 240, 191, 0.04)');
    bgGradient.addColorStop(0.7, 'rgba(138, 199, 255, 0.045)');
    bgGradient.addColorStop(1, 'rgba(255, 191, 122, 0.05)');
    ctx.fillStyle = bgGradient;
    this.drawRoundedRect(ctx, 0, 0, width, height, 18);
    ctx.fill();

    ctx.strokeStyle = 'rgba(239, 248, 231, 0.06)';
    ctx.lineWidth = 1;
    for (let line = 1; line <= 4; line += 1) {
      const y = 12 + (((height - 24) / 5) * line);
      ctx.beginPath();
      ctx.moveTo(14, y);
      ctx.lineTo(width - 14, y);
      ctx.stroke();
    }

    const channels = quadrascope?.channels ?? [];
    const allSamples = channels.flatMap((channel) => channel.sample);
    const compactSpectrum = this.visualizationMode === 'split';
    const barCount = compactSpectrum
      ? Math.max(32, Math.floor(width / 12))
      : Math.max(24, Math.floor(width / 24));
    const usableHeight = height - 24;
    const slotWidth = (width - 28) / barCount;
    const barWidth = compactSpectrum
      ? Math.max(4, Math.min(7, slotWidth - 1))
      : Math.max(8, Math.min(14, slotWidth - 1));

    for (let bar = 0; bar < barCount; bar += 1) {
      const start = Math.floor((bar / barCount) * allSamples.length);
      const end = Math.max(start + 1, Math.floor(((bar + 1) / barCount) * allSamples.length));
      let energy = 0;
      for (let index = start; index < end; index += 1) {
        energy += Math.abs(allSamples[index] ?? 0);
      }

      const normalized = allSamples.length === 0 ? 0 : clamp((energy / Math.max(1, end - start)) / 96, 0, 1);
      const barHeight = Math.max(4, Math.round(normalized * usableHeight));
      const x = 14 + (bar * slotWidth);
      const y = height - 12 - barHeight;
      const baseColor = spectrumColorAt(bar / Math.max(1, barCount - 1));
      const topColor = brighten(baseColor, 0.18 + (normalized * 0.28));
      const bottomColor = darken(baseColor, 0.38);
      const gradient = ctx.createLinearGradient(x, y, x, height - 12);
      gradient.addColorStop(0, rgba(topColor, 0.96));
      gradient.addColorStop(0.45, rgba(baseColor, 0.78));
      gradient.addColorStop(1, rgba(bottomColor, 0.35));
      ctx.fillStyle = gradient;
      this.drawRoundedRect(ctx, x, y, barWidth, barHeight, Math.min(6, barWidth * 0.5));
      ctx.fill();
    }
  }

  private drawSignalTrails(quadrascope: QuadrascopeState | null): void {
    if (this.viewMode !== 'modern') {
      return;
    }

    const widthSource = this.trailsCanvas.parentElement?.clientWidth
      || this.trailsCanvas.getBoundingClientRect().width
      || 960;
    if (widthSource <= 0) {
      return;
    }

    const width = Math.max(220, Math.round(widthSource));
    const height = QUADRASCOPE_HEIGHT;
    const dpr = window.devicePixelRatio || 1;

    if (this.trailsCanvas.width !== Math.round(width * dpr) || this.trailsCanvas.height !== Math.round(height * dpr)) {
      this.trailsCanvas.width = Math.round(width * dpr);
      this.trailsCanvas.height = Math.round(height * dpr);
      this.trailsCanvas.style.width = '100%';
      this.trailsCanvas.style.height = `${height}px`;
    }

    const ctx = this.trailsCanvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
    this.drawRoundedRect(ctx, 0, 0, width, height, 18);
    ctx.fill();

    const channels = quadrascope?.channels ?? [];
    const laneHeight = (height - 28) / 4;
    const historyLength = Math.max(64, Math.floor(width / 5));

    for (let channel = 0; channel < 4; channel += 1) {
      const laneTop = 12 + (channel * laneHeight);
      const laneMid = laneTop + (laneHeight / 2);
      const samples = channels[channel]?.sample ?? [];
      const energy = samples.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, samples.length);

      const history = this.trailColumns[channel];
      history.push(energy);
      if (history.length > historyLength) {
        history.shift();
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      this.drawRoundedRect(ctx, 10, laneTop, width - 20, laneHeight - 8, 10);
      ctx.fill();

      history.forEach((value, index) => {
        const t = index / Math.max(1, historyLength - 1);
        const alpha = 0.08 + (t * 0.88);
        const amplitude = clamp(value / 72, 0, 1);
        const barHeight = Math.max(2, amplitude * (laneHeight - 18));
        const x = 14 + (index * ((width - 28) / historyLength));
        const y = laneMid - (barHeight / 2);
        ctx.fillStyle = rgba(brighten(hexToRgb(CHANNEL_COLORS[channel]), amplitude * 0.3), alpha);
        this.drawRoundedRect(ctx, x, y, 3, barHeight, 3);
        ctx.fill();
      });

      ctx.fillStyle = CHANNEL_COLORS[channel];
      ctx.font = '12px Consolas, "Courier New", monospace';
      ctx.fillText(`CH${channel + 1}`, 18, laneTop + 12);
    }
  }

  private syncPianoNotes(snapshot: TrackerSnapshot, quadrascope: QuadrascopeState | null): void {
    if (!snapshot.transport.playing) {
      this.lastPianoTransportKey = null;
      return;
    }

    const transportKey = `${snapshot.transport.position}:${snapshot.transport.pattern}:${snapshot.transport.row}`;
    if (transportKey !== this.lastPianoTransportKey) {
      const playingRow = snapshot.pattern.rows[snapshot.transport.row];
      for (let channel = 0; channel < 4; channel += 1) {
        const absolute = noteToAbsolute(playingRow?.channels[channel]?.note);
        if (absolute !== null) {
          this.activePianoNotes[channel] = absolute;
          this.triggerPianoGlow(channel, absolute);
        }
      }

      this.lastPianoTransportKey = transportKey;
    }
  }

  private triggerPianoGlow(channel: number, absolute: number): void {
    const safeChannel = clamp(channel, 0, 3);
    const safeNote = clamp(absolute, PIANO_START_ABSOLUTE, PIANO_END_ABSOLUTE);
    this.pianoGlowLevels[safeChannel][safeNote] = 1;
  }

  private decayPianoGlow(): void {
    const now = performance.now();
    const deltaMs = this.pianoLastFrameAt === null ? 16 : Math.min(48, now - this.pianoLastFrameAt);
    this.pianoLastFrameAt = now;
    const decayFactor = Math.exp(-deltaMs / 180);

    for (let channel = 0; channel < this.pianoGlowLevels.length; channel += 1) {
      const levels = this.pianoGlowLevels[channel];
      for (let note = PIANO_START_ABSOLUTE; note <= PIANO_END_ABSOLUTE; note += 1) {
        levels[note] *= decayFactor;
        if (levels[note] < 0.01) {
          levels[note] = 0;
        }
      }
    }
  }

  private drawPianoVisualizer(snapshot: TrackerSnapshot, quadrascope: QuadrascopeState | null): void {
    if (this.viewMode !== 'modern') {
      return;
    }

    const widthSource = this.pianoCanvas.parentElement?.clientWidth
      || this.pianoCanvas.getBoundingClientRect().width
      || 960;
    if (widthSource <= 0) {
      return;
    }

    const width = Math.max(220, Math.round(widthSource));
    const height = PIANO_HEIGHT;
    const dpr = window.devicePixelRatio || 1;

    if (this.pianoCanvas.width !== Math.round(width * dpr) || this.pianoCanvas.height !== Math.round(height * dpr)) {
      this.pianoCanvas.width = Math.round(width * dpr);
      this.pianoCanvas.height = Math.round(height * dpr);
      this.pianoCanvas.style.width = '100%';
      this.pianoCanvas.style.height = `${height}px`;
    }

    const ctx = this.pianoCanvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
    this.drawRoundedRect(ctx, 0, 0, width, height, 18);
    ctx.fill();
    this.decayPianoGlow();

    const padding = 16;
    const keyboardTop = 14;
    const keyboardHeight = height - 28;
    const keyboardWidth = width - (padding * 2);
    const keys = buildPianoKeys(keyboardWidth);
    const whiteKeys = keys.filter((key) => !key.black);
    const blackKeys = keys.filter((key) => key.black);
    void snapshot;
    void quadrascope;

    ctx.font = '11px Consolas, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (const key of whiteKeys) {
      const x = padding + key.x;
      const keyLevels = this.pianoGlowLevels.map((levels) => levels[key.absolute] ?? 0);
      const peakLevel = Math.max(...keyLevels);
      const active = peakLevel > 0.01;

      ctx.fillStyle = active
        ? rgba(mixRgb({ r: 197, g: 206, b: 192 }, { r: 229, g: 238, b: 223 }, peakLevel), 0.82 + (peakLevel * 0.12))
        : 'rgba(197, 206, 192, 0.82)';
      this.drawRoundedRect(ctx, x, keyboardTop, key.width - 2, keyboardHeight, 10);
      ctx.fill();

      if (active) {
        keyLevels.forEach((level, channel) => {
          if (level <= 0.01) {
            return;
          }

          ctx.fillStyle = rgba(brighten(hexToRgb(CHANNEL_COLORS[channel]), 0.04), 0.24 + (level * 0.64));
          this.drawRoundedRect(ctx, x + 2, keyboardTop + 2, key.width - 6, keyboardHeight - 4, 8);
          ctx.fill();
        });
      }

      ctx.strokeStyle = active ? 'rgba(8, 13, 10, 0.55)' : 'rgba(8, 13, 10, 0.28)';
      ctx.lineWidth = 1.2;
      this.drawRoundedRect(ctx, x, keyboardTop, key.width - 2, keyboardHeight, 10);
      ctx.stroke();

      const showLabel = active || key.note.startsWith('C-');
      if (showLabel) {
        ctx.fillStyle = active ? 'rgba(8, 13, 10, 0.92)' : 'rgba(8, 13, 10, 0.68)';
        ctx.fillText(key.note, x + ((key.width - 2) / 2), keyboardTop + keyboardHeight - 10);
      }
    }

    const blackHeight = keyboardHeight * 0.66;
    for (const key of blackKeys) {
      const x = padding + key.x;
      const keyLevels = this.pianoGlowLevels.map((levels) => levels[key.absolute] ?? 0);
      const peakLevel = Math.max(...keyLevels);
      const active = peakLevel > 0.01;

      ctx.fillStyle = active ? 'rgba(24, 31, 29, 0.98)' : 'rgba(14, 18, 17, 0.98)';
      this.drawRoundedRect(ctx, x, keyboardTop, key.width, blackHeight, 9);
      ctx.fill();

      if (active) {
        keyLevels.forEach((level, channel) => {
          if (level <= 0.01) {
            return;
          }

          ctx.fillStyle = rgba(brighten(hexToRgb(CHANNEL_COLORS[channel]), 0.08), 0.34 + (level * 0.76));
          this.drawRoundedRect(ctx, x + 2, keyboardTop + 2, key.width - 4, blackHeight - 4, 7);
          ctx.fill();
        });
      }

      ctx.strokeStyle = active ? 'rgba(239, 248, 231, 0.12)' : 'rgba(239, 248, 231, 0.08)';
      ctx.lineWidth = 1;
      this.drawRoundedRect(ctx, x, keyboardTop, key.width, blackHeight, 9);
      ctx.stroke();
    }
  }

  private drawPatternCanvas(snapshot: TrackerSnapshot): void {
    if (this.viewMode !== 'modern') {
      return;
    }

    const host = this.root.querySelector<HTMLElement>('[data-role="pattern-host"]');
    if (!host) {
      return;
    }

    const width = Math.max(320, Math.round(host.clientWidth || host.getBoundingClientRect().width || 960));
    const height = (MODERN_VISIBLE_PATTERN_ROWS * PATTERN_ROW_HEIGHT) + 20;
    const dpr = window.devicePixelRatio || 1;

    if (this.patternCanvas.width !== Math.round(width * dpr) || this.patternCanvas.height !== Math.round(height * dpr)) {
      this.patternCanvas.width = Math.round(width * dpr);
      this.patternCanvas.height = Math.round(height * dpr);
      this.patternCanvas.style.width = `${width}px`;
      this.patternCanvas.style.height = `${height}px`;
    }

    const ctx = this.patternCanvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
    this.drawRoundedRect(ctx, 0, 0, width, height, 18);
    ctx.fill();

    const layout = this.getPatternCanvasLayout(width);
    const firstRow = this.getPatternViewportStartRow(snapshot);
    const centeredRow = snapshot.transport.playing ? snapshot.transport.row : snapshot.cursor.row;

    ctx.textBaseline = 'middle';
    ctx.font = '16px Consolas, "Courier New", monospace';

    for (let visibleIndex = 0; visibleIndex < MODERN_VISIBLE_PATTERN_ROWS; visibleIndex += 1) {
      const rowIndex = firstRow + visibleIndex;
      const y = 10 + (visibleIndex * PATTERN_ROW_HEIGHT);
      const row = snapshot.pattern.rows[rowIndex];
      const rowRectHeight = PATTERN_ROW_HEIGHT - 2;
      const centered = rowIndex === centeredRow;

      if (!row) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = 'rgba(212, 255, 117, 0.06)';
        this.drawRoundedRect(ctx, 8, y, width - 16, rowRectHeight, 12);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }

      if (centered) {
        ctx.fillStyle = 'rgba(212, 255, 117, 0.09)';
        this.drawRoundedRect(ctx, 8, y, width - 16, rowRectHeight, 12);
        ctx.fill();
      }

      if (row.index === snapshot.transport.row) {
        ctx.fillStyle = 'rgba(120, 240, 191, 0.12)';
        this.drawRoundedRect(ctx, 8, y, width - 16, rowRectHeight, 12);
        ctx.fill();
      }

      if (row.index === snapshot.cursor.row) {
        ctx.strokeStyle = 'rgba(120, 240, 191, 0.5)';
        ctx.lineWidth = 1;
        this.drawRoundedRect(ctx, 8.5, y + 0.5, width - 17, rowRectHeight - 1, 12);
        ctx.stroke();
      }

      ctx.fillStyle = '#d4ff75';
      ctx.fillText(String(row.index).padStart(2, '0'), 20, y + (PATTERN_ROW_HEIGHT / 2));

      row.channels.forEach((cell, channelIndex) => {
        const cellX = layout.gridLeft + (channelIndex * (layout.channelWidth + PATTERN_GUTTER));
        this.drawPatternCell(ctx, cellX, y, layout.channelWidth, row.index, channelIndex, cell, snapshot);
      });
    }
  }

  private drawPatternCell(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    rowIndex: number,
    channelIndex: number,
    cell: PatternCell,
    snapshot: TrackerSnapshot,
  ): void {
    const selected = rowIndex === snapshot.cursor.row && channelIndex === snapshot.cursor.channel;
    const note = formatCellNote(cell);
    const sample = formatCellSample(cell);
    const effect = formatCellEffect(cell);
    const param = formatCellParam(cell);
    const fieldRects = this.getPatternFieldRects(x, width);

    if (selected) {
      ctx.fillStyle = 'rgba(34, 54, 40, 0.95)';
      this.drawRoundedRect(ctx, x, y + 2, width, PATTERN_ROW_HEIGHT - 6, 10);
      ctx.fill();
    }

    if (selected && snapshot.cursor.field === 'note') {
      this.drawCursorFrame(ctx, fieldRects.note.x, y + 4, fieldRects.note.width, PATTERN_ROW_HEIGHT - 10);
      ctx.fillStyle = '#08110a';
    } else {
      ctx.fillStyle = '#eff8e7';
    }
    ctx.fillText(note, fieldRects.note.x + 2, y + (PATTERN_ROW_HEIGHT / 2));
    ctx.fillStyle = '#eff8e7';

    this.drawPatternDigit(ctx, fieldRects.sampleHigh, sample[0], selected && snapshot.cursor.field === 'sampleHigh', y);
    this.drawPatternDigit(ctx, fieldRects.sampleLow, sample[1], selected && snapshot.cursor.field === 'sampleLow', y);
    this.drawPatternDigit(ctx, fieldRects.effect, effect, selected && snapshot.cursor.field === 'effect', y, true);
    this.drawPatternDigit(ctx, fieldRects.paramHigh, param[0], selected && snapshot.cursor.field === 'paramHigh', y);
    this.drawPatternDigit(ctx, fieldRects.paramLow, param[1], selected && snapshot.cursor.field === 'paramLow', y);
  }

  private drawPatternDigit(
    ctx: CanvasRenderingContext2D,
    rect: { x: number; width: number },
    value: string,
    selected: boolean,
    y: number,
    effect = false,
  ): void {
    if (selected) {
      this.drawCursorFrame(ctx, rect.x - 1, y + 4, rect.width + 2, PATTERN_ROW_HEIGHT - 10);
      ctx.fillStyle = '#08110a';
      ctx.fillText(value, rect.x + 3, y + (PATTERN_ROW_HEIGHT / 2));
      ctx.fillStyle = '#eff8e7';
      return;
    }

    ctx.fillStyle = effect ? '#78f0bf' : '#eff8e7';
    ctx.fillText(value, rect.x + 3, y + (PATTERN_ROW_HEIGHT / 2));
    ctx.fillStyle = '#eff8e7';
  }

  private drawCursorFrame(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    ctx.fillStyle = 'rgba(120, 240, 191, 0.96)';
    this.drawRoundedRect(ctx, x, y, width, height, 6);
    ctx.fill();
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
    const anchorOffset = Math.floor(MODERN_VISIBLE_PATTERN_ROWS / 2);
    const anchorRow = snapshot.transport.playing ? snapshot.transport.row : snapshot.cursor.row;
    return anchorRow - anchorOffset;
  }

  private getPatternCanvasLayout(width: number): { gridLeft: number; channelWidth: number } {
    const totalGap = PATTERN_GUTTER * 3;
    const available = width - 16 - PATTERN_ROW_INDEX_WIDTH - totalGap;
    const channelWidth = Math.max(PATTERN_MIN_CHANNEL_WIDTH, Math.floor(available / 4));
    return {
      gridLeft: PATTERN_ROW_INDEX_WIDTH,
      channelWidth,
    };
  }

  private getPatternFieldRects(x: number, width: number): Record<CursorField, { x: number; width: number }> {
    const noteWidth = Math.min(48, Math.max(38, Math.floor(width * 0.28)));
    const digitWidth = Math.min(16, Math.max(12, Math.floor((width - noteWidth - 20) / 5)));
    const sampleStart = x + noteWidth + 10;
    const effectStart = sampleStart + (digitWidth * 2) + 6;
    const paramStart = effectStart + digitWidth + 6;

    return {
      note: { x: x + 8, width: noteWidth - 4 },
      sampleHigh: { x: sampleStart, width: digitWidth },
      sampleLow: { x: sampleStart + digitWidth, width: digitWidth },
      effect: { x: effectStart, width: digitWidth },
      paramHigh: { x: paramStart, width: digitWidth },
      paramLow: { x: paramStart + digitWidth, width: digitWidth },
    };
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
    const emptyCell = Array.from({ length: channelCount }, () => `<div class="pattern-cell pattern-cell--ghost" aria-hidden="true"><span class="pattern-cell-note">---</span><span class="pattern-cell-mod"><span class="pattern-cell-digit">0</span><span class="pattern-cell-digit">0</span><span class="pattern-cell-digit pattern-cell-digit--effect">0</span><span class="pattern-cell-digit">0</span><span class="pattern-cell-digit">0</span></span></div>`).join('');
    return `<div class="pattern-row pattern-row--ghost" aria-hidden="true"><div class="pattern-row-index">..</div>${emptyCell}</div>`;
  }

  private renderModernPatternRow(
    rowIndex: number,
    cells: PatternCell[],
    snapshot: TrackerSnapshot,
    centered: boolean,
  ): string {
    const rowClasses = [
      'pattern-row',
      rowIndex === snapshot.transport.row ? 'is-playing' : '',
      rowIndex === snapshot.cursor.row ? 'is-selected-row' : '',
      centered ? 'is-centered-row' : '',
    ].filter(Boolean).join(' ');

    return `<div class="${rowClasses}"><div class="pattern-row-index">${String(rowIndex).padStart(2, '0')}</div>${cells.map((cell, channelIndex) => this.renderModernPatternCell(rowIndex, channelIndex, cell, snapshot)).join('')}</div>`;
  }

  private renderModernPatternCell(
    rowIndex: number,
    channelIndex: number,
    cell: PatternCell,
    snapshot: TrackerSnapshot,
  ): string {
    const selected = rowIndex === snapshot.cursor.row && channelIndex === snapshot.cursor.channel;
    const sample = formatCellSample(cell);
    const effect = formatCellEffect(cell);
    const param = formatCellParam(cell);

    return `<button class="pattern-cell${selected ? ' is-selected' : ''}" type="button" data-action="select-cell" data-row="${rowIndex}" data-channel="${channelIndex}" data-field="note"><span class="pattern-cell-note${selected && snapshot.cursor.field === 'note' ? ' is-cursor' : ''}" data-action="select-cell" data-row="${rowIndex}" data-channel="${channelIndex}" data-field="note">${escapeHtml(formatCellNote(cell))}</span><span class="pattern-cell-mod">${this.renderPatternDigit(rowIndex, channelIndex, 'sampleHigh', sample[0], snapshot)}${this.renderPatternDigit(rowIndex, channelIndex, 'sampleLow', sample[1], snapshot)}${this.renderPatternDigit(rowIndex, channelIndex, 'effect', effect, snapshot, true)}${this.renderPatternDigit(rowIndex, channelIndex, 'paramHigh', param[0], snapshot)}${this.renderPatternDigit(rowIndex, channelIndex, 'paramLow', param[1], snapshot)}</span></button>`;
  }

  private renderPatternDigit(
    rowIndex: number,
    channelIndex: number,
    field: CursorField,
    digit: string,
    snapshot: TrackerSnapshot,
    effect = false,
  ): string {
    const selected = rowIndex === snapshot.cursor.row && channelIndex === snapshot.cursor.channel && snapshot.cursor.field === field;
    return `<span class="pattern-cell-digit${effect ? ' pattern-cell-digit--effect' : ''}${selected ? ' is-cursor' : ''}" data-action="select-cell" data-row="${rowIndex}" data-channel="${channelIndex}" data-field="${field}">${escapeHtml(digit)}</span>`;
  }

  private getSampleCardLabel(sample: SampleSlot): string {
    const trimmedName = sample.name.trim();
    if (trimmedName.length > 0) {
      return trimmedName;
    }

    return sample.length > 0 ? '' : 'Empty';
  }

  private getSelectedSampleHeading(sample: SampleSlot): string {
    const trimmedName = sample.name.trim();
    if (trimmedName.length > 0) {
      return trimmedName;
    }

    return sample.length > 0 ? `Sample ${String(sample.index + 1).padStart(2, '0')}` : 'Empty';
  }

  private getSamplePageCount(snapshot: TrackerSnapshot): number {
    return Math.max(1, Math.ceil(snapshot.samples.length / SAMPLE_PAGE_SIZE));
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
    const start = samplePage * SAMPLE_PAGE_SIZE;
    const visible = snapshot.samples
      .slice(start, start + SAMPLE_PAGE_SIZE)
      .map((sample) => `${sample.index}:${sample.name}:${sample.length}`)
      .join('|');
    const selected = snapshot.samples[snapshot.selectedSample];
    const selectedKey = selected
      ? `${selected.index}:${selected.name}:${selected.length}:${selected.volume}:${selected.fineTune}:${selected.loopStart}:${selected.loopLength}`
      : 'none';

    return `${samplePage}:${snapshot.selectedSample}:${visible}:${selectedKey}`;
  }

  private renderSampleBank(snapshot: TrackerSnapshot, samplePage: number): string {
    const start = samplePage * SAMPLE_PAGE_SIZE;
    return snapshot.samples
      .slice(start, start + SAMPLE_PAGE_SIZE)
      .map((sample) => this.renderSampleChip(sample, snapshot.selectedSample))
      .join('');
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

  private renderSampleWaveform(sample: SampleSlot): string {
    const values = sample.preview && sample.preview.length > 0
      ? sample.preview
      : Array.from({ length: 48 }, () => 0);

    const width = 240;
    const height = 72;
    const centerY = height / 2;
    const stepX = values.length > 1 ? width / (values.length - 1) : width;
    const linePoints = values
      .map((value, index) => {
        const x = (index * stepX).toFixed(2);
        const y = (centerY - ((value / 128) * (height * 0.3))).toFixed(2);
        return `${x},${y}`;
      })
      .join(' ');
    const areaPath = values
      .map((value, index) => {
        const x = (index * stepX).toFixed(2);
        const y = (centerY - ((value / 128) * (height * 0.3))).toFixed(2);
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ') + ` L ${width} ${centerY.toFixed(2)} L 0 ${centerY.toFixed(2)} Z`;

    return `
      <svg class="sample-chip__wave" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="sample-wave-fill-${sample.index}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="rgba(212,255,117,0.03)" />
            <stop offset="55%" stop-color="rgba(120,240,191,0.08)" />
            <stop offset="100%" stop-color="rgba(138,199,255,0.03)" />
          </linearGradient>
          <linearGradient id="sample-wave-stroke-${sample.index}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="rgba(212,255,117,0.34)" />
            <stop offset="55%" stop-color="rgba(239,248,231,0.52)" />
            <stop offset="100%" stop-color="rgba(138,199,255,0.3)" />
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#sample-wave-fill-${sample.index})" />
        <polyline points="${linePoints}" fill="none" stroke="url(#sample-wave-stroke-${sample.index})" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
    `;
  }

  private renderSampleChip(sample: SampleSlot, selectedSample: number): string {
    return `
      <button class="sample-chip${sample.index === selectedSample ? ' is-selected' : ''}" type="button" data-action="select-sample" data-sample="${sample.index}">
        ${this.renderSampleWaveform(sample)}
        <span class="sample-chip__index">${String(sample.index + 1).padStart(2, '0')}</span>
        <strong class="sample-chip__name">${escapeHtml(this.getSampleCardLabel(sample))}</strong>
      </button>
    `;
  }

  private renderSelectedSamplePanel(sample: SampleSlot, snapshot: TrackerSnapshot): string {
    return `
      <section class="sample-detail-panel">
        <div class="sample-detail-head">
          <div>
            <p class="metric-label">Sample ${String(sample.index + 1).padStart(2, '0')}</p>
            <strong class="sample-detail-title" data-role="selected-sample-title">${escapeHtml(this.getSelectedSampleHeading(sample))}</strong>
          </div>
          <div class="sample-detail-actions">
            <button type="button" class="toolbar-button toolbar-button--primary" data-role="sample-preview-toggle" data-action="${this.samplePreviewPlaying ? 'sample-preview-stop' : 'sample-preview-play'}" ${sample.length > 0 ? '' : 'disabled'}>${iconMarkup(this.samplePreviewPlaying ? Square : Play)}<span>${this.samplePreviewPlaying ? 'Stop' : 'Play'}</span></button>
            <button type="button" class="toolbar-button" data-action="sample-editor-open">${iconMarkup(PencilLine)}<span>Edit</span></button>
          </div>
        </div>
        <div class="sample-preview-host" data-role="sample-preview-host"></div>
        <p class="hint" data-role="selected-sample-hint">${escapeHtml(formatSampleLength(sample))}</p>
      </section>
    `;
  }

  private renderSampleEditorPanel(snapshot: TrackerSnapshot): string {
    const sample = snapshot.samples[snapshot.selectedSample];
    const editable = this.canEditSnapshot(snapshot);
    const view = this.getSampleEditorView(snapshot);
    const loopEnabled = sample.loopLength > 2 && sample.length > 2;
    const loopEnd = sample.loopStart + sample.loopLength;
    const showScrollbar = sample.length > 0 && view.length > 0 && view.length < sample.length;
    const scrollMax = Math.max(0, sample.length - view.length);
    return `
      <article class="panel sample-editor-panel editor-panel-shell">
        <div class="panel-head compact sample-editor-head">
          <div>
            <p class="panel-label">Sample editor</p>
            <h2 class="panel-title--subtle">Sample ${String(sample.index + 1).padStart(2, '0')} ${escapeHtml(this.getSelectedSampleHeading(sample))}</h2>
          </div>
          <div class="sample-editor-toolbar">
            <button type="button" class="toolbar-button" data-action="sample-editor-show-all" ${sample.length > 0 ? '' : 'disabled'}>Show all</button>
            <button type="button" class="toolbar-button" data-action="sample-editor-show-selection" ${(sample.length > 0 && snapshot.sampleEditor.selectionStart !== null) ? '' : 'disabled'}>Show selection</button>
            <button type="button" class="toolbar-button toolbar-button--primary" data-role="sample-editor-preview-toggle" data-action="${this.samplePreviewPlaying ? 'sample-editor-stop' : 'sample-editor-preview'}" ${sample.length > 0 ? '' : 'disabled'}>${iconMarkup(this.samplePreviewPlaying ? Square : Play)}<span>${this.samplePreviewPlaying ? 'Stop' : 'Play'}</span></button>
            <button type="button" class="toolbar-button" data-action="sample-editor-crop" ${(editable && snapshot.sampleEditor.selectionStart !== null) ? '' : 'disabled'}>Crop</button>
            <button type="button" class="toolbar-button" data-action="sample-editor-cut" ${(editable && snapshot.sampleEditor.selectionStart !== null) ? '' : 'disabled'}>Cut</button>
            <button type="button" class="toolbar-button" data-action="sample-editor-close">Back to pattern</button>
          </div>
        </div>
        <div class="field-row field-row--sample-detail">
          <label class="field">
            <span>Name</span>
            <input data-input="sample-name" value="${escapeHtml(sample.name)}" maxlength="22" ${editable ? '' : 'disabled'} />
          </label>
          <label class="field">
            <span>Volume</span>
            <input data-input="sample-volume" type="number" min="0" max="64" value="${sample.volume}" ${editable ? '' : 'disabled'} />
          </label>
          <label class="field">
            <span>Fine tune</span>
            <input data-input="sample-finetune" type="number" min="-8" max="7" value="${sample.fineTune}" ${editable ? '' : 'disabled'} />
          </label>
        </div>
        <div class="field-row field-row--sample-loop">
          <label class="field field--toggle">
            <span>Loop</span>
            <span class="toggle-control">
              <input data-input="sample-loop-enabled" type="checkbox" ${loopEnabled ? 'checked' : ''} ${editable ? '' : 'disabled'} />
              <span>Enabled</span>
            </span>
          </label>
          <label class="field">
            <span>Loop start</span>
            <input data-input="sample-loop-start" type="number" min="0" max="${Math.max(0, sample.length - 2)}" value="${sample.loopStart}" ${(editable && loopEnabled) ? '' : 'disabled'} />
          </label>
          <label class="field">
            <span>Loop end</span>
            <input data-input="sample-loop-end" type="number" min="2" max="${sample.length}" value="${loopEnd}" ${(editable && loopEnabled) ? '' : 'disabled'} />
          </label>
        </div>
        <div class="sample-editor-meta">
          <span class="panel-title--subtle" data-role="sample-editor-visible">Visible ${view.start} - ${view.end}</span>
          <span class="panel-title--subtle" data-role="sample-editor-loop">Loop ${sample.loopStart} - ${sample.loopStart + sample.loopLength}</span>
        </div>
        <div class="sample-editor-host" data-role="sample-editor-host"></div>
        <div class="sample-editor-scrollbar-wrap${showScrollbar ? '' : ' is-hidden'}">
          <input
            class="sample-editor-scrollbar"
            data-input="sample-editor-scroll"
            type="range"
            min="0"
            max="${scrollMax}"
            step="1"
            value="${clamp(view.start, 0, scrollMax)}"
            ${showScrollbar ? '' : 'disabled'}
          />
        </div>
      </article>
    `;
  }

  private renderClassicDebug(): string {
    if (this.viewMode !== 'classic' || !SHOW_CLASSIC_DEBUG) {
      return '';
    }

    return `
      <div class="classic-debug">
        <div><span>DOM mouse</span><strong data-debug-field="dom-mouse">n/a</strong></div>
        <div><span>DOM state</span><strong data-debug-field="dom-state">n/a</strong></div>
        <div><span>Mouse abs</span><strong data-debug-field="mouse-abs">n/a</strong></div>
        <div><span>Mouse raw</span><strong data-debug-field="mouse-raw">n/a</strong></div>
        <div><span>Mouse pt2</span><strong data-debug-field="mouse-pt2">n/a</strong></div>
        <div><span>Buttons</span><strong data-debug-field="mouse-buttons">n/a</strong></div>
        <div><span>Canvas CSS</span><strong data-debug-field="canvas-css">n/a</strong></div>
        <div><span>Render</span><strong data-debug-field="video-render">n/a</strong></div>
        <div><span>Scale</span><strong data-debug-field="video-scale">n/a</strong></div>
      </div>
    `;
  }

  private async handleClick(event: Event): Promise<void> {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') as HTMLElement | null : null;
    if (!target || !this.engine || !this.snapshot) {
      return;
    }

    switch (target.dataset.action) {
      case 'new-song':
        this.clearSampleEditorViewOverride();
        this.engine.dispatch({ type: 'song/new' });
        return;
      case 'load-module':
        this.moduleInput.click();
        return;
      case 'save-module':
        triggerDownload(await this.engine.saveModule());
        return;
      case 'toggle-play':
        this.engine.setTransport({ type: 'transport/toggle' });
        return;
      case 'stop':
        this.engine.setTransport({ type: 'transport/stop' });
        return;
      case 'toggle-track-mute':
        this.engine.dispatch({
          type: 'channel/toggle-mute',
          channel: Number(target.dataset.channel),
        });
        return;
      case 'song-position-down':
        if (this.canEditSnapshot(this.snapshot)) {
          this.engine.dispatch({
            type: 'song/set-position',
            position: clamp(this.snapshot.transport.position - 1, 0, this.snapshot.song.length - 1),
          });
        }
        return;
      case 'song-position-up':
        if (this.canEditSnapshot(this.snapshot)) {
          this.engine.dispatch({
            type: 'song/set-position',
            position: clamp(this.snapshot.transport.position + 1, 0, this.snapshot.song.length - 1),
          });
        }
        return;
      case 'song-pattern-down':
        if (this.canEditSnapshot(this.snapshot)) {
          this.engine.dispatch({
            type: 'song/set-pattern',
            pattern: clamp(this.snapshot.pattern.index - 1, 0, 99),
          });
        }
        return;
      case 'song-pattern-up':
        if (this.canEditSnapshot(this.snapshot)) {
          this.engine.dispatch({
            type: 'song/set-pattern',
            pattern: clamp(this.snapshot.pattern.index + 1, 0, 99),
          });
        }
        return;
      case 'song-length-down':
        if (this.canEditSnapshot(this.snapshot)) {
          this.engine.dispatch({ type: 'song/adjust-length', delta: -1 });
        }
        return;
      case 'song-length-up':
        if (this.canEditSnapshot(this.snapshot)) {
          this.engine.dispatch({ type: 'song/adjust-length', delta: 1 });
        }
        return;
      case 'song-bpm-down':
        if (this.canEditSnapshot(this.snapshot)) {
          this.engine.dispatch({
            type: 'song/set-bpm',
            bpm: clamp(this.snapshot.transport.bpm - 1, 32, 255),
          });
        }
        return;
      case 'song-bpm-up':
        if (this.canEditSnapshot(this.snapshot)) {
          this.engine.dispatch({
            type: 'song/set-bpm',
            bpm: clamp(this.snapshot.transport.bpm + 1, 32, 255),
          });
        }
        return;
      case 'view-modern':
        this.releaseClassicKeys();
        this.viewMode = 'modern';
        this.render();
        return;
      case 'view-classic':
        this.releaseClassicKeys();
        this.viewMode = 'classic';
        this.render();
        return;
      case 'octave-down':
        this.keyboardOctave = clamp(this.keyboardOctave - 1, MIN_OCTAVE, MAX_OCTAVE);
        this.updateModernLiveRegions(this.snapshot);
        return;
      case 'octave-up':
        this.keyboardOctave = clamp(this.keyboardOctave + 1, MIN_OCTAVE, MAX_OCTAVE);
        this.updateModernLiveRegions(this.snapshot);
        return;
      case 'visualization-prev':
        this.shiftVisualization(-1);
        return;
      case 'visualization-next':
        this.shiftVisualization(1);
        return;
      case 'sample-page-prev':
        this.samplePage = clamp(this.resolveSamplePage(this.snapshot) - 1, 0, this.getSamplePageCount(this.snapshot) - 1);
        this.render();
        return;
      case 'sample-page-next':
        this.samplePage = clamp(this.resolveSamplePage(this.snapshot) + 1, 0, this.getSamplePageCount(this.snapshot) - 1);
        this.render();
        return;
      case 'sample-preview-play':
        this.engine.dispatch({ type: 'sample-editor/play', mode: 'sample' });
        this.samplePreviewPlaying = true;
        this.updateModernLiveRegions(this.snapshot);
        return;
      case 'sample-preview-stop':
        this.engine.setTransport({ type: 'transport/stop' });
        this.samplePreviewPlaying = false;
        this.updateModernLiveRegions(this.snapshot);
        return;
      case 'sample-editor-open':
        this.clearSampleEditorViewOverride();
        this.engine.dispatch({ type: 'sample-editor/open', sample: this.snapshot.selectedSample });
        this.snapshot = this.engine.getSnapshot();
        this.render();
        return;
      case 'sample-editor-close':
        this.clearSampleEditorViewOverride();
        this.engine.dispatch({ type: 'sample-editor/close' });
        this.snapshot = this.engine.getSnapshot();
        this.render();
        return;
      case 'sample-editor-show-all':
        this.clearSampleEditorViewOverride();
        this.engine.dispatch({ type: 'sample-editor/show-all' });
        this.snapshot = this.engine.getSnapshot();
        this.updateModernLiveRegions(this.snapshot);
        return;
      case 'sample-editor-show-selection':
        if (this.snapshot.sampleEditor.selectionStart !== null && this.snapshot.sampleEditor.selectionEnd !== null) {
          this.sampleEditorViewOverride = {
            sample: this.snapshot.selectedSample,
            start: this.snapshot.sampleEditor.selectionStart,
            length: Math.max(2, this.snapshot.sampleEditor.selectionEnd - this.snapshot.sampleEditor.selectionStart),
          };
          this.updateModernLiveRegions(this.snapshot);
        }
        return;
      case 'sample-editor-zoom-in': {
        this.clearSampleEditorViewOverride();
        const anchor = this.getSampleEditorZoomAnchor();
        this.engine.dispatch({ type: 'sample-editor/zoom-in', anchor });
        this.snapshot = this.engine.getSnapshot();
        this.updateModernLiveRegions(this.snapshot);
        return;
      }
      case 'sample-editor-zoom-out': {
        this.clearSampleEditorViewOverride();
        const anchor = this.getSampleEditorZoomAnchor();
        this.engine.dispatch({ type: 'sample-editor/zoom-out', anchor });
        this.snapshot = this.engine.getSnapshot();
        this.updateModernLiveRegions(this.snapshot);
        return;
      }
      case 'sample-editor-preview': {
        const mode = this.snapshot.sampleEditor.selectionStart !== null ? 'selection' : 'view';
        if (mode === 'view' && this.sampleEditorViewOverride) {
          const view = this.getSampleEditorView(this.snapshot);
          this.engine.dispatch({ type: 'sample-editor/set-view', start: view.start, length: view.length });
        }
        this.engine.dispatch({ type: 'sample-editor/play', mode });
        this.samplePreviewPlaying = true;
        this.updateModernLiveRegions(this.snapshot);
        return;
      }
      case 'sample-editor-stop':
        this.engine.setTransport({ type: 'transport/stop' });
        this.samplePreviewPlaying = false;
        this.updateModernLiveRegions(this.snapshot);
        return;
      case 'sample-editor-crop':
        if (!this.canEditSnapshot(this.snapshot)) {
          return;
        }
        this.clearSampleEditorViewOverride();
        this.engine.dispatch({ type: 'sample-editor/crop' });
        this.snapshot = this.engine.getSnapshot();
        this.refreshSelectedSampleWaveform(this.snapshot, true);
        this.updateModernLiveRegions(this.snapshot);
        return;
      case 'sample-editor-cut':
        if (!this.canEditSnapshot(this.snapshot)) {
          return;
        }
        this.clearSampleEditorViewOverride();
        this.engine.dispatch({ type: 'sample-editor/cut' });
        this.snapshot = this.engine.getSnapshot();
        this.refreshSelectedSampleWaveform(this.snapshot, true);
        this.updateModernLiveRegions(this.snapshot);
        return;
      case 'select-cell':
        this.engine.dispatch({
          type: 'cursor/set',
          row: Number(target.dataset.row),
          channel: Number(target.dataset.channel),
          field: (target.dataset.field as CursorField | undefined) ?? 'note',
        });
        return;
      case 'select-sample':
        this.clearSampleEditorViewOverride();
        this.lastSelectedSample = Number(target.dataset.sample);
        this.samplePage = clamp(Math.floor(this.lastSelectedSample / SAMPLE_PAGE_SIZE), 0, this.getSamplePageCount(this.snapshot) - 1);
        this.engine.dispatch({
          type: 'sample/select',
          sample: this.lastSelectedSample,
        });
        this.snapshot = this.engine.getSnapshot();
        this.refreshSelectedSampleWaveform(this.snapshot, true);
        if (this.snapshot.samples[this.lastSelectedSample]?.length === 0) {
          this.pendingSampleImportSlot = this.lastSelectedSample;
          this.render();
          this.sampleInput.click();
          return;
        }
        this.render();
        return;
      default:
        return;
    }
  }

  private async handleChange(event: Event): Promise<void> {
    if (!(event.target instanceof HTMLInputElement) || !this.engine) {
      return;
    }

    if (event.target === this.moduleInput) {
      const [file] = Array.from(this.moduleInput.files ?? []);
      if (file) {
        await this.engine.loadModule(new Uint8Array(await file.arrayBuffer()), file.name);
      }
      this.moduleInput.value = '';
      return;
    }

    if (event.target === this.sampleInput) {
      const [file] = Array.from(this.sampleInput.files ?? []);
      if (file) {
        if (this.pendingSampleImportSlot !== null) {
          this.engine.dispatch({ type: 'sample/select', sample: this.pendingSampleImportSlot });
        }
        await this.engine.loadSample(new Uint8Array(await file.arrayBuffer()), file.name);
        this.snapshot = this.engine.getSnapshot();
        this.refreshSelectedSampleWaveform(this.snapshot, true);
        this.render();
      }
      this.pendingSampleImportSlot = null;
      this.sampleInput.value = '';
      return;
    }

    this.handleInput(event);
  }

  private handleInput(event: Event): void {
    if (!(event.target instanceof HTMLInputElement) || !this.engine || !this.snapshot) {
      return;
    }

    const inputKey = event.target.dataset.input;
    if (!inputKey) {
      return;
    }

    const selectedSample = this.snapshot.selectedSample;
    const canEdit = this.canEditSnapshot(this.snapshot);

    switch (inputKey) {
      case 'sample-name':
        if (!canEdit) {
          return;
        }
        this.engine.dispatch({ type: 'sample/update', sample: selectedSample, patch: { name: event.target.value } });
        break;
      case 'sample-volume':
        if (!canEdit) {
          return;
        }
        this.engine.dispatch({ type: 'sample/update', sample: selectedSample, patch: { volume: clamp(Number(event.target.value), 0, 64) } });
        break;
      case 'sample-finetune':
        if (!canEdit) {
          return;
        }
        this.engine.dispatch({ type: 'sample/update', sample: selectedSample, patch: { fineTune: clamp(Number(event.target.value), -8, 7) } });
        break;
      case 'sample-loop-start':
        if (!canEdit) {
          return;
        }
        this.engine.dispatch({ type: 'sample-editor/set-loop', start: Math.max(0, Number(event.target.value)) });
        break;
      case 'sample-loop-end':
        if (!canEdit) {
          return;
        }
        this.engine.dispatch({ type: 'sample-editor/set-loop', end: Math.max(2, Number(event.target.value)) });
        break;
      case 'sample-loop-enabled':
        if (!canEdit) {
          return;
        }
        this.engine.dispatch({ type: 'sample-editor/toggle-loop', enabled: event.target.checked });
        break;
      case 'sample-editor-scroll':
        this.sampleEditorViewOverride = {
          sample: this.snapshot.selectedSample,
          start: Math.max(0, Number(event.target.value)),
          length: this.getSampleEditorView(this.snapshot).length,
        };
        this.updateModernLiveRegions(this.snapshot);
        return;
    }

    this.snapshot = this.engine.getSnapshot();
    this.refreshSelectedSampleWaveform(this.snapshot, true);
    this.updateModernLiveRegions(this.snapshot);
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
    for (let channel = 0; channel < 4; channel += 1) {
      const muted = snapshot.editor.muted[channel] ?? false;
      const button = this.root.querySelector<HTMLButtonElement>(`[data-role="track-mute-${channel}"]`);
      if (button) {
        button.classList.toggle('is-muted', muted);
        button.setAttribute('aria-pressed', muted ? 'true' : 'false');
        button.setAttribute('aria-label', `${muted ? 'Unmute' : 'Mute'} track ${channel + 1}`);
        button.innerHTML = iconMarkup(muted ? VolumeX : Volume2);
      }

      const label = button?.closest('.track-label');
      label?.classList.toggle('is-muted', muted);
    }
  }

  private updateSamplePanel(snapshot: TrackerSnapshot): void {
    const selectedSample = snapshot.samples[snapshot.selectedSample];
    const samplePage = this.resolveSamplePage(snapshot);
    const pageCount = this.getSamplePageCount(snapshot);
    const key = this.getSamplePanelKey(snapshot, samplePage);

    this.setLiveText('sample-page-label', `Page ${samplePage + 1} / ${pageCount}`);

    const prevButton = this.root.querySelector<HTMLButtonElement>('[data-action="sample-page-prev"]');
    if (prevButton) {
      prevButton.disabled = samplePage <= 0;
    }

    const nextButton = this.root.querySelector<HTMLButtonElement>('[data-action="sample-page-next"]');
    if (nextButton) {
      nextButton.disabled = samplePage >= pageCount - 1;
    }

    if (this.samplePanelKey === key) {
      this.setLiveText('selected-sample-title', this.getSelectedSampleHeading(selectedSample));
      this.setLiveText('selected-sample-hint', formatSampleLength(selectedSample));
      return;
    }

    const bank = this.root.querySelector<HTMLElement>('[data-role="sample-bank"]');
    if (bank) {
      bank.innerHTML = this.renderSampleBank(snapshot, samplePage);
    }

    const detail = this.root.querySelector<HTMLElement>('[data-role="sample-detail-content"]');
    if (detail) {
      detail.innerHTML = this.renderSelectedSamplePanel(selectedSample, snapshot);
      const previewHost = detail.querySelector<HTMLElement>('[data-role="sample-preview-host"]');
      if (previewHost) {
        previewHost.replaceChildren(this.samplePreviewCanvas);
      }
    }

    this.samplePanelKey = key;
  }

  private setLiveText(role: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(`[data-role="${role}"]`);
    if (element) {
      element.textContent = value;
    }
  }

  private handleModernHexEntry(event: KeyboardEvent): boolean {
    if (!this.engine || !this.snapshot || !this.canEditSnapshot(this.snapshot)) {
      return false;
    }

    const key = event.key.toUpperCase();
    if (!/^[0-9A-F]$/.test(key)) {
      return false;
    }

    const { field, row, channel } = this.snapshot.cursor;
    if (field === 'note') {
      return false;
    }

    const cell = this.snapshot.pattern.rows[row]?.channels[channel];
    if (!cell) {
      return false;
    }

    event.preventDefault();

    switch (field) {
      case 'sampleHigh':
      case 'sampleLow': {
        const current = formatCellSample(cell);
        const nextDigits = field === 'sampleHigh' ? `${key}${current[1]}` : `${current[0]}${key}`;
        const sampleNumber = Number.parseInt(nextDigits, 16);
        this.applyCellPatch(row, channel, {
          sample: sampleNumber <= 0 ? null : clamp(sampleNumber, 1, 31) - 1,
        });
        break;
      }
      case 'effect':
        this.applyCellPatch(row, channel, { effect: key });
        break;
      case 'paramHigh':
      case 'paramLow': {
        const current = formatCellParam(cell);
        const nextDigits = field === 'paramHigh' ? `${key}${current[1]}` : `${current[0]}${key}`;
        this.applyCellPatch(row, channel, { param: nextDigits });
        break;
      }
    }

    const nextCursor = moveCursorHorizontally(this.snapshot.cursor, this.snapshot.pattern.rows[0]?.channels.length ?? 4, 1);
    this.engine.dispatch({
      type: 'cursor/set',
      row,
      channel: nextCursor.channel,
      field: nextCursor.field,
    });
    return true;
  }

  private handlePatternCanvasPointer(event: MouseEvent): void {
    if (!this.engine || !this.snapshot || this.viewMode !== 'modern') {
      return;
    }

    const rect = this.patternCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const rowTop = 10;
    const rowIndexInView = Math.floor((y - rowTop) / PATTERN_ROW_HEIGHT);
    if (rowIndexInView < 0 || rowIndexInView >= MODERN_VISIBLE_PATTERN_ROWS) {
      return;
    }

    const row = this.getPatternViewportStartRow(this.snapshot) + rowIndexInView;
    if (row < 0 || row >= this.snapshot.pattern.rows.length) {
      return;
    }

    const layout = this.getPatternCanvasLayout(rect.width);
    const channelStride = layout.channelWidth + PATTERN_GUTTER;
    const localX = x - layout.gridLeft;
    if (localX < 0) {
      return;
    }

    const channel = Math.floor(localX / channelStride);
    if (channel < 0 || channel >= 4) {
      return;
    }

    const channelX = layout.gridLeft + (channel * channelStride);
    const channelLocalX = x - channelX;
    if (channelLocalX < 0 || channelLocalX > layout.channelWidth) {
      return;
    }

    const fieldRects = this.getPatternFieldRects(channelX, layout.channelWidth);
    const field = this.resolvePatternFieldFromPointer(x, fieldRects);

    this.engine.dispatch({
      type: 'cursor/set',
      row,
      channel,
      field,
    });
  }

  private handleSampleEditorPointerDown(event: MouseEvent): void {
    if (!this.engine || !this.snapshot || this.viewMode !== 'modern' || !this.snapshot.sampleEditor.open || !this.canEditSnapshot(this.snapshot)) {
      return;
    }

    const rect = this.sampleEditorCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const layout = this.getSampleEditorLayout(rect.width, rect.height);
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    if (localX < layout.left || localX > layout.left + layout.width || localY < layout.top || localY > layout.top + layout.height) {
      return;
    }

    const offset = this.sampleEditorXToOffset(event.clientX, this.snapshot);
    const loopEnabled = this.snapshot.samples[this.snapshot.selectedSample].loopLength > 2 && this.snapshot.samples[this.snapshot.selectedSample].length > 2;
    const loopStartX = this.sampleOffsetToEditorX(this.snapshot.sampleEditor.loopStart, this.snapshot, layout);
    const loopEndX = this.sampleOffsetToEditorX(this.snapshot.sampleEditor.loopEnd, this.snapshot, layout);
    const handleThreshold = 10;

    if (loopEnabled && Math.abs(localX - loopStartX) <= handleThreshold) {
      this.sampleEditorPointer = { mode: 'loop-start', active: true, anchor: offset, current: offset };
    } else if (loopEnabled && Math.abs(localX - loopEndX) <= handleThreshold) {
      this.sampleEditorPointer = { mode: 'loop-end', active: true, anchor: offset, current: offset };
    } else {
      this.sampleEditorPointer = { mode: 'select', active: true, anchor: offset, current: offset };
    }

    event.preventDefault();
    this.drawSampleEditor(this.snapshot);
  }

  private handleSampleEditorPointerMove(event: MouseEvent): void {
    if (!this.snapshot || this.viewMode !== 'modern' || !this.sampleEditorPointer.active || !this.canEditSnapshot(this.snapshot)) {
      return;
    }

    this.sampleEditorPointer.current = this.sampleEditorXToOffset(event.clientX, this.snapshot);
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

    if (pointer.mode === 'select') {
      if (Math.abs(pointer.current - pointer.anchor) < 2) {
        this.engine.dispatch({ type: 'sample-editor/set-selection', start: null, end: null });
      } else {
        this.engine.dispatch({
          type: 'sample-editor/set-selection',
          start: Math.min(pointer.anchor, pointer.current),
          end: Math.max(pointer.anchor, pointer.current),
        });
      }
    } else if (pointer.mode === 'loop-start') {
      this.engine.dispatch({
        type: 'sample-editor/set-loop',
        start: Math.min(pointer.current, this.snapshot.sampleEditor.loopEnd - 2),
      });
    } else if (pointer.mode === 'loop-end') {
      this.engine.dispatch({
        type: 'sample-editor/set-loop',
        end: Math.max(pointer.current, this.snapshot.sampleEditor.loopStart + 2),
      });
    }

    this.snapshot = this.engine.getSnapshot();
    this.refreshSelectedSampleWaveform(this.snapshot, true);
    this.updateModernLiveRegions(this.snapshot);
  }

  private handleSampleEditorWheel(event: WheelEvent): void {
    if (!this.engine || !this.snapshot || this.viewMode !== 'modern' || !this.snapshot.sampleEditor.open) {
      return;
    }

    event.preventDefault();
    this.clearSampleEditorViewOverride();
    const anchor = this.sampleEditorXToOffset(event.clientX, this.snapshot);
    this.engine.dispatch({
      type: event.deltaY < 0 ? 'sample-editor/zoom-in' : 'sample-editor/zoom-out',
      anchor,
    });
    this.snapshot = this.engine.getSnapshot();
    this.updateModernLiveRegions(this.snapshot);
  }

  private resolvePatternFieldFromPointer(
    x: number,
    fieldRects: Record<CursorField, { x: number; width: number }>,
  ): CursorField {
    for (const field of CURSOR_FIELDS) {
      const rect = fieldRects[field];
      if (x >= rect.x && x <= rect.x + rect.width) {
        return field;
      }
    }

    return 'note';
  }

  private handleClassicCanvasPointer(event: MouseEvent): void {
    const rect = this.config.canvas.getBoundingClientRect();
    this.classicDomDebug.x = Math.round(event.clientX - rect.left);
    this.classicDomDebug.y = Math.round(event.clientY - rect.top);
    this.classicDomDebug.buttons = event.buttons;
    this.classicDomDebug.events += 1;
    this.updateClassicDebugPanel(this.snapshot);
  }

  private handlePianoPointer(event: MouseEvent): void {
    if (!this.engine || !this.snapshot || this.viewMode !== 'modern') {
      return;
    }

    const rect = this.pianoCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const padding = 16;
    const keyboardTop = 14;
    const keyboardHeight = rect.height - 28;
    const localX = x - padding;
    const keys = buildPianoKeys(Math.max(1, rect.width - (padding * 2)));
    const blackHeight = keyboardHeight * 0.66;

    const blackKey = keys
      .filter((key) => key.black)
      .find((key) => localX >= key.x && localX <= key.x + key.width && y >= keyboardTop && y <= keyboardTop + blackHeight);
    const whiteKey = keys
      .filter((key) => !key.black)
      .find((key) => localX >= key.x && localX <= key.x + key.width && y >= keyboardTop && y <= keyboardTop + keyboardHeight);
    const targetKey = blackKey ?? whiteKey;

    if (!targetKey || !this.canEditSnapshot(this.snapshot) || this.snapshot.cursor.field !== 'note') {
      return;
    }

    event.preventDefault();
    this.engine.dispatch({
      type: 'pattern/set-cell',
      row: this.snapshot.cursor.row,
      channel: this.snapshot.cursor.channel,
      patch: { note: targetKey.note },
    });
    this.activePianoNotes[this.snapshot.cursor.channel] = targetKey.absolute;
    this.triggerPianoGlow(this.snapshot.cursor.channel, targetKey.absolute);
    this.engine.dispatch({ type: 'cursor/move', rowDelta: 1 });
    this.snapshot = this.engine.getSnapshot();
    this.drawPatternCanvas(this.snapshot);
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

    const translation = translateClassicKeyboardEvent(event);
    if (!translation) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.repeat || this.classicPressedKeys.has(event.code)) {
      return;
    }

    this.classicPressedKeys.set(event.code, translation);
    this.engine.forwardClassicKeyDown(
      translation.scancode,
      translation.keycode,
      translation.shift,
      translation.ctrl,
      translation.alt,
      translation.meta,
    );

    if (translation.text) {
      this.engine.forwardClassicTextInput(translation.text);
    }
  }

  private releaseClassicKeys(): void {
    if (!this.engine || this.classicPressedKeys.size === 0) {
      this.classicPressedKeys.clear();
      return;
    }

    for (const translation of this.classicPressedKeys.values()) {
      this.engine.forwardClassicKeyUp(
        translation.scancode,
        translation.keycode,
        false,
        false,
        false,
        false,
      );
    }

    this.classicPressedKeys.clear();
  }

  private getClassicLogicalPointerPosition(): { x: number; y: number } {
    const rect = this.config.canvas.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : this.config.canvas.width;
    const height = rect.height > 0 ? rect.height : this.config.canvas.height;
    const x = clamp(Math.floor((this.classicDomDebug.x / width) * this.config.canvas.width), 0, this.config.canvas.width - 1);
    const y = clamp(Math.floor((this.classicDomDebug.y / height) * this.config.canvas.height), 0, this.config.canvas.height - 1);

    return { x, y };
  }

  private updateClassicDebugPanel(snapshot: TrackerSnapshot | null): void {
    if (this.viewMode !== 'classic') {
      return;
    }

    const debugRoot = this.root.querySelector<HTMLElement>('.classic-debug');
    if (!debugRoot) {
      return;
    }

    const rect = this.config.canvas.getBoundingClientRect();
    const cssWidth = Math.round(rect.width);
    const cssHeight = Math.round(rect.height);
    const debug = snapshot?.debug;

    this.setDebugField('dom-mouse', `${this.classicDomDebug.x}, ${this.classicDomDebug.y}`);
    this.setDebugField(
      'dom-state',
      `${this.classicDomDebug.inside ? 'inside' : 'outside'} btn:${this.classicDomDebug.buttons} ev:${this.classicDomDebug.events}`,
    );
    this.setDebugField('mouse-abs', debug ? `${debug.mouse.absX}, ${debug.mouse.absY}` : 'n/a');
    this.setDebugField('mouse-raw', debug ? `${debug.mouse.rawX}, ${debug.mouse.rawY}` : 'n/a');
    this.setDebugField('mouse-pt2', debug ? `${debug.mouse.x}, ${debug.mouse.y}` : 'n/a');
    this.setDebugField(
      'mouse-buttons',
      debug ? `${debug.mouse.buttons} L:${debug.mouse.left ? '1' : '0'} R:${debug.mouse.right ? '1' : '0'}` : 'n/a',
    );
    this.setDebugField('canvas-css', `${cssWidth} x ${cssHeight}`);
    this.setDebugField('video-render', debug ? `${debug.video.renderW} x ${debug.video.renderH}` : 'n/a');
    this.setDebugField(
      'video-scale',
      debug ? `${debug.video.scaleX.toFixed(4)} / ${debug.video.scaleY.toFixed(4)}` : 'n/a',
    );
  }

  private setDebugField(field: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(`[data-debug-field="${field}"]`);
    if (element) {
      element.textContent = value;
    }
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
