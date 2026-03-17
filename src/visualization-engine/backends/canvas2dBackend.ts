import { createCanvasFillStyle, drawRoundedRectPath } from '../canvasUtils';
import type { DrawCommand, VisualizationBackend, VisualizationViewport } from '../types';

export class Canvas2dVisualizationBackend implements VisualizationBackend {
  readonly kind = 'canvas2d' as const;

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
}
