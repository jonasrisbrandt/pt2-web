import type { CursorField, PatternCell, SampleSlot, TrackerSnapshot } from '../../core/trackerTypes';
import {
  escapeHtml,
  formatCellEffect,
  formatCellNote,
  formatCellParam,
  formatCellSample,
  formatSampleLength,
} from '../../ui/formatters';
import { clamp } from '../../ui/appShared';

export const renderToolbarButton = (
  action: string,
  iconHtml: string,
  label: string,
  active = false,
): string => `<button type="button" class="toolbar-button${active ? ' is-active' : ''}" data-action="${action}">${iconHtml}<span>${escapeHtml(label)}</span></button>`;

export const renderTransportButtonContent = (playing: boolean, iconHtml: string): string =>
  `${iconHtml}<span>${playing ? 'Stop' : 'Play'}</span>`;

export const renderModuleStepperCard = (
  label: string,
  value: string,
  role: string,
  downAction: string,
  upAction: string,
  enabled: boolean,
  downIconHtml: string,
  upIconHtml: string,
): string => `
  <div class="module-card module-card--stepper">
    <span class="metric-label">${escapeHtml(label)}</span>
    <div class="module-stepper">
      <strong class="module-stepper__value" data-role="metric-${role}">${escapeHtml(value)}</strong>
      <div class="module-stepper__buttons">
        <button type="button" class="icon-button icon-button--small" data-action="${downAction}" ${enabled ? '' : 'disabled'}>${downIconHtml}<span class="sr-only">Decrease ${escapeHtml(label)}</span></button>
        <button type="button" class="icon-button icon-button--small" data-action="${upAction}" ${enabled ? '' : 'disabled'}>${upIconHtml}<span class="sr-only">Increase ${escapeHtml(label)}</span></button>
      </div>
    </div>
  </div>
`;

export const renderModuleValueCard = (label: string, value: string, role: string): string => `
  <div class="module-card module-card--readout">
    <span class="metric-label">${escapeHtml(label)}</span>
    <div class="module-readout">
      <strong class="module-readout__value" data-role="metric-${role}">${escapeHtml(value)}</strong>
    </div>
  </div>
`;

export const renderTrackHeader = (
  channel: number,
  muted: boolean,
  muteIconHtml: string,
): string => `
  <span class="track-label track-label--${channel + 1}${muted ? ' is-muted' : ''}">
    <button
      type="button"
      class="track-mute-button${muted ? ' is-muted' : ''}"
      data-role="track-mute-${channel}"
      data-action="toggle-track-mute"
      data-channel="${channel}"
      aria-pressed="${muted ? 'true' : 'false'}"
      aria-label="${muted ? 'Unmute track' : 'Mute track'} ${channel + 1}"
    >${muteIconHtml}</button>
    <span>Track ${channel + 1}</span>
  </span>
`;

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
  const selected = rowIndex === snapshot.cursor.row && channelIndex === snapshot.cursor.channel;
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
  const rowClasses = [
    'pattern-row',
    rowIndex === snapshot.transport.row ? 'is-playing' : '',
    rowIndex === snapshot.cursor.row ? 'is-selected-row' : '',
    centered ? 'is-centered-row' : '',
  ].filter(Boolean).join(' ');

  return `<div class="${rowClasses}"><div class="pattern-row-index">${String(rowIndex).padStart(2, '0')}</div>${cells.map((cell, channelIndex) => renderModernPatternCell(rowIndex, channelIndex, cell, snapshot)).join('')}</div>`;
};

export const getSampleCardLabel = (sample: SampleSlot): string => {
  const trimmedName = sample.name.trim();
  if (trimmedName.length > 0) {
    return trimmedName;
  }

  return sample.length > 0 ? '' : 'Empty';
};

export const getSelectedSampleHeading = (sample: SampleSlot): string => {
  const trimmedName = sample.name.trim();
  if (trimmedName.length > 0) {
    return trimmedName;
  }

  return sample.length > 0 ? `Sample ${String(sample.index + 1).padStart(2, '0')}` : 'Empty';
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
    .map((sample) => `${sample.index}:${sample.name}:${sample.length}`)
    .join('|');
  const selected = snapshot.samples[snapshot.selectedSample];
  const selectedKey = selected
    ? `${selected.index}:${selected.name}:${selected.length}:${selected.volume}:${selected.fineTune}:${selected.loopStart}:${selected.loopLength}`
    : 'none';

  return `${samplePage}:${snapshot.selectedSample}:${visible}:${selectedKey}`;
};

