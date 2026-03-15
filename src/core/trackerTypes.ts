export type EngineBackend = 'wasm' | 'mock';

export type CursorField =
  | 'note'
  | 'sampleHigh'
  | 'sampleLow'
  | 'effect'
  | 'paramHigh'
  | 'paramLow';
export type TransportMode = 'song' | 'pattern';
export type SampleExportFormat = 'wav' | 'iff' | 'raw';

export interface ExportedFile {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface EngineConfig {
  canvas: HTMLCanvasElement;
  workspaceRoot: string;
}

export interface EngineCapabilities {
  accuratePlayback: boolean;
  moduleEditing: boolean;
  sampleEditing: boolean;
  sampleImport: boolean;
  moduleImport: boolean;
  keyboardFirst: boolean;
  browserPersistence: boolean;
}

export interface PatternCell {
  note: string | null;
  sample: number | null;
  effect: string | null;
  param: string | null;
}

export interface PatternRow {
  index: number;
  channels: PatternCell[];
}

export interface SampleSlot {
  index: number;
  name: string;
  length: number;
  volume: number;
  fineTune: number;
  loopStart: number;
  loopLength: number;
  preview?: number[];
}

export interface QuadrascopeChannel {
  active: boolean;
  volume: number;
  sample: number[];
}

export interface QuadrascopeState {
  channels: QuadrascopeChannel[];
}

export interface SampleEditorState {
  open: boolean;
  sample: number;
  visibleStart: number;
  visibleLength: number;
  selectionStart: number | null;
  selectionEnd: number | null;
  loopStart: number;
  loopEnd: number;
  sampleLength: number;
}

export interface TrackerSnapshot {
  backend: EngineBackend;
  ready: boolean;
  status: string;
  diagnostics: string[];
  debug?: {
    mouse: {
      absX: number;
      absY: number;
      rawX: number;
      rawY: number;
      x: number;
      y: number;
      left: boolean;
      right: boolean;
      buttons: number;
    };
    video: {
      renderW: number;
      renderH: number;
      scaleX: number;
      scaleY: number;
      fullscreen: boolean;
    };
  };
  capabilities: EngineCapabilities;
  audio: {
    stereo: boolean;
  };
  song: {
    title: string;
    currentPattern: number;
    currentPosition: number;
    length: number;
    sizeBytes: number;
  };
  transport: {
    playing: boolean;
    mode: TransportMode;
    bpm: number;
    speed: number;
    elapsedSeconds: number;
    row: number;
    pattern: number;
    position: number;
  };
  editor: {
    editMode: boolean;
    recordMode: boolean;
    muted: boolean[];
  };
  cursor: {
    row: number;
    channel: number;
    field: CursorField;
  };
  selectedSample: number;
  recentModuleName: string | null;
  pattern: {
    index: number;
    rows: PatternRow[];
  };
  quadrascope?: QuadrascopeState;
  sampleEditor: SampleEditorState;
  samples: SampleSlot[];
}

export type TrackerCommand =
  | { type: 'song/new' }
  | { type: 'song/set-title'; title: string }
  | { type: 'song/set-position'; position: number }
  | { type: 'song/set-bpm'; bpm: number }
  | { type: 'song/set-speed'; speed: number }
  | { type: 'song/set-pattern'; pattern: number }
  | { type: 'song/adjust-length'; delta: number }
  | { type: 'editor/set-edit-mode'; enabled: boolean }
  | { type: 'channel/toggle-mute'; channel: number }
  | { type: 'cursor/set'; row: number; channel: number; field?: CursorField }
  | { type: 'cursor/move'; rowDelta?: number; channelDelta?: number; fieldDelta?: number }
  | { type: 'pattern/set-cell'; row: number; channel: number; patch: Partial<PatternCell> }
  | { type: 'pattern/clear-cell'; row: number; channel: number }
  | { type: 'sample/select'; sample: number }
  | { type: 'sample/update'; sample: number; patch: Partial<Omit<SampleSlot, 'index'>> }
  | { type: 'sample-editor/open'; sample?: number }
  | { type: 'sample-editor/close' }
  | { type: 'sample-editor/show-all' }
  | { type: 'sample-editor/show-selection' }
  | { type: 'sample-editor/zoom-in'; anchor: number }
  | { type: 'sample-editor/zoom-out'; anchor: number }
  | { type: 'sample-editor/set-view'; start: number; length: number }
  | { type: 'sample-editor/set-selection'; start: number | null; end: number | null }
  | { type: 'sample-editor/set-loop'; start?: number; end?: number }
  | { type: 'sample-editor/toggle-loop'; enabled: boolean }
  | { type: 'sample-editor/crop' }
  | { type: 'sample-editor/cut' }
  | { type: 'sample-editor/play'; mode: 'sample' | 'view' | 'selection' }
  | { type: 'audio/toggle-stereo' }
  | { type: 'note-preview/play'; note: string; channel: number }
  | { type: 'note-preview/stop' };

export type TransportCommand =
  | { type: 'transport/play-song' }
  | { type: 'transport/play-pattern' }
  | { type: 'transport/pause' }
  | { type: 'transport/stop' }
  | { type: 'transport/toggle' };

export type EngineEvent =
  | { type: 'snapshot'; snapshot: TrackerSnapshot }
  | { type: 'status'; message: string; level: 'info' | 'warn' | 'error' };
