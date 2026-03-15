import type { TrackerEngine } from './trackerEngine';
import type {
  CursorField,
  EngineConfig,
  EngineEvent,
  ExportedFile,
  PatternCell,
  PatternRow,
  QuadrascopeState,
  SampleExportFormat,
  SampleSlot,
  TrackerCommand,
  TrackerSnapshot,
  TransportCommand,
} from './trackerTypes';

const DEFAULT_PATTERN_ROWS = 64;
const DEFAULT_CHANNELS = 4;
const DEFAULT_SAMPLES = 31;
const SAMPLE_PREVIEW_POINTS = 48;
const CURSOR_FIELDS: CursorField[] = ['note', 'sampleHigh', 'sampleLow', 'effect', 'paramHigh', 'paramLow'];

const clone = <T>(value: T): T => structuredClone(value);
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const createEmptyCell = (): PatternCell => ({
  note: null,
  sample: null,
  effect: null,
  param: null,
});

const createEmptyRows = (): PatternRow[] =>
  Array.from({ length: DEFAULT_PATTERN_ROWS }, (_, rowIndex) => ({
    index: rowIndex,
    channels: Array.from({ length: DEFAULT_CHANNELS }, () => createEmptyCell()),
  }));

const createSamplePreviewFromBytes = (bytes: Uint8Array): number[] => {
  if (bytes.length === 0) {
    return Array.from({ length: SAMPLE_PREVIEW_POINTS }, () => 0);
  }

  return Array.from({ length: SAMPLE_PREVIEW_POINTS }, (_, index) => {
    const start = Math.floor((index * bytes.length) / SAMPLE_PREVIEW_POINTS);
    const end = Math.max(start + 1, Math.floor(((index + 1) * bytes.length) / SAMPLE_PREVIEW_POINTS));
    let peak = 0;

    for (let i = start; i < end && i < bytes.length; i += 1) {
      const signed = bytes[i] > 127 ? bytes[i] - 256 : bytes[i];
      if (Math.abs(signed) >= Math.abs(peak)) {
        peak = signed;
      }
    }

    return peak;
  });
};

const createMockPreview = (seed: number): number[] =>
  Array.from({ length: SAMPLE_PREVIEW_POINTS }, (_, index) => {
    const phase = ((index / SAMPLE_PREVIEW_POINTS) * Math.PI * 2 * ((seed % 3) + 1)) + (seed * 0.37);
    return Math.round(Math.sin(phase) * (64 - ((index + seed) % 11)));
  });

const createSampleDataFromPreview = (preview: number[], targetLength: number): Int8Array => {
  if (targetLength <= 0 || preview.length === 0) {
    return new Int8Array(0);
  }

  return Int8Array.from({ length: targetLength }, (_, index) => {
    const sourceIndex = Math.floor((index / targetLength) * preview.length);
    return clamp(preview[sourceIndex] ?? 0, -128, 127);
  });
};

const createSampleDataFromBytes = (bytes: Uint8Array): Int8Array => {
  if (bytes.length === 0) {
    return new Int8Array(0);
  }

  return Int8Array.from(bytes, (value) => (value > 127 ? value - 256 : value));
};

const createSamplePreviewFromData = (data: Int8Array): number[] => {
  if (data.length === 0) {
    return Array.from({ length: SAMPLE_PREVIEW_POINTS }, () => 0);
  }

  return Array.from({ length: SAMPLE_PREVIEW_POINTS }, (_, index) => {
    const start = Math.floor((index * data.length) / SAMPLE_PREVIEW_POINTS);
    const end = Math.max(start + 1, Math.floor(((index + 1) * data.length) / SAMPLE_PREVIEW_POINTS));
    let peak = 0;

    for (let i = start; i < end && i < data.length; i += 1) {
      const sample = data[i] ?? 0;
      if (Math.abs(sample) >= Math.abs(peak)) {
        peak = sample;
      }
    }

    return peak;
  });
};

