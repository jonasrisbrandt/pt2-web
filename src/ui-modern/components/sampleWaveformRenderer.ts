import type { SampleSlot, TrackerSnapshot } from '../../core/trackerTypes';
import { clamp } from '../../ui/appShared';

export interface RoundedRectDrawer {
  (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void;
}

export interface SampleEditorLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SampleEditorView {
  start: number;
  length: number;
  end: number;
}

export const getSampleEditorLayout = (width: number, height: number): SampleEditorLayout => ({
  left: 18,
  top: 18,
  width: width - 36,
  height: height - 56,
});

export const sampleOffsetToEditorX = (
  offset: number,
  view: SampleEditorView,
  layout: SampleEditorLayout,
): number => {
  const visibleStart = view.start;
  const visibleLength = Math.max(1, view.length);
  const normalized = (offset - visibleStart) / visibleLength;
  return layout.left + (clamp(normalized, 0, 1) * layout.width);
};

const drawSampleMarker = (
  ctx: CanvasRenderingContext2D,
  drawRoundedRect: RoundedRectDrawer,
  x: number,
  top: number,
  height: number,
  color: string,
): void => {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, top + 8);
  ctx.lineTo(x, top + height - 8);
  ctx.stroke();

  ctx.fillStyle = color;
  drawRoundedRect(ctx, x - 5, top + 4, 10, 10, 4);
  ctx.fill();
};

const drawPlayheadMarker = (
  ctx: CanvasRenderingContext2D,
  drawRoundedRect: RoundedRectDrawer,
  x: number,
  top: number,
  height: number,
): void => {
  ctx.strokeStyle = 'rgba(255, 191, 122, 0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, top + 6);
  ctx.lineTo(x, top + height - 6);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 191, 122, 0.95)';
  drawRoundedRect(ctx, x - 4, top + 4, 8, 8, 4);
  ctx.fill();
};

const drawWaveformPath = (
  ctx: CanvasRenderingContext2D,
  data: Int8Array,
  start: number,
  end: number,
  left: number,
  top: number,
  width: number,
  height: number,
  stroke: string,
  fill: string,
): void => {
  const safeStart = clamp(start, 0, Math.max(0, data.length - 1));
  const safeEnd = clamp(end, safeStart + 1, data.length);
  const span = Math.max(1, safeEnd - safeStart);
  const centerY = top + (height / 2);
  const samplesPerPixel = span / Math.max(1, width);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(left, centerY);
  ctx.lineTo(left + width, centerY);
  ctx.stroke();

  if (samplesPerPixel > 1.25) {
    const barGradient = ctx.createLinearGradient(left, top, left + width, top);
    barGradient.addColorStop(0, 'rgba(212, 255, 117, 0.9)');
    barGradient.addColorStop(0.55, stroke);
    barGradient.addColorStop(1, 'rgba(90, 184, 255, 0.82)');

    const glowGradient = ctx.createLinearGradient(left, top, left + width, top);
    glowGradient.addColorStop(0, 'rgba(212, 255, 117, 0.08)');
    glowGradient.addColorStop(0.55, fill);
    glowGradient.addColorStop(1, 'rgba(90, 184, 255, 0.07)');

    ctx.fillStyle = glowGradient;
    let previousTopY = centerY;
    let previousBottomY = centerY;
    for (let pixel = 0; pixel < width; pixel += 1) {
      const from = safeStart + Math.floor((pixel / width) * span);
      const to = Math.min(safeEnd, safeStart + Math.max(1, Math.floor(((pixel + 1) / width) * span)));
      let minValue = 127;
      let maxValue = -128;

      for (let index = from; index < to; index += 1) {
        const value = data[index] ?? 0;
        if (value < minValue) {
          minValue = value;
        }
        if (value > maxValue) {
          maxValue = value;
        }
      }

      if (minValue > maxValue) {
        minValue = 0;
        maxValue = 0;
      }

      const x = left + pixel;
      const topY = centerY - ((maxValue / 128) * (height * 0.42));
      const bottomY = centerY - ((minValue / 128) * (height * 0.42));
      const glowY = Math.round(Math.min(topY, bottomY)) - 1;
      const glowH = Math.max(3, Math.round(Math.abs(bottomY - topY)) + 2);
      ctx.fillRect(x, glowY, 1, glowH);

      if (pixel > 0) {
        if (topY > previousBottomY) {
          const bridgeY = Math.round(previousBottomY);
          const bridgeH = Math.max(1, Math.round(topY - previousBottomY));
          ctx.fillRect(x, bridgeY, 1, bridgeH);
        }

        if (bottomY < previousTopY) {
          const bridgeY = Math.round(bottomY);
          const bridgeH = Math.max(1, Math.round(previousTopY - bottomY));
          ctx.fillRect(x, bridgeY, 1, bridgeH);
        }
      }

      previousTopY = topY;
      previousBottomY = bottomY;
    }

    ctx.fillStyle = barGradient;
    previousTopY = centerY;
    previousBottomY = centerY;
    for (let pixel = 0; pixel < width; pixel += 1) {
      const from = safeStart + Math.floor((pixel / width) * span);
      const to = Math.min(safeEnd, safeStart + Math.max(1, Math.floor(((pixel + 1) / width) * span)));
      let minValue = 127;
      let maxValue = -128;

      for (let index = from; index < to; index += 1) {
        const value = data[index] ?? 0;
        if (value < minValue) {
          minValue = value;
        }
        if (value > maxValue) {
          maxValue = value;
        }
      }

      if (minValue > maxValue) {
        minValue = 0;
        maxValue = 0;
      }

      const x = left + pixel;
      const topY = centerY - ((maxValue / 128) * (height * 0.42));
      const bottomY = centerY - ((minValue / 128) * (height * 0.42));
      const y = Math.round(Math.min(topY, bottomY));
      const h = Math.max(1, Math.round(Math.abs(bottomY - topY)));
      ctx.fillRect(x, y, 1, h);

      if (pixel > 0) {
        if (topY > previousBottomY) {
          const bridgeY = Math.round(previousBottomY);
          const bridgeH = Math.max(1, Math.round(topY - previousBottomY));
          ctx.fillRect(x, bridgeY, 1, bridgeH);
        }

        if (bottomY < previousTopY) {
          const bridgeY = Math.round(bottomY);
          const bridgeH = Math.max(1, Math.round(previousTopY - bottomY));
          ctx.fillRect(x, bridgeY, 1, bridgeH);
        }
      }

      previousTopY = topY;
      previousBottomY = bottomY;
    }

    return;
  }

  if (width <= 0) {
    return;
  }

  const strokeGradient = ctx.createLinearGradient(left, top, left + width, top);
  strokeGradient.addColorStop(0, 'rgba(212, 255, 117, 0.34)');
  strokeGradient.addColorStop(0.55, stroke);
  strokeGradient.addColorStop(1, 'rgba(138, 199, 255, 0.28)');

  const getSampleY = (pixel: number): number => {
    const samplePos = safeStart + Math.floor((pixel / Math.max(1, width - 1)) * Math.max(0, span - 1));
    const value = data[samplePos] ?? 0;
    return centerY - ((value / 128) * (height * 0.42));
  };

  const firstX = left;
  const firstY = getSampleY(0);
  ctx.beginPath();
  ctx.moveTo(firstX, firstY);
  for (let pixel = 1; pixel < width; pixel += 1) {
    ctx.lineTo(left + pixel, getSampleY(pixel));
  }
  ctx.strokeStyle = strokeGradient;
  ctx.lineWidth = 1.15;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(firstX, centerY);
  for (let pixel = 0; pixel < width; pixel += 1) {
    ctx.lineTo(left + pixel, pixel === 0 ? firstY : getSampleY(pixel));
  }
  ctx.lineTo(left + width - 1, centerY);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
};

