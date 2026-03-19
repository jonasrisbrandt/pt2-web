import type { CursorField, PatternCell, TrackerSnapshot } from '../../core/trackerTypes';
import { clamp, CURSOR_FIELDS, PIANO_END_ABSOLUTE, PIANO_START_ABSOLUTE, type PianoKey } from '../../ui/appShared';
import { formatCellParam, formatCellSample } from '../../ui/formatters';
import type { TrackerEngine } from '../../core/trackerEngine';
import { resolvePianoKeyFromCanvasPointer } from '../../ui/pianoCanvasShared';

export const handleModernHexEntry = (
  event: KeyboardEvent,
  engine: TrackerEngine,
  snapshot: TrackerSnapshot,
  canEditSnapshot: (snapshot: TrackerSnapshot) => boolean,
  applyCellPatch: (row: number, channel: number, patch: Partial<PatternCell>) => void,
): boolean => {
  if (!canEditSnapshot(snapshot)) {
    return false;
  }

  const key = event.key.toUpperCase();
  if (!/^[0-9A-F]$/.test(key)) {
    return false;
  }

  const { field, row, channel } = snapshot.cursor;
  if (field === 'note') {
    return false;
  }

  const cell = snapshot.pattern.rows[row]?.channels[channel];
  if (!cell) {
    return false;
  }

  event.preventDefault();

  switch (field) {
    case 'sampleHigh':
    case 'sampleLow': {
      const current = formatCellSample(cell);
      const nextDigits = field === 'sampleHigh' ? `${key}${current[1]}` : `${current[0]}${key}`;
      const sampleNumber = Number.parseInt(nextDigits, 16);
      applyCellPatch(row, channel, {
        sample: sampleNumber <= 0 ? null : clamp(sampleNumber, 1, 31) - 1,
      });
      break;
    }
    case 'effect':
      applyCellPatch(row, channel, { effect: key });
      break;
    case 'paramHigh':
    case 'paramLow': {
      const current = formatCellParam(cell);
      const nextDigits = field === 'paramHigh' ? `${key}${current[1]}` : `${current[0]}${key}`;
      applyCellPatch(row, channel, { param: nextDigits });
      break;
    }
  }

  engine.dispatch({
    type: 'cursor/set',
    row: clamp(row + 1, 0, Math.max(0, snapshot.pattern.rows.length - 1)),
    channel,
    field,
  });
  return true;
};

export const resolvePatternFieldFromPointer = (
  x: number,
  fieldRects: Record<CursorField, { x: number; width: number }>,
): CursorField => {
  for (const field of CURSOR_FIELDS) {
    const rect = fieldRects[field];
    if (x >= rect.x && x <= rect.x + rect.width) {
      return field;
    }
  }

  return 'note';
};

export interface PatternCanvasPointerOptions {
  event: MouseEvent;
  engine: TrackerEngine;
  snapshot: TrackerSnapshot;
  canvas: HTMLCanvasElement;
  visibleRowCount: number;
  rowHeight: number;
  gutter: number;
  getPatternViewportStartRow: (snapshot: TrackerSnapshot) => number;
  getPatternCanvasLayout: (width: number) => { gridLeft: number; channelWidth: number };
  getPatternFieldRects: (x: number, width: number) => Record<CursorField, { x: number; width: number }>;
}

