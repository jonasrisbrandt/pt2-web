import type { QuadrascopeState, TrackerSnapshot } from '../../core/trackerTypes';
import {
  buildPianoKeys,
  brighten,
  CHANNEL_COLORS,
  clamp,
  darken,
  hexToRgb,
  mixRgb,
  noteToAbsolute,
  PIANO_END_ABSOLUTE,
  PIANO_START_ABSOLUTE,
  rgba,
  spectrumColorAt,
} from '../../ui/appShared';

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

const setupCanvas = (
  canvas: HTMLCanvasElement,
  minWidth: number,
  height: number,
): { ctx: CanvasRenderingContext2D; width: number; height: number } | null => {
  const widthSource = canvas.parentElement?.clientWidth
    || canvas.getBoundingClientRect().width
    || 960;
  if (widthSource <= 0) {
    return null;
  }

  const width = Math.max(minWidth, Math.round(widthSource));
  const dpr = window.devicePixelRatio || 1;

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = '100%';
    canvas.style.height = `${height}px`;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
};

export interface QuadrascopeRenderOptions {
  canvas: HTMLCanvasElement;
  quadrascope: QuadrascopeState | null;
  height: number;
  drawRoundedRect: RoundedRectDrawer;
}

export const drawQuadrascopeStack = ({
  canvas,
  quadrascope,
  height,
  drawRoundedRect,
}: QuadrascopeRenderOptions): void => {
  const setup = setupCanvas(canvas, 220, height);
  if (!setup) {
    return;
  }

  const { ctx, width } = setup;
  ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
  drawRoundedRect(ctx, 0, 0, width, height, 18);
  ctx.fill();
  ctx.font = '14px Consolas, "Courier New", monospace';
  ctx.textBaseline = 'middle';

  const laneHeight = (height - 36) / 4;
  const scopeChannels = quadrascope?.channels ?? [];

  for (let channel = 0; channel < 4; channel += 1) {
    const laneTop = 16 + (channel * laneHeight);
    const laneMid = laneTop + (laneHeight / 2);
    const scopeChannel = scopeChannels[channel];
    const samplePoints = scopeChannel?.sample ?? [];
    const volume = scopeChannel?.volume ?? 0;
    const active = scopeChannel?.active ?? false;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    drawRoundedRect(ctx, 10, laneTop, width - 20, laneHeight - 10, 12);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(16, laneMid);
    ctx.lineTo(width - 16, laneMid);
    ctx.stroke();

    ctx.strokeStyle = CHANNEL_COLORS[channel];
    ctx.lineWidth = 2;
    ctx.beginPath();

    const pointCount = samplePoints.length > 0 ? samplePoints.length : 64;
    for (let index = 0; index < pointCount; index += 1) {
      const normalizedX = index / Math.max(1, pointCount - 1);
      const sampleValue = samplePoints[index] ?? 0;
      const normalizedSample = clamp(sampleValue, -128, 127) / 128;
      const y = laneMid + (normalizedSample * laneHeight * 0.36);
      const x = 16 + (normalizedX * (width - 32));

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.fillStyle = CHANNEL_COLORS[channel];
    ctx.fillText(`CH${channel + 1}`, 18, laneTop + 14);
    ctx.fillStyle = 'rgba(239, 248, 231, 0.72)';
    ctx.fillText(active ? `VOL ${String(volume).padStart(2, '0')}` : 'IDLE', width - 86, laneTop + 14);
  }
};

export const drawQuadrascopeClassic = ({
  canvas,
  quadrascope,
  height,
  drawRoundedRect,
}: QuadrascopeRenderOptions): void => {
  const setup = setupCanvas(canvas, 220, height);
  if (!setup) {
    return;
  }

  const { ctx, width } = setup;
  ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
  drawRoundedRect(ctx, 0, 0, width, height, 18);
  ctx.fill();
  ctx.font = '13px Consolas, "Courier New", monospace';
  ctx.textBaseline = 'middle';

  const columnWidth = (width - 30) / 4;
  const scopeChannels = quadrascope?.channels ?? [];

  for (let channel = 0; channel < 4; channel += 1) {
    const x = 10 + (channel * columnWidth);
    const y = 14;
    const w = columnWidth - 8;
    const h = height - 28;
    const midY = y + (h / 2);
    const scopeChannel = scopeChannels[channel];
    const samplePoints = scopeChannel?.sample ?? [];

    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    drawRoundedRect(ctx, x, y, w, h, 12);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(x + 8, midY);
    ctx.lineTo(x + w - 8, midY);
    ctx.stroke();

    ctx.strokeStyle = CHANNEL_COLORS[channel];
    ctx.lineWidth = 2;
    ctx.beginPath();

    const pointCount = samplePoints.length > 0 ? samplePoints.length : 64;
    for (let index = 0; index < pointCount; index += 1) {
      const t = index / Math.max(1, pointCount - 1);
      const sampleValue = samplePoints[index] ?? 0;
      const normalizedSample = clamp(sampleValue, -128, 127) / 128;
      const pointX = x + 8 + (t * (w - 16));
      const pointY = midY + (normalizedSample * h * 0.34);
      if (index === 0) {
        ctx.moveTo(pointX, pointY);
      } else {
        ctx.lineTo(pointX, pointY);
      }
    }

    ctx.stroke();
    ctx.fillStyle = CHANNEL_COLORS[channel];
    ctx.fillText(`CH${channel + 1}`, x + 10, y + 14);
  }
};

export interface SpectrumRenderOptions {
  canvas: HTMLCanvasElement;
  quadrascope: QuadrascopeState | null;
  height: number;
  compact: boolean;
  drawRoundedRect: RoundedRectDrawer;
}

export const drawSpectrumAnalyzer = ({
  canvas,
  quadrascope,
  height,
  compact,
  drawRoundedRect,
}: SpectrumRenderOptions): void => {
  const setup = setupCanvas(canvas, 220, height);
  if (!setup) {
    return;
  }

  const { ctx, width } = setup;
  ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
  drawRoundedRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  const bgGradient = ctx.createLinearGradient(0, 0, width, 0);
  bgGradient.addColorStop(0, 'rgba(212, 255, 117, 0.05)');
  bgGradient.addColorStop(0.35, 'rgba(120, 240, 191, 0.04)');
  bgGradient.addColorStop(0.7, 'rgba(138, 199, 255, 0.045)');
  bgGradient.addColorStop(1, 'rgba(255, 191, 122, 0.05)');
  ctx.fillStyle = bgGradient;
  drawRoundedRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  ctx.strokeStyle = 'rgba(239, 248, 231, 0.06)';
  ctx.lineWidth = 1;
  for (let line = 1; line <= 4; line += 1) {
    const y = 12 + (((height - 24) / 5) * line);
    ctx.beginPath();
    ctx.moveTo(14, y);
    ctx.lineTo(width - 14, y);
    ctx.stroke();
  }

  const channels = quadrascope?.channels ?? [];
  const allSamples = channels.flatMap((channel) => channel.sample);
  const barCount = compact
    ? Math.max(32, Math.floor(width / 12))
    : Math.max(24, Math.floor(width / 24));
  const usableHeight = height - 24;
  const slotWidth = (width - 28) / barCount;
  const barWidth = compact
    ? Math.max(4, Math.min(7, slotWidth - 1))
    : Math.max(8, Math.min(14, slotWidth - 1));

  for (let bar = 0; bar < barCount; bar += 1) {
    const start = Math.floor((bar / barCount) * allSamples.length);
    const end = Math.max(start + 1, Math.floor(((bar + 1) / barCount) * allSamples.length));
    let energy = 0;
    for (let index = start; index < end; index += 1) {
      energy += Math.abs(allSamples[index] ?? 0);
    }

    const normalized = allSamples.length === 0 ? 0 : clamp((energy / Math.max(1, end - start)) / 96, 0, 1);
    const barHeight = Math.max(4, Math.round(normalized * usableHeight));
    const x = 14 + (bar * slotWidth);
    const y = height - 12 - barHeight;
    const baseColor = spectrumColorAt(bar / Math.max(1, barCount - 1));
    const topColor = brighten(baseColor, 0.18 + (normalized * 0.28));
    const bottomColor = darken(baseColor, 0.38);
    const gradient = ctx.createLinearGradient(x, y, x, height - 12);
    gradient.addColorStop(0, rgba(topColor, 0.96));
    gradient.addColorStop(0.45, rgba(baseColor, 0.78));
    gradient.addColorStop(1, rgba(bottomColor, 0.35));
    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, x, y, barWidth, barHeight, Math.min(6, barWidth * 0.5));
    ctx.fill();
  }
};

