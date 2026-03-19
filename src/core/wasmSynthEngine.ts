import { SYNTH_PARAM_INDEX, SYNTH_PRESETS, SYNTH_PARAMETERS, applyPresetToPatch, createInitialSynthSnapshot } from './synthConfig';
import { buildRenderedSampleFromCapture, createWaveformPreview, stereoToMono, type CapturedPreviewAudio } from './synthAudioUtils';
import type {
  SynthParamId,
  RenderJob,
  RenderedSample,
  SynthCommand,
  SynthEvent,
  SynthSnapshot,
  SynthTelemetryCurveId,
  SynthTelemetrySnapshot,
  SynthTelemetryTapId,
} from './synthTypes';
import type { SynthEngine } from './synthEngine';
import { SynthPreviewDriver } from './synthPreviewDriver';

type SynthModule = {
  HEAP8?: Int8Array;
  HEAPF32?: Float32Array;
  ccall: <T>(ident: string, returnType: string | null, argTypes: string[], args: unknown[]) => T;
};

type SynthModuleFactory = (options: Record<string, unknown>) => Promise<SynthModule>;
type EmscriptenInstantiateCallback = (instance: WebAssembly.Instance, module: WebAssembly.Module) => void;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const TELEMETRY_HEADER_SIZE = 16;
const TELEMETRY_POINTS = 96;
const TELEMETRY_TAP_IDS: SynthTelemetryTapId[] = ['oscA', 'oscB', 'mix', 'filter', 'drive', 'amp', 'master'];
const TELEMETRY_CURVE_IDS: SynthTelemetryCurveId[] = ['ampEnv', 'filterEnv', 'lfo', 'filterResponse'];
const SYNTH_WASM_JS_URL = '/wasm-synth/synthcore.js';
const SYNTH_WASM_BINARY_URL = '/wasm-synth/synthcore.wasm';

const normalizeWasmImports = (imports: WebAssembly.Imports): WebAssembly.Imports => {
  const normalized = { ...imports } as Record<string, unknown>;
  const envModule = normalized.env;
  const minifiedModule = normalized.a;

  if (!envModule && minifiedModule) {
    normalized.env = minifiedModule;
  }

  if (!minifiedModule && envModule) {
    normalized.a = envModule;
  }

  return normalized as WebAssembly.Imports;
};