export const renderSampleWaveform = (sample: SampleSlot): string => {
  const values = sample.preview && sample.preview.length > 0
    ? sample.preview
    : Array.from({ length: 48 }, () => 0);

  const width = 240;
  const height = 72;
  const centerY = height / 2;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const linePoints = values
    .map((value, index) => {
      const x = (index * stepX).toFixed(2);
      const y = (centerY - ((value / 128) * (height * 0.3))).toFixed(2);
      return `${x},${y}`;
    })
    .join(' ');
  const areaPath = values
    .map((value, index) => {
      const x = (index * stepX).toFixed(2);
      const y = (centerY - ((value / 128) * (height * 0.3))).toFixed(2);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ') + ` L ${width} ${centerY.toFixed(2)} L 0 ${centerY.toFixed(2)} Z`;

  return `
    <svg class="sample-chip__wave" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="sample-wave-fill-${sample.index}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="rgba(212,255,117,0.03)" />
          <stop offset="55%" stop-color="rgba(120,240,191,0.08)" />
          <stop offset="100%" stop-color="rgba(138,199,255,0.03)" />
        </linearGradient>
        <linearGradient id="sample-wave-stroke-${sample.index}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="rgba(212,255,117,0.34)" />
          <stop offset="55%" stop-color="rgba(239,248,231,0.52)" />
          <stop offset="100%" stop-color="rgba(138,199,255,0.3)" />
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#sample-wave-fill-${sample.index})" />
      <polyline points="${linePoints}" fill="none" stroke="url(#sample-wave-stroke-${sample.index})" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  `;
};

export const renderSampleChip = (sample: SampleSlot, selectedSample: number): string => `
  <button class="sample-chip${sample.index === selectedSample ? ' is-selected' : ''}" type="button" data-action="select-sample" data-sample="${sample.index}">
    ${renderSampleWaveform(sample)}
    <span class="sample-chip__index">${String(sample.index + 1).padStart(2, '0')}</span>
    <strong class="sample-chip__name">${escapeHtml(getSampleCardLabel(sample))}</strong>
  </button>
`;

export const renderSampleBank = (
  snapshot: TrackerSnapshot,
  samplePage: number,
  pageSize: number,
): string => {
  const start = samplePage * pageSize;
  return snapshot.samples
    .slice(start, start + pageSize)
    .map((sample) => renderSampleChip(sample, snapshot.selectedSample))
    .join('');
};

export interface SelectedSamplePanelRenderOptions {
  sample: SampleSlot;
  samplePreviewPlaying: boolean;
  playIconHtml: string;
  stopIconHtml: string;
  editIconHtml: string;
}

export const renderSelectedSamplePanel = ({
  sample,
  samplePreviewPlaying,
  playIconHtml,
  stopIconHtml,
  editIconHtml,
}: SelectedSamplePanelRenderOptions): string => `
  <section class="sample-detail-panel">
    <div class="sample-detail-head">
      <div>
        <p class="metric-label">Sample ${String(sample.index + 1).padStart(2, '0')}</p>
        <strong class="sample-detail-title" data-role="selected-sample-title">${escapeHtml(getSelectedSampleHeading(sample))}</strong>
      </div>
      <div class="sample-detail-actions">
        <button type="button" class="toolbar-button toolbar-button--primary" data-role="sample-preview-toggle" data-action="${samplePreviewPlaying ? 'sample-preview-stop' : 'sample-preview-play'}" ${sample.length > 0 ? '' : 'disabled'}>${samplePreviewPlaying ? stopIconHtml : playIconHtml}<span>${samplePreviewPlaying ? 'Stop' : 'Play'}</span></button>
        <button type="button" class="toolbar-button" data-action="sample-editor-open">${editIconHtml}<span>Edit</span></button>
      </div>
    </div>
    <div class="sample-preview-host" data-role="sample-preview-host"></div>
    <p class="hint" data-role="selected-sample-hint">${escapeHtml(formatSampleLength(sample))}</p>
  </section>
`;

export interface SampleEditorPanelRenderOptions {
  snapshot: TrackerSnapshot;
  editable: boolean;
  samplePreviewPlaying: boolean;
  selectedSampleHeading: string;
  view: { start: number; length: number; end: number };
  playIconHtml: string;
  stopIconHtml: string;
}

export const renderSampleEditorPanel = ({
  snapshot,
  editable,
  samplePreviewPlaying,
  selectedSampleHeading,
  view,
  playIconHtml,
  stopIconHtml,
}: SampleEditorPanelRenderOptions): string => {
  const sample = snapshot.samples[snapshot.selectedSample];
  const loopEnabled = sample.loopLength > 2 && sample.length > 2;
  const loopEnd = sample.loopStart + sample.loopLength;
  const showScrollbar = sample.length > 0 && view.length > 0 && view.length < sample.length;
  const scrollMax = Math.max(0, sample.length - view.length);

  return `
    <article class="panel sample-editor-panel editor-panel-shell">
      <div class="panel-head compact sample-editor-head">
        <div>
          <p class="panel-label">Sample editor</p>
          <h2 class="panel-title--subtle">Sample ${String(sample.index + 1).padStart(2, '0')} ${escapeHtml(selectedSampleHeading)}</h2>
        </div>
        <div class="sample-editor-toolbar">
          <button type="button" class="toolbar-button" data-action="sample-editor-show-all" ${sample.length > 0 ? '' : 'disabled'}>Show all</button>
          <button type="button" class="toolbar-button" data-action="sample-editor-show-selection" ${(sample.length > 0 && snapshot.sampleEditor.selectionStart !== null) ? '' : 'disabled'}>Show selection</button>
          <button type="button" class="toolbar-button toolbar-button--primary" data-role="sample-editor-preview-toggle" data-action="${samplePreviewPlaying ? 'sample-editor-stop' : 'sample-editor-preview'}" ${sample.length > 0 ? '' : 'disabled'}>${samplePreviewPlaying ? stopIconHtml : playIconHtml}<span>${samplePreviewPlaying ? 'Stop' : 'Play'}</span></button>
          <button type="button" class="toolbar-button" data-action="sample-editor-crop" ${(editable && snapshot.sampleEditor.selectionStart !== null) ? '' : 'disabled'}>Crop</button>
          <button type="button" class="toolbar-button" data-action="sample-editor-cut" ${(editable && snapshot.sampleEditor.selectionStart !== null) ? '' : 'disabled'}>Cut</button>
          <button type="button" class="toolbar-button" data-action="sample-editor-close">Back to pattern</button>
        </div>
      </div>
      <div class="field-row field-row--sample-detail">
        <label class="field">
          <span>Name</span>
          <input data-input="sample-name" value="${escapeHtml(sample.name)}" maxlength="22" ${editable ? '' : 'disabled'} />
        </label>
        <label class="field">
          <span>Volume</span>
          <input data-input="sample-volume" type="number" min="0" max="64" value="${sample.volume}" ${editable ? '' : 'disabled'} />
        </label>
        <label class="field">
          <span>Fine tune</span>
          <input data-input="sample-finetune" type="number" min="-8" max="7" value="${sample.fineTune}" ${editable ? '' : 'disabled'} />
        </label>
      </div>
      <div class="field-row field-row--sample-loop">
        <label class="field field--toggle">
          <span>Loop</span>
          <span class="toggle-control">
            <input data-input="sample-loop-enabled" type="checkbox" ${loopEnabled ? 'checked' : ''} ${editable ? '' : 'disabled'} />
            <span>Enabled</span>
          </span>
        </label>
        <label class="field">
          <span>Loop start</span>
          <input data-input="sample-loop-start" type="number" min="0" max="${Math.max(0, sample.length - 2)}" value="${sample.loopStart}" ${(editable && loopEnabled) ? '' : 'disabled'} />
        </label>
        <label class="field">
          <span>Loop end</span>
          <input data-input="sample-loop-end" type="number" min="2" max="${sample.length}" value="${loopEnd}" ${(editable && loopEnabled) ? '' : 'disabled'} />
        </label>
      </div>
      <div class="sample-editor-meta">
        <span class="panel-title--subtle" data-role="sample-editor-visible">Visible ${view.start} - ${view.end}</span>
        <span class="panel-title--subtle" data-role="sample-editor-loop">Loop ${sample.loopStart} - ${sample.loopStart + sample.loopLength}</span>
      </div>
      <div class="sample-editor-host" data-role="sample-editor-host"></div>
      <div class="sample-editor-scrollbar-wrap${showScrollbar ? '' : ' is-hidden'}">
        <input
          class="sample-editor-scrollbar"
          data-input="sample-editor-scroll"
          type="range"
          min="0"
          max="${scrollMax}"
          step="1"
          value="${clamp(view.start, 0, scrollMax)}"
          ${showScrollbar ? '' : 'disabled'}
        />
      </div>
    </article>
  `;
};

export const renderClassicDebug = (enabled: boolean): string => {
  if (!enabled) {
    return '';
  }

  return `
    <div class="classic-debug">
      <div><span>DOM mouse</span><strong data-debug-field="dom-mouse">n/a</strong></div>
      <div><span>DOM state</span><strong data-debug-field="dom-state">n/a</strong></div>
      <div><span>Mouse abs</span><strong data-debug-field="mouse-abs">n/a</strong></div>
      <div><span>Mouse raw</span><strong data-debug-field="mouse-raw">n/a</strong></div>
      <div><span>Mouse pt2</span><strong data-debug-field="mouse-pt2">n/a</strong></div>
      <div><span>Buttons</span><strong data-debug-field="mouse-buttons">n/a</strong></div>
      <div><span>Canvas CSS</span><strong data-debug-field="canvas-css">n/a</strong></div>
      <div><span>Render</span><strong data-debug-field="video-render">n/a</strong></div>
      <div><span>Scale</span><strong data-debug-field="video-scale">n/a</strong></div>
    </div>
  `;
};
