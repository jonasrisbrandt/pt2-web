import { createTrackerEngine } from './core/createEngine';
import { translateClassicKeyboardEvent, type ClassicKeyTranslation } from './core/classicKeyboard';
import { interpretKeyboard, isEditableTarget } from './core/keyboard';
import type { TrackerEngine } from './core/trackerEngine';
import type {
  CursorField,
  EngineConfig,
  ExportedFile,
  PatternCell,
  SampleSlot,
  TrackerSnapshot,
} from './core/trackerTypes';
import {
  backendLabel,
  escapeHtml,
  formatCellEffect,
  formatCellNote,
  formatCellParam,
  formatCellSample,
  formatSampleLength,
} from './ui/formatters';

const DEFAULT_STATUS = 'Initierar PT2 Web...';
const MODERN_VISIBLE_PATTERN_ROWS = 15;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const triggerDownload = (file: ExportedFile): void => {
  const blob = new Blob([Uint8Array.from(file.bytes)], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(url);
};

export class TrackerApplication {
  private readonly root: HTMLElement;
  private readonly config: EngineConfig;
  private readonly moduleInput: HTMLInputElement;
  private readonly sampleInput: HTMLInputElement;
  private engine: TrackerEngine | null = null;
  private snapshot: TrackerSnapshot | null = null;
  private statusMessage = DEFAULT_STATUS;
  private keyboardOctave = 2;
  private viewMode: 'modern' | 'classic' = 'modern';
  private detachEngineListener: (() => void) | null = null;
  private layoutRefreshFrame: number | null = null;
  private snapshotPollTimer: number | null = null;
  private modernHexEntryState: {
    row: number;
    channel: number;
    field: 'sample' | 'effect' | 'param';
    digits: string;
  } | null = null;
  private classicPressedKeys = new Map<string, ClassicKeyTranslation>();
  private classicDomDebug = {
    x: 0,
    y: 0,
    buttons: 0,
    inside: false,
    events: 0,
  };

  constructor(root: HTMLElement, config: EngineConfig) {
    this.root = root;
    this.config = config;

    this.moduleInput = document.createElement('input');
    this.moduleInput.type = 'file';
    this.moduleInput.accept = '.mod,.m15,.stk,.nst,.ust,.pp,.nt';
    this.moduleInput.hidden = true;

    this.sampleInput = document.createElement('input');
    this.sampleInput.type = 'file';
    this.sampleInput.accept = '.wav,.iff,.aiff,.aif,.raw';
    this.sampleInput.hidden = true;

    this.root.append(this.moduleInput, this.sampleInput);

    this.root.addEventListener('click', (event) => void this.handleClick(event));
    this.root.addEventListener('change', (event) => void this.handleChange(event));
    this.root.addEventListener('input', (event) => this.handleInput(event));
    window.addEventListener('keydown', (event) => this.handleKeyDown(event));
    window.addEventListener('keyup', (event) => this.handleKeyUp(event));
    window.addEventListener('blur', () => this.releaseClassicKeys());
    this.config.canvas.addEventListener('mousemove', (event) => this.handleClassicCanvasPointerMove(event));
    this.config.canvas.addEventListener('mousedown', (event) => this.handleClassicCanvasPointerButton(event, true));
    this.config.canvas.addEventListener('mouseup', (event) => this.handleClassicCanvasPointerButton(event, false));
    this.config.canvas.addEventListener('mouseenter', (event) => {
      this.classicDomDebug.inside = true;
      this.handleClassicCanvasPointer(event);
    });
    this.config.canvas.addEventListener('mouseleave', () => {
      this.classicDomDebug.inside = false;
      this.updateClassicDebugPanel(this.snapshot);
    });
  }

  async init(): Promise<void> {
    const { engine, warning } = await createTrackerEngine(this.config);
    this.engine = engine;
    this.detachEngineListener = this.engine.subscribe((event) => {
      if (event.type === 'snapshot') {
        this.snapshot = event.snapshot;
        this.statusMessage = event.snapshot.status;
      } else {
        this.statusMessage = event.message;
      }

      this.render();
    });

    if (warning) {
      this.statusMessage = `Fallback till mock-backend: ${warning}`;
    }

    this.snapshot = this.engine.getSnapshot();
    this.render();
  }

  private render(): void {
    const snapshot = this.snapshot;
    if (!snapshot) {
      return;
    }

    const selectedSample = snapshot.samples[snapshot.selectedSample];
    const selectedCell = snapshot.pattern.rows[snapshot.cursor.row]?.channels[snapshot.cursor.channel];
    const patternRows = this.renderCenteredPatternRows(snapshot);
    const sampleButtons = snapshot.samples.map((sample) => this.renderSampleChip(sample, snapshot.selectedSample)).join('');
    const warnings = snapshot.diagnostics.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('');
    const classicDebug = this.renderClassicDebug();

    this.root.querySelector('.app-shell')?.remove();

    const shell = document.createElement('div');
    shell.className = `app-shell app-shell--${this.viewMode}`;
    shell.innerHTML = `
      <header class="topbar">
        <div>
          <h1>ProTracker 2 web clone</h1>
        </div>
        <div class="topbar-meta">
          <span class="badge">${escapeHtml(backendLabel(snapshot))}</span>
          <span class="badge" data-role="transport-state">${snapshot.transport.playing ? 'Playing' : 'Stopped'}</span>
          <span class="badge">Octave ${this.keyboardOctave}</span>
        </div>
      </header>

      <section class="toolbar">
        <button type="button" data-action="new-song">Ny modul</button>
        <button type="button" data-action="load-module">Ladda MOD</button>
        <button type="button" data-action="load-sample">Ladda sample</button>
        <button type="button" data-action="save-module">Exportera modul</button>
        <button type="button" data-role="transport-toggle" data-action="${snapshot.transport.playing ? 'stop' : 'toggle-play'}">
          ${snapshot.transport.playing ? 'Stop' : 'Play'}
        </button>
        <div class="view-toggle" role="tablist" aria-label="View mode">
          <button type="button" data-action="view-modern" class="${this.viewMode === 'modern' ? 'is-active' : ''}">Modern</button>
          <button type="button" data-action="view-classic" class="${this.viewMode === 'classic' ? 'is-active' : ''}">Classic</button>
        </div>
      </section>

      <section class="hero-grid">
        <article class="panel panel-primary">
          <div class="panel-head">
            <div>
              <p class="panel-label">Module</p>
              <h2 data-role="song-title">${escapeHtml(snapshot.song.title || 'UNTITLED')}</h2>
            </div>
            <p class="panel-copy" data-role="status-message">${escapeHtml(this.statusMessage)}</p>
          </div>
          <div class="transport-grid">
            ${this.renderMetric('Backend', snapshot.backend, 'backend')}
            ${this.renderMetric('Position', String(snapshot.transport.position).padStart(2, '0'), 'position')}
            ${this.renderMetric('Pattern', String(snapshot.transport.pattern).padStart(2, '0'), 'pattern')}
            ${this.renderMetric('Row', String(snapshot.transport.row).padStart(2, '0'), 'row')}
            ${this.renderMetric('BPM', String(snapshot.transport.bpm), 'bpm')}
            ${this.renderMetric('Speed', String(snapshot.transport.speed), 'speed')}
          </div>
        </article>

        <article class="panel panel-secondary">
          <div class="panel-head">
            <div>
              <p class="panel-label">Status</p>
              <h2>${this.viewMode === 'classic' ? 'Classic tracker view' : 'Modern tracker view'}</h2>
            </div>
          </div>
          <ul class="warning-list">${warnings}</ul>
        </article>
      </section>

      <main class="workspace">
        <section class="panel pattern-panel">
          <div class="panel-head compact">
            <div>
              <p class="panel-label">Pattern editor</p>
              <h2>Keyboard-first grid</h2>
            </div>
            <div class="panel-tools">
              <button type="button" data-action="octave-down">[</button>
              <button type="button" data-action="octave-up">]</button>
            </div>
          </div>
          <div class="pattern-header">
            <span>ROW</span>
            <span>CH1</span>
            <span>CH2</span>
            <span>CH3</span>
            <span>CH4</span>
          </div>
          <div class="pattern-grid" data-role="pattern-grid">${patternRows}</div>
        </section>

        <aside class="inspector-stack">
          <section class="panel inspector-panel">
            <div class="panel-head compact">
              <div>
                <p class="panel-label">Song settings</p>
                <h2>Transport and meta</h2>
              </div>
            </div>
            <label class="field">
              <span>Title</span>
              <input data-input="song-title" value="${escapeHtml(snapshot.song.title)}" maxlength="20" />
            </label>
            <div class="field-row">
              <label class="field">
                <span>BPM</span>
                <input data-input="song-bpm" type="number" min="32" max="255" value="${snapshot.transport.bpm}" />
              </label>
              <label class="field">
                <span>Speed</span>
                <input data-input="song-speed" type="number" min="1" max="31" value="${snapshot.transport.speed}" />
              </label>
            </div>
            <label class="field">
              <span>Pattern</span>
              <input data-input="song-pattern" type="number" min="0" max="99" value="${snapshot.pattern.index}" />
            </label>
          </section>

          <section class="panel inspector-panel">
            <div class="panel-head compact">
              <div>
                <p class="panel-label">Selected step</p>
                <h2>Row ${String(snapshot.cursor.row).padStart(2, '0')} · Channel ${snapshot.cursor.channel + 1}</h2>
              </div>
            </div>
            ${this.renderCellEditor(selectedCell, snapshot.cursor.field)}
          </section>

          <section class="panel inspector-panel">
            <div class="panel-head compact">
              <div>
                <p class="panel-label">Sample bank</p>
                <h2>${escapeHtml(selectedSample.name || `Sample ${selectedSample.index + 1}`)}</h2>
              </div>
            </div>
            <div class="sample-bank">${sampleButtons}</div>
            ${this.renderSampleEditor(selectedSample)}
          </section>

          <section class="panel canvas-panel">
            <div class="panel-head compact">
              <div>
                <p class="panel-label">Classic</p>
                <h2>Original ProTracker UI</h2>
              </div>
            </div>
            ${classicDebug}
            <div class="engine-canvas-host"></div>
          </section>
        </aside>
      </main>
    `;

    this.root.prepend(shell);

    const canvasHost = shell.querySelector<HTMLElement>('.engine-canvas-host');
    if (canvasHost) {
      this.config.canvas.className = this.viewMode === 'classic'
        ? 'engine-canvas engine-canvas-classic'
        : 'engine-canvas';
      canvasHost.replaceChildren(this.config.canvas);
      if (this.viewMode === 'classic') {
        window.requestAnimationFrame(() => this.config.canvas.focus());
      }
    }

    this.updateModernLiveRegions(snapshot);
    this.updateClassicDebugPanel(snapshot);
    this.syncSnapshotPolling();
  }

  private renderMetric(label: string, value: string, role?: string): string {
    return `
      <div>
        <span class="metric-label">${escapeHtml(label)}</span>
        <strong${role ? ` data-role="metric-${role}"` : ''}>${escapeHtml(value)}</strong>
      </div>
    `;
  }

  private renderCenteredPatternRows(snapshot: TrackerSnapshot): string {
    const anchorOffset = Math.floor(MODERN_VISIBLE_PATTERN_ROWS / 2);
    const anchorRow = snapshot.transport.playing ? snapshot.transport.row : snapshot.cursor.row;
    const rows: string[] = [];

    for (let visibleIndex = 0; visibleIndex < MODERN_VISIBLE_PATTERN_ROWS; visibleIndex += 1) {
      const rowIndex = anchorRow + visibleIndex - anchorOffset;
      const row = snapshot.pattern.rows[rowIndex];

      if (!row) {
        rows.push(this.renderPatternPaddingRow(snapshot.pattern.rows[0]?.channels.length ?? 4));
        continue;
      }

      rows.push(this.renderModernPatternRow(row, snapshot, visibleIndex === anchorOffset));
    }

    return rows.join('');
  }

  private renderPatternPaddingRow(channelCount: number): string {
    const emptyCell = Array.from({ length: channelCount }, () => `
      <div class="pattern-cell pattern-cell--ghost" aria-hidden="true">
        <span class="pattern-cell-note">---</span>
        <span class="pattern-cell-mod">
          <span class="pattern-cell-segment">..</span>
          <span class="pattern-cell-segment pattern-cell-segment--effect">.</span>
          <span class="pattern-cell-segment">..</span>
        </span>
      </div>
    `).join('');

    return `
      <div class="pattern-row pattern-row--ghost" aria-hidden="true">
        <div class="pattern-row-index">..</div>
        ${emptyCell}
      </div>
    `;
  }

  private renderModernPatternRow(
    row: TrackerSnapshot['pattern']['rows'][number],
    snapshot: TrackerSnapshot,
    centered: boolean,
  ): string {
    const rowClasses = [
      'pattern-row',
      row.index === snapshot.transport.row ? 'is-playing' : '',
      row.index === snapshot.cursor.row ? 'is-selected-row' : '',
      centered ? 'is-centered-row' : '',
    ].filter(Boolean).join(' ');

    const cells = row.channels.map((cell, channelIndex) =>
      this.renderModernPatternCell(row.index, channelIndex, cell, snapshot)).join('');

    return `
      <div class="${rowClasses}">
        <div class="pattern-row-index">${String(row.index).padStart(2, '0')}</div>
        ${cells}
      </div>
    `;
  }

  private renderModernPatternCell(
    rowIndex: number,
    channelIndex: number,
    cell: PatternCell,
    snapshot: TrackerSnapshot,
  ): string {
    const isSelectedCell = rowIndex === snapshot.cursor.row && channelIndex === snapshot.cursor.channel;
    const noteCursor = isSelectedCell && snapshot.cursor.field === 'note';
    const sampleCursor = isSelectedCell && snapshot.cursor.field === 'sample';
    const effectCursor = isSelectedCell && snapshot.cursor.field === 'effect';
    const paramCursor = isSelectedCell && snapshot.cursor.field === 'param';

    return `
      <button
        class="pattern-cell${isSelectedCell ? ' is-selected' : ''}"
        type="button"
        data-action="select-cell"
        data-row="${rowIndex}"
        data-channel="${channelIndex}"
        data-field="note"
      >
        <span
          class="pattern-cell-note${noteCursor ? ' is-cursor' : ''}"
          data-action="select-cell"
          data-row="${rowIndex}"
          data-channel="${channelIndex}"
          data-field="note"
        >${escapeHtml(formatCellNote(cell))}</span>
        <span class="pattern-cell-mod">
          <span
            class="pattern-cell-segment${sampleCursor ? ' is-cursor' : ''}"
            data-action="select-cell"
            data-row="${rowIndex}"
            data-channel="${channelIndex}"
            data-field="sample"
          >${escapeHtml(formatCellSample(cell))}</span>
          <span
            class="pattern-cell-segment pattern-cell-segment--effect${effectCursor ? ' is-cursor' : ''}"
            data-action="select-cell"
            data-row="${rowIndex}"
            data-channel="${channelIndex}"
            data-field="effect"
          >${escapeHtml(formatCellEffect(cell))}</span>
          <span
            class="pattern-cell-segment${paramCursor ? ' is-cursor' : ''}"
            data-action="select-cell"
            data-row="${rowIndex}"
            data-channel="${channelIndex}"
            data-field="param"
          >${escapeHtml(formatCellParam(cell))}</span>
        </span>
      </button>
    `;
  }

  private renderSampleChip(sample: SampleSlot, selectedSample: number): string {
    return `
      <button
        class="sample-chip${sample.index === selectedSample ? ' is-selected' : ''}"
        type="button"
        data-action="select-sample"
        data-sample="${sample.index}"
      >
        <span>${String(sample.index + 1).padStart(2, '0')}</span>
        <strong>${escapeHtml(sample.name || 'Empty')}</strong>
      </button>
    `;
  }

  private renderCellEditor(cell: PatternCell | undefined, activeField: CursorField): string {
    const value = cell ?? { note: null, sample: null, effect: null, param: null };
    return `
      <div class="field-row">
        <label class="field">
          <span>Note</span>
          <input data-input="cell-note" value="${escapeHtml(value.note ?? '')}" maxlength="3" />
        </label>
        <label class="field">
          <span>Sample</span>
          <input data-input="cell-sample" value="${value.sample === null ? '' : String(value.sample + 1)}" maxlength="2" />
        </label>
      </div>
      <div class="field-row">
        <label class="field">
          <span>Effect</span>
          <input data-input="cell-effect" value="${escapeHtml(value.effect ?? '')}" maxlength="1" />
        </label>
        <label class="field">
          <span>Param</span>
          <input data-input="cell-param" value="${escapeHtml(value.param ?? '')}" maxlength="2" />
        </label>
      </div>
      <p class="hint">
        Use tracker keys for note entry, arrows to move, space to toggle transport, and [ ] for octave.
        Active field: <strong>${escapeHtml(activeField)}</strong>
      </p>
    `;
  }

  private renderSampleEditor(sample: SampleSlot): string {
    return `
      <label class="field">
        <span>Name</span>
        <input data-input="sample-name" value="${escapeHtml(sample.name)}" maxlength="22" />
      </label>
      <div class="field-row">
        <label class="field">
          <span>Volume</span>
          <input data-input="sample-volume" type="number" min="0" max="64" value="${sample.volume}" />
        </label>
        <label class="field">
          <span>Fine tune</span>
          <input data-input="sample-finetune" type="number" min="-8" max="7" value="${sample.fineTune}" />
        </label>
      </div>
      <div class="field-row">
        <label class="field">
          <span>Length</span>
          <input data-input="sample-length" type="number" min="0" value="${sample.length}" />
        </label>
        <label class="field">
          <span>Loop start</span>
          <input data-input="sample-loop-start" type="number" min="0" value="${sample.loopStart}" />
        </label>
      </div>
      <label class="field">
        <span>Loop length</span>
        <input data-input="sample-loop-length" type="number" min="2" value="${sample.loopLength}" />
      </label>
      <p class="hint">${escapeHtml(formatSampleLength(sample))}</p>
    `;
  }

  private renderClassicDebug(): string {
    if (this.viewMode !== 'classic') {
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
  }

  private async handleClick(event: Event): Promise<void> {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-action]') : null;
    if (!target || !this.engine || !this.snapshot) {
      return;
    }

    switch (target.dataset.action) {
      case 'new-song':
        this.engine.dispatch({ type: 'song/new' });
        return;
      case 'load-module':
        this.moduleInput.click();
        return;
      case 'load-sample':
        this.sampleInput.click();
        return;
      case 'save-module':
        triggerDownload(await this.engine.saveModule());
        return;
      case 'toggle-play':
        this.engine.setTransport({ type: 'transport/toggle' });
        return;
      case 'stop':
        this.engine.setTransport({ type: 'transport/stop' });
        return;
      case 'view-modern':
        this.releaseClassicKeys();
        this.resetModernHexEntry();
        this.viewMode = 'modern';
        this.render();
        return;
      case 'view-classic':
        this.releaseClassicKeys();
        this.resetModernHexEntry();
        this.viewMode = 'classic';
        this.render();
        return;
      case 'octave-down':
        this.keyboardOctave = clamp(this.keyboardOctave - 1, 1, 2);
        this.render();
        return;
      case 'octave-up':
        this.keyboardOctave = clamp(this.keyboardOctave + 1, 1, 2);
        this.render();
        return;
      case 'select-cell':
        this.resetModernHexEntry();
        this.engine.dispatch({
          type: 'cursor/set',
          row: Number(target.dataset.row),
          channel: Number(target.dataset.channel),
          field: (target.dataset.field as CursorField | undefined) ?? 'note',
        });
        return;
      case 'select-sample':
        this.engine.dispatch({
          type: 'sample/select',
          sample: Number(target.dataset.sample),
        });
        return;
      default:
        return;
    }
  }

  private async handleChange(event: Event): Promise<void> {
    if (!(event.target instanceof HTMLInputElement) || !this.engine) {
      return;
    }

    if (event.target === this.moduleInput) {
      const [file] = Array.from(this.moduleInput.files ?? []);
      if (file) {
        await this.engine.loadModule(new Uint8Array(await file.arrayBuffer()), file.name);
      }
      this.moduleInput.value = '';
      return;
    }

    if (event.target === this.sampleInput) {
      const [file] = Array.from(this.sampleInput.files ?? []);
      if (file) {
        await this.engine.loadSample(new Uint8Array(await file.arrayBuffer()), file.name);
      }
      this.sampleInput.value = '';
    }
  }

  private handleInput(event: Event): void {
    if (!(event.target instanceof HTMLInputElement) || !this.engine || !this.snapshot) {
      return;
    }

    const inputKey = event.target.dataset.input;
    if (!inputKey) {
      return;
    }

    const cellRow = this.snapshot.cursor.row;
    const cellChannel = this.snapshot.cursor.channel;
    const selectedSample = this.snapshot.selectedSample;

    switch (inputKey) {
      case 'song-title':
        this.engine.dispatch({ type: 'song/set-title', title: event.target.value });
        break;
      case 'song-bpm':
        this.engine.dispatch({ type: 'song/set-bpm', bpm: Number(event.target.value) });
        break;
      case 'song-speed':
        this.engine.dispatch({ type: 'song/set-speed', speed: Number(event.target.value) });
        break;
      case 'song-pattern':
        this.engine.dispatch({ type: 'song/set-pattern', pattern: Number(event.target.value) });
        break;
      case 'cell-note':
        this.applyCellPatch(cellRow, cellChannel, { note: event.target.value.toUpperCase() || null });
        break;
      case 'cell-sample':
        this.applyCellPatch(cellRow, cellChannel, {
          sample: event.target.value ? clamp(Number(event.target.value) - 1, 0, 30) : null,
        });
        break;
      case 'cell-effect':
        this.applyCellPatch(cellRow, cellChannel, { effect: event.target.value.toUpperCase() || null });
        break;
      case 'cell-param':
        this.applyCellPatch(cellRow, cellChannel, { param: event.target.value.toUpperCase() || null });
        break;
      case 'sample-name':
        this.engine.dispatch({ type: 'sample/update', sample: selectedSample, patch: { name: event.target.value } });
        break;
      case 'sample-volume':
        this.engine.dispatch({ type: 'sample/update', sample: selectedSample, patch: { volume: clamp(Number(event.target.value), 0, 64) } });
        break;
      case 'sample-finetune':
        this.engine.dispatch({ type: 'sample/update', sample: selectedSample, patch: { fineTune: clamp(Number(event.target.value), -8, 7) } });
        break;
      case 'sample-length':
        this.engine.dispatch({ type: 'sample/update', sample: selectedSample, patch: { length: Math.max(0, Number(event.target.value)) } });
        break;
      case 'sample-loop-start':
        this.engine.dispatch({ type: 'sample/update', sample: selectedSample, patch: { loopStart: Math.max(0, Number(event.target.value)) } });
        break;
      case 'sample-loop-length':
        this.engine.dispatch({ type: 'sample/update', sample: selectedSample, patch: { loopLength: Math.max(2, Number(event.target.value)) } });
        break;
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.viewMode === 'classic') {
      this.handleClassicKeyDown(event);
      return;
    }

    if (!this.engine || !this.snapshot || isEditableTarget(event.target)) {
      return;
    }

    const outcome = interpretKeyboard(event, this.snapshot, this.keyboardOctave);
    if (!outcome) {
      if (this.handleModernHexEntry(event)) {
        return;
      }

      return;
    }

    event.preventDefault();
    this.resetModernHexEntry();

    if (typeof outcome.octave === 'number') {
      this.keyboardOctave = outcome.octave;
      this.render();
    }

    if (outcome.transport) {
      this.engine.setTransport(outcome.transport);
    }

    if (outcome.command) {
      this.engine.dispatch(outcome.command);
      if (outcome.command.type === 'pattern/set-cell' && outcome.command.patch.note) {
        this.engine.dispatch({ type: 'cursor/move', rowDelta: 1 });
      }
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (this.viewMode !== 'classic' || !this.engine || isEditableTarget(event.target)) {
      return;
    }

    const translation = translateClassicKeyboardEvent(event) ?? this.classicPressedKeys.get(event.code);
    if (!translation) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.classicPressedKeys.delete(event.code);
    this.engine.forwardClassicKeyUp(
      translation.scancode,
      translation.keycode,
      event.shiftKey,
      event.ctrlKey,
      event.altKey,
      event.metaKey,
    );
  }

  private applyCellPatch(row: number, channel: number, patch: Partial<PatternCell>): void {
    if (!this.engine) {
      return;
    }

    this.engine.dispatch({
      type: 'pattern/set-cell',
      row,
      channel,
      patch,
    });
  }

  private scheduleLayoutRefresh(): void {
    if (!this.engine) {
      return;
    }

    if (this.layoutRefreshFrame !== null) {
      window.cancelAnimationFrame(this.layoutRefreshFrame);
    }

    this.layoutRefreshFrame = window.requestAnimationFrame(() => {
      this.layoutRefreshFrame = null;
      this.engine?.refreshLayout();
    });
  }

  private syncSnapshotPolling(): void {
    const shouldPoll = Boolean(
      this.engine &&
      this.snapshot &&
      (
        this.viewMode === 'classic' ||
        (this.snapshot.backend === 'wasm' && this.snapshot.transport.playing)
      ),
    );

    if (!shouldPoll) {
      if (this.snapshotPollTimer !== null) {
        window.clearInterval(this.snapshotPollTimer);
        this.snapshotPollTimer = null;
      }
      return;
    }

    if (this.snapshotPollTimer !== null) {
      return;
    }

    this.snapshotPollTimer = window.setInterval(() => {
      if (!this.engine || !this.snapshot) {
        return;
      }

      this.snapshot = this.engine.getSnapshot();
      if (this.viewMode === 'classic') {
        this.updateClassicDebugPanel(this.snapshot);
        return;
      }

      this.updateModernLiveRegions(this.snapshot);
    }, 100);
  }

  private updateModernLiveRegions(snapshot: TrackerSnapshot): void {
    if (this.viewMode !== 'modern') {
      return;
    }

    const transportState = this.root.querySelector<HTMLElement>('[data-role="transport-state"]');
    if (transportState) {
      transportState.textContent = snapshot.transport.playing ? 'Playing' : 'Stopped';
    }

    const transportToggle = this.root.querySelector<HTMLButtonElement>('[data-role="transport-toggle"]');
    if (transportToggle) {
      transportToggle.dataset.action = snapshot.transport.playing ? 'stop' : 'toggle-play';
      transportToggle.textContent = snapshot.transport.playing ? 'Stop' : 'Play';
    }

    const songTitle = this.root.querySelector<HTMLElement>('[data-role="song-title"]');
    if (songTitle) {
      songTitle.textContent = snapshot.song.title || 'UNTITLED';
    }

    const statusMessage = this.root.querySelector<HTMLElement>('[data-role="status-message"]');
    if (statusMessage) {
      statusMessage.textContent = this.statusMessage;
    }

    this.setLiveText('metric-backend', snapshot.backend);
    this.setLiveText('metric-position', String(snapshot.transport.position).padStart(2, '0'));
    this.setLiveText('metric-pattern', String(snapshot.transport.pattern).padStart(2, '0'));
    this.setLiveText('metric-row', String(snapshot.transport.row).padStart(2, '0'));
    this.setLiveText('metric-bpm', String(snapshot.transport.bpm));
    this.setLiveText('metric-speed', String(snapshot.transport.speed));

    const patternGrid = this.root.querySelector<HTMLElement>('[data-role="pattern-grid"]');
    if (patternGrid) {
      patternGrid.innerHTML = this.renderCenteredPatternRows(snapshot);
    }
  }

  private setLiveText(role: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(`[data-role="${role}"]`);
    if (element) {
      element.textContent = value;
    }
  }

  private handleModernHexEntry(event: KeyboardEvent): boolean {
    if (!this.engine || !this.snapshot) {
      return false;
    }

    const key = event.key.toUpperCase();
    if (!/^[0-9A-F]$/.test(key)) {
      return false;
    }

    const { field, row, channel } = this.snapshot.cursor;
    if (field !== 'sample' && field !== 'effect' && field !== 'param') {
      return false;
    }

    event.preventDefault();

    const cell = this.snapshot.pattern.rows[row]?.channels[channel];
    if (!cell) {
      return true;
    }

    if (field === 'effect') {
      this.engine.dispatch({
        type: 'pattern/set-cell',
        row,
        channel,
        patch: { effect: key },
      });
      this.modernHexEntryState = { row, channel, field, digits: key };
      return true;
    }

    const previousState = this.modernHexEntryState;
    const sameTarget = previousState &&
      previousState.row === row &&
      previousState.channel === channel &&
      previousState.field === field;
    const nextDigits = sameTarget && previousState.digits.length < 2
      ? `${previousState.digits}${key}`
      : key;
    const paddedDigits = nextDigits.padEnd(2, '0').slice(0, 2);

    this.modernHexEntryState = {
      row,
      channel,
      field,
      digits: nextDigits.slice(-2),
    };

    if (field === 'sample') {
      const sampleNumber = Number.parseInt(paddedDigits, 16);
      this.engine.dispatch({
        type: 'pattern/set-cell',
        row,
        channel,
        patch: {
          sample: sampleNumber <= 0 ? null : clamp(sampleNumber, 1, 31) - 1,
        },
      });
      return true;
    }

    this.engine.dispatch({
      type: 'pattern/set-cell',
      row,
      channel,
      patch: { param: paddedDigits },
    });
    return true;
  }

  private resetModernHexEntry(): void {
    this.modernHexEntryState = null;
  }

  private handleClassicCanvasPointer(event: MouseEvent): void {
    const rect = this.config.canvas.getBoundingClientRect();
    this.classicDomDebug.x = Math.round(event.clientX - rect.left);
    this.classicDomDebug.y = Math.round(event.clientY - rect.top);
    this.classicDomDebug.buttons = event.buttons;
    this.classicDomDebug.events += 1;
    this.updateClassicDebugPanel(this.snapshot);
  }

  private handleClassicCanvasPointerMove(event: MouseEvent): void {
    this.handleClassicCanvasPointer(event);

    if (this.viewMode !== 'classic' || !this.engine) {
      return;
    }

    const { x, y } = this.getClassicLogicalPointerPosition();
    this.engine.forwardClassicPointerMove(x, y, event.buttons);
  }

  private handleClassicCanvasPointerButton(event: MouseEvent, pressed: boolean): void {
    event.preventDefault();
    this.handleClassicCanvasPointer(event);

    if (this.viewMode !== 'classic' || !this.engine) {
      return;
    }

    const { x, y } = this.getClassicLogicalPointerPosition();
    this.engine.forwardClassicPointerButton(
      x,
      y,
      event.button,
      pressed,
      event.buttons,
    );
  }

  private handleClassicKeyDown(event: KeyboardEvent): void {
    if (!this.engine || isEditableTarget(event.target)) {
      return;
    }

    const translation = translateClassicKeyboardEvent(event);
    if (!translation) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.repeat || this.classicPressedKeys.has(event.code)) {
      return;
    }

    this.classicPressedKeys.set(event.code, translation);
    this.engine.forwardClassicKeyDown(
      translation.scancode,
      translation.keycode,
      translation.shift,
      translation.ctrl,
      translation.alt,
      translation.meta,
    );

    if (translation.text) {
      this.engine.forwardClassicTextInput(translation.text);
    }
  }

  private releaseClassicKeys(): void {
    if (!this.engine || this.classicPressedKeys.size === 0) {
      this.classicPressedKeys.clear();
      return;
    }

    for (const translation of this.classicPressedKeys.values()) {
      this.engine.forwardClassicKeyUp(
        translation.scancode,
        translation.keycode,
        false,
        false,
        false,
        false,
      );
    }

    this.classicPressedKeys.clear();
  }

  private getClassicLogicalPointerPosition(): { x: number; y: number } {
    const rect = this.config.canvas.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : this.config.canvas.width;
    const height = rect.height > 0 ? rect.height : this.config.canvas.height;
    const x = clamp(Math.floor((this.classicDomDebug.x / width) * this.config.canvas.width), 0, this.config.canvas.width - 1);
    const y = clamp(Math.floor((this.classicDomDebug.y / height) * this.config.canvas.height), 0, this.config.canvas.height - 1);

    return { x, y };
  }

  private updateClassicDebugPanel(snapshot: TrackerSnapshot | null): void {
    if (this.viewMode !== 'classic') {
      return;
    }

    const debugRoot = this.root.querySelector<HTMLElement>('.classic-debug');
    if (!debugRoot) {
      return;
    }

    const rect = this.config.canvas.getBoundingClientRect();
    const cssWidth = Math.round(rect.width);
    const cssHeight = Math.round(rect.height);
    const debug = snapshot?.debug;

    this.setDebugField('dom-mouse', `${this.classicDomDebug.x}, ${this.classicDomDebug.y}`);
    this.setDebugField(
      'dom-state',
      `${this.classicDomDebug.inside ? 'inside' : 'outside'} btn:${this.classicDomDebug.buttons} ev:${this.classicDomDebug.events}`,
    );
    this.setDebugField('mouse-abs', debug ? `${debug.mouse.absX}, ${debug.mouse.absY}` : 'n/a');
    this.setDebugField('mouse-raw', debug ? `${debug.mouse.rawX}, ${debug.mouse.rawY}` : 'n/a');
    this.setDebugField('mouse-pt2', debug ? `${debug.mouse.x}, ${debug.mouse.y}` : 'n/a');
    this.setDebugField(
      'mouse-buttons',
      debug ? `${debug.mouse.buttons} L:${debug.mouse.left ? '1' : '0'} R:${debug.mouse.right ? '1' : '0'}` : 'n/a',
    );
    this.setDebugField('canvas-css', `${cssWidth} x ${cssHeight}`);
    this.setDebugField('video-render', debug ? `${debug.video.renderW} x ${debug.video.renderH}` : 'n/a');
    this.setDebugField(
      'video-scale',
      debug ? `${debug.video.scaleX.toFixed(4)} / ${debug.video.scaleY.toFixed(4)}` : 'n/a',
    );
  }

  private setDebugField(field: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(`[data-debug-field="${field}"]`);
    if (element) {
      element.textContent = value;
    }
  }
}