export interface SignalTrailsRenderOptions {
  canvas: HTMLCanvasElement;
  quadrascope: QuadrascopeState | null;
  trailColumns: number[][];
  height: number;
  drawRoundedRect: RoundedRectDrawer;
}

export const drawSignalTrails = ({
  canvas,
  quadrascope,
  trailColumns,
  height,
  drawRoundedRect,
}: SignalTrailsRenderOptions): void => {
  const setup = setupCanvas(canvas, 220, height);
  if (!setup) {
    return;
  }

  const { ctx, width } = setup;
  ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
  drawRoundedRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  const channels = quadrascope?.channels ?? [];
  const laneHeight = (height - 28) / 4;
  const historyLength = Math.max(64, Math.floor(width / 5));

  for (let channel = 0; channel < 4; channel += 1) {
    const laneTop = 12 + (channel * laneHeight);
    const laneMid = laneTop + (laneHeight / 2);
    const samples = channels[channel]?.sample ?? [];
    const energy = samples.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, samples.length);

    const history = trailColumns[channel];
    history.push(energy);
    if (history.length > historyLength) {
      history.shift();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    drawRoundedRect(ctx, 10, laneTop, width - 20, laneHeight - 8, 10);
    ctx.fill();

    history.forEach((value, index) => {
      const t = index / Math.max(1, historyLength - 1);
      const alpha = 0.08 + (t * 0.88);
      const amplitude = clamp(value / 72, 0, 1);
      const barHeight = Math.max(2, amplitude * (laneHeight - 18));
      const x = 14 + (index * ((width - 28) / historyLength));
      const y = laneMid - (barHeight / 2);
      ctx.fillStyle = rgba(brighten(hexToRgb(CHANNEL_COLORS[channel]), amplitude * 0.3), alpha);
      drawRoundedRect(ctx, x, y, 3, barHeight, 3);
      ctx.fill();
    });

    ctx.fillStyle = CHANNEL_COLORS[channel];
    ctx.font = '12px Consolas, "Courier New", monospace';
    ctx.fillText(`CH${channel + 1}`, 18, laneTop + 12);
  }
};