export interface SelectedSamplePreviewRenderOptions {
  canvas: HTMLCanvasElement;
  snapshot: TrackerSnapshot;
  height: number;
  previewPlayheadOffset: number | null;
  getWaveformSource: (sample: SampleSlot) => Int8Array;
  drawRoundedRect: RoundedRectDrawer;
}

export const drawSelectedSamplePreview = ({
  canvas,
  snapshot,
  height,
  previewPlayheadOffset,
  getWaveformSource,
  drawRoundedRect,
}: SelectedSamplePreviewRenderOptions): void => {
  const widthSource = canvas.parentElement?.clientWidth
    || canvas.getBoundingClientRect().width
    || 420;
  if (widthSource <= 0) {
    return;
  }

  const width = Math.max(280, Math.round(widthSource));
  const dpr = window.devicePixelRatio || 1;

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = '100%';
    canvas.style.height = `${height}px`;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const sample = snapshot.samples[snapshot.selectedSample];
  const data = getWaveformSource(sample);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
  drawRoundedRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, 'rgba(212, 255, 117, 0.06)');
  gradient.addColorStop(0.5, 'rgba(120, 240, 191, 0.12)');
  gradient.addColorStop(1, 'rgba(90, 184, 255, 0.08)');
  ctx.fillStyle = gradient;
  drawRoundedRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  if (sample.length <= 0 || data.length <= 0) {
    ctx.fillStyle = 'rgba(239, 248, 231, 0.52)';
    ctx.font = '15px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Select an empty slot to load a sample', width / 2, height / 2);
    return;
  }

  const plotLeft = 14;
  const plotTop = 14;
  const plotWidth = width - 28;
  const plotHeight = height - 28;
  drawWaveformPath(ctx, data, 0, data.length, plotLeft, plotTop, plotWidth, plotHeight, 'rgba(120, 240, 191, 0.95)', 'rgba(120, 240, 191, 0.12)');

  if (sample.loopLength > 2) {
    const loopStartX = plotLeft + ((sample.loopStart / Math.max(1, sample.length)) * plotWidth);
    const loopEndX = plotLeft + (((sample.loopStart + sample.loopLength) / Math.max(1, sample.length)) * plotWidth);
    ctx.fillStyle = 'rgba(90, 184, 255, 0.08)';
    drawRoundedRect(ctx, loopStartX, plotTop + 8, Math.max(2, loopEndX - loopStartX), plotHeight - 16, 8);
    ctx.fill();
    drawSampleMarker(ctx, drawRoundedRect, loopStartX, plotTop, plotHeight, '#5ab8ff');
    drawSampleMarker(ctx, drawRoundedRect, loopEndX, plotTop, plotHeight, '#5ab8ff');
  }

  if (previewPlayheadOffset !== null) {
    const playheadX = plotLeft + ((previewPlayheadOffset / Math.max(1, sample.length)) * plotWidth);
    drawPlayheadMarker(ctx, drawRoundedRect, playheadX, plotTop, plotHeight);
  }
};

