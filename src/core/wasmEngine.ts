import createPt2Module from '../wasm/pt2clone.js';
import type { TrackerEngine } from './trackerEngine';
import type {
  AudioMode,
  CursorField,
  EngineConfig,
  EngineEvent,
  ExportedFile,
  ImportedSample,
  PatternCell,
  QuadrascopeState,
  SampleExportFormat,
  TrackerCommand,
  TrackerLiveState,
  TrackerSnapshot,
  TransportCommand,
} from './trackerTypes';

type Pt2Module = {
  FS: {
    analyzePath(path: string): { exists: boolean };
    chdir(path: string): void;
    mkdir(path: string): void;
    mount(type: unknown, options: Record<string, unknown>, mountpoint: string): void;
    readFile(path: string): Uint8Array;
    syncfs(populate: boolean, callback: (error?: unknown) => void): void;
    writeFile(path: string, data: Uint8Array): void;
  };
  IDBFS?: unknown;
  HEAP8: Int8Array;
  HEAPU8: Uint8Array;
  ccall: <T>(ident: string, returnType: string | null, argTypes: string[], args: unknown[]) => T;
};

type Pt2ModuleFactory = (options: Record<string, unknown>) => Promise<Pt2Module>;

const moduleFactory = createPt2Module as unknown as Pt2ModuleFactory;
const LIVE_STATE_FLAG_PLAYING = 1 << 0;
const LIVE_STATE_FLAG_PATTERN_MODE = 1 << 1;
const LIVE_STATE_AUDIO_MODE_CUSTOM = 0;
const LIVE_STATE_AUDIO_MODE_MONO = 1;
const LIVE_STATE_AUDIO_MODE_AMIGA = 2;

const decodeAudioMode = (value: number): AudioMode => {
  if (value === LIVE_STATE_AUDIO_MODE_MONO) {
    return 'mono';
  }

  if (value === LIVE_STATE_AUDIO_MODE_AMIGA) {
    return 'amiga';
  }

  return 'custom';
};

const ensureDir = (module: Pt2Module, path: string): void => {
  if (!module.FS.analyzePath(path).exists) {
    module.FS.mkdir(path);
  }
};

