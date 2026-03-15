import type { CursorField, PatternCell, TrackerSnapshot } from '../../core/trackerTypes';
import {
  formatCellEffect,
  formatCellNote,
  formatCellParam,
  formatCellSample,
} from '../../ui/formatters';

export interface PatternCanvasLayout {
  gridLeft: number;
  channelWidth: number;
}

export interface PatternFieldRect {
  x: number;
  width: number;
}

export type PatternFieldRects = Record<CursorField, PatternFieldRect>;

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

export const getPatternViewportStartRow = (
  snapshot: TrackerSnapshot,
  visibleRowCount: number,
): number => {
  const anchorOffset = Math.floor(visibleRowCount / 2);
  const anchorRow = snapshot.transport.playing ? snapshot.transport.row : snapshot.cursor.row;
  return anchorRow - anchorOffset;
};

export const getPatternCanvasLayout = (
  width: number,
  rowIndexWidth: number,
  gutter: number,
  minChannelWidth: number,
): PatternCanvasLayout => {
  const totalGap = gutter * 3;
  const available = width - 16 - rowIndexWidth - totalGap;
  const channelWidth = Math.max(minChannelWidth, Math.floor(available / 4));
  return {
    gridLeft: rowIndexWidth,
    channelWidth,
  };
};

export const getPatternFieldRects = (x: number, width: number): PatternFieldRects => {
  const noteWidth = Math.min(48, Math.max(38, Math.floor(width * 0.28)));
  const digitWidth = Math.min(16, Math.max(12, Math.floor((width - noteWidth - 20) / 5)));
  const sampleStart = x + noteWidth + 10;
  const effectStart = sampleStart + (digitWidth * 2) + 6;
  const paramStart = effectStart + digitWidth + 6;

  return {
    note: { x: x + 8, width: noteWidth - 4 },
    sampleHigh: { x: sampleStart, width: digitWidth },
    sampleLow: { x: sampleStart + digitWidth, width: digitWidth },
    effect: { x: effectStart, width: digitWidth },
    paramHigh: { x: paramStart, width: digitWidth },
    paramLow: { x: paramStart + digitWidth, width: digitWidth },
  };
};

const drawCursorFrame = (
  ctx: CanvasRenderingContext2D,
  drawRoundedRect: RoundedRectDrawer,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  ctx.fillStyle = 'rgba(120, 240, 191, 0.96)';
  drawRoundedRect(ctx, x, y, width, height, 6);
  ctx.fill();
};

const drawPatternDigit = (
  ctx: CanvasRenderingContext2D,
  drawRoundedRect: RoundedRectDrawer,
  rowHeight: number,
  rect: PatternFieldRect,
  value: string,
  selected: boolean,
  y: number,
  effect = false,
): void => {
  if (selected) {
    drawCursorFrame(ctx, drawRoundedRect, rect.x - 1, y + 4, rect.width + 2, rowHeight - 10);
    ctx.fillStyle = '#08110a';
    ctx.fillText(value, rect.x + 3, y + (rowHeight / 2));
    ctx.fillStyle = '#eff8e7';
    return;
  }

  ctx.fillStyle = effect ? '#78f0bf' : '#eff8e7';
  ctx.fillText(value, rect.x + 3, y + (rowHeight / 2));
  ctx.fillStyle = '#eff8e7';
};