const createSamples = (): SampleSlot[] =>
  Array.from({ length: DEFAULT_SAMPLES }, (_, index) => ({
    index,
    name: index === 0 ? 'Kick Demo' : '',
    length: index === 0 ? 7424 : 0,
    volume: 64,
    fineTune: 0,
    loopStart: 0,
    loopLength: 2,
    preview: index === 0 ? createMockPreview(index) : Array.from({ length: SAMPLE_PREVIEW_POINTS }, () => 0),
  }));

const createSampleData = (samples: SampleSlot[]): Int8Array[] =>
  samples.map((sample, index) => {
    if (sample.length > 0) {
      return createSampleDataFromPreview(sample.preview ?? createMockPreview(index), sample.length);
    }

    return new Int8Array(0);
  });

const createSnapshot = (status: string): TrackerSnapshot => ({
  backend: 'mock',
  ready: false,
  status,
  diagnostics: [
    'The wasm core is not active. The mock engine is being used for UI and API development.',
    'Playback here is UI-only simulation and does not replace Paula/replayer verification.',
  ],
  capabilities: {
    accuratePlayback: false,
    moduleEditing: true,
    sampleEditing: true,
    sampleImport: true,
    moduleImport: true,
    keyboardFirst: true,
    browserPersistence: false,
  },
  song: {
    title: 'UNTITLED',
    currentPattern: 0,
    currentPosition: 0,
    length: 1,
  },
  transport: {
    playing: false,
    mode: 'song',
    bpm: 125,
    speed: 6,
    row: 0,
    pattern: 0,
    position: 0,
  },
  editor: {
    editMode: false,
    recordMode: false,
    muted: Array.from({ length: DEFAULT_CHANNELS }, () => false),
  },
  cursor: {
    row: 0,
    channel: 0,
    field: 'note',
  },
  selectedSample: 0,
  recentModuleName: null,
  pattern: {
    index: 0,
    rows: createEmptyRows(),
  },
  quadrascope: {
    channels: Array.from({ length: DEFAULT_CHANNELS }, () => ({
      active: false,
      volume: 0,
      sample: Array.from({ length: 64 }, () => 0),
    })),
  },
  sampleEditor: {
    open: false,
    sample: 0,
    visibleStart: 0,
    visibleLength: 0,
    selectionStart: null,
    selectionEnd: null,
    loopStart: 0,
    loopEnd: 2,
    sampleLength: 0,
  },
  samples: createSamples(),
});

export class MockTrackerEngine implements TrackerEngine {
  private snapshot = createSnapshot('Initializing mock engine...');
  private listeners = new Set<(event: EngineEvent) => void>();
  private playbackTimer: number | null = null;
  private previewTimer: number | null = null;
  private sampleData = createSampleData(this.snapshot.samples);

  async init(_config: EngineConfig): Promise<void> {
    this.snapshot.ready = true;
    this.snapshot.status = 'Mock engine ready. The modern UI can run without a WASM build.';
    this.emitSnapshot();
    this.emitStatus(this.snapshot.status, 'warn');
  }

  async dispose(): Promise<void> {
    this.stopPlaybackTimer();
    this.stopPreviewTimer();
    this.listeners.clear();
  }

  async loadModule(file: Uint8Array, name: string): Promise<void> {
    this.snapshot.recentModuleName = name;
    this.snapshot.song.title = name.replace(/\.[^.]+$/, '').slice(0, 20).toUpperCase() || 'UNTITLED';
    this.snapshot.status = `Loaded ${name} (${file.byteLength} bytes) into the mock engine.`;
    this.emitSnapshot();
    this.emitStatus('The module is not decoded in mock mode. Only the UI flow is active.', 'warn');
  }

  async saveModule(): Promise<ExportedFile> {
    const payload = {
      kind: 'pt2-web-draft',
      createdAt: new Date().toISOString(),
      snapshot: this.snapshot,
    };

    return {
      filename: `${this.snapshot.song.title || 'untitled'}.draft.json`,
      mimeType: 'application/json',
      bytes: new TextEncoder().encode(JSON.stringify(payload, null, 2)),
    };
  }

