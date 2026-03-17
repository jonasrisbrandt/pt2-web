import { featureFlags } from '../../config/featureFlags';
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

export const renderToolIconButton = (
  action: string,
  iconHtml: string,
  label: string,
  active = false,
  disabled = false,
  role = '',
  valueText = '',
): string => `
  <button
    type="button"
    class="tool-icon-button${active ? ' is-active' : ''}"
    data-action="${action}"
    ${role ? `data-role="${role}"` : ''}
    aria-label="${escapeHtml(label)}"
    title="${escapeHtml(label)}"
    ${disabled ? 'disabled' : ''}
  >${iconHtml}${valueText ? `<span class="tool-icon-button__value" aria-hidden="true">${escapeHtml(valueText)}</span>` : ''}<span class="sr-only">${escapeHtml(label)}</span></button>
`;

export const renderTransportButtonContent = (playing: boolean, iconHtml: string): string =>
  `${iconHtml}<span>${playing ? 'Stop' : 'Play'}</span>`;

const formatDisplayName = (value: string): string => {
  const normalized = value.trim();
  return (normalized || 'UNTITLED').toUpperCase();
};

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
        <button type="button" class="icon-button icon-button--small" data-action="${upAction}" ${enabled ? '' : 'disabled'}>${upIconHtml}<span class="sr-only">Increase ${escapeHtml(label)}</span></button>
        <button type="button" class="icon-button icon-button--small" data-action="${downAction}" ${enabled ? '' : 'disabled'}>${downIconHtml}<span class="sr-only">Decrease ${escapeHtml(label)}</span></button>
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

