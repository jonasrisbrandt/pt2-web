import type { RenderJob, RenderedSample, SynthCommand, SynthEvent, SynthSnapshot, SynthTelemetrySnapshot } from './synthTypes';

export interface SynthEngine {
  init(): Promise<void>;
  dispose(): Promise<void>;
  dispatch(command: SynthCommand): void;
  getSnapshot(): SynthSnapshot;
  getTelemetry(): SynthTelemetrySnapshot | null;
  renderSample(job: RenderJob): Promise<RenderedSample>;
  peekRecordedSample(job: RenderJob): RenderedSample | null;
  getRecordedSample(job: RenderJob): RenderedSample | null;
  subscribe(listener: (event: SynthEvent) => void): () => void;
}