  async loadSample(file: Uint8Array, name: string): Promise<void> {
    const sample = this.snapshot.samples[this.snapshot.selectedSample];
    const data = createSampleDataFromBytes(file);
    sample.name = name.replace(/\.[^.]+$/, '').slice(0, 22);
    sample.length = data.length;
    sample.preview = createSamplePreviewFromData(data);
    sample.loopStart = 0;
    sample.loopLength = Math.min(Math.max(2, data.length), Math.max(2, data.length));
    this.sampleData[sample.index] = data;
    this.syncSampleEditor(sample.index, true);
    this.snapshot.status = `Loaded sample ${name} into slot ${sample.index + 1}.`;
    this.emitSnapshot();
  }

  async saveSample(slot: number, format: SampleExportFormat): Promise<ExportedFile> {
    const sample = this.snapshot.samples[slot];
    return {
      filename: `${sample.name || `sample-${slot + 1}`}.${format}.draft.json`,
      mimeType: 'application/json',
      bytes: new TextEncoder().encode(JSON.stringify(sample, null, 2)),
    };
  }

  dispatch(command: TrackerCommand): void {
    switch (command.type) {
      case 'song/new':
        this.stopPlaybackTimer();
        this.stopPreviewTimer();
        this.snapshot = createSnapshot('Created a new mock module.');
        this.snapshot.ready = true;
        this.sampleData = createSampleData(this.snapshot.samples);
        break;
      case 'song/set-title':
        this.snapshot.song.title = command.title.slice(0, 20).toUpperCase();
        break;
      case 'song/set-position':
        this.snapshot.transport.position = clamp(command.position, 0, this.snapshot.song.length - 1);
        this.snapshot.song.currentPosition = this.snapshot.transport.position;
        break;
      case 'song/set-bpm':
        this.snapshot.transport.bpm = clamp(command.bpm, 32, 255);
        if (this.snapshot.transport.playing) {
          this.restartPlaybackTimer();
        }
        break;
      case 'song/set-speed':
        this.snapshot.transport.speed = clamp(command.speed, 1, 31);
        if (this.snapshot.transport.playing) {
          this.restartPlaybackTimer();
        }
        break;
      case 'song/set-pattern':
        this.snapshot.song.currentPattern = clamp(command.pattern, 0, 99);
        this.snapshot.pattern.index = this.snapshot.song.currentPattern;
        break;
      case 'song/adjust-length':
        if (!this.snapshot.editor.editMode) {
          break;
        }

        this.snapshot.song.length = clamp(this.snapshot.song.length + command.delta, 1, 128);
        this.snapshot.transport.position = clamp(this.snapshot.transport.position, 0, this.snapshot.song.length - 1);
        break;
      case 'editor/set-edit-mode':
        this.snapshot.editor.editMode = command.enabled;
        this.snapshot.editor.recordMode = false;
        this.snapshot.status = command.enabled ? 'Edit mode enabled.' : 'Edit mode disabled.';
        break;
      case 'channel/toggle-mute': {
        const channel = clamp(command.channel, 0, DEFAULT_CHANNELS - 1);
        this.snapshot.editor.muted[channel] = !this.snapshot.editor.muted[channel];
        break;
      }
      case 'cursor/set':
        this.snapshot.cursor.row = clamp(command.row, 0, DEFAULT_PATTERN_ROWS - 1);
        this.snapshot.cursor.channel = clamp(command.channel, 0, DEFAULT_CHANNELS - 1);
        if (command.field) {
          this.snapshot.cursor.field = command.field;
        }
        break;
      case 'cursor/move':
        this.snapshot.cursor.row = clamp(this.snapshot.cursor.row + (command.rowDelta ?? 0), 0, DEFAULT_PATTERN_ROWS - 1);
        this.snapshot.cursor.channel = clamp(this.snapshot.cursor.channel + (command.channelDelta ?? 0), 0, DEFAULT_CHANNELS - 1);
        if (typeof command.fieldDelta === 'number' && command.fieldDelta !== 0) {
          const currentFieldIndex = CURSOR_FIELDS.indexOf(this.snapshot.cursor.field);
          this.snapshot.cursor.field = CURSOR_FIELDS[clamp(currentFieldIndex + command.fieldDelta, 0, CURSOR_FIELDS.length - 1)];
        }
        break;
      case 'pattern/set-cell': {
        if (!this.snapshot.editor.editMode) {
          break;
        }

        const cell = this.snapshot.pattern.rows[command.row]?.channels[command.channel];
        if (!cell) {
          break;
        }

        Object.assign(cell, command.patch);
        this.snapshot.cursor.row = command.row;
        this.snapshot.cursor.channel = command.channel;
        break;
      }
      case 'pattern/clear-cell': {
        if (!this.snapshot.editor.editMode) {
          break;
        }

        const cell = this.snapshot.pattern.rows[command.row]?.channels[command.channel];
        if (!cell) {
          break;
        }

        cell.note = null;
        cell.sample = null;
        cell.effect = null;
        cell.param = null;
        this.snapshot.cursor.row = command.row;
        this.snapshot.cursor.channel = command.channel;
        break;
      }
      case 'sample/select':
        this.snapshot.selectedSample = clamp(command.sample, 0, DEFAULT_SAMPLES - 1);
        this.syncSampleEditor(this.snapshot.selectedSample, false);
        break;
      case 'sample/update': {
        if (!this.snapshot.editor.editMode) {
          break;
        }

        const sample = this.snapshot.samples[command.sample];
        if (!sample) {
          break;
        }

        Object.assign(sample, command.patch);
        this.syncSampleEditor(command.sample, false);
        if (typeof command.patch.length === 'number') {
          this.sampleData[command.sample] = this.resizeSampleData(this.sampleData[command.sample] ?? new Int8Array(0), sample.length);
          sample.preview = createSamplePreviewFromData(this.sampleData[command.sample]);
        }
        break;
      }
      case 'sample-editor/open': {
        const sample = clamp(command.sample ?? this.snapshot.selectedSample, 0, DEFAULT_SAMPLES - 1);
        this.snapshot.selectedSample = sample;
        this.syncSampleEditor(sample, true);
        this.snapshot.sampleEditor.open = true;
        break;
      }
      case 'sample-editor/close':
        this.snapshot.sampleEditor.open = false;
        break;
      case 'sample-editor/show-all':
        this.showAllInSampleEditor();
        break;
      case 'sample-editor/show-selection':
        this.showSelectionInSampleEditor();
        break;
      case 'sample-editor/zoom-in':
        this.zoomSampleEditor(command.anchor, -1);
        break;
      case 'sample-editor/zoom-out':
        this.zoomSampleEditor(command.anchor, 1);
        break;
      case 'sample-editor/set-view':
        this.setSampleEditorView(command.start, command.length);
        break;
      case 'sample-editor/set-selection':
        this.setSampleEditorSelection(command.start, command.end);
        break;
      case 'sample-editor/set-loop':
        this.setSampleEditorLoop(command.start, command.end);
        break;
      case 'sample-editor/toggle-loop':
        this.toggleSampleEditorLoop(command.enabled);
        break;
      case 'sample-editor/crop':
        this.applySampleCropOrCut(false);
        break;
      case 'sample-editor/cut':
        this.applySampleCropOrCut(true);
        break;
      case 'sample-editor/play':
        this.playSamplePreview(command.mode);
        break;
    }

    this.emitSnapshot();
  }

