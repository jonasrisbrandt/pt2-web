import type { CursorField, TrackerSnapshot } from '../core/trackerTypes';

export const MIN_OCTAVE = 1;
export const MAX_OCTAVE = 2;
export const SAMPLE_PAGE_SIZE = 16;
export const CURSOR_FIELDS: CursorField[] = ['note', 'sampleHigh', 'sampleLow', 'effect', 'paramHigh', 'paramLow'];
export const CHANNEL_COLORS = ['#deff5a', '#43f7af', '#5ab8ff', '#ffad46'];
export const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
export const PIANO_START_ABSOLUTE = 12;
export const PIANO_END_ABSOLUTE = 47;
export const VISUALIZATION_MODES = ['quad-stack', 'quad-classic', 'spectrum', 'split', 'signal-trails', 'piano'] as const;

export type VisualizationMode = (typeof VISUALIZATION_MODES)[number];

export interface PianoKey {
  note: string;
  absolute: number;
  black: boolean;
  x: number;
  width: number;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const hexToRgb = (hex: string): RgbColor => {
  const value = hex.replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map((char) => `${char}${char}`).join('')
    : value;

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

export const mixRgb = (
  left: RgbColor,
  right: RgbColor,
  amount: number,
): RgbColor => ({
  r: Math.round(left.r + ((right.r - left.r) * amount)),
  g: Math.round(left.g + ((right.g - left.g) * amount)),
  b: Math.round(left.b + ((right.b - left.b) * amount)),
});

export const rgba = (color: RgbColor, alpha = 1): string =>
  `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;

export const brighten = (color: RgbColor, amount: number): RgbColor =>
  mixRgb(color, { r: 255, g: 255, b: 255 }, amount);

export const darken = (color: RgbColor, amount: number): RgbColor =>
  mixRgb(color, { r: 8, g: 13, b: 10 }, amount);

export const spectrumColorAt = (t: number): RgbColor => {
  const clamped = clamp(t, 0, 1);
  const scaled = clamped * (CHANNEL_COLORS.length - 1);
  const leftIndex = Math.floor(scaled);
  const rightIndex = Math.min(CHANNEL_COLORS.length - 1, leftIndex + 1);
  const localT = scaled - leftIndex;
  return mixRgb(hexToRgb(CHANNEL_COLORS[leftIndex]), hexToRgb(CHANNEL_COLORS[rightIndex]), localT);
};

export const moveCursorHorizontally = (
  cursor: TrackerSnapshot['cursor'],
  channelCount: number,
  direction: -1 | 1,
): { channel: number; field: CursorField } => {
  const maxChannel = Math.max(0, channelCount - 1);
  let fieldIndex = CURSOR_FIELDS.indexOf(cursor.field);
  let channel = cursor.channel;

  fieldIndex += direction;

  if (fieldIndex < 0) {
    if (channel > 0) {
      channel -= 1;
      fieldIndex = CURSOR_FIELDS.length - 1;
    } else {
      fieldIndex = 0;
    }
  } else if (fieldIndex >= CURSOR_FIELDS.length) {
    if (channel < maxChannel) {
      channel += 1;
      fieldIndex = 0;
    } else {
      fieldIndex = CURSOR_FIELDS.length - 1;
    }
  }

  return {
    channel,
    field: CURSOR_FIELDS[fieldIndex],
  };
};

export const getVisualizationLabel = (mode: VisualizationMode): string => {
  switch (mode) {
    case 'quad-stack':
      return 'Quadrascope';
    case 'quad-classic':
      return 'Classic quadrascope';
    case 'spectrum':
      return 'Spectrum analyzer';
    case 'split':
      return 'Scope + spectrum';
    case 'signal-trails':
      return 'Signal trails';
    case 'piano':
      return 'Tracker piano';
  }
};

export const formatSongTime = (snapshot: TrackerSnapshot): string => {
  const secondsPerRow = (snapshot.transport.speed * 2.5) / Math.max(1, snapshot.transport.bpm);
  const totalRows = (snapshot.transport.position * 64) + snapshot.transport.row;
  const totalSeconds = Math.max(0, Math.floor(totalRows * secondsPerRow));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const triggerDownload = (filename: string, mimeType: string, bytes: Uint8Array): void => {
  const blob = new Blob([Uint8Array.from(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const noteToAbsolute = (note: string | null | undefined): number | null => {
  if (!note || note === '---' || note.length < 3) {
    return null;
  }

  const pitch = note.slice(0, 2);
  const octave = Number.parseInt(note.slice(2), 10);
  const pitchIndex = NOTE_NAMES.indexOf(pitch);
  if (pitchIndex < 0 || Number.isNaN(octave)) {
    return null;
  }

  return (octave * 12) + pitchIndex;
};

const absoluteToNote = (absolute: number): string => {
  const clamped = clamp(absolute, PIANO_START_ABSOLUTE, PIANO_END_ABSOLUTE);
  return `${NOTE_NAMES[clamped % 12]}${Math.floor(clamped / 12)}`;
};

const isBlackSemitone = (absolute: number): boolean => [1, 3, 6, 8, 10].includes(absolute % 12);

export const buildPianoKeys = (
  width: number,
  startAbsolute = PIANO_START_ABSOLUTE,
  endAbsolute = PIANO_END_ABSOLUTE,
): PianoKey[] => {
  const whiteKeys = Array.from({ length: endAbsolute - startAbsolute + 1 }, (_, offset) => startAbsolute + offset)
    .filter((absolute) => !isBlackSemitone(absolute));
  const whiteKeyWidth = width / Math.max(1, whiteKeys.length);
  const whiteKeyMap = new Map<number, number>();

  whiteKeys.forEach((absolute, index) => {
    whiteKeyMap.set(absolute, index);
  });

  return Array.from({ length: endAbsolute - startAbsolute + 1 }, (_, offset) => {
    const absolute = startAbsolute + offset;
    const black = isBlackSemitone(absolute);
    if (!black) {
      const whiteIndex = whiteKeyMap.get(absolute) ?? 0;
      return {
        note: absoluteToNote(absolute),
        absolute,
        black,
        x: whiteIndex * whiteKeyWidth,
        width: whiteKeyWidth,
      };
    }

    const leftWhite = whiteKeyMap.get(absolute - 1) ?? 0;
    return {
      note: absoluteToNote(absolute),
      absolute,
      black,
      x: ((leftWhite + 1) * whiteKeyWidth) - (whiteKeyWidth * 0.32),
      width: whiteKeyWidth * 0.64,
    };
  });
};
