import type { PatternCell, SampleSlot } from '../core/trackerTypes';

export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const formatPatternCell = (cell: PatternCell): string => {
  const note = formatCellNote(cell);
  const sample = formatCellSample(cell);
  const effect = formatCellEffect(cell);
  const param = formatCellParam(cell);
  return `${note} ${sample} ${effect}${param}`;
};

export const formatCellNote = (cell: PatternCell): string => cell.note ?? '---';

export const formatCellSample = (cell: PatternCell): string =>
  cell.sample === null ? '00' : (cell.sample + 1).toString(16).toUpperCase().padStart(2, '0');

export const formatCellEffect = (cell: PatternCell): string =>
  (cell.effect ?? '0').slice(0, 1).toUpperCase();

export const formatCellParam = (cell: PatternCell): string =>
  (cell.param ?? '00').padStart(2, '0').slice(0, 2).toUpperCase();

export const formatSampleLength = (sample: SampleSlot): string =>
  sample.length === 0 ? 'Empty sample' : `${sample.length.toLocaleString('en-US')} bytes`;