export const triggerPianoGlow = (
  pianoGlowLevels: number[][],
  channel: number,
  absolute: number,
): void => {
  const safeChannel = clamp(channel, 0, 3);
  const safeNote = clamp(absolute, PIANO_START_ABSOLUTE, PIANO_END_ABSOLUTE);
  pianoGlowLevels[safeChannel][safeNote] = 1;
};

export const syncPianoNotes = (
  snapshot: TrackerSnapshot,
  lastPianoTransportKey: string | null,
  activePianoNotes: Array<number | null>,
  pianoGlowLevels: number[][],
): string | null => {
  if (!snapshot.transport.playing) {
    return null;
  }

  const transportKey = `${snapshot.transport.position}:${snapshot.transport.pattern}:${snapshot.transport.row}`;
  if (transportKey !== lastPianoTransportKey) {
    const playingRow = snapshot.pattern.rows[snapshot.transport.row];
    for (let channel = 0; channel < 4; channel += 1) {
      const absolute = noteToAbsolute(playingRow?.channels[channel]?.note);
      if (absolute !== null) {
        activePianoNotes[channel] = absolute;
        triggerPianoGlow(pianoGlowLevels, channel, absolute);
      }
    }
  }

  return transportKey;
};

export const decayPianoGlowLevels = (
  pianoGlowLevels: number[][],
  previousFrameAt: number | null,
): number => {
  const now = performance.now();
  const deltaMs = previousFrameAt === null ? 16 : Math.min(48, now - previousFrameAt);
  const decayFactor = Math.exp(-deltaMs / 180);

  for (let channel = 0; channel < pianoGlowLevels.length; channel += 1) {
    const levels = pianoGlowLevels[channel];
    for (let note = PIANO_START_ABSOLUTE; note <= PIANO_END_ABSOLUTE; note += 1) {
      levels[note] *= decayFactor;
      if (levels[note] < 0.01) {
        levels[note] = 0;
      }
    }
  }

  return now;
};

