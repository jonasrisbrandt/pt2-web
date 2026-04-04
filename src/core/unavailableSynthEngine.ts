import { createInitialSynthSnapshot } from './synthConfig';
import type { SynthEngine } from './synthEngine';
import type { RenderJob, RenderedSample, SynthCommand, SynthEvent, SynthSnapshot, SynthTelemetrySnapshot } from './synthTypes';

export class UnavailableSynthEngine implements SynthEngine {
  private snapshot: SynthSnapshot = createInitialSynthSnapshot();
  private listeners = new Set<(event: SynthEvent) => void>();

  constructor(message: string) {
    this.snapshot = {
      ...this.snapshot,
      backend: 'unavailable',
      backendStatus: 'error',
      backendError: message,
      ready: false,
      status: message,
    };
  }

  async init(): Promise<void> {
    this.emitSnapshot();
  }

  async dispose(): Promise<void> {
    this.listeners.clear();
  }

  dispatch(command: SynthCommand): void {
    switch (command.type) {
      case 'input-arm/set':
        this.snapshot.inputArm = command.target;
        break;
      case 'target-slot/set':
        this.snapshot.targetSampleSlot = command.slot;
        break;
      case 'midi/set-available':
        this.snapshot.midiAvailable = command.available;
        break;
      case 'bake-rate/set':
        this.snapshot.bakeSampleRate = command.sampleRate;
        break;
      case 'tempo/set':
        break;
    }

    this.emitSnapshot();
  }

  getSnapshot(): SynthSnapshot {
    return structuredClone(this.snapshot);
  }

  getTelemetry(): SynthTelemetrySnapshot | null {
    return null;
  }

  async renderSample(_job: RenderJob): Promise<RenderedSample> {
    throw new Error(this.snapshot.backendError ?? 'The synth engine is unavailable.');
  }

  getRecordedSample(_job: RenderJob): RenderedSample | null {
    return null;
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
}