export const handlePatternCanvasPointer = ({
  event,
  engine,
  snapshot,
  canvas,
  visibleRowCount,
  rowHeight,
  gutter,
  getPatternViewportStartRow,
  getPatternCanvasLayout,
  getPatternFieldRects,
}: PatternCanvasPointerOptions): void => {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const rowTop = 10;
  const rowIndexInView = Math.floor((y - rowTop) / rowHeight);
  if (rowIndexInView < 0 || rowIndexInView >= visibleRowCount) {
    return;
  }

  const row = getPatternViewportStartRow(snapshot) + rowIndexInView;
  if (row < 0 || row >= snapshot.pattern.rows.length) {
    return;
  }

  const layout = getPatternCanvasLayout(rect.width);
  const channelStride = layout.channelWidth + gutter;
  const localX = x - layout.gridLeft;
  if (localX < 0) {
    return;
  }

  const channel = Math.floor(localX / channelStride);
  if (channel < 0 || channel >= 4) {
    return;
  }

  const channelX = layout.gridLeft + (channel * channelStride);
  const channelLocalX = x - channelX;
  if (channelLocalX < 0 || channelLocalX > layout.channelWidth) {
    return;
  }

  const fieldRects = getPatternFieldRects(channelX, layout.channelWidth);
  const field = resolvePatternFieldFromPointer(x, fieldRects);

  engine.dispatch({
    type: 'cursor/set',
    row,
    channel,
    field,
  });
};

export interface PianoPointerOptions {
  event: MouseEvent;
  engine: TrackerEngine;
  snapshot: TrackerSnapshot;
  canvas: HTMLCanvasElement;
  canEditSnapshot: (snapshot: TrackerSnapshot) => boolean;
  onGlow: (channel: number, absolute: number) => void;
  onActiveNote: (channel: number, absolute: number) => void;
  onAfterCommit: (snapshot: TrackerSnapshot) => void;
}

export const resolvePianoKeyFromPointer = (
  event: MouseEvent,
  canvas: HTMLCanvasElement,
): PianoKey | null => {
  return resolvePianoKeyFromCanvasPointer(
    event,
    canvas,
    PIANO_START_ABSOLUTE,
    PIANO_END_ABSOLUTE,
  );
};

export const handlePianoPointer = ({
  event,
  engine,
  snapshot,
  canvas,
  canEditSnapshot,
  onGlow,
  onActiveNote,
  onAfterCommit,
}: PianoPointerOptions): void => {
  const targetKey = resolvePianoKeyFromPointer(event, canvas);
  if (!targetKey || !canEditSnapshot(snapshot) || snapshot.cursor.field !== 'note') {
    return;
  }

  event.preventDefault();
  engine.dispatch({
    type: 'pattern/set-cell',
    row: snapshot.cursor.row,
    channel: snapshot.cursor.channel,
    patch: { note: targetKey.note },
  });
  onActiveNote(snapshot.cursor.channel, targetKey.absolute);
  onGlow(snapshot.cursor.channel, targetKey.absolute);
  engine.dispatch({ type: 'cursor/move', rowDelta: 1 });
  onAfterCommit(engine.getSnapshot());
};

export interface SampleEditorPointerState {
  mode: 'idle' | 'select' | 'loop-start' | 'loop-end';
  active: boolean;
  anchor: number;
  current: number;
}

export interface SampleEditorLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SampleEditorPointerDownOptions {
  event: MouseEvent;
  snapshot: TrackerSnapshot;
  canvas: HTMLCanvasElement;
  canEditSnapshot: (snapshot: TrackerSnapshot) => boolean;
  getSampleEditorLayout: (width: number, height: number) => SampleEditorLayout;
  sampleEditorXToOffset: (clientX: number, snapshot: TrackerSnapshot) => number;
  sampleOffsetToEditorX: (offset: number, snapshot: TrackerSnapshot, layout: SampleEditorLayout) => number;
}

export const beginSampleEditorPointer = ({
  event,
  snapshot,
  canvas,
  canEditSnapshot,
  getSampleEditorLayout,
  sampleEditorXToOffset,
  sampleOffsetToEditorX,
}: SampleEditorPointerDownOptions): SampleEditorPointerState | null => {
  if (!snapshot.sampleEditor.open || !canEditSnapshot(snapshot)) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const layout = getSampleEditorLayout(rect.width, rect.height);
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  if (localX < layout.left || localX > layout.left + layout.width || localY < layout.top || localY > layout.top + layout.height) {
    return null;
  }

  const offset = sampleEditorXToOffset(event.clientX, snapshot);
  const loopEnabled = snapshot.samples[snapshot.selectedSample].loopLength > 2 && snapshot.samples[snapshot.selectedSample].length > 2;
  const loopStartX = sampleOffsetToEditorX(snapshot.sampleEditor.loopStart, snapshot, layout);
  const loopEndX = sampleOffsetToEditorX(snapshot.sampleEditor.loopEnd, snapshot, layout);
  const handleThreshold = 10;

  if (loopEnabled && Math.abs(localX - loopStartX) <= handleThreshold) {
    return { mode: 'loop-start', active: true, anchor: offset, current: offset };
  }

  if (loopEnabled && Math.abs(localX - loopEndX) <= handleThreshold) {
    return { mode: 'loop-end', active: true, anchor: offset, current: offset };
  }

  return { mode: 'select', active: true, anchor: offset, current: offset };
};