  setTransport(command: TransportCommand): void {
    switch (command.type) {
      case 'transport/play-song':
        this.snapshot.transport.mode = 'song';
        this.snapshot.transport.playing = true;
        this.restartPlaybackTimer();
        break;
      case 'transport/play-pattern':
        this.snapshot.transport.mode = 'pattern';
        this.snapshot.transport.playing = true;
        this.restartPlaybackTimer();
        break;
      case 'transport/stop':
        this.snapshot.transport.playing = false;
        this.snapshot.transport.row = 0;
        this.stopPlaybackTimer();
        break;
      case 'transport/toggle':
        if (this.snapshot.transport.playing) {
          this.setTransport({ type: 'transport/stop' });
        } else {
          this.setTransport({ type: 'transport/play-song' });
        }
        return;
    }

    this.emitSnapshot();
  }

  refreshLayout(): void {
    // No-op in mock mode. The DOM layout is already authoritative here.
  }

  forwardClassicPointerMove(_x: number, _y: number, _buttons: number): void {
    // No-op in mock mode.
  }

  forwardClassicPointerButton(_x: number, _y: number, _button: number, _pressed: boolean, _buttons: number): void {
    // No-op in mock mode.
  }

  forwardClassicKeyDown(_scancode: number, _keycode: number, _shift: boolean, _ctrl: boolean, _alt: boolean, _meta: boolean): void {
    // No-op in mock mode.
  }