export interface SampleEditorRenderOptions {
  canvas: HTMLCanvasElement;
  snapshot: TrackerSnapshot;
  height: number;
  previewPlayheadOffset: number | null;
  getWaveformSource: (sample: SampleSlot) => Int8Array;
  getSampleEditorView: (snapshot: TrackerSnapshot) => SampleEditorView;
  getDraftSampleSelection: (snapshot: TrackerSnapshot) => { start: number | null; end: number | null };
  getDraftSampleLoop: (snapshot: TrackerSnapshot) => { start: number; end: number };
  drawRoundedRect: RoundedRectDrawer;
}

export const drawSampleEditor = ({
  canvas,
  snapshot,
  height,
  previewPlayheadOffset,
  getWaveformSource,
  getSampleEditorView,
  getDraftSampleSelection,
  getDraftSampleLoop,
  drawRoundedRect,
}: SampleEditorRenderOptions): void => {
  if (!snapshot.sampleEditor.open) {
    return;
  }

  const widthSource = canvas.parentElement?.clientWidth
    || canvas.getBoundingClientRect().width
    || 960;
  if (widthSource <= 0) {
    return;
  }

  const width = Math.max(420, Math.round(widthSource));
  const dpr = window.devicePixelRatio || 1;

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = '100%';
    canvas.style.height = `${height}px`;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const sample = snapshot.samples[snapshot.selectedSample];
  const data = getWaveformSource(sample);
  const layout = getSampleEditorLayout(width, height);
  const selection = getDraftSampleSelection(snapshot);
  const loop = getDraftSampleLoop(snapshot);
  const view = getSampleEditorView(snapshot);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
  drawRoundedRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  drawRoundedRect(ctx, layout.left, layout.top, layout.width, layout.height, 14);
  ctx.fill();

  if (sample.length <= 0 || data.length <= 0 || view.length <= 0) {
    ctx.fillStyle = 'rgba(239, 248, 231, 0.52)';
    ctx.font = '15px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('The selected sample is empty', width / 2, height / 2);
    return;
  }

  drawWaveformPath(ctx, data, view.start, view.end, layout.left, layout.top, layout.width, layout.height, 'rgba(120, 240, 191, 0.98)', 'rgba(120, 240, 191, 0.1)');

  const selectionStart = selection.start;
  const selectionEnd = selection.end;
  if (selectionStart !== null && selectionEnd !== null) {
    const x1 = sampleOffsetToEditorX(selectionStart, view, layout);
    const x2 = sampleOffsetToEditorX(selectionEnd, view, layout);
    ctx.fillStyle = 'rgba(212, 255, 117, 0.14)';
    drawRoundedRect(ctx, Math.min(x1, x2), layout.top + 10, Math.max(2, Math.abs(x2 - x1)), layout.height - 20, 10);
    ctx.fill();
  }

  if (sample.loopLength > 2) {
    const loopStartX = sampleOffsetToEditorX(loop.start, view, layout);
    const loopEndX = sampleOffsetToEditorX(loop.end, view, layout);
    ctx.fillStyle = 'rgba(90, 184, 255, 0.1)';
    drawRoundedRect(ctx, Math.min(loopStartX, loopEndX), layout.top + 10, Math.max(2, Math.abs(loopEndX - loopStartX)), layout.height - 20, 10);
    ctx.fill();
    drawSampleMarker(ctx, drawRoundedRect, loopStartX, layout.top, layout.height, '#5ab8ff');
    drawSampleMarker(ctx, drawRoundedRect, loopEndX, layout.top, layout.height, '#5ab8ff');
  }

  if (previewPlayheadOffset !== null && previewPlayheadOffset >= view.start && previewPlayheadOffset <= view.end) {
    drawPlayheadMarker(ctx, drawRoundedRect, sampleOffsetToEditorX(previewPlayheadOffset, view, layout), layout.top, layout.height);
  }

  ctx.fillStyle = 'rgba(239, 248, 231, 0.72)';
  ctx.font = '13px Consolas, "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Start ${view.start}`, layout.left, layout.top + layout.height + 8);
  ctx.fillText(`End ${view.end}`, layout.left + layout.width - 92, layout.top + layout.height + 8);
};