export const updateSampleEditorPointer = (
  event: MouseEvent,
  snapshot: TrackerSnapshot,
  pointer: SampleEditorPointerState,
  canEditSnapshot: (snapshot: TrackerSnapshot) => boolean,
  sampleEditorXToOffset: (clientX: number, snapshot: TrackerSnapshot) => number,
): SampleEditorPointerState | null => {
  if (!pointer.active || !canEditSnapshot(snapshot)) {
    return null;
  }

  return {
    ...pointer,
    current: sampleEditorXToOffset(event.clientX, snapshot),
  };
};

export const completeSampleEditorPointer = (
  engine: TrackerEngine,
  snapshot: TrackerSnapshot,
  pointer: SampleEditorPointerState,
  canEditSnapshot: (snapshot: TrackerSnapshot) => boolean,
): TrackerSnapshot | null => {
  if (!pointer.active || !canEditSnapshot(snapshot)) {
    return null;
  }

  if (pointer.mode === 'select') {
    const rawStart = Math.min(pointer.anchor, pointer.current);
    const rawEnd = Math.max(pointer.anchor, pointer.current);
    const start = clamp(rawStart & ~1, 0, Math.max(0, snapshot.sampleEditor.sampleLength - 1));
    const end = clamp((rawEnd + 1) & ~1, 0, snapshot.sampleEditor.sampleLength);

    if (end - start < 2) {
      engine.dispatch({ type: 'sample-editor/set-selection', start: null, end: null });
    } else {
      engine.dispatch({
        type: 'sample-editor/set-selection',
        start,
        end,
      });
    }
  } else if (pointer.mode === 'loop-start') {
    engine.dispatch({
      type: 'sample-editor/set-loop',
      start: Math.min(pointer.current, snapshot.sampleEditor.loopEnd - 2),
    });
  } else if (pointer.mode === 'loop-end') {
    engine.dispatch({
      type: 'sample-editor/set-loop',
      end: Math.max(pointer.current, snapshot.sampleEditor.loopStart + 2),
    });
  }

  return engine.getSnapshot();
};

export const zoomSampleEditorFromWheel = (
  event: WheelEvent,
  engine: TrackerEngine,
  snapshot: TrackerSnapshot,
  sampleEditorXToOffset: (clientX: number, snapshot: TrackerSnapshot) => number,
): TrackerSnapshot => {
  event.preventDefault();
  const anchor = sampleEditorXToOffset(event.clientX, snapshot);
  engine.dispatch({
    type: event.deltaY < 0 ? 'sample-editor/zoom-in' : 'sample-editor/zoom-out',
    anchor,
  });
  return engine.getSnapshot();
};

export const scrollPatternFromWheel = (
  event: WheelEvent,
  snapshot: TrackerSnapshot,
): { row: number; channel: number; field: CursorField } | null => {
  if (event.deltaY === 0) {
    return null;
  }

  event.preventDefault();
  const delta = Math.sign(event.deltaY) * Math.max(1, Math.round(Math.abs(event.deltaY) / 80));

  return {
    row: clamp(snapshot.cursor.row + delta, 0, Math.max(0, snapshot.pattern.rows.length - 1)),
    channel: snapshot.cursor.channel,
    field: snapshot.cursor.field,
  };
};
