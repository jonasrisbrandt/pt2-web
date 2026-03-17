import type {
  DrawCommand,
  FillRoundedRectCommand,
  SignalTrailsVisualizationFrame,
  TrailColumnsCommand,
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

export class SignalTrailsModeRenderer implements VisualizationModeRenderer<SignalTrailsVisualizationFrame> {
  private readonly commands: DrawCommand[] = [];
  private readonly panelCommand = createRectCommand();
  private readonly trailColumnsCommand: TrailColumnsCommand = {
    kind: 'trail-columns',
    x: 0,
    top: 0,
    width: 0,
    laneStep: 0,
    historyLength: 0,
    maxValue: 1,
    columnWidth: 3,
    radius: 3,
    maxBarHeight: 0,
    lanes: [],
  };
  private laneCommands: FillRoundedRectCommand[] = [];
  private baselineCommands: FillRoundedRectCommand[] = [];

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
    this.trailColumnsCommand.x = 14;
    this.trailColumnsCommand.top = 12;
    this.trailColumnsCommand.width = viewport.width - 28;
    this.trailColumnsCommand.laneStep = laneHeight;
    this.trailColumnsCommand.historyLength = Math.max(1, frame.signal.historyLength);
    this.trailColumnsCommand.maxValue = frame.signal.maxValue;
    this.trailColumnsCommand.columnWidth = 3;
    this.trailColumnsCommand.radius = 3;
    this.trailColumnsCommand.maxBarHeight = laneHeight - 18;
    this.trailColumnsCommand.lanes = frame.signal.lanes;

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
    }

    this.commands.push(this.trailColumnsCommand);

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
}