  forwardClassicKeyUp(_scancode: number, _keycode: number, _shift: boolean, _ctrl: boolean, _alt: boolean, _meta: boolean): void {
    // No-op in mock mode.
  }

  forwardClassicTextInput(_text: string): void {
    // No-op in mock mode.
  }

  getSnapshot(): TrackerSnapshot {
    return clone(this.snapshot);
  }

  getQuadrascope(): QuadrascopeState | null {
    return clone(this.snapshot.quadrascope ?? null);
  }

  getSampleWaveform(sample: number): Int8Array | null {
    const data = this.sampleData[clamp(sample, 0, DEFAULT_SAMPLES - 1)];
    return data ? new Int8Array(data) : null;
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    listener({ type: 'snapshot', snapshot: this.getSnapshot() });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitSnapshot(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener({ type: 'snapshot', snapshot });
    }
  }

  private emitStatus(message: string, level: 'info' | 'warn' | 'error'): void {
    for (const listener of this.listeners) {
      listener({ type: 'status', message, level });
    }
  }

  private restartPlaybackTimer(): void {
    this.stopPlaybackTimer();
    const intervalMs = Math.max(40, Math.round((2500 * this.snapshot.transport.speed) / this.snapshot.transport.bpm));

    this.playbackTimer = window.setInterval(() => {
      this.snapshot.transport.row = (this.snapshot.transport.row + 1) % DEFAULT_PATTERN_ROWS;
      if (this.snapshot.transport.row === 0) {
        this.snapshot.transport.position = (this.snapshot.transport.position + 1) % Math.max(1, this.snapshot.song.length);
      }
      this.snapshot.quadrascope?.channels.forEach((channel, index) => {
        channel.active = this.snapshot.transport.playing;
        channel.volume = 24 + ((index * 9 + this.snapshot.transport.row) % 36);
        channel.sample = channel.sample.map((_, point) =>
          Math.round(Math.sin((point / 64) * Math.PI * 2 * (index + 1) + (this.snapshot.transport.row * 0.15)) * 96),
        );
      });
      this.emitSnapshot();
    }, intervalMs);
  }

