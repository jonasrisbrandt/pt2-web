/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module '*.vue' {
  const component: unknown;
  export default component;
}

interface MIDIInput extends EventTarget {
  onmidimessage: ((event: MIDIMessageEvent) => void) | null;
}

interface MIDIInputMap extends IterableIterator<MIDIInput> {
  size: number;
  values(): IterableIterator<MIDIInput>;
}

interface MIDIAccess extends EventTarget {
  inputs: MIDIInputMap;
  onstatechange: ((event: Event) => void) | null;
}

interface MIDIMessageEvent extends Event {
  data: Uint8Array;
}

interface Navigator {
  requestMIDIAccess?: () => Promise<MIDIAccess>;
}

declare module '/wasm-synth/synthcore.js' {
  const createSynthCoreModule: (options: Record<string, unknown>) => Promise<unknown>;
  export default createSynthCoreModule;
}

export {};
