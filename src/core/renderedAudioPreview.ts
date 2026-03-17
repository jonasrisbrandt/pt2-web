import type { RenderedSample } from './synthTypes';

export class RenderedAudioPreview {
  private context: AudioContext | null = null;
  private activeSources = new Map<string, AudioBufferSourceNode>();

  async prepare(): Promise<void> {
    await this.ensureContext();
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.context) {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('Web Audio is unavailable in this browser.');
      }

      this.context = new AudioContextCtor();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    return this.context;
  }

  async play(key: string, rendered: RenderedSample): Promise<void> {
    const context = await this.ensureContext();
    this.stop(key);

    const buffer = context.createBuffer(1, rendered.data.length, rendered.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < rendered.data.length; index += 1) {
      channel[index] = (rendered.data[index] ?? 0) / 127;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => {
      if (this.activeSources.get(key) === source) {
        this.activeSources.delete(key);
      }
    };
    this.activeSources.set(key, source);
    source.start();
  }

  stop(key: string): void {
    const source = this.activeSources.get(key);
    if (!source) {
      return;
    }

    this.activeSources.delete(key);
    source.stop();
    source.disconnect();
  }

  stopAll(): void {
    for (const key of Array.from(this.activeSources.keys())) {
      this.stop(key);
    }
  }
}
