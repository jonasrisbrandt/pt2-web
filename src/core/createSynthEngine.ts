import type { SynthEngine } from './synthEngine';
import { MockSynthEngine } from './mockSynthEngine';
import { UnavailableSynthEngine } from './unavailableSynthEngine';
import { WasmSynthEngine } from './wasmSynthEngine';

const getRequestedBackend = (): 'auto' | 'js-fallback' | 'wasm-only' => {
  const params = new URLSearchParams(window.location.search);
  const backend = params.get('synthBackend')?.trim().toLowerCase();
  if (backend === 'js-fallback') {
    return 'js-fallback';
  }

  if (backend === 'wasm-only' || backend === 'wasm') {
    return 'wasm-only';
  }

  return 'auto';
};

export const createSynthEngine = async (): Promise<{ engine: SynthEngine; warning: string | null }> => {
  const requestedBackend = getRequestedBackend();
  const preferred = new WasmSynthEngine();
  try {
    await preferred.init();
    return { engine: preferred, warning: null };
  } catch (error) {
    await preferred.dispose();
    const message = error instanceof Error ? error.message : 'Unknown error while initializing the synth engine.';
    if (requestedBackend !== 'wasm-only') {
      const fallback = new MockSynthEngine();
      await fallback.init();
      return {
        engine: fallback,
        warning: `Synth wasm unavailable, using JS fallback: ${message}`,
      };
    }

    const unavailable = new UnavailableSynthEngine(message);
    await unavailable.init();
    return { engine: unavailable, warning: message };
  }
};