const drawPatternCell = (
  ctx: CanvasRenderingContext2D,
  drawRoundedRect: RoundedRectDrawer,
  rowHeight: number,
  x: number,
  y: number,
  width: number,
  rowIndex: number,
  channelIndex: number,
  cell: PatternCell,
  snapshot: TrackerSnapshot,
): void => {
  const selected = rowIndex === snapshot.cursor.row && channelIndex === snapshot.cursor.channel;
  const note = formatCellNote(cell);
  const sample = formatCellSample(cell);
  const effect = formatCellEffect(cell);
  const param = formatCellParam(cell);
  const fieldRects = getPatternFieldRects(x, width);

  if (selected) {
    ctx.fillStyle = 'rgba(34, 54, 40, 0.95)';
    drawRoundedRect(ctx, x, y + 2, width, rowHeight - 6, 10);
    ctx.fill();
  }

  if (selected && snapshot.cursor.field === 'note') {
    drawCursorFrame(ctx, drawRoundedRect, fieldRects.note.x, y + 4, fieldRects.note.width, rowHeight - 10);
    ctx.fillStyle = '#08110a';
  } else {
    ctx.fillStyle = '#eff8e7';
  }
  ctx.fillText(note, fieldRects.note.x + 2, y + (rowHeight / 2));
  ctx.fillStyle = '#eff8e7';

  drawPatternDigit(ctx, drawRoundedRect, rowHeight, fieldRects.sampleHigh, sample[0], selected && snapshot.cursor.field === 'sampleHigh', y);
  drawPatternDigit(ctx, drawRoundedRect, rowHeight, fieldRects.sampleLow, sample[1], selected && snapshot.cursor.field === 'sampleLow', y);
  drawPatternDigit(ctx, drawRoundedRect, rowHeight, fieldRects.effect, effect, selected && snapshot.cursor.field === 'effect', y, true);
  drawPatternDigit(ctx, drawRoundedRect, rowHeight, fieldRects.paramHigh, param[0], selected && snapshot.cursor.field === 'paramHigh', y);
  drawPatternDigit(ctx, drawRoundedRect, rowHeight, fieldRects.paramLow, param[1], selected && snapshot.cursor.field === 'paramLow', y);
};

export interface PatternCanvasRenderOptions {
  canvas: HTMLCanvasElement;
  snapshot: TrackerSnapshot;
  hostWidth: number;
  visibleRowCount: number;
  rowHeight: number;
  gutter: number;
  rowIndexWidth: number;
  minChannelWidth: number;
  drawRoundedRect: RoundedRectDrawer;
}

export const drawPatternCanvas = ({
  canvas,
  snapshot,
  hostWidth,
  visibleRowCount,
  rowHeight,
  gutter,
  rowIndexWidth,
  minChannelWidth,
  drawRoundedRect,
}: PatternCanvasRenderOptions): void => {
  const width = Math.max(320, Math.round(hostWidth || canvas.getBoundingClientRect().width || 960));
  const height = (visibleRowCount * rowHeight) + 20;
  const dpr = window.devicePixelRatio || 1;

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(8, 13, 10, 0.92)';
  drawRoundedRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  const layout = getPatternCanvasLayout(width, rowIndexWidth, gutter, minChannelWidth);
  const firstRow = getPatternViewportStartRow(snapshot, visibleRowCount);
  const centeredRow = snapshot.transport.playing ? snapshot.transport.row : snapshot.cursor.row;

  ctx.textBaseline = 'middle';
  ctx.font = '16px Consolas, "Courier New", monospace';

  for (let visibleIndex = 0; visibleIndex < visibleRowCount; visibleIndex += 1) {
    const rowIndex = firstRow + visibleIndex;
    const y = 10 + (visibleIndex * rowHeight);
    const row = snapshot.pattern.rows[rowIndex];
    const rowRectHeight = rowHeight - 2;
    const centered = rowIndex === centeredRow;

    if (!row) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = 'rgba(212, 255, 117, 0.06)';
      drawRoundedRect(ctx, 8, y, width - 16, rowRectHeight, 12);
      ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }

    if (centered) {
      ctx.fillStyle = 'rgba(212, 255, 117, 0.09)';
      drawRoundedRect(ctx, 8, y, width - 16, rowRectHeight, 12);
      ctx.fill();
    }

    if (row.index === snapshot.transport.row) {
      ctx.fillStyle = 'rgba(120, 240, 191, 0.12)';
      drawRoundedRect(ctx, 8, y, width - 16, rowRectHeight, 12);
      ctx.fill();
    }

    if (row.index === snapshot.cursor.row) {
      ctx.strokeStyle = 'rgba(120, 240, 191, 0.5)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, 8.5, y + 0.5, width - 17, rowRectHeight - 1, 12);
      ctx.stroke();
    }

    ctx.fillStyle = '#d4ff75';
    ctx.fillText(String(row.index).padStart(2, '0'), 20, y + (rowHeight / 2));

    row.channels.forEach((cell, channelIndex) => {
      const cellX = layout.gridLeft + (channelIndex * (layout.channelWidth + gutter));
      drawPatternCell(ctx, drawRoundedRect, rowHeight, cellX, y, layout.channelWidth, row.index, channelIndex, cell, snapshot);
    });
  }
};
