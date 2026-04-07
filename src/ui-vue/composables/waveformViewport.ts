import { clamp } from '../../ui/appShared';

export interface WaveformViewportState {
  start: number;
  length: number;
}

export const getWaveformScrollMax = (
  sampleLength: number,
  viewLength: number,
): number => Math.max(0, sampleLength - Math.max(1, viewLength));

export const clampWaveformViewport = (
  sampleLength: number,
  nextStart: number,
  nextLength: number,
): WaveformViewportState => {
  if (sampleLength <= 0) {
    return { start: 0, length: 0 };
  }

  const clampedLength = clamp(Math.round(nextLength), Math.min(64, sampleLength), Math.max(64, sampleLength));
  const maxStart = Math.max(0, sampleLength - clampedLength);
  return {
    start: clamp(Math.round(nextStart), 0, maxStart),
    length: clampedLength,
  };
};

export const zoomWaveformViewport = (
  sampleLength: number,
  current: WaveformViewportState,
  anchorOffset: number,
  zoomIn: boolean,
): WaveformViewportState => {
  if (sampleLength <= 0) {
    return { start: 0, length: 0 };
  }

  const currentLength = Math.max(64, current.length || sampleLength);
  const nextLength = zoomIn
    ? Math.max(64, Math.round(currentLength * 0.5))
    : Math.min(sampleLength, Math.round(currentLength * 2));
  const normalizedAnchor = currentLength <= 0 ? 0.5 : (anchorOffset - current.start) / currentLength;
  const nextStart = anchorOffset - (nextLength * normalizedAnchor);
  return clampWaveformViewport(sampleLength, nextStart, nextLength);
};

export const getWaveformScrollbarThumbWidth = (
  trackWidth: number,
  sampleLength: number,
  viewLength: number,
): number => {
  if (trackWidth <= 0) {
    return 0;
  }

  const ratio = sampleLength <= 0 ? 1 : clamp(viewLength / sampleLength, 0, 1);
  const thumbWidth = Math.max(24, Math.round(trackWidth * ratio));
  return Math.min(trackWidth, thumbWidth);
};
