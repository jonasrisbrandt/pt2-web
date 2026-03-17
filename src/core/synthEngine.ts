import type { RenderJob, RenderedSample, SynthCommand, SynthEvent, SynthSnapshot } from './synthTypes';

export interface SynthEngine {
  init(): Promise<void>;
  dispose(): Promise<void>;
  dispatch(command: SynthCommand): void;
  getSnapshot(): SynthSnapshot;
  renderSample(job: RenderJob): Promise<RenderedSample>;
  getRecordedSample(job: RenderJob): RenderedSample | null;
  subscribe(listener: (event: SynthEvent) => void): () => void;
}
