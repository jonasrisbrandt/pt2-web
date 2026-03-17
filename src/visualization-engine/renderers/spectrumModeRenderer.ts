import type {
  DrawCommand,
  FillRoundedRectCommand,
  SpectrumPaletteStop,
  SpectrumVisualizationFrame,
  VisualizationModeRenderer,
  VisualizationViewport,
} from '../types';

const createRectCommand = (): FillRoundedRectCommand => ({
  kind: 'fill-rounded-rect',
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  radius: 0,
  fill: { kind: 'solid', color: 'rgba(0, 0, 0, 0)' },
});

const pickPaletteStop = (
  palette: readonly SpectrumPaletteStop[],
  position: number,
): SpectrumPaletteStop => palette[Math.max(0, Math.min(palette.length - 1, Math.round(position * Math.max(0, palette.length - 1))))] ?? {
  topColor: 'rgba(255, 255, 255, 0.9)',
  bottomColor: 'rgba(255, 255, 255, 0.35)',
};

export class SpectrumModeRenderer implements VisualizationModeRenderer<SpectrumVisualizationFrame> {
  private readonly commands: DrawCommand[] = [];
  private readonly panelCommand = createRectCommand();
  private readonly accentCommand = createRectCommand();
  private readonly guideCommands = Array.from({ length: 4 }, () => createRectCommand());
  private barCommands: FillRoundedRectCommand[] = [];

  buildCommands(frame: SpectrumVisualizationFrame, viewport: VisualizationViewport): readonly DrawCommand[] {
    this.commands.length = 0;
    this.commands.push({ kind: 'clear' });

    this.panelCommand.x = 0;
    this.panelCommand.y = 0;
    this.panelCommand.width = viewport.width;
    this.panelCommand.height = viewport.height;
    this.panelCommand.radius = 18;
    this.panelCommand.fill = frame.panelFill;
    this.commands.push(this.panelCommand);

    this.accentCommand.x = 0;
    this.accentCommand.y = 0;
    this.accentCommand.width = viewport.width;
    this.accentCommand.height = viewport.height;
    this.accentCommand.radius = 18;
    this.accentCommand.fill = frame.accentFill;
    this.commands.push(this.accentCommand);

    for (let line = 0; line < frame.guideCount; line += 1) {
      const command = this.guideCommands[line];
      const y = 12 + (((viewport.height - 24) / (frame.guideCount + 1)) * (line + 1));
      command.x = 14;
      command.y = y;
      command.width = viewport.width - 28;
      command.height = 1;
      command.radius = 0;
      command.fill = { kind: 'solid', color: frame.guideColor };
      this.commands.push(command);
    }

    const barCount = frame.compact
      ? Math.max(32, Math.floor(viewport.width / 12))
      : Math.max(24, Math.floor(viewport.width / 24));
    this.ensureBarCapacity(barCount);

    const usableHeight = viewport.height - 24;
    const slotWidth = (viewport.width - 28) / Math.max(1, barCount);
    const barWidth = frame.compact
      ? Math.max(4, Math.min(7, slotWidth - 1))
      : Math.max(8, Math.min(14, slotWidth - 1));
    const sampleCount = frame.signal.samples.length;

    for (let bar = 0; bar < barCount; bar += 1) {
      const start = Math.floor((bar / barCount) * sampleCount);
      const end = Math.max(start + 1, Math.floor(((bar + 1) / barCount) * sampleCount));
      let energy = 0;
      for (let index = start; index < end && index < sampleCount; index += 1) {
        energy += Math.abs(frame.signal.samples[index] ?? 0);
      }

      const normalized = sampleCount === 0 ? 0 : Math.max(0, Math.min(1, energy / Math.max(1, end - start)));
      if (normalized <= 0) {
        continue;
      }

      const command = this.barCommands[bar];
      const barHeight = Math.max(4, Math.round(normalized * usableHeight));
      const x = 14 + (bar * slotWidth);
      const y = viewport.height - 12 - barHeight;
      const paletteStop = pickPaletteStop(frame.signal.palette, bar / Math.max(1, barCount - 1));
      command.x = x;
      command.y = y;
      command.width = barWidth;
      command.height = barHeight;
      command.radius = Math.min(6, barWidth * 0.5);
      command.fill = {
        kind: 'linear-gradient',
        startColor: paletteStop.topColor,
        endColor: paletteStop.bottomColor,
        direction: 'vertical',
      };
      this.commands.push(command);
    }

    return this.commands;
  }

  private ensureBarCapacity(count: number): void {
    while (this.barCommands.length < count) {
      this.barCommands.push(createRectCommand());
    }
  }
}