export const renderSampleWaveform = (sampleIndex: number, values: ArrayLike<number>): string => {
  const waveformValues = Array.from(values);
  const width = 240;
  const height = 72;
  const centerY = height / 2;
  const stepX = waveformValues.length > 1 ? width / (waveformValues.length - 1) : width;
  const linePoints = waveformValues
    .map((value: number, index: number) => {
      const x = (index * stepX).toFixed(2);
      const y = (centerY - ((value / 128) * (height * 0.3))).toFixed(2);
      return `${x},${y}`;
    })
    .join(' ');
  const areaPath = waveformValues
    .map((value: number, index: number) => {
      const x = (index * stepX).toFixed(2);
      const y = (centerY - ((value / 128) * (height * 0.3))).toFixed(2);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ') + ` L ${width} ${centerY.toFixed(2)} L 0 ${centerY.toFixed(2)} Z`;

  return `
    <svg class="sample-chip__wave" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="sample-wave-fill-${sampleIndex}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="rgba(212,255,117,0.03)" />
          <stop offset="55%" stop-color="rgba(120,240,191,0.08)" />
          <stop offset="100%" stop-color="rgba(138,199,255,0.03)" />
        </linearGradient>
        <linearGradient id="sample-wave-stroke-${sampleIndex}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="rgba(212,255,117,0.34)" />
          <stop offset="55%" stop-color="rgba(239,248,231,0.52)" />
          <stop offset="100%" stop-color="rgba(138,199,255,0.3)" />
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#sample-wave-fill-${sampleIndex})" />
      <polyline points="${linePoints}" fill="none" stroke="url(#sample-wave-stroke-${sampleIndex})" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  `;
};

export const renderSampleChip = (
  sample: SampleSlot,
  selectedSample: number,
  previewValues: ArrayLike<number>,
): string => `
  <button class="sample-chip${sample.index === selectedSample ? ' is-selected' : ''}${sample.length <= 0 ? ' is-empty' : ''}" type="button" data-action="select-sample" data-sample="${sample.index}">
    ${renderSampleWaveform(sample.index, previewValues)}
    <span class="sample-chip__index">${String(sample.index + 1).padStart(2, '0')}</span>
    ${sample.length > 0
      ? `<strong class="sample-chip__name">${escapeHtml(getSampleCardLabel(sample))}</strong>`
      : '<span class="sample-chip__empty" aria-hidden="true">+</span>'}
  </button>
`;

export const renderSampleBank = (
  snapshot: TrackerSnapshot,
  samplePage: number,
  pageSize: number,
  getPreviewValues?: (sample: SampleSlot) => ArrayLike<number>,
): string => {
  const start = samplePage * pageSize;
  return snapshot.samples
    .slice(start, start + pageSize)
    .map((sample) => renderSampleChip(
      sample,
      snapshot.selectedSample,
      getPreviewValues?.(sample) ?? new Int8Array(256),
    ))
    .join('');
};

export interface SelectedSamplePanelRenderOptions {
  sample: SampleSlot;
  editable: boolean;
  samplePreviewPlaying: boolean;
  sampleTitleHtml: string;
  playIconHtml: string;
  stopIconHtml: string;
  editIconHtml: string;
  replaceIconHtml: string;
  createIconHtml: string;
}

export const renderSelectedSamplePanel = ({
  sample,
  editable,
  samplePreviewPlaying,
  sampleTitleHtml,
  playIconHtml,
  stopIconHtml,
  editIconHtml,
  replaceIconHtml,
  createIconHtml,
}: SelectedSamplePanelRenderOptions): string => `
  <section class="sample-detail-panel">
    <div class="sample-detail-head">
      <div>
        <p class="metric-label">Sample ${String(sample.index + 1).padStart(2, '0')}</p>
        <strong class="sample-detail-title panel-title panel-title--editable" data-role="selected-sample-title">${sampleTitleHtml}</strong>
      </div>
      <div class="sample-detail-actions">
        ${renderToolIconButton(samplePreviewPlaying ? 'sample-preview-stop' : 'sample-preview-play', samplePreviewPlaying ? stopIconHtml : playIconHtml, samplePreviewPlaying ? 'Stop preview' : 'Play preview', samplePreviewPlaying, sample.length <= 0, 'sample-preview-toggle')}
        ${renderToolIconButton('sample-editor-open', editIconHtml, 'Open sample editor', false, sample.length <= 0)}
        ${featureFlags.sample_composer ? renderToolIconButton('sample-creator-open', createIconHtml, 'Open Sample Creator', false, false) : ''}
        ${renderToolIconButton('sample-load-selected', replaceIconHtml, sample.length > 0 ? 'Replace sample' : 'Load sample', false, !editable)}
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
  collapsed: boolean;
  collapseIconHtml: string;
  selectedSampleTitleHtml: string;
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

const formatFineTune = (value: number): string => (value > 0 ? `+${value}` : String(value));

export const renderSampleEditorPanel = ({
  snapshot,
  editable,
  samplePreviewPlaying,
  collapsed,
  collapseIconHtml,
  selectedSampleTitleHtml,
  view,
  showAllIconHtml,
  showSelectionIconHtml,
  playIconHtml,
  stopIconHtml,
  loopIconHtml,
  volumeIconHtml,
  fineTuneIconHtml,
  cropIconHtml,
  cutIconHtml,
  backIconHtml,
  volumePopoverOpen,
  fineTunePopoverOpen,
  volumeEditOpen,
  fineTuneEditOpen,
  volumeEditValue,
  fineTuneEditValue,
}: SampleEditorPanelRenderOptions): string => {
  const sample = snapshot.samples[snapshot.selectedSample];
  const loopEnabled = sample.loopLength > 2 && sample.length > 2;
  const hasSelection = snapshot.sampleEditor.selectionStart !== null
    && snapshot.sampleEditor.selectionEnd !== null
    && snapshot.sampleEditor.selectionEnd - snapshot.sampleEditor.selectionStart >= 2;
  const scrollMax = Math.max(0, sample.length - view.length);

  return `
    <article class="panel sample-editor-panel editor-panel-shell${collapsed ? ' is-collapsed' : ''}">
      <div class="panel-head compact panel-head--section sample-editor-head">
        <div class="panel-heading-copy">
          <button type="button" class="section-heading-button" data-action="toggle-section-editor" aria-expanded="${collapsed ? 'false' : 'true'}">
            <span class="section-heading-button__copy">
              <span class="panel-label">Sample editor</span>
            </span>
            <span class="section-heading-button__icon" aria-hidden="true">${collapseIconHtml}</span>
          </button>
          <h2 class="panel-title panel-title--editable panel-title--section-detail">Sample ${String(sample.index + 1).padStart(2, '0')} ${selectedSampleTitleHtml}</h2>
        </div>
        <div class="panel-head-actions">
          <div class="sample-editor-toolbar">
            ${renderToolIconButton(samplePreviewPlaying ? 'sample-editor-stop' : 'sample-editor-preview', samplePreviewPlaying ? stopIconHtml : playIconHtml, samplePreviewPlaying ? 'Stop preview' : 'Play preview', samplePreviewPlaying, sample.length <= 0, 'sample-editor-preview-toggle')}
            ${renderToolIconButton('sample-editor-toggle-loop', loopIconHtml, loopEnabled ? 'Disable loop' : 'Enable loop', loopEnabled, !editable || sample.length <= 1)}
            <span class="toolbar-divider" aria-hidden="true"></span>
            <div class="tool-popover-anchor">
              ${renderToolIconButton('sample-editor-open-volume', volumeIconHtml, `Volume ${sample.volume}`, volumePopoverOpen, !editable || sample.length <= 0, '', String(sample.volume))}
              <div class="tool-popover${volumePopoverOpen ? ' is-open' : ''}" data-role="sample-editor-volume-popover">
                <div class="tool-popover__head">
                  <span class="tool-popover__label">Volume</span>
                  ${volumeEditOpen
                    ? `<input class="tool-popover__inline-input" data-inline-sample-number="volume" type="number" min="0" max="64" step="1" value="${escapeHtml(volumeEditValue)}" ${editable ? '' : 'disabled'} />`
                    : `<button type="button" class="tool-popover__value-button" data-popover-value-edit="volume" data-role="sample-editor-volume-display">${sample.volume}</button>`}
                </div>
                <input class="tool-popover__slider" data-input="sample-volume" type="range" min="0" max="64" step="1" value="${sample.volume}" ${editable ? '' : 'disabled'} />
              </div>
            </div>
            <div class="tool-popover-anchor">
              ${renderToolIconButton('sample-editor-open-finetune', fineTuneIconHtml, `Fine tune ${formatFineTune(sample.fineTune)}`, fineTunePopoverOpen, !editable || sample.length <= 0, '', formatFineTune(sample.fineTune))}
              <div class="tool-popover${fineTunePopoverOpen ? ' is-open' : ''}" data-role="sample-editor-finetune-popover">
                <div class="tool-popover__head">
                  <span class="tool-popover__label">Fine tune</span>
                  ${fineTuneEditOpen
                    ? `<input class="tool-popover__inline-input" data-inline-sample-number="fineTune" type="number" min="-8" max="7" step="1" value="${escapeHtml(fineTuneEditValue)}" ${editable ? '' : 'disabled'} />`
                    : `<button type="button" class="tool-popover__value-button" data-popover-value-edit="fineTune" data-role="sample-editor-finetune-display">${formatFineTune(sample.fineTune)}</button>`}
                </div>
                <input class="tool-popover__slider" data-input="sample-finetune" type="range" min="-8" max="7" step="1" value="${sample.fineTune}" ${editable ? '' : 'disabled'} />
              </div>
            </div>
            <span class="toolbar-divider" aria-hidden="true"></span>
            ${renderToolIconButton('sample-editor-show-selection', showSelectionIconHtml, 'Show selection', false, !hasSelection)}
            ${renderToolIconButton('sample-editor-show-all', showAllIconHtml, 'Show all', false, sample.length <= 0)}
            ${renderToolIconButton('sample-editor-crop', cropIconHtml, 'Crop selection', false, !(editable && hasSelection))}
            ${renderToolIconButton('sample-editor-cut', cutIconHtml, 'Cut selection', false, !(editable && hasSelection))}
            <span class="toolbar-divider" aria-hidden="true"></span>
            ${renderToolIconButton('sample-editor-close', backIconHtml, 'Back to pattern')}
          </div>
        </div>
      </div>
      <div class="panel-body">
        <div class="sample-editor-host" data-role="sample-editor-host"></div>
        <div class="sample-editor-scrollbar-wrap">
          <input
            class="sample-editor-scrollbar"
            data-input="sample-editor-scroll"
            type="range"
            min="0"
            max="${scrollMax}"
            step="1"
            value="${clamp(view.start, 0, scrollMax)}"
            ${sample.length > 0 ? '' : 'disabled'}
          />
        </div>
        <div class="sample-editor-meta">
          <div class="module-card module-card--readout">
            <span class="metric-label">Length</span>
            <div class="module-readout">
              <strong class="module-readout__value" data-role="sample-editor-length">${sample.length}</strong>
            </div>
          </div>
          <div class="module-card module-card--readout">
            <span class="metric-label">Visible</span>
            <div class="module-readout">
              <strong class="module-readout__value" data-role="sample-editor-visible">${view.start} - ${view.end}</strong>
            </div>
          </div>
          <div class="module-card module-card--readout">
            <span class="metric-label">Loop</span>
            <div class="module-readout">
              <strong class="module-readout__value" data-role="sample-editor-loop">${snapshot.sampleEditor.loopStart} - ${snapshot.sampleEditor.loopEnd}</strong>
            </div>
          </div>
        </div>
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
