import type { QuadrascopeState } from '../core/trackerTypes';
import {
  brighten,
  CHANNEL_COLORS,
  darken,
  spectrumColorAt,
  rgba,
} from '../ui/appShared';
import { HistoryRingBuffer } from '../visualization-engine/historyRingBuffer';
import type {
  SignalTrailsVisualizationFrame,
  SpectrumPaletteStop,
  SpectrumVisualizationFrame,
} from '../visualization-engine/types';

const SPECTRUM_SAMPLE_CAPACITY = 4 * 64;
const TRAIL_HISTORY_CAPACITY = 192;
const TRAIL_FIXED_MAX_VALUE = 72 / 128;

export class TrackerSpectrumFrameSource {
  private readonly palette: SpectrumPaletteStop[] = Array.from({ length: 128 }, (_, index) => {
    const baseColor = spectrumColorAt(index / 127);
    return {
      topColor: rgba(brighten(baseColor, 0.18), 0.96),
      bottomColor: rgba(darken(baseColor, 0.38), 0.35),
    };
  });
  private readonly samples = new Float32Array(SPECTRUM_SAMPLE_CAPACITY);
  private readonly frame: SpectrumVisualizationFrame = {
    mode: 'spectrum',
    compact: false,
    panelFill: { kind: 'solid', color: 'rgba(8, 13, 10, 0.92)' },
    accentFill: {
      kind: 'linear-gradient',
      startColor: 'rgba(212, 255, 117, 0.05)',
      endColor: 'rgba(255, 191, 122, 0.05)',
      direction: 'horizontal',
    },
    guideColor: 'rgba(239, 248, 231, 0.06)',
    guideCount: 4,
    signal: {
      kind: 'spectrum',
      samples: this.samples,
      palette: this.palette,
    },
  };

  buildFrame(quadrascope: QuadrascopeState | null, compact: boolean): SpectrumVisualizationFrame {
    this.samples.fill(0);
    let offset = 0;
    const channels = quadrascope?.channels ?? [];
    for (let channel = 0; channel < channels.length && offset < this.samples.length; channel += 1) {
      const samplePoints = channels[channel]?.sample ?? [];
      const copyLength = Math.min(64, samplePoints.length, this.samples.length - offset);
      for (let index = 0; index < copyLength; index += 1) {
        this.samples[offset + index] = Math.abs((samplePoints[index] ?? 0) / 128);
      }
      offset += copyLength;
    }

    this.frame.compact = compact;
    return this.frame;
  }
}

export class TrackerSignalTrailsFrameSource {
  private readonly history = new HistoryRingBuffer(4, TRAIL_HISTORY_CAPACITY);
  private readonly energies = new Float32Array(4);
  private readonly laneBuffers = Array.from({ length: 4 }, () => new Float32Array(TRAIL_HISTORY_CAPACITY));
  private readonly frame: SignalTrailsVisualizationFrame = {
    mode: 'signal-trails',
    panelFill: { kind: 'solid', color: 'rgba(8, 13, 10, 0.92)' },
    laneFill: { kind: 'solid', color: 'rgba(255, 255, 255, 0.035)' },
    laneLabelColor: 'rgba(239, 248, 231, 0.72)',
    signal: {
      kind: 'history-series',
      lanes: [
        { id: 'ch1', color: CHANNEL_COLORS[0], values: this.laneBuffers[0] },
        { id: 'ch2', color: CHANNEL_COLORS[1], values: this.laneBuffers[1] },
        { id: 'ch3', color: CHANNEL_COLORS[2], values: this.laneBuffers[2] },
        { id: 'ch4', color: CHANNEL_COLORS[3], values: this.laneBuffers[3] },
      ],
      historyLength: 0,
      maxValue: 1,
    },
  };

  reset(): void {
    this.history.reset();
    for (const buffer of this.laneBuffers) {
      buffer.fill(0);
    }
    this.frame.signal.historyLength = 0;
  }

  buildFrame(quadrascope: QuadrascopeState | null): SignalTrailsVisualizationFrame {
    const channels = quadrascope?.channels ?? [];
    this.energies.fill(0);

    for (let channel = 0; channel < 4; channel += 1) {
      const samplePoints = channels[channel]?.sample ?? [];
      let energy = 0;
      for (let index = 0; index < samplePoints.length; index += 1) {
        energy += Math.abs((samplePoints[index] ?? 0) / 128);
      }

      const normalizedEnergy = samplePoints.length === 0 ? 0 : (energy / samplePoints.length);
      this.energies[channel] = normalizedEnergy;
    }

    this.history.push(this.energies);
    const historyLength = this.history.getSize();
    for (let lane = 0; lane < 4; lane += 1) {
      this.history.copyOrderedLane(lane, this.laneBuffers[lane]);
    }

    this.frame.signal.historyLength = historyLength;
    this.frame.signal.maxValue = TRAIL_FIXED_MAX_VALUE;
    return this.frame;
  }
}
