import { parseCssColor } from '../colorUtils';
import type {
  DrawCommand,
  FillRoundedRectCommand,
  SignalTrailsVisualizationFrame,
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

const withAlpha = (color: string, alpha: number): string => {
  const parsed = parseCssColor(color);
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
};

export class SignalTrailsModeRenderer implements VisualizationModeRenderer<SignalTrailsVisualizationFrame> {
  private readonly commands: DrawCommand[] = [];
  private readonly panelCommand = createRectCommand();
  private laneCommands: FillRoundedRectCommand[] = [];
  private baselineCommands: FillRoundedRectCommand[] = [];
  private columnCommands: FillRoundedRectCommand[] = [];

  buildCommands(frame: SignalTrailsVisualizationFrame, viewport: VisualizationViewport): readonly DrawCommand[] {
    this.commands.length = 0;
    this.commands.push({ kind: 'clear' });

    this.panelCommand.x = 0;
    this.panelCommand.y = 0;
    this.panelCommand.width = viewport.width;
    this.panelCommand.height = viewport.height;
    this.panelCommand.radius = 18;
    this.panelCommand.fill = frame.panelFill;
    this.commands.push(this.panelCommand);

    const laneCount = frame.signal.lanes.length;
    const laneHeight = (viewport.height - 28) / Math.max(1, laneCount);
    this.ensureLaneCapacity(laneCount);

    let columnCount = 0;
    for (let lane = 0; lane < laneCount; lane += 1) {
      const laneTop = 12 + (lane * laneHeight);
      const laneCommand = this.laneCommands[lane];
      laneCommand.x = 10;
      laneCommand.y = laneTop;
      laneCommand.width = viewport.width - 20;
      laneCommand.height = laneHeight - 8;
      laneCommand.radius = 10;
      laneCommand.fill = frame.laneFill;
      this.commands.push(laneCommand);

      this.ensureBaselineCapacity(lane + 1);
      const baselineCommand = this.baselineCommands[lane];
      baselineCommand.x = 14;
      baselineCommand.y = (laneTop + (laneHeight / 2));
      baselineCommand.width = viewport.width - 28;
      baselineCommand.height = 1;
      baselineCommand.radius = 0;
      baselineCommand.fill = {
        kind: 'solid',
        color: 'rgba(239, 248, 231, 0.08)',
      };
      this.commands.push(baselineCommand);

      const history = frame.signal.lanes[lane]?.values ?? new Float32Array(0);
      const historyLength = Math.max(1, frame.signal.historyLength);
      const slotWidth = (viewport.width - 28) / historyLength;

      for (let index = 0; index < historyLength; index += 1) {
        const amplitude = Math.max(0, Math.min(1, (history[index] ?? 0) / Math.max(0.0001, frame.signal.maxValue)));
        if (amplitude <= 0) {
          continue;
        }

        this.ensureColumnCapacity(columnCount + 1);
        const command = this.columnCommands[columnCount];
        const laneMid = laneTop + (laneHeight / 2);
        const alpha = 0.08 + ((index / Math.max(1, historyLength - 1)) * 0.88);
        const barHeight = Math.max(2, amplitude * (laneHeight - 18));
        command.x = 14 + (index * slotWidth);
        command.y = laneMid - (barHeight / 2);
        command.width = 3;
        command.height = barHeight;
        command.radius = 3;
        command.fill = {
          kind: 'solid',
          color: withAlpha(frame.signal.lanes[lane]?.color ?? '#ffffff', alpha),
        };
        this.commands.push(command);
        columnCount += 1;
      }
    }

    return this.commands;
  }

  private ensureLaneCapacity(count: number): void {
    while (this.laneCommands.length < count) {
      this.laneCommands.push(createRectCommand());
    }
  }

  private ensureBaselineCapacity(count: number): void {
    while (this.baselineCommands.length < count) {
      this.baselineCommands.push(createRectCommand());
    }
  }

  private ensureColumnCapacity(count: number): void {
    while (this.columnCommands.length < count) {
      this.columnCommands.push(createRectCommand());
    }
  }
}
