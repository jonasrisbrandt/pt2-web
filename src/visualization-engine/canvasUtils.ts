import type { FillStyle, VisualizationViewport } from './types';

export const drawRoundedRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
};

export const createCanvasFillStyle = (
  ctx: CanvasRenderingContext2D,
  viewport: VisualizationViewport,
  fill: FillStyle,
  x: number,
  y: number,
  width: number,
  height: number,
): string | CanvasGradient => {
  void viewport;
  if (fill.kind === 'solid') {
    return fill.color;
  }

  const gradient = fill.direction === 'horizontal'
    ? ctx.createLinearGradient(x, y, x + width, y)
    : ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, fill.startColor);
  gradient.addColorStop(1, fill.endColor);
  return gradient;
};
