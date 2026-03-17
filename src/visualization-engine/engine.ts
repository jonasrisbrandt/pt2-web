import { Canvas2dVisualizationBackend } from './backends/canvas2dBackend';
import { Webgl2VisualizationBackend } from './backends/webgl2Backend';
import { SignalTrailsModeRenderer } from './renderers/signalTrailsModeRenderer';
import { SpectrumModeRenderer } from './renderers/spectrumModeRenderer';
import type { VisualizationBackend, VisualizationFrame, VisualizationViewport } from './types';

export interface VisualizationEngineOptions {
  canvas: HTMLCanvasElement;
  minWidth: number;
  logicalHeight: number;
  preferredBackend?: 'webgl2' | 'canvas2d';
}

export class VisualizationEngine {
  private backend: VisualizationBackend | null = null;
  private contextLost = false;
  private readonly spectrumRenderer = new SpectrumModeRenderer();
  private readonly signalTrailsRenderer = new SignalTrailsModeRenderer();

  constructor(private readonly options: VisualizationEngineOptions) {
    this.options.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.backend?.dispose();
      this.backend = null;
    });
    this.options.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.backend = null;
    });
  }

  render(frame: VisualizationFrame): void {
    const viewport = this.resolveViewport();
    if (!viewport) {
      return;
    }

    const backend = this.ensureBackend();
    const commands = frame.mode === 'spectrum'
      ? this.spectrumRenderer.buildCommands(frame, viewport)
      : this.signalTrailsRenderer.buildCommands(frame, viewport);
    backend.render(commands, viewport);
  }

  dispose(): void {
    this.backend?.dispose();
    this.backend = null;
  }

  getBackendKind(): 'canvas2d' | 'webgl2' | 'unavailable' {
    return this.backend?.kind ?? 'unavailable';
  }

  private resolveViewport(): VisualizationViewport | null {
    const widthSource = this.options.canvas.parentElement?.clientWidth
      || this.options.canvas.getBoundingClientRect().width
      || 960;
    if (widthSource <= 0) {
      return null;
    }

    const width = Math.max(this.options.minWidth, Math.round(widthSource));
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(this.options.logicalHeight * dpr);
    if (this.options.canvas.width !== pixelWidth || this.options.canvas.height !== pixelHeight) {
      this.options.canvas.width = pixelWidth;
      this.options.canvas.height = pixelHeight;
      this.options.canvas.style.width = '100%';
      this.options.canvas.style.height = `${this.options.logicalHeight}px`;
    }

    return {
      width,
      height: this.options.logicalHeight,
      dpr,
    };
  }

  private ensureBackend(): VisualizationBackend {
    if (this.backend) {
      return this.backend;
    }

    if (!this.contextLost && this.options.preferredBackend !== 'canvas2d') {
      this.backend = Webgl2VisualizationBackend.create(this.options.canvas);
    }

    if (!this.backend) {
      this.backend = new Canvas2dVisualizationBackend(this.options.canvas);
    }

    return this.backend;
  }
}
