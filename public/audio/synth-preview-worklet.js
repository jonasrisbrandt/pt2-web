class Pt2SynthPreviewProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.readOffset = 0;
    this.queuedFrames = 0;

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message || message.type !== 'push' || !(message.frames instanceof Float32Array)) {
        return;
      }

      this.queue.push(message.frames);
      this.queuedFrames += Math.floor(message.frames.length / 2);
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const left = output?.[0];
    const right = output?.[1];
    if (!left || !right) {
      return true;
    }

    let frame = 0;
    while (frame < left.length) {
      const current = this.queue[0];
      if (!current) {
        left[frame] = 0;
        right[frame] = 0;
        frame += 1;
        continue;
      }

      left[frame] = current[this.readOffset] ?? 0;
      right[frame] = current[this.readOffset + 1] ?? 0;
      this.readOffset += 2;
      this.queuedFrames = Math.max(0, this.queuedFrames - 1);
      frame += 1;

      if (this.readOffset >= current.length) {
        this.queue.shift();
        this.readOffset = 0;
      }
    }

    if (this.queuedFrames < left.length * 4) {
      this.port.postMessage({ type: 'need-data', frameCount: Math.max(256, left.length * 2) });
    }

    return true;
  }
}

registerProcessor('pt2-synth-preview', Pt2SynthPreviewProcessor);
