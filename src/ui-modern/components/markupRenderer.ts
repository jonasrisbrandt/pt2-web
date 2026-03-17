import type { CursorField, PatternCell, SampleSlot, TrackerSnapshot } from '../../core/trackerTypes';
import type { InlineNameFieldRenderOptions } from './viewModels';
import {
  escapeHtml,
  formatCellEffect,
  formatCellNote,
  formatCellParam,
  formatCellSample,
} from '../../ui/formatters';

const formatDisplayName = (value: string): string => {
  const normalized = value.trim();
  return (normalized || 'UNTITLED').toUpperCase();
};

export const renderPatternPaddingRow = (channelCount: number): string => {
  const emptyCell = Array.from({ length: channelCount }, () => `<div class="pattern-cell pattern-cell--ghost" aria-hidden="true"><span class="pattern-cell-note">---</span><span class="pattern-cell-mod"><span class="pattern-cell-digit">0</span><span class="pattern-cell-digit">0</span><span class="pattern-cell-digit pattern-cell-digit--effect">0</span><span class="pattern-cell-digit">0</span><span class="pattern-cell-digit">0</span></span></div>`).join('');
  return `<div class="pattern-row pattern-row--ghost" aria-hidden="true"><div class="pattern-row-index">..</div>${emptyCell}</div>`;
};

export const renderPatternDigit = (
  rowIndex: number,
  channelIndex: number,
  field: CursorField,
  digit: string,
  selected: boolean,
  effect = false,
): string =>
  `<span class="pattern-cell-digit${effect ? ' pattern-cell-digit--effect' : ''}${selected ? ' is-cursor' : ''}" data-action="select-cell" data-row="${rowIndex}" data-channel="${channelIndex}" data-field="${field}">${escapeHtml(digit)}</span>`;

export const renderModernPatternCell = (
  rowIndex: number,
  channelIndex: number,
  cell: PatternCell,
  snapshot: TrackerSnapshot,
): string => {
  const selected = !snapshot.transport.playing
    && rowIndex === snapshot.cursor.row
    && channelIndex === snapshot.cursor.channel;
  const sample = formatCellSample(cell);
  const effect = formatCellEffect(cell);
  const param = formatCellParam(cell);

  return `<button class="pattern-cell${selected ? ' is-selected' : ''}" type="button" data-action="select-cell" data-row="${rowIndex}" data-channel="${channelIndex}" data-field="note"><span class="pattern-cell-note${selected && snapshot.cursor.field === 'note' ? ' is-cursor' : ''}" data-action="select-cell" data-row="${rowIndex}" data-channel="${channelIndex}" data-field="note">${escapeHtml(formatCellNote(cell))}</span><span class="pattern-cell-mod">${renderPatternDigit(rowIndex, channelIndex, 'sampleHigh', sample[0], selected && snapshot.cursor.field === 'sampleHigh')}${renderPatternDigit(rowIndex, channelIndex, 'sampleLow', sample[1], selected && snapshot.cursor.field === 'sampleLow')}${renderPatternDigit(rowIndex, channelIndex, 'effect', effect, selected && snapshot.cursor.field === 'effect', true)}${renderPatternDigit(rowIndex, channelIndex, 'paramHigh', param[0], selected && snapshot.cursor.field === 'paramHigh')}${renderPatternDigit(rowIndex, channelIndex, 'paramLow', param[1], selected && snapshot.cursor.field === 'paramLow')}</span></button>`;
};

export const renderModernPatternRow = (
  rowIndex: number,
  cells: PatternCell[],
  snapshot: TrackerSnapshot,
  centered: boolean,
): string => {
  const displayCursorRow = snapshot.transport.playing ? snapshot.transport.row : snapshot.cursor.row;
  const rowClasses = [
    'pattern-row',
    rowIndex === snapshot.transport.row ? 'is-playing' : '',
    rowIndex === displayCursorRow ? 'is-selected-row' : '',
    centered ? 'is-centered-row' : '',
  ].filter(Boolean).join(' ');

  return `<div class="${rowClasses}"><div class="pattern-row-index">${String(rowIndex).padStart(2, '0')}</div>${cells.map((cell, channelIndex) => renderModernPatternCell(rowIndex, channelIndex, cell, snapshot)).join('')}</div>`;
};

export const getSampleCardLabel = (sample: SampleSlot): string => {
  const trimmedName = sample.name.trim();
  if (trimmedName.length > 0) {
    return formatDisplayName(trimmedName);
  }

  return sample.length > 0 ? `SAMPLE ${String(sample.index + 1).padStart(2, '0')}` : '';
};

export const getSelectedSampleHeading = (sample: SampleSlot): string => {
  const trimmedName = sample.name.trim();
  if (trimmedName.length > 0) {
    return formatDisplayName(trimmedName);
  }

  return `SAMPLE ${String(sample.index + 1).padStart(2, '0')}`;
};

export const getSamplePageCount = (sampleCount: number, pageSize: number): number =>
  Math.max(1, Math.ceil(sampleCount / pageSize));

export const getSamplePanelKey = (
  snapshot: TrackerSnapshot,
  samplePage: number,
  pageSize: number,
): string => {
  const start = samplePage * pageSize;
  const visible = snapshot.samples
    .slice(start, start + pageSize)
    .map((sample) => `${sample.index}:${sample.name}:${sample.length}:${sample.dataRevision}`)
    .join('|');
  const selected = snapshot.samples[snapshot.selectedSample];
  const selectedKey = selected
    ? `${selected.index}:${selected.name}:${selected.length}:${selected.volume}:${selected.fineTune}:${selected.loopStart}:${selected.loopLength}:${selected.dataRevision}`
    : 'none';

  return `${samplePage}:${snapshot.selectedSample}:${visible}:${selectedKey}`;
};

export interface SelectedSamplePanelRenderOptions {
  sample: SampleSlot;
  editable: boolean;
  samplePreviewPlaying: boolean;
  sampleTitle: InlineNameFieldRenderOptions;
  playIconHtml: string;
  stopIconHtml: string;
  editIconHtml: string;
  replaceIconHtml: string;
  createIconHtml: string;
}

export interface SampleEditorPanelRenderOptions {
  snapshot: TrackerSnapshot;
  editable: boolean;
  samplePreviewPlaying: boolean;
  collapsed: boolean;
  collapseIconHtml: string;
  selectedSampleTitle: InlineNameFieldRenderOptions;
  view: { start: number; length: number; end: number };
  showAllIconHtml: string;
  showSelectionIconHtml: string;
  playIconHtml: string;
  stopIconHtml: string;
  loopIconHtml: string;
  volumeIconHtml: string;
  fineTuneIconHtml: string;
  cropIconHtml: string;
  cutIconHtml: string;
  backIconHtml: string;
  volumePopoverOpen: boolean;
  fineTunePopoverOpen: boolean;
  volumeEditOpen: boolean;
  fineTuneEditOpen: boolean;
  volumeEditValue: string;
  fineTuneEditValue: string;
}
