import { createCanvasFillStyle, drawRoundedRectPath } from '../canvasUtils';
import { parseCssColor } from '../colorUtils';
import type { DrawCommand, VisualizationBackend, VisualizationViewport } from '../types';

export class Canvas2dVisualizationBackend implements VisualizationBackend {
  readonly kind = 'canvas2d' as const;
  private readonly alphaRampCache = new Map<string, string[]>();

  constructor(private readonly canvas: HTMLCanvasElement) {}

  render(commands: readonly DrawCommand[], viewport: VisualizationViewport): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.width, viewport.height);

    for (const command of commands) {
      if (command.kind === 'clear') {
        continue;
      }

      if (command.kind === 'fill-rounded-rect') {
        ctx.fillStyle = createCanvasFillStyle(
          ctx,
          viewport,
          command.fill,
          command.x,
          command.y,
          command.width,
          command.height,
        );
        drawRoundedRectPath(ctx, command.x, command.y, command.width, command.height, command.radius);
        ctx.fill();
        continue;
      }

      if (command.kind === 'trail-columns') {
        const historyLength = Math.max(1, command.historyLength);
        const slotWidth = command.width / historyLength;
        for (let laneIndex = 0; laneIndex < command.lanes.length; laneIndex += 1) {
          const lane = command.lanes[laneIndex];
          const alphaRamp = this.getAlphaRamp(lane?.color ?? '#ffffff', historyLength);
          const laneMid = command.top + (laneIndex * command.laneStep) + (command.laneStep / 2);
          const values = lane?.values ?? new Float32Array(0);

          for (let index = 0; index < historyLength; index += 1) {
            const amplitude = Math.max(0, Math.min(1, (values[index] ?? 0) / Math.max(0.0001, command.maxValue)));
            if (amplitude <= 0) {
              continue;
            }

            const barHeight = Math.max(2, amplitude * command.maxBarHeight);
            ctx.fillStyle = alphaRamp[index] ?? lane?.color ?? '#ffffff';
            drawRoundedRectPath(
              ctx,
              command.x + (index * slotWidth),
              laneMid - (barHeight / 2),
              command.columnWidth,
              barHeight,
              command.radius,
            );
            ctx.fill();
          }
        }
        continue;
      }

      ctx.strokeStyle = command.color;
      ctx.lineWidth = command.width;
      ctx.beginPath();
      const pointCount = Math.floor(command.points.length / 2);
      for (let index = 0; index < pointCount; index += 1) {
        const x = command.points[index * 2] ?? 0;
        const y = command.points[(index * 2) + 1] ?? 0;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  dispose(): void {}

  private getAlphaRamp(color: string, historyLength: number): string[] {
    const cacheKey = `${color}|${historyLength}`;
    const cached = this.alphaRampCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const parsed = parseCssColor(color);
    const ramp = Array.from({ length: historyLength }, (_, index) => {
      const alpha = 0.08 + ((index / Math.max(1, historyLength - 1)) * 0.88);
      return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
    });
    this.alphaRampCache.set(cacheKey, ramp);
    return ramp;
  }
}
