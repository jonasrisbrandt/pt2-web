import {
  brighten,
  buildPianoKeys,
  CHANNEL_COLORS,
  clamp,
  hexToRgb,
  mixRgb,
  rgba,
  type PianoKey,
} from './appShared';

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

export interface PianoCanvasMetrics {
  padding: number;
  keyboardTop: number;
  keyboardBottom: number;
  blackHeightRatio: number;
}

export interface PianoCanvasDrawOptions {
  canvas: HTMLCanvasElement;
  pianoGlowLevels: number[][];
  heldNotes?: Iterable<number>;
  height: number;
  startAbsolute: number;
  endAbsolute: number;
  drawRoundedRect: RoundedRectDrawer;
  minWidth?: number;
}

const DEFAULT_MIN_WIDTH = 220;
const DEFAULT_PIANO_CANVAS_METRICS: PianoCanvasMetrics = {
  padding: 16,
  keyboardTop: 14,
  keyboardBottom: 14,
  blackHeightRatio: 0.66,
};

interface CachedPianoKeys {
  cacheKey: string;
  whiteKeys: PianoKey[];
  blackKeys: PianoKey[];
}

let cachedPianoKeys: CachedPianoKeys | null = null;

const getCachedPianoKeys = (
  width: number,
  startAbsolute: number,
  endAbsolute: number,
): CachedPianoKeys => {
  const cacheKey = `${width}:${startAbsolute}:${endAbsolute}`;
  if (cachedPianoKeys?.cacheKey === cacheKey) {
    return cachedPianoKeys;
  }

  const keys = buildPianoKeys(width, startAbsolute, endAbsolute);
  const whiteKeys: PianoKey[] = [];
  const blackKeys: PianoKey[] = [];

  for (const key of keys) {
    if (key.black) {
      blackKeys.push(key);
    } else {
      whiteKeys.push(key);
    }
  }

  cachedPianoKeys = {
    cacheKey,
    whiteKeys,
    blackKeys,
  };

  return cachedPianoKeys;
};

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

const getKeyboardMetrics = (
  height: number,
  metrics: PianoCanvasMetrics,
): { padding: number; keyboardTop: number; keyboardHeight: number; blackHeight: number } => {
  const keyboardHeight = height - metrics.keyboardTop - metrics.keyboardBottom;
  return {
    padding: metrics.padding,
    keyboardTop: metrics.keyboardTop,
    keyboardHeight,
    blackHeight: keyboardHeight * metrics.blackHeightRatio,
  };
};

export const createPianoGlowLevels = (
  channelCount: number,
  startAbsolute: number,
  endAbsolute: number,
): number[][] => Array.from(
  { length: Math.max(1, channelCount) },
  () => Array.from({ length: Math.max(0, endAbsolute) + 1 }, (_, index) => (index < startAbsolute ? 0 : 0)),
);

export const triggerPianoGlow = (
  pianoGlowLevels: number[][],
  channel: number,
  absolute: number,
  startAbsolute: number,
  endAbsolute: number,
): void => {
  if (absolute < startAbsolute || absolute > endAbsolute || pianoGlowLevels.length === 0) {
    return;
  }

  const safeChannel = clamp(channel, 0, pianoGlowLevels.length - 1);
  pianoGlowLevels[safeChannel][absolute] = 1;
};

export const decayPianoGlowLevels = (
  pianoGlowLevels: number[][],
  previousFrameAt: number | null,
  startAbsolute: number,
  endAbsolute: number,
): number => {
  const now = performance.now();
  const deltaMs = previousFrameAt === null ? 16 : Math.min(48, now - previousFrameAt);
  const decayFactor = Math.exp(-deltaMs / 180);

  for (let channel = 0; channel < pianoGlowLevels.length; channel += 1) {
    const levels = pianoGlowLevels[channel];
    for (let note = startAbsolute; note <= endAbsolute; note += 1) {
      levels[note] *= decayFactor;
      if (levels[note] < 0.01) {
        levels[note] = 0;
      }
    }
  }

  return now;
};

export const resolvePianoKeyFromCanvasPointer = (
  event: MouseEvent,
  canvas: HTMLCanvasElement,
  startAbsolute: number,
  endAbsolute: number,
  metrics: PianoCanvasMetrics = DEFAULT_PIANO_CANVAS_METRICS,
): PianoKey | null => {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const { padding, keyboardTop, keyboardHeight, blackHeight } = getKeyboardMetrics(rect.height, metrics);
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const localX = x - padding;
  const { whiteKeys, blackKeys } = getCachedPianoKeys(Math.max(1, rect.width - (padding * 2)), startAbsolute, endAbsolute);

  const blackKey = blackKeys.find((key) => (
    localX >= key.x
    && localX <= key.x + key.width
    && y >= keyboardTop
    && y <= keyboardTop + blackHeight
  ));
  if (blackKey) {
    return blackKey;
  }

  return whiteKeys.find((key) => (
    localX >= key.x
    && localX <= key.x + key.width
    && y >= keyboardTop
    && y <= keyboardTop + keyboardHeight
  )) ?? null;
};

