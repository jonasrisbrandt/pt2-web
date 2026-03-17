import type { RenderJob, RenderedSample } from './synthTypes';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export interface CapturedPreviewAudio {
  sampleRate: number;
  interleavedStereo: Float32Array;
}

export const createWaveformPreview = (mono: Float32Array, length = 160): Int8Array => {
  if (mono.length === 0 || length <= 0) {
    return new Int8Array(0);
  }

  const preview = new Int8Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor((index * mono.length) / length);
    const end = Math.max(start + 1, Math.floor(((index + 1) * mono.length) / length));
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(mono[sampleIndex] ?? 0));
    }
    preview[index] = clamp(Math.round(peak * 127), 0, 127);
  }

  return preview;
};

export const stereoToMono = (interleavedStereo: Float32Array): Float32Array => {
  const mono = new Float32Array(Math.floor(interleavedStereo.length / 2));
  for (let frame = 0; frame < mono.length; frame += 1) {
    mono[frame] = ((interleavedStereo[frame * 2] ?? 0) + (interleavedStereo[(frame * 2) + 1] ?? 0)) * 0.5;
  }
  return mono;
};

const trimSilence = (data: Float32Array, threshold = 0.003): Float32Array => {
  let start = 0;
  let end = data.length - 1;

  while (start < data.length && Math.abs(data[start] ?? 0) <= threshold) {
    start += 1;
  }

  while (end >= start && Math.abs(data[end] ?? 0) <= threshold) {
    end -= 1;
  }

  if (start > end) {
    return new Float32Array(0);
  }

  return data.slice(start, end + 1);
};

const removeDcOffset = (data: Float32Array): void => {
  if (data.length === 0) {
    return;
  }

  let sum = 0;
  for (const sample of data) {
    sum += sample;
  }

  const mean = sum / data.length;
  for (let index = 0; index < data.length; index += 1) {
    data[index] -= mean;
  }
};

const resampleLinear = (source: Float32Array, fromRate: number, toRate: number): Float32Array => {
  if (source.length === 0 || fromRate === toRate) {
    return source.slice();
  }

  const ratio = toRate / fromRate;
  const outputLength = Math.max(1, Math.round(source.length * ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index / ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(source.length - 1, leftIndex + 1);
    const fraction = sourceIndex - leftIndex;
    const left = source[leftIndex] ?? 0;
    const right = source[rightIndex] ?? 0;
    output[index] = left + ((right - left) * fraction);
  }

  return output;
};

export const buildRenderedSampleFromCapture = (
  capture: CapturedPreviewAudio,
  job: RenderJob,
): RenderedSample | null => {
  const trimmed = trimSilence(stereoToMono(capture.interleavedStereo));
  if (trimmed.length === 0) {
    return null;
  }

  removeDcOffset(trimmed);
  let data = resampleLinear(trimmed, capture.sampleRate, job.sampleRate);

  let peak = 0;
  for (const sample of data) {
    peak = Math.max(peak, Math.abs(sample));
  }

  if (job.normalize && peak > 0.0001) {
    const gain = 0.92 / peak;
    for (let index = 0; index < data.length; index += 1) {
      data[index] *= gain;
    }
    peak = Math.min(0.92, peak * gain);
  }

  if (job.fadeOut && data.length > 16) {
    const fadeLength = clamp(Math.floor(data.length / 12), 32, 4096);
    const start = Math.max(0, data.length - fadeLength);
    for (let index = start; index < data.length; index += 1) {
      const ratio = 1 - ((index - start) / Math.max(1, data.length - start));
      data[index] *= ratio;
    }
  }

  const pcm = new Int8Array(data.length);
  peak = 0;
  for (let index = 0; index < data.length; index += 1) {
    const sample = clamp(data[index], -1, 1);
    peak = Math.max(peak, Math.abs(sample));
    pcm[index] = clamp(Math.round(sample * 127), -128, 127);
  }

  const loopStart = clamp(job.loopStart & ~1, 0, Math.max(0, pcm.length - 2));
  return {
    name: job.sampleName.slice(0, 22),
    data: pcm,
    volume: clamp(job.volume, 0, 64),
    fineTune: clamp(job.fineTune, -8, 7),
    loopStart,
    loopLength: clamp(job.loopLength & ~1, 2, Math.max(2, pcm.length - loopStart)),
    sampleRate: job.sampleRate,
    peak,
    midiNote: job.midiNote,
  };
};
