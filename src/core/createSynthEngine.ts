import type { SynthEngine } from './synthEngine';
import { MockSynthEngine } from './mockSynthEngine';
import { UnavailableSynthEngine } from './unavailableSynthEngine';
import { WasmSynthEngine } from './wasmSynthEngine';

const useDebugFallback = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  return params.get('synthBackend') === 'js-fallback';
};

export const createSynthEngine = async (): Promise<{ engine: SynthEngine; warning: string | null }> => {
  const preferred = new WasmSynthEngine();
  try {
    await preferred.init();
    return { engine: preferred, warning: null };
  } catch (error) {
    await preferred.dispose();
    const message = error instanceof Error ? error.message : 'Unknown error while initializing the synth engine.';
    if (useDebugFallback()) {
      const fallback = new MockSynthEngine();
      await fallback.init();
      return {
        engine: fallback,
        warning: `Debug fallback active: ${message}`,
      };
    }

    const unavailable = new UnavailableSynthEngine(message);
    await unavailable.init();
    return { engine: unavailable, warning: message };
  }
};