export interface PianoVisualizerRenderOptions {
  canvas: HTMLCanvasElement;
  pianoGlowLevels: number[][];
  height: number;
  drawRoundedRect: RoundedRectDrawer;
}

export const drawPianoVisualizer = ({
  canvas,
  pianoGlowLevels,
  height,
  drawRoundedRect,
}: PianoVisualizerRenderOptions): void => {
  const setup = setupCanvas(canvas, 220, height);
  if (!setup) {
    return;
  }

  const { ctx, width } = setup;
  ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
  drawRoundedRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  const padding = 16;
  const keyboardTop = 14;
  const keyboardHeight = height - 28;
  const keyboardWidth = width - (padding * 2);
  const keys = buildPianoKeys(keyboardWidth);
  const whiteKeys = keys.filter((key) => !key.black);
  const blackKeys = keys.filter((key) => key.black);

  ctx.font = '11px Consolas, "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  for (const key of whiteKeys) {
    const x = padding + key.x;
    const keyLevels = pianoGlowLevels.map((levels) => levels[key.absolute] ?? 0);
    const peakLevel = Math.max(...keyLevels);
    const active = peakLevel > 0.01;

    ctx.fillStyle = active
      ? rgba(mixRgb({ r: 197, g: 206, b: 192 }, { r: 229, g: 238, b: 223 }, peakLevel), 0.82 + (peakLevel * 0.12))
      : 'rgba(197, 206, 192, 0.82)';
    drawRoundedRect(ctx, x, keyboardTop, key.width - 2, keyboardHeight, 10);
    ctx.fill();

    if (active) {
      keyLevels.forEach((level, channel) => {
        if (level <= 0.01) {
          return;
        }

        ctx.fillStyle = rgba(brighten(hexToRgb(CHANNEL_COLORS[channel]), 0.04), 0.24 + (level * 0.64));
        drawRoundedRect(ctx, x + 2, keyboardTop + 2, key.width - 6, keyboardHeight - 4, 8);
        ctx.fill();
      });
    }

    ctx.strokeStyle = active ? 'rgba(8, 13, 10, 0.55)' : 'rgba(8, 13, 10, 0.28)';
    ctx.lineWidth = 1.2;
    drawRoundedRect(ctx, x, keyboardTop, key.width - 2, keyboardHeight, 10);
    ctx.stroke();

    const showLabel = active || key.note.startsWith('C-');
    if (showLabel) {
      ctx.fillStyle = active ? 'rgba(8, 13, 10, 0.92)' : 'rgba(8, 13, 10, 0.68)';
      ctx.fillText(key.note, x + ((key.width - 2) / 2), keyboardTop + keyboardHeight - 10);
    }
  }

  const blackHeight = keyboardHeight * 0.66;
  for (const key of blackKeys) {
    const x = padding + key.x;
    const keyLevels = pianoGlowLevels.map((levels) => levels[key.absolute] ?? 0);
    const peakLevel = Math.max(...keyLevels);
    const active = peakLevel > 0.01;

    ctx.fillStyle = active ? 'rgba(24, 31, 29, 0.98)' : 'rgba(14, 18, 17, 0.98)';
    drawRoundedRect(ctx, x, keyboardTop, key.width, blackHeight, 9);
    ctx.fill();

    if (active) {
      keyLevels.forEach((level, channel) => {
        if (level <= 0.01) {
          return;
        }

        ctx.fillStyle = rgba(brighten(hexToRgb(CHANNEL_COLORS[channel]), 0.08), 0.34 + (level * 0.76));
        drawRoundedRect(ctx, x + 2, keyboardTop + 2, key.width - 4, blackHeight - 4, 7);
        ctx.fill();
      });
    }

    ctx.strokeStyle = active ? 'rgba(239, 248, 231, 0.12)' : 'rgba(239, 248, 231, 0.08)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x, keyboardTop, key.width, blackHeight, 9);
    ctx.stroke();
  }
};
