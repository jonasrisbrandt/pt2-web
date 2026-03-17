export interface VisualizationViewport {
  width: number;
  height: number;
  dpr: number;
}

export interface SolidFill {
  kind: 'solid';
  color: string;
}

export interface LinearGradientFill {
  kind: 'linear-gradient';
  startColor: string;
  endColor: string;
  direction: 'vertical' | 'horizontal';
}

export type FillStyle = SolidFill | LinearGradientFill;

export interface SpectrumPaletteStop {
  topColor: string;
  bottomColor: string;
}

export interface SpectrumSignal {
  kind: 'spectrum';
  samples: Float32Array;
  palette: readonly SpectrumPaletteStop[];
}

export interface HistorySeriesLane {
  id: string;
  color: string;
  values: Float32Array;
}

export interface HistorySeriesSignal {
  kind: 'history-series';
  lanes: readonly HistorySeriesLane[];
  historyLength: number;
  maxValue: number;
}

export interface WaveformSignal {
  kind: 'waveform';
  samples: Float32Array;
  color: string;
}

export interface CurveSignal {
  kind: 'curve';
  points: Float32Array;
  color: string;
  width: number;
}

export type VisualizationSignal =
  | SpectrumSignal
  | HistorySeriesSignal
  | WaveformSignal
  | CurveSignal;

export interface SpectrumVisualizationFrame {
  mode: 'spectrum';
  compact: boolean;
  panelFill: FillStyle;
  accentFill: FillStyle;
  guideColor: string;
  guideCount: number;
  signal: SpectrumSignal;
}

export interface SignalTrailsVisualizationFrame {
  mode: 'signal-trails';
  panelFill: FillStyle;
  laneFill: FillStyle;
  laneLabelColor: string;
  signal: HistorySeriesSignal;
}

export type VisualizationFrame =
  | SpectrumVisualizationFrame
  | SignalTrailsVisualizationFrame;

export interface ClearCommand {
  kind: 'clear';
}

export interface FillRoundedRectCommand {
  kind: 'fill-rounded-rect';
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  fill: FillStyle;
}

export interface StrokePolylineCommand {
  kind: 'stroke-polyline';
  points: Float32Array;
  color: string;
  width: number;
}

export interface TrailColumnsCommand {
  kind: 'trail-columns';
  x: number;
  top: number;
  width: number;
  laneStep: number;
  historyLength: number;
  maxValue: number;
  columnWidth: number;
  radius: number;
  maxBarHeight: number;
  lanes: readonly HistorySeriesLane[];
}

export type DrawCommand =
  | ClearCommand
  | FillRoundedRectCommand
  | StrokePolylineCommand
  | TrailColumnsCommand;

export interface VisualizationModeRenderer<TFrame extends VisualizationFrame> {
  buildCommands(frame: TFrame, viewport: VisualizationViewport): readonly DrawCommand[];
}

export interface VisualizationBackend {
  readonly kind: 'canvas2d' | 'webgl2';
  render(commands: readonly DrawCommand[], viewport: VisualizationViewport): void;
  dispose(): void;
}
