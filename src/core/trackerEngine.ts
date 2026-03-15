import type {
  EngineConfig,
  EngineEvent,
  ExportedFile,
  QuadrascopeState,
  SampleExportFormat,
  TrackerCommand,
  TrackerSnapshot,
  TransportCommand,
} from './trackerTypes';

export interface TrackerEngine {
  init(config: EngineConfig): Promise<void>;
  dispose(): Promise<void>;
  loadModule(file: Uint8Array, name: string): Promise<void>;
  saveModule(): Promise<ExportedFile>;
  loadSample(file: Uint8Array, name: string): Promise<void>;
  saveSample(slot: number, format: SampleExportFormat): Promise<ExportedFile>;
  dispatch(command: TrackerCommand): void;
  setTransport(command: TransportCommand): void;
  refreshLayout(): void;
  forwardClassicPointerMove(x: number, y: number, buttons: number): void;
  forwardClassicPointerButton(x: number, y: number, button: number, pressed: boolean, buttons: number): void;
  forwardClassicKeyDown(scancode: number, keycode: number, shift: boolean, ctrl: boolean, alt: boolean, meta: boolean): void;
  forwardClassicKeyUp(scancode: number, keycode: number, shift: boolean, ctrl: boolean, alt: boolean, meta: boolean): void;
  forwardClassicTextInput(text: string): void;
  getSnapshot(): TrackerSnapshot;
  getQuadrascope(): QuadrascopeState | null;
  getSampleWaveform(sample: number): Int8Array | null;
  subscribe(listener: (event: EngineEvent) => void): () => void;
}
