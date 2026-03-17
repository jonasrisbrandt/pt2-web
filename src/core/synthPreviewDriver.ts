import type { CapturedPreviewAudio } from './synthAudioUtils';

interface SynthPreviewDriverOptions {
  onSampleRateChange?: (sampleRate: number) => void;
  onRenderError?: (error: Error) => void;
}

type WorkletMessage =
  | { type: 'need-data'; frameCount: number }
  | { type: 'state'; queuedFrames: number };

const DEFAULT_FRAME_CHUNK = 256;

export class SynthPreviewDriver {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private readonly recordedChunks: Float32Array[] = [];
  private recording = false;

  constructor(
    private readonly renderFrames: (frameCount: number, sampleRate: number) => Float32Array,
    private readonly options: SynthPreviewDriverOptions = {},
  ) {}

  async ensureStarted(): Promise<void> {
    if (!this.context) {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('Web Audio is unavailable in this browser.');
      }
      if (typeof AudioWorkletNode === 'undefined') {
        throw new Error('AudioWorklet is unavailable in this browser.');
      }

      this.context = new AudioContextCtor();
      if (!this.context.audioWorklet) {
        throw new Error('The audio context does not support AudioWorklet.');
      }
      await this.context.audioWorklet.addModule('/audio/synth-preview-worklet.js');
      this.node = new AudioWorkletNode(this.context, 'pt2-synth-preview', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
        this.handleWorkletMessage(event.data);
      };
      this.node.connect(this.context.destination);
      this.options.onSampleRateChange?.(this.context.sampleRate);
      this.fillQueue(DEFAULT_FRAME_CHUNK * 6);
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  startRecording(): void {
    this.recordedChunks.length = 0;
    this.recording = true;
  }

  stopRecording(): CapturedPreviewAudio | null {
    this.recording = false;
    if (!this.context || this.recordedChunks.length === 0) {
      return null;
    }

    const totalLength = this.recordedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const interleavedStereo = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.recordedChunks) {
      interleavedStereo.set(chunk, offset);
      offset += chunk.length;
    }
    this.recordedChunks.length = 0;

    return {
      sampleRate: this.context.sampleRate,
      interleavedStereo,
    };
  }

  discardRecording(): void {
    this.recordedChunks.length = 0;
    this.recording = false;
  }

  async suspend(): Promise<void> {
    if (this.context && this.context.state === 'running') {
      await this.context.suspend();
    }
  }

  async dispose(): Promise<void> {
    this.discardRecording();

    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.node = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  private handleWorkletMessage(message: WorkletMessage): void {
    if (message.type === 'need-data') {
      this.fillQueue(message.frameCount);
    }
  }

  private fillQueue(frameCount: number): void {
    if (!this.context || !this.node) {
      return;
    }

    let rendered: Float32Array;
    try {
      rendered = this.renderFrames(frameCount, this.context.sampleRate);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.options.onRenderError?.(failure);
      rendered = new Float32Array(frameCount * 2);
    }

    if (this.recording) {
      this.recordedChunks.push(rendered.slice());
    }

    this.node.port.postMessage({ type: 'push', frames: rendered }, [rendered.buffer]);
  }
}
