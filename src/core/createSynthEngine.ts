import type { SynthEngine } from './synthEngine';
import { UnavailableSynthEngine } from './unavailableSynthEngine';
import { WasmSynthEngine } from './wasmSynthEngine';

export const createSynthEngine = async (): Promise<{ engine: SynthEngine; warning: string | null }> => {
  const preferred = new WasmSynthEngine();
  try {
    await preferred.init();
    return { engine: preferred, warning: null };
  } catch (error) {
    await preferred.dispose();
    const message = error instanceof Error ? error.message : 'Unknown error while initializing the synth engine.';
    const unavailable = new UnavailableSynthEngine(message);
    await unavailable.init();
    return { engine: unavailable, warning: message };
  }
};