export const drawPianoCanvas = ({
  canvas,
  pianoGlowLevels,
  heldNotes,
  height,
  startAbsolute,
  endAbsolute,
  drawRoundedRect,
  minWidth = DEFAULT_MIN_WIDTH,
}: PianoCanvasDrawOptions): void => {
  const setup = setupCanvas(canvas, minWidth, height);
  if (!setup) {
    return;
  }

  const { ctx, width } = setup;
  const metrics = DEFAULT_PIANO_CANVAS_METRICS;
  const { padding, keyboardTop, keyboardHeight, blackHeight } = getKeyboardMetrics(height, metrics);
  const { whiteKeys, blackKeys } = getCachedPianoKeys(Math.max(1, width - (padding * 2)), startAbsolute, endAbsolute);
  const heldNoteSet = heldNotes instanceof Set ? heldNotes : new Set(heldNotes ?? []);

  ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
  drawRoundedRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  ctx.font = '11px Consolas, "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  for (const key of whiteKeys) {
    const x = padding + key.x;
    let peakLevel = 0;
    for (let channel = 0; channel < pianoGlowLevels.length; channel += 1) {
      const level = pianoGlowLevels[channel][key.absolute] ?? 0;
      if (level > peakLevel) {
        peakLevel = level;
      }
    }

    const held = heldNoteSet.has(key.absolute);
    const emphasis = held ? Math.max(peakLevel, 0.28) : peakLevel;
    const active = held || peakLevel > 0.01;

    ctx.fillStyle = active
      ? rgba(mixRgb({ r: 197, g: 206, b: 192 }, { r: 229, g: 238, b: 223 }, emphasis), 0.82 + (emphasis * 0.12))
      : 'rgba(197, 206, 192, 0.82)';
    drawRoundedRect(ctx, x, keyboardTop, key.width - 2, keyboardHeight, 10);
    ctx.fill();

    if (active) {
      for (let channel = 0; channel < pianoGlowLevels.length; channel += 1) {
        const level = pianoGlowLevels[channel][key.absolute] ?? 0;
        if (level <= 0.01) {
          continue;
        }

        ctx.fillStyle = rgba(brighten(hexToRgb(CHANNEL_COLORS[channel % CHANNEL_COLORS.length]), 0.04), 0.24 + (level * 0.64));
        drawRoundedRect(ctx, x + 2, keyboardTop + 2, key.width - 6, keyboardHeight - 4, 8);
        ctx.fill();
      }
    }

    ctx.strokeStyle = active ? 'rgba(8, 13, 10, 0.55)' : 'rgba(8, 13, 10, 0.28)';
    ctx.lineWidth = 1.2;
    drawRoundedRect(ctx, x, keyboardTop, key.width - 2, keyboardHeight, 10);
    ctx.stroke();

    if (active || key.note.startsWith('C-')) {
      ctx.fillStyle = active ? 'rgba(8, 13, 10, 0.92)' : 'rgba(8, 13, 10, 0.68)';
      ctx.fillText(key.note, x + ((key.width - 2) / 2), keyboardTop + keyboardHeight - 10);
    }
  }

  for (const key of blackKeys) {
    const x = padding + key.x;
    let peakLevel = 0;
    for (let channel = 0; channel < pianoGlowLevels.length; channel += 1) {
      const level = pianoGlowLevels[channel][key.absolute] ?? 0;
      if (level > peakLevel) {
        peakLevel = level;
      }
    }

    const held = heldNoteSet.has(key.absolute);
    const active = held || peakLevel > 0.01;

    ctx.fillStyle = active ? 'rgba(24, 31, 29, 0.98)' : 'rgba(14, 18, 17, 0.98)';
    drawRoundedRect(ctx, x, keyboardTop, key.width, blackHeight, 9);
    ctx.fill();

    if (active) {
      for (let channel = 0; channel < pianoGlowLevels.length; channel += 1) {
        const level = pianoGlowLevels[channel][key.absolute] ?? 0;
        if (level <= 0.01) {
          continue;
        }

        ctx.fillStyle = rgba(brighten(hexToRgb(CHANNEL_COLORS[channel % CHANNEL_COLORS.length]), 0.08), 0.34 + (level * 0.76));
        drawRoundedRect(ctx, x + 2, keyboardTop + 2, key.width - 4, blackHeight - 4, 7);
        ctx.fill();
      }
    }

    ctx.strokeStyle = active ? 'rgba(239, 248, 231, 0.12)' : 'rgba(239, 248, 231, 0.08)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x, keyboardTop, key.width, blackHeight, 9);
    ctx.stroke();
  }
};