  private stopPlaybackTimer(): void {
    if (this.playbackTimer !== null) {
      window.clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  private stopPreviewTimer(): void {
    if (this.previewTimer !== null) {
      window.clearInterval(this.previewTimer);
      this.previewTimer = null;
    }
  }

  private syncSampleEditor(sampleIndex: number, resetViewport: boolean): void {
    const sample = this.snapshot.samples[sampleIndex];
    const length = sample?.length ?? 0;
    const editorState = this.snapshot.sampleEditor;
    const previousSample = editorState.sample;
    editorState.sample = sampleIndex;
    editorState.sampleLength = length;
    editorState.loopStart = sample?.loopStart ?? 0;
    editorState.loopEnd = (sample?.loopStart ?? 0) + (sample?.loopLength ?? 2);

    if (length <= 0) {
      editorState.visibleStart = 0;
      editorState.visibleLength = 0;
      editorState.selectionStart = null;
      editorState.selectionEnd = null;
      return;
    }

    if (resetViewport || editorState.visibleLength <= 0 || previousSample !== sampleIndex) {
      editorState.visibleStart = 0;
      editorState.visibleLength = length;
      editorState.selectionStart = null;
      editorState.selectionEnd = null;
      return;
    }

    editorState.visibleStart = clamp(editorState.visibleStart, 0, Math.max(0, length - 1));
    editorState.visibleLength = clamp(editorState.visibleLength, 1, length);
    if (editorState.visibleStart + editorState.visibleLength > length) {
      editorState.visibleStart = Math.max(0, length - editorState.visibleLength);
    }

    if (editorState.selectionStart !== null && editorState.selectionEnd !== null) {
      editorState.selectionStart = clamp(editorState.selectionStart, 0, Math.max(0, length - 1));
      editorState.selectionEnd = clamp(editorState.selectionEnd, 0, length);
      if (editorState.selectionEnd <= editorState.selectionStart) {
        editorState.selectionStart = null;
        editorState.selectionEnd = null;
      }
    }
  }

  private resizeSampleData(source: Int8Array, targetLength: number): Int8Array {
    if (targetLength <= 0) {
      return new Int8Array(0);
    }

    if (source.length === targetLength) {
      return new Int8Array(source);
    }

    const resized = new Int8Array(targetLength);
    resized.set(source.subarray(0, Math.min(source.length, targetLength)));
    return resized;
  }

  private setSampleEditorSelection(start: number | null, end: number | null): void {
    const state = this.snapshot.sampleEditor;
    const length = state.sampleLength;
    if (start === null || end === null || length <= 0) {
      state.selectionStart = null;
      state.selectionEnd = null;
      return;
    }

    const left = clamp(Math.min(start, end), 0, Math.max(0, length - 1));
    const right = clamp(Math.max(start, end), 0, length);
    if (right <= left) {
      state.selectionStart = null;
      state.selectionEnd = null;
      return;
    }

    state.selectionStart = left;
    state.selectionEnd = right;
  }

  private setSampleEditorLoop(start?: number, end?: number): void {
    const sample = this.snapshot.samples[this.snapshot.selectedSample];
    if (!sample || sample.length <= 0) {
      return;
    }

    const currentEnd = sample.loopStart + sample.loopLength;
    const nextStart = typeof start === 'number' ? clamp(start & ~1, 0, Math.max(0, sample.length - 2)) : sample.loopStart;
    const nextEnd = typeof end === 'number' ? clamp(end & ~1, nextStart + 2, sample.length) : clamp(currentEnd & ~1, nextStart + 2, sample.length);

    sample.loopStart = nextStart;
    sample.loopLength = Math.max(2, nextEnd - nextStart);
    this.syncSampleEditor(sample.index, false);
  }

  private toggleSampleEditorLoop(enabled: boolean): void {
    const sample = this.snapshot.samples[this.snapshot.selectedSample];
    if (!sample || sample.length < 2) {
      return;
    }

    if (!enabled) {
      sample.loopStart = 0;
      sample.loopLength = 2;
      this.syncSampleEditor(sample.index, false);
      return;
    }

    if (sample.loopLength > 2) {
      return;
    }

    sample.loopStart = 0;
    sample.loopLength = Math.max(2, sample.length & ~1);
    this.syncSampleEditor(sample.index, false);
  }

  private showAllInSampleEditor(): void {
    const state = this.snapshot.sampleEditor;
    state.visibleStart = 0;
    state.visibleLength = state.sampleLength;
  }

  private showSelectionInSampleEditor(): void {
    const state = this.snapshot.sampleEditor;
    if (state.selectionStart === null || state.selectionEnd === null || state.selectionEnd <= state.selectionStart) {
      return;
    }

    state.visibleStart = state.selectionStart;
    state.visibleLength = state.selectionEnd - state.selectionStart;
  }

  private zoomSampleEditor(anchor: number, direction: -1 | 1): void {
    const state = this.snapshot.sampleEditor;
    if (state.sampleLength <= 1 || state.visibleLength <= 0) {
      return;
    }

    const clampedAnchor = clamp(anchor, state.visibleStart, Math.max(state.visibleStart, state.visibleStart + state.visibleLength - 1));
    const anchorRatio = state.visibleLength > 1 ? (clampedAnchor - state.visibleStart) / (state.visibleLength - 1) : 0.5;
    const delta = Math.max(2, Math.round(state.visibleLength * 0.2));
    let nextLength = direction < 0
      ? Math.max(2, state.visibleLength - delta)
      : Math.min(state.sampleLength, state.visibleLength + delta);

    if (nextLength >= state.sampleLength) {
      state.visibleStart = 0;
      state.visibleLength = state.sampleLength;
      return;
    }

    let nextStart = Math.round(clampedAnchor - (anchorRatio * nextLength));
    nextStart = clamp(nextStart, 0, Math.max(0, state.sampleLength - nextLength));

    state.visibleStart = nextStart;
    state.visibleLength = nextLength;
  }

  private setSampleEditorView(start: number, length: number): void {
    const state = this.snapshot.sampleEditor;
    if (state.sampleLength <= 0) {
      return;
    }

    const nextLength = clamp(length, 2, state.sampleLength);
    state.visibleLength = nextLength;
    state.visibleStart = clamp(start, 0, Math.max(0, state.sampleLength - nextLength));
  }

  private applySampleCropOrCut(cut: boolean): void {
    const state = this.snapshot.sampleEditor;
    const sample = this.snapshot.samples[this.snapshot.selectedSample];
    const data = this.sampleData[this.snapshot.selectedSample];
    if (!sample || !data || state.selectionStart === null || state.selectionEnd === null) {
      return;
    }

    const start = clamp(state.selectionStart, 0, data.length);
    const end = clamp(state.selectionEnd, 0, data.length);
    if (end <= start) {
      return;
    }

    const nextData = cut
      ? Int8Array.from([...data.subarray(0, start), ...data.subarray(end)])
      : data.slice(start, end);

    this.sampleData[this.snapshot.selectedSample] = nextData;
    sample.length = nextData.length;
    sample.preview = createSamplePreviewFromData(nextData);
    sample.loopStart = 0;
    sample.loopLength = Math.max(2, Math.min(nextData.length, Math.max(2, nextData.length)));
    state.selectionStart = null;
    state.selectionEnd = null;
    this.syncSampleEditor(this.snapshot.selectedSample, true);
  }

  private playSamplePreview(mode: 'sample' | 'view' | 'selection'): void {
    this.stopPreviewTimer();

    const sample = this.snapshot.samples[this.snapshot.selectedSample];
    const data = this.sampleData[this.snapshot.selectedSample];
    if (!sample || !data || data.length === 0) {
      return;
    }

    const state = this.snapshot.sampleEditor;
    let start = 0;
    let end = data.length;

    if (mode === 'view') {
      start = state.visibleStart;
      end = Math.min(data.length, state.visibleStart + state.visibleLength);
    } else if (mode === 'selection' && state.selectionStart !== null && state.selectionEnd !== null) {
      start = state.selectionStart;
      end = state.selectionEnd;
    }

    const slice = data.subarray(clamp(start, 0, data.length), clamp(end, 0, data.length));
    if (slice.length === 0) {
      return;
    }

    let phase = 0;
    this.previewTimer = window.setInterval(() => {
      phase = (phase + 1) % 64;
      this.snapshot.quadrascope?.channels.forEach((channel, index) => {
        const stride = Math.max(1, Math.floor(slice.length / 64));
        channel.active = true;
        channel.volume = 42 + ((index * 7 + phase) % 22);
        channel.sample = Array.from({ length: 64 }, (_, point) => slice[(point * stride + phase) % slice.length] ?? 0);
      });
      this.emitSnapshot();
    }, 33);

    window.setTimeout(() => {
      this.stopPreviewTimer();
      this.snapshot.quadrascope?.channels.forEach((channel) => {
        channel.active = false;
        channel.volume = 0;
      });
      this.emitSnapshot();
    }, 500);
  }
}

