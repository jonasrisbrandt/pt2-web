import { MockTrackerEngine } from './mockEngine';
import type { TrackerEngine } from './trackerEngine';
import type { EngineConfig } from './trackerTypes';
import { WasmTrackerEngine } from './wasmEngine';

export const createTrackerEngine = async (
  config: EngineConfig,
): Promise<{ engine: TrackerEngine; warning: string | null }> => {
  const preferred = new WasmTrackerEngine();

  try {
    await preferred.init(config);
    return { engine: preferred, warning: null };
  } catch (error) {
    await preferred.dispose();

    const fallback = new MockTrackerEngine();
    await fallback.init(config);

    return {
      engine: fallback,
      warning: error instanceof Error ? error.message : 'Unknown error while initializing the wasm engine.',
    };
  }
};