const syncFs = async (module: Pt2Module, populate: boolean): Promise<void> =>
  new Promise((resolve, reject) => {
    module.FS.syncfs(populate, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const fieldToNumber = (field: CursorField): number => {
  switch (field) {
    case 'note':
      return 0;
    case 'sampleHigh':
      return 1;
    case 'sampleLow':
      return 2;
    case 'effect':
      return 3;
    case 'paramHigh':
      return 4;
    case 'paramLow':
      return 5;
  }

  return 0;
};

export class WasmTrackerEngine implements TrackerEngine {
  private module: Pt2Module | null = null;
  private config: EngineConfig | null = null;
  private snapshot: TrackerSnapshot | null = null;
  private listeners = new Set<(event: EngineEvent) => void>();
  private scopeBufferSupported = true;
  private scopeJsonSupported = true;
  private liveStateBufferSupported = true;
  private liveStateFallbackVersion = 0;
  private scopeFallbackVersion = 0;
  private quadrascopeCache: QuadrascopeState | null = null;
  private quadrascopeVersion = -1;
  private classicRenderingActive: boolean | null = null;

  async init(config: EngineConfig): Promise<void> {
    this.config = config;
    this.module = await moduleFactory({
      canvas: config.canvas,
      locateFile: (path: string) => new URL(`../wasm/${path}`, import.meta.url).href,
      printErr: (message: string) => {
        this.emitStatus(message, 'warn');
      },
    });

    ensureDir(this.module, config.workspaceRoot);

    if (this.module.IDBFS) {
      this.module.FS.mount(this.module.IDBFS, {}, config.workspaceRoot);
      await syncFs(this.module, true);
    }

    ensureDir(this.module, `${config.workspaceRoot}/imports`);
    ensureDir(this.module, `${config.workspaceRoot}/exports`);
    this.module.FS.chdir('/');

    const bootResult = this.callNumber('pt2_web_engine_boot', [], []);
    if (bootResult !== 1) {
      throw new Error('The wasm core is missing the planned engine adapter API.');
    }

    this.snapshot = this.getSnapshot();
    try {
      this.snapshot.quadrascope = this.getQuadrascope() ?? this.snapshot.quadrascope;
    } catch (error) {
      this.scopeBufferSupported = false;
      this.emitStatus(
        error instanceof Error
          ? `Quadrascope buffer disabled: ${error.message}`
          : 'Quadrascope buffer disabled.',
        'warn',
      );
    }
  }

  async dispose(): Promise<void> {
    this.listeners.clear();
    this.module = null;
    this.config = null;
    this.snapshot = null;
  }

  async loadModule(file: Uint8Array, name: string): Promise<void> {
    const module = this.requireModule();
    const path = `${this.requireConfig().workspaceRoot}/imports/${name}`;
    module.FS.writeFile(path, file);
    await this.syncWorkspace();
    this.callNumber('pt2_web_engine_load_module', ['string'], [path]);
    this.emitSnapshot(this.getSnapshot());
  }

  async saveModule(): Promise<ExportedFile> {
    const module = this.requireModule();
    const path = this.callString('pt2_web_engine_save_module', ['string'], [`${this.requireConfig().workspaceRoot}/exports`]);
    return {
      filename: path.split('/').pop() ?? 'module.mod',
      mimeType: 'application/octet-stream',
      bytes: module.FS.readFile(path),
    };
  }

  async loadSample(file: Uint8Array, name: string): Promise<void> {
    const module = this.requireModule();
    const path = `${this.requireConfig().workspaceRoot}/imports/${name}`;
    module.FS.writeFile(path, file);
    await this.syncWorkspace();
    this.callNumber('pt2_web_engine_load_sample', ['string'], [path]);
    this.emitSnapshot(this.getSnapshot());
  }

  async saveSample(slot: number, format: SampleExportFormat): Promise<ExportedFile> {
    const module = this.requireModule();
    const path = this.callString(
      'pt2_web_engine_save_sample',
      ['number', 'string', 'string'],
      [slot, format, `${this.requireConfig().workspaceRoot}/exports`],
    );
    return {
      filename: path.split('/').pop() ?? `sample-${slot + 1}.${format}`,
      mimeType: format === 'wav' ? 'audio/wav' : 'application/octet-stream',
      bytes: module.FS.readFile(path),
    };
  }

  importSample(slot: number, sample: ImportedSample): void {
    const module = this.requireModule();
    const length = sample.data.length;
    const pointer = this.callNumber('malloc', ['number'], [length > 0 ? length : 1]);
    try {
      if (length > 0) {
        module.HEAP8.set(sample.data, pointer);
      } else {
        module.HEAP8[pointer] = 0;
      }

      this.callVoid(
        'pt2_web_engine_import_sample_buffer',
        ['number', 'string', 'number', 'number', 'number', 'number', 'number', 'number'],
        [
          slot,
          sample.name,
          sample.volume,
          sample.fineTune,
          sample.loopStart,
          sample.loopLength,
          pointer,
          length,
        ],
      );
    } finally {
      this.callVoid('free', ['number'], [pointer]);
    }

    this.emitSnapshot(this.getSnapshot());
  }

  setClassicRenderingActive(active: boolean): void {
    if (this.classicRenderingActive === active) {
      return;
    }

    this.classicRenderingActive = active;
    this.callVoid('pt2_web_engine_set_classic_rendering_active', ['number'], [active ? 1 : 0]);
    if (active) {
      this.callVoid('pt2_web_engine_force_redraw', [], []);
    }
  }

  dispatch(command: TrackerCommand): void {
    const snapshot = this.snapshot ?? this.getSnapshot();

    switch (command.type) {
      case 'song/new':
        this.callVoid('pt2_web_engine_new_song', [], []);
        break;
      case 'song/set-title':
        this.callVoid('pt2_web_engine_set_title', ['string'], [command.title]);
        break;
      case 'song/set-position':
        this.callVoid('pt2_web_engine_set_position', ['number'], [command.position]);
        break;
      case 'song/set-bpm':
        this.callVoid('pt2_web_engine_set_bpm', ['number'], [command.bpm]);
        break;
      case 'song/set-speed':
        this.callVoid('pt2_web_engine_set_speed', ['number'], [command.speed]);
        break;
      case 'song/set-pattern':
        this.callVoid('pt2_web_engine_set_pattern', ['number'], [command.pattern]);
        break;
      case 'song/adjust-length':
        this.callVoid('pt2_web_engine_adjust_song_length', ['number'], [command.delta]);
        break;
      case 'editor/set-edit-mode':
        this.callVoid('pt2_web_engine_set_edit_mode', ['number'], [command.enabled ? 1 : 0]);
        break;
      case 'channel/toggle-mute':
        this.callVoid('pt2_web_engine_toggle_mute_channel', ['number'], [command.channel]);
        break;
      case 'cursor/set':
        this.callVoid(
          'pt2_web_engine_set_cursor',
          ['number', 'number', 'number'],
          [command.row, command.channel, fieldToNumber(command.field ?? snapshot.cursor.field)],
        );
        break;
      case 'cursor/move':
        this.callVoid(
          'pt2_web_engine_move_cursor',
          ['number', 'number', 'number'],
          [command.rowDelta ?? 0, command.channelDelta ?? 0, command.fieldDelta ?? 0],
        );
        break;
      case 'pattern/set-cell': {
        const currentCell = this.getPatternCell(snapshot, command.row, command.channel);
        const nextCell = {
          note: command.patch.note ?? currentCell.note,
          sample: command.patch.sample ?? currentCell.sample,
          effect: command.patch.effect ?? currentCell.effect,
          param: command.patch.param ?? currentCell.param,
        };

        this.callVoid(
          'pt2_web_engine_set_cell',
          ['number', 'number', 'string', 'number', 'string', 'string'],
          [
            command.row,
            command.channel,
            nextCell.note ?? '',
            nextCell.sample ?? -1,
            nextCell.effect ?? '',
            nextCell.param ?? '',
          ],
        );
        break;
      }
      case 'pattern/clear-cell':
        this.callVoid('pt2_web_engine_clear_cell', ['number', 'number'], [command.row, command.channel]);
        break;
      case 'sample/select':
        this.callVoid('pt2_web_engine_select_sample', ['number'], [command.sample]);
        break;
      case 'sample/update': {
        const currentSample = snapshot.samples[command.sample];
        if (!currentSample) {
          break;
        }

        const nextSample = {
          ...currentSample,
          ...command.patch,
        };

        this.callVoid(
          'pt2_web_engine_update_sample',
          ['number', 'string', 'number', 'number', 'number', 'number', 'number'],
          [
            command.sample,
            nextSample.name,
            nextSample.volume,
            nextSample.fineTune,
            nextSample.length,
            nextSample.loopStart,
            nextSample.loopLength,
          ],
        );
        break;
      }
      case 'sample-editor/open':
        this.callVoid('pt2_web_engine_open_sample_editor', ['number'], [command.sample ?? snapshot.selectedSample]);
        break;
      case 'sample-editor/close':
        this.callVoid('pt2_web_engine_close_sample_editor', [], []);
        break;
      case 'sample-editor/show-all':
        this.callVoid('pt2_web_engine_sample_show_all', [], []);
        break;
      case 'sample-editor/show-selection':
        this.callVoid('pt2_web_engine_sample_show_selection', [], []);
        break;
      case 'sample-editor/zoom-in':
        this.callVoid('pt2_web_engine_sample_zoom_in', ['number'], [command.anchor]);
        break;
      case 'sample-editor/zoom-out':
        this.callVoid('pt2_web_engine_sample_zoom_out', ['number'], [command.anchor]);
        break;
      case 'sample-editor/set-view':
        this.callVoid('pt2_web_engine_sample_set_view', ['number', 'number'], [command.start, command.length]);
        break;
      case 'sample-editor/set-selection':
        this.callVoid(
          'pt2_web_engine_sample_set_selection',
          ['number', 'number'],
          [command.start ?? -1, command.end ?? -1],
        );
        break;
      case 'sample-editor/set-loop':
        this.callVoid(
          'pt2_web_engine_sample_set_loop',
          ['number', 'number'],
          [typeof command.start === 'number' ? command.start : -1, typeof command.end === 'number' ? command.end : -1],
        );
        break;
      case 'sample-editor/toggle-loop':
        this.callVoid('pt2_web_engine_sample_toggle_loop', ['number'], [command.enabled ? 1 : 0]);
        break;
      case 'sample-editor/crop':
        this.callVoid('pt2_web_engine_sample_crop', [], []);
        break;
      case 'sample-editor/cut':
        this.callVoid('pt2_web_engine_sample_cut', [], []);
        break;
      case 'sample-editor/play':
        this.callVoid('pt2_web_engine_sample_play', ['number'], [command.mode === 'selection' ? 2 : command.mode === 'view' ? 1 : 0]);
        break;
      case 'audio/cycle-mode':
        this.callVoid('pt2_web_engine_cycle_audio_mode', [], []);
        break;
      case 'note-preview/play':
        this.callVoid('pt2_web_engine_preview_note', ['string', 'number'], [command.note, command.channel]);
        break;
      case 'note-preview/stop':
        this.callVoid('pt2_web_engine_preview_note_stop', [], []);
        break;
    }

    this.emitSnapshotForTrackerCommand(command.type);
  }

  setTransport(command: TransportCommand): void {
    const snapshot = this.snapshot ?? this.getSnapshot();

    switch (command.type) {
      case 'transport/play-song':
        this.callVoid('pt2_web_engine_transport_play_song', [], []);
        break;
      case 'transport/play-pattern':
        this.callVoid('pt2_web_engine_transport_play_pattern', [], []);
        break;
      case 'transport/pause':
        this.callVoid('pt2_web_engine_transport_pause', [], []);
        break;
      case 'transport/stop':
        this.callVoid('pt2_web_engine_transport_stop', [], []);
        break;
      case 'transport/toggle':
        if (snapshot.transport.playing) {
          this.callVoid('pt2_web_engine_transport_pause', [], []);
        } else if (snapshot.transport.mode === 'pattern') {
          this.callVoid('pt2_web_engine_transport_play_pattern', [], []);
        } else {
          this.callVoid('pt2_web_engine_transport_play_song', [], []);
        }
        break;
    }

    this.emitSnapshot(this.getSnapshot());
  }

  refreshLayout(): void {
    this.callVoid('pt2_web_engine_refresh_layout', [], []);
  }

  forwardClassicPointerMove(x: number, y: number, buttons: number): void {
    this.callVoid('pt2_web_engine_pointer_move', ['number', 'number', 'number'], [x, y, buttons]);
  }

  forwardClassicPointerButton(x: number, y: number, button: number, pressed: boolean, buttons: number): void {
    this.callVoid(
      'pt2_web_engine_pointer_button',
      ['number', 'number', 'number', 'number', 'number'],
      [x, y, button, pressed ? 1 : 0, buttons],
    );
  }

  forwardClassicKeyDown(scancode: number, keycode: number, shift: boolean, ctrl: boolean, alt: boolean, meta: boolean): void {
    this.callVoid(
      'pt2_web_engine_key_down',
      ['number', 'number', 'number', 'number', 'number', 'number'],
      [scancode, keycode, shift ? 1 : 0, ctrl ? 1 : 0, alt ? 1 : 0, meta ? 1 : 0],
    );
  }

  forwardClassicKeyUp(scancode: number, keycode: number, shift: boolean, ctrl: boolean, alt: boolean, meta: boolean): void {
    this.callVoid(
      'pt2_web_engine_key_up',
      ['number', 'number', 'number', 'number', 'number', 'number'],
      [scancode, keycode, shift ? 1 : 0, ctrl ? 1 : 0, alt ? 1 : 0, meta ? 1 : 0],
    );
  }

  forwardClassicTextInput(text: string): void {
    if (!text) {
      return;
    }

    this.callVoid('pt2_web_engine_text_input', ['string'], [text]);
  }

  getSnapshot(): TrackerSnapshot {
    const json = this.callString('pt2_web_engine_snapshot_json', [], []);
    this.snapshot = JSON.parse(json) as TrackerSnapshot;
    if (this.snapshot.quadrascope && typeof this.snapshot.quadrascope.version !== 'number') {
      this.scopeFallbackVersion += 1;
      this.snapshot.quadrascope.version = this.scopeFallbackVersion;
    }
    return this.snapshot;
  }

  getLiveState(): TrackerLiveState | null {
    if (!this.liveStateBufferSupported) {
      return this.getLiveStateFallback();
    }

    try {
      const module = this.requireModule();
      const pointer = this.callNumber('pt2_web_engine_live_state_buffer', [], []);
      const length = this.callNumber('pt2_web_engine_live_state_buffer_length', [], []);
      if (pointer < 0 || length < 40) {
        this.liveStateBufferSupported = false;
        this.emitStatus('Live-state buffer disabled: invalid buffer metadata.', 'warn');
        return this.getLiveStateFallback();
      }

      const view = new DataView(module.HEAPU8.buffer, pointer, length);
      const version = view.getUint32(0, true);
      const flags = view.getUint32(4, true);
      const audioMode = decodeAudioMode(view.getInt32(8, true));
      return {
        version,
        playing: (flags & LIVE_STATE_FLAG_PLAYING) !== 0,
        mode: (flags & LIVE_STATE_FLAG_PATTERN_MODE) !== 0 ? 'pattern' : 'song',
        audioMode,
        stereo: audioMode !== 'mono',
        mutedMask: view.getInt32(12, true),
        bpm: view.getInt32(16, true),
        speed: view.getInt32(20, true),
        elapsedSeconds: view.getInt32(24, true),
        row: view.getInt32(28, true),
        pattern: view.getInt32(32, true),
        position: view.getInt32(36, true),
      };
    } catch (error) {
      this.liveStateBufferSupported = false;
      this.emitStatus(
        error instanceof Error
          ? `Live-state buffer disabled: ${error.message}`
          : 'Live-state buffer disabled.',
        'warn',
      );
      return this.getLiveStateFallback();
    }
  }

  getQuadrascope(): QuadrascopeState | null {
    if (!this.scopeBufferSupported) {
      return this.getQuadrascopeFromJson();
    }

    try {
      const module = this.requireModule();
      const pointer = this.callNumber('pt2_web_engine_scope_buffer', [], []);
      const length = this.callNumber('pt2_web_engine_scope_buffer_length', [], []);
      const headerSize = 4;
      const channelStride = 66;
      if (pointer < 0 || length < headerSize + channelStride) {
        return this.getQuadrascopeFromJson();
      }

      const view = new DataView(module.HEAPU8.buffer, pointer, length);
      const version = view.getUint32(0, true);
      if (this.quadrascopeCache && this.quadrascopeVersion === version) {
        if (this.snapshot) {
          this.snapshot.quadrascope = this.quadrascopeCache;
        }
        return this.quadrascopeCache;
      }

      const payloadLength = length - headerSize;
      const channelCount = Math.floor(payloadLength / channelStride);
      let quadrascope = this.quadrascopeCache;
      if (!quadrascope || quadrascope.channels.length !== channelCount) {
        quadrascope = {
          version,
          channels: Array.from({ length: channelCount }, () => ({
            active: false,
            volume: 0,
            sample: Array.from({ length: 64 }, () => 0),
          })),
        };
        this.quadrascopeCache = quadrascope;
      }

      const heap = module.HEAP8;
      for (let index = 0; index < channelCount; index += 1) {
        const base = pointer + headerSize + (index * channelStride);
        const channel = quadrascope.channels[index];
        channel.active = heap[base] !== 0;
        channel.volume = module.HEAPU8[base + 1] ?? 0;
        const samples = channel.sample;
        for (let point = 0; point < 64; point += 1) {
          samples[point] = heap[base + 2 + point] ?? 0;
        }
      }

      quadrascope.version = version;
      this.quadrascopeVersion = version;
      if (this.snapshot) {
        this.snapshot.quadrascope = quadrascope;
      }

      return quadrascope;
    } catch (error) {
      this.scopeBufferSupported = false;
      this.emitStatus(
        error instanceof Error
          ? `Quadrascope buffer disabled: ${error.message}`
          : 'Quadrascope buffer disabled.',
        'warn',
      );
      return this.getQuadrascopeFromJson();
    }
  }

  getSampleWaveform(sample: number): Int8Array | null {
    const module = this.requireModule();
    try {
      const pointer = this.callNumber('pt2_web_engine_sample_buffer', ['number'], [sample]);
      const length = this.callNumber('pt2_web_engine_sample_buffer_length', ['number'], [sample]);
      if (pointer >= 0 && length > 0) {
        return module.HEAP8.slice(pointer, pointer + length);
      }
    } catch {
      // Fall back to raw export below if the direct sample buffer path is unavailable.
    }

    const path = this.callString(
      'pt2_web_engine_save_sample',
      ['number', 'string', 'string'],
      [sample, 'raw', `${this.requireConfig().workspaceRoot}/exports`],
    );
    if (!path) {
      return null;
    }

    const bytes = module.FS.readFile(path);
    return Int8Array.from(bytes, (value) => (value << 24) >> 24);
  }

  private getQuadrascopeFromJson(): QuadrascopeState | null {
    if (!this.scopeJsonSupported) {
      return this.snapshot?.quadrascope ?? null;
    }

    try {
      const json = this.callString('pt2_web_engine_scope_json', [], []);
      if (!json) {
        return this.snapshot?.quadrascope ?? null;
      }

      const quadrascope = JSON.parse(json) as QuadrascopeState;
      if (typeof quadrascope.version !== 'number') {
        this.scopeFallbackVersion += 1;
        quadrascope.version = this.scopeFallbackVersion;
      }
      if (this.snapshot) {
        this.snapshot.quadrascope = quadrascope;
      }

      return quadrascope;
    } catch (error) {
      this.scopeJsonSupported = false;
      this.emitStatus(
        error instanceof Error
          ? `Quadrascope JSON fallback disabled: ${error.message}`
          : 'Quadrascope JSON fallback disabled.',
        'warn',
      );
      return this.snapshot?.quadrascope ?? null;
    }
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    if (this.module) {
      listener({ type: 'snapshot', snapshot: this.getSnapshot() });
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitSnapshot(snapshot: TrackerSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener({ type: 'snapshot', snapshot });
    }
  }

  private emitStatus(message: string, level: 'info' | 'warn' | 'error'): void {
    for (const listener of this.listeners) {
      listener({ type: 'status', message, level });
    }
  }

  private callNumber(name: string, argTypes: string[], args: unknown[]): number {
    return this.requireModule().ccall<number>(name, 'number', argTypes, args);
  }

  private callString(name: string, argTypes: string[], args: unknown[]): string {
    return this.requireModule().ccall<string>(name, 'string', argTypes, args);
  }

  private callVoid(name: string, argTypes: string[], args: unknown[]): void {
    this.requireModule().ccall(name, null, argTypes, args);
  }

  private emitSnapshotForTrackerCommand(commandType: TrackerCommand['type']): void {
    if (this.isLiveStateTrackerCommand(commandType)) {
      const nextSnapshot = this.applyLiveStateToSnapshot(this.getLiveState());
      if (nextSnapshot) {
        this.emitSnapshot(nextSnapshot);
        return;
      }
    }

    this.emitSnapshot(this.getSnapshot());
  }

  private async syncWorkspace(): Promise<void> {
    const module = this.requireModule();
    if (module.IDBFS) {
      await syncFs(module, false);
    }
  }

  private requireModule(): Pt2Module {
    if (!this.module) {
      throw new Error('The wasm engine has not been initialized.');
    }

    return this.module;
  }

  private requireConfig(): EngineConfig {
    if (!this.config) {
      throw new Error('The wasm engine is missing its configuration.');
    }

    return this.config;
  }

  private getPatternCell(snapshot: TrackerSnapshot, row: number, channel: number): PatternCell {
    return snapshot.pattern.rows[row]?.channels[channel] ?? {
      note: null,
      sample: null,
      effect: null,
      param: null,
    };
  }

  private isLiveStateTrackerCommand(commandType: TrackerCommand['type']): boolean {
    return commandType === 'channel/toggle-mute' || commandType === 'audio/cycle-mode';
  }

  private getLiveStateFallback(): TrackerLiveState | null {
    const snapshot = this.getSnapshot();
    this.liveStateFallbackVersion += 1;
    return this.snapshotToLiveState(snapshot, this.liveStateFallbackVersion);
  }

  private applyLiveStateToSnapshot(liveState: TrackerLiveState | null): TrackerSnapshot | null {
    const snapshot = this.snapshot;
    if (!snapshot || !liveState) {
      return snapshot ?? null;
    }

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

    return snapshot;
  }

  private snapshotToLiveState(snapshot: TrackerSnapshot, version = 0): TrackerLiveState {
    let mutedMask = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      if (snapshot.editor.muted[channel]) {
        mutedMask |= 1 << channel;
      }
    }

    return {
      version,
      playing: snapshot.transport.playing,
      mode: snapshot.transport.mode,
      audioMode: snapshot.audio.mode,
      stereo: snapshot.audio.stereo,
      mutedMask,
      bpm: snapshot.transport.bpm,
      speed: snapshot.transport.speed,
      elapsedSeconds: snapshot.transport.elapsedSeconds,
      row: snapshot.transport.row,
      pattern: snapshot.transport.pattern,
      position: snapshot.transport.position,
    };
  }
}