const fetchSynthWasmBinary = async (): Promise<ArrayBuffer> => {
  const response = await fetch(SYNTH_WASM_BINARY_URL, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Unable to fetch synth wasm binary: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
};

const loadSynthModuleFactory = async (): Promise<SynthModuleFactory> => {
  const dynamicImport = new Function('path', 'return import(path);') as (path: string) => Promise<{ default?: SynthModuleFactory }>;
  const imported = await dynamicImport(SYNTH_WASM_JS_URL);
  const factory = imported.default as SynthModuleFactory | undefined;
  if (!factory) {
    throw new Error('The synth wasm module did not expose a default factory.');
  }

  return factory;
};

export class WasmSynthEngine implements SynthEngine {
  private module: SynthModule | null = null;
  private snapshot: SynthSnapshot = createInitialSynthSnapshot();
  private listeners = new Set<(event: SynthEvent) => void>();
  private previewDriver: SynthPreviewDriver | null = null;
  private recordedAudio: CapturedPreviewAudio | null = null;
  private telemetry: SynthTelemetrySnapshot | null = null;

  async init(): Promise<void> {
    const factory = await loadSynthModuleFactory();
    const wasmBinary = await fetchSynthWasmBinary();
    const wasmBytes = new Uint8Array(wasmBinary);
    this.module = await factory({
      locateFile: (path: string) => `/wasm-synth/${path}`,
      wasmBinary: wasmBytes,
      instantiateWasm: (imports: WebAssembly.Imports, receiveInstance: EmscriptenInstantiateCallback) => {
        const normalizedImports = normalizeWasmImports(imports);
        const module = new WebAssembly.Module(wasmBinary);
        const instance = new WebAssembly.Instance(module, normalizedImports);
        receiveInstance(instance, module);
        return instance.exports;
      },
    });

    const booted = this.callNumber('pt2_synth_boot', [], []);
    if (booted !== 1) {
      throw new Error('The synth wasm core boot sequence failed.');
    }

    this.runSelfTest();
    this.previewDriver = new SynthPreviewDriver(
      (frameCount, sampleRate) => this.renderPreviewFrames(frameCount, sampleRate),
      {
        onSampleRateChange: (sampleRate) => {
          this.snapshot.previewSampleRate = Math.round(sampleRate);
          this.snapshot.status = `Preview ready at ${Math.round(sampleRate)} Hz.`;
          this.emitSnapshot();
        },
        onRenderError: (error) => {
          this.snapshot.backendError = error.message;
          this.snapshot.status = `Synth preview error: ${error.message}`;
          this.emitSnapshot();
        },
      },
    );
    this.snapshot = {
      ...createInitialSynthSnapshot(),
      backend: 'wasm',
      backendStatus: 'ready',
      backendError: null,
      ready: true,
      status: 'Sample Creator ready.',
    };
    this.pushFullPatchToModule();
    this.refreshTelemetry();
    this.emitSnapshot();
  }

  async dispose(): Promise<void> {
    this.listeners.clear();
    if (this.previewDriver) {
      await this.previewDriver.dispose();
      this.previewDriver = null;
    }
    this.module = null;
  }

  dispatch(command: SynthCommand): void {
    switch (command.type) {
      case 'synth/select': {
        const next = applyPresetToPatch(command.synth, SYNTH_PRESETS.find((preset) => preset.synth === command.synth)?.id ?? '');
        this.snapshot.selectedSynth = command.synth;
        this.snapshot.selectedPresetId = next.presetId;
        this.snapshot.patch = next.patch;
        this.snapshot.activeNotes = [];
        this.recordedAudio = null;
        this.snapshot.recordState = 'idle';
        this.snapshot.recordedWaveform = null;
        this.callVoid('pt2_synth_set_synth', ['number'], [command.synth === 'acid303' ? 1 : 0]);
        this.pushFullPatchToModule();
        this.refreshTelemetry();
        this.snapshot.status = `Loaded ${command.synth === 'acid303' ? 'Acid303' : 'CoreSub'}.`;
        break;
      }
      case 'preset/load': {
        const next = applyPresetToPatch(this.snapshot.selectedSynth, command.presetId);
        this.snapshot.selectedPresetId = next.presetId;
        this.snapshot.patch = next.patch;
        this.pushFullPatchToModule();
        this.refreshTelemetry();
        this.snapshot.status = `Preset ${SYNTH_PRESETS.find((preset) => preset.id === next.presetId)?.name ?? 'loaded'}.`;
        break;
      }
      case 'param/set': {
        const value = clamp(command.value, SYNTH_PARAMETERS[command.id].min, SYNTH_PARAMETERS[command.id].max);
        this.snapshot.patch[command.id] = value;
        this.setModuleParameter(command.id, value);
        this.refreshTelemetry();
        this.snapshot.status = `${SYNTH_PARAMETERS[command.id].label} updated.`;
        break;
      }
      case 'preview/note-on':
        void this.previewDriver?.ensureStarted().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.snapshot.backendError = message;
          this.snapshot.status = `Synth preview error: ${message}`;
          this.emitSnapshot();
        });
        this.callVoid('pt2_synth_note_on', ['number', 'number'], [command.midiNote, clamp(command.velocity ?? 1, 0.05, 1)]);
        this.refreshTelemetry();
        this.snapshot.activeNotes = Array.from(new Set([...this.snapshot.activeNotes, command.midiNote])).sort((a, b) => a - b);
        this.snapshot.status = `Preview note ${command.midiNote} playing.`;
        break;
      case 'preview/note-off':
        this.callVoid('pt2_synth_note_off', ['number'], [command.midiNote]);
        this.refreshTelemetry();
        this.snapshot.activeNotes = this.snapshot.activeNotes.filter((note) => note !== command.midiNote);
        break;
      case 'preview/panic':
        this.callVoid('pt2_synth_panic', [], []);
        this.refreshTelemetry();
        this.snapshot.activeNotes = [];
        this.snapshot.status = 'Preview stopped.';
        void this.previewDriver?.suspend();
        break;
      case 'bake-rate/set':
        this.snapshot.bakeSampleRate = clamp(command.sampleRate, 11025, 48000);
        break;
      case 'record/start':
        this.recordedAudio = null;
        this.snapshot.recordState = 'recording';
        this.snapshot.recordedWaveform = null;
        this.snapshot.recordedDurationSeconds = 0;
        this.snapshot.recordedPeak = 0;
        this.previewDriver?.startRecording();
        this.snapshot.status = 'Recording synth preview...';
        break;
      case 'record/stop': {
        const capture = this.previewDriver?.stopRecording() ?? null;
        this.applyCapture(capture);
        break;
      }
      case 'record/discard':
        this.previewDriver?.discardRecording();
        this.recordedAudio = null;
        this.snapshot.recordState = 'idle';
        this.snapshot.recordedWaveform = null;
        this.snapshot.recordedDurationSeconds = 0;
        this.snapshot.recordedPeak = 0;
        this.snapshot.status = 'Recorded preview discarded.';
        break;
      case 'target-slot/set':
        this.snapshot.targetSampleSlot = clamp(command.slot, 0, 30);
        break;
      case 'input-arm/set':
        this.snapshot.inputArm = command.target;
        break;
      case 'midi/set-available':
        this.snapshot.midiAvailable = command.available;
        break;
    }

    this.emitSnapshot();
  }

  getSnapshot(): SynthSnapshot {
    return structuredClone(this.snapshot);
  }

  getTelemetry(): SynthTelemetrySnapshot | null {
    return this.telemetry;
  }

  async renderSample(job: RenderJob): Promise<RenderedSample> {
    this.callVoid(
      'pt2_synth_render_sample',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [
        job.midiNote,
        clamp(job.velocity, 0.05, 1),
        job.durationSeconds,
        job.tailSeconds,
        job.sampleRate,
        job.normalize ? 1 : 0,
        job.fadeOut ? 1 : 0,
      ],
    );

    const pointer = this.callNumber('pt2_synth_sample_buffer', [], []);
    const length = this.callNumber('pt2_synth_sample_buffer_length', [], []);
    const module = this.requireModule();
    const heap8 = module.HEAP8;
    if (!heap8) {
      throw new Error('The synth wasm runtime did not expose HEAP8.');
    }
    if (length <= 0) {
      throw new Error('The synth wasm core returned an empty sample buffer.');
    }

    const data = heap8.slice(pointer, pointer + length);

    let peak = 0;
    for (const value of data) {
      peak = Math.max(peak, Math.abs(value / 127));
    }

    const loopStart = clamp(job.loopStart & ~1, 0, Math.max(0, data.length - 2));
    const rendered: RenderedSample = {
      name: job.sampleName.slice(0, 22),
      data,
      volume: clamp(job.volume, 0, 64),
      fineTune: clamp(job.fineTune, -8, 7),
      loopStart,
      loopLength: clamp(job.loopLength & ~1, 2, Math.max(2, data.length - loopStart)),
      sampleRate: job.sampleRate,
      peak,
      midiNote: job.midiNote,
    };

    this.snapshot.lastRender = rendered;
    this.snapshot.status = `Rendered ${rendered.name} from ${this.snapshot.selectedSynth === 'acid303' ? 'Acid303' : 'CoreSub'}.`;
    this.refreshTelemetry();
    this.emitSnapshot();
    return rendered;
  }

  getRecordedSample(job: RenderJob): RenderedSample | null {
    if (!this.recordedAudio) {
      return null;
    }

    const rendered = buildRenderedSampleFromCapture(this.recordedAudio, job);
    if (!rendered) {
      return null;
    }

    this.snapshot.lastRender = rendered;
    this.snapshot.status = `Committed recorded preview to ${rendered.name}.`;
    this.emitSnapshot();
    return rendered;
  }

  subscribe(listener: (event: SynthEvent) => void): () => void {
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

  private pushFullPatchToModule(): void {
    this.callVoid('pt2_synth_set_synth', ['number'], [this.snapshot.selectedSynth === 'acid303' ? 1 : 0]);
    for (const [id, value] of Object.entries(this.snapshot.patch) as Array<[SynthParamId, number]>) {
      this.setModuleParameter(id, value);
    }
    this.refreshTelemetry();
  }

  private setModuleParameter(id: SynthParamId, value: number): void {
    const index = SYNTH_PARAM_INDEX.get(id);
    if (typeof index === 'number') {
      this.callVoid('pt2_synth_set_param', ['number', 'number'], [index, value]);
    }
  }

  private renderPreviewFrames(frameCount: number, sampleRate: number): Float32Array {
    const module = this.requireModule();
    this.callVoid('pt2_synth_render_preview', ['number', 'number'], [frameCount, sampleRate]);
    this.refreshTelemetry();
    const pointer = this.callNumber('pt2_synth_preview_buffer', [], []);
    const length = this.callNumber('pt2_synth_preview_buffer_length', [], []);
    const heapF32 = module.HEAPF32;
    if (!heapF32) {
      throw new Error('The synth wasm runtime did not expose HEAPF32.');
    }

    return heapF32.slice(pointer >> 2, (pointer >> 2) + length);
  }

  private runSelfTest(): void {
    const module = this.requireModule();
    if (!module.HEAP8 || !module.HEAPF32) {
      throw new Error('The synth wasm runtime did not expose the expected memory views.');
    }

    this.callVoid('pt2_synth_render_preview', ['number', 'number'], [64, 48000]);
    const pointer = this.callNumber('pt2_synth_preview_buffer', [], []);
    const length = this.callNumber('pt2_synth_preview_buffer_length', [], []);
    if (pointer <= 0 || length <= 0) {
      throw new Error('The synth wasm core did not expose a readable preview buffer.');
    }

    const preview = module.HEAPF32.slice(pointer >> 2, (pointer >> 2) + length);
    if (preview.length !== length) {
      throw new Error('The synth wasm preview buffer length was invalid.');
    }
  }

  private applyCapture(capture: CapturedPreviewAudio | null): void {
    this.recordedAudio = capture;
    if (!capture) {
      this.snapshot.recordState = 'idle';
      this.snapshot.status = 'No recorded preview captured.';
      this.emitSnapshot();
      return;
    }

    const mono = stereoToMono(capture.interleavedStereo);
    let peak = 0;
    for (const sample of mono) {
      peak = Math.max(peak, Math.abs(sample));
    }

    this.snapshot.recordState = 'captured';
    this.snapshot.recordedWaveform = createWaveformPreview(mono);
    this.snapshot.recordedDurationSeconds = mono.length / capture.sampleRate;
    this.snapshot.recordedPeak = peak;
    this.snapshot.status = 'Recorded preview captured.';
    this.emitSnapshot();
  }

  private callNumber(name: string, argTypes: string[], args: unknown[]): number {
    return this.requireModule().ccall<number>(name, 'number', argTypes, args);
  }

  private callVoid(name: string, argTypes: string[], args: unknown[]): void {
    this.requireModule().ccall(name, null, argTypes, args);
  }

  private requireModule(): SynthModule {
    if (!this.module) {
      throw new Error('The synth engine has not been initialized.');
    }

    return this.module;
  }

  private refreshTelemetry(): void {
    const module = this.requireModule();
    const pointer = this.callNumber('pt2_synth_telemetry_buffer', [], []);
    const length = this.callNumber('pt2_synth_telemetry_buffer_length', [], []);
    const heapF32 = module.HEAPF32;
    if (!heapF32 || pointer <= 0 || length <= TELEMETRY_HEADER_SIZE) {
      return;
    }

    const view = heapF32.slice(pointer >> 2, (pointer >> 2) + length);
    const version = Math.round(view[0] ?? 0);
    if (this.telemetry && this.telemetry.version === version) {
      return;
    }

    let offset = TELEMETRY_HEADER_SIZE;
    const taps = {} as Record<SynthTelemetryTapId, Float32Array>;
    for (const id of TELEMETRY_TAP_IDS) {
      taps[id] = view.slice(offset, offset + TELEMETRY_POINTS);
      offset += TELEMETRY_POINTS;
    }

    const curves = {} as Record<SynthTelemetryCurveId, Float32Array>;
    for (const id of TELEMETRY_CURVE_IDS) {
      curves[id] = view.slice(offset, offset + TELEMETRY_POINTS);
      offset += TELEMETRY_POINTS;
    }

    this.telemetry = {
      version,
      focusedMidiNote: (view[1] ?? 0) > 0 ? Math.round(view[1] ?? 0) : null,
      activeVoiceCount: Math.max(0, Math.round(view[2] ?? 0)),
      sampleRate: Math.max(0, Math.round(view[3] ?? 0)),
      peak: Math.max(0, view[12] ?? 0),
      runtime: {
        cutoff: clamp(view[4] ?? 0, 0, 1),
        resonance: clamp(view[5] ?? 0, 0, 1),
        ampEnv: clamp(view[6] ?? 0, 0, 1),
        filterEnv: clamp(view[7] ?? 0, 0, 1),
        lfo: clamp(view[8] ?? 0, -1, 1),
        drive: clamp(view[9] ?? 0, 0, 1),
        velocity: clamp(view[10] ?? 0, 0, 1),
      },
      taps,
      curves,
    };
  }
}
