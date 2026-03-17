import { escapeHtml } from '../../ui/formatters';
import { SYNTH_DEFINITIONS, SYNTH_PARAMETERS, SYNTH_PRESETS } from '../../core/synthConfig';
import type { RenderJob, SynthSnapshot, SynthParamId } from '../../core/synthTypes';
import type { SampleSlot } from '../../core/trackerTypes';

export interface SampleCreatorRenderOptions {
  snapshot: SynthSnapshot;
  targetSample: SampleSlot;
  keyboardOctave: number;
  renderJob: RenderJob;
}

const renderRangeControl = (snapshot: SynthSnapshot, paramId: SynthParamId): string => {
  const definition = SYNTH_PARAMETERS[paramId];
  const value = snapshot.patch[paramId];
  return `
    <label class="sample-creator-control">
      <span class="sample-creator-control__label">${escapeHtml(definition.label)}</span>
      <input
        class="sample-creator-control__input"
        data-input="sample-creator-param"
        data-param="${paramId}"
        type="range"
        min="${definition.min}"
        max="${definition.max}"
        step="${definition.step}"
        value="${value}"
      />
      <span class="sample-creator-control__value">${escapeHtml(definition.formatter?.(value) ?? value.toFixed(2))}</span>
    </label>
  `;
};

const renderRecordedWaveform = (waveform: Int8Array | null): string => {
  if (!waveform || waveform.length === 0) {
    return '<div class="sample-creator-waveform sample-creator-waveform--empty">No recorded capture yet.</div>';
  }

  const points = Array.from(waveform, (value, index) => {
    const x = waveform.length <= 1 ? 0 : (index / (waveform.length - 1)) * 100;
    const normalized = (value ?? 0) / 127;
    const y = 50 - (normalized * 42);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  return `
    <div class="sample-creator-waveform">
      <svg viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
        <polyline points="${points}" />
      </svg>
    </div>
  `;
};

const renderPiano = (baseMidi: number, activeNotes: ReadonlySet<number>): string => {
  const whiteOffsets = [0, 2, 4, 5, 7, 9, 11];
  const blackOffsets = [1, 3, -1, 6, 8, 10];
  const keys: string[] = [];

  for (let octave = 0; octave < 2; octave += 1) {
    for (const offset of whiteOffsets) {
      const midiNote = baseMidi + (octave * 12) + offset;
      const activeClass = activeNotes.has(midiNote) ? ' is-active' : '';
      keys.push(`<button type="button" class="sample-creator-piano__key${activeClass}" data-action="sample-creator-piano-note" data-midi="${midiNote}">${midiNote}</button>`);
    }
  }

  for (let octave = 0; octave < 2; octave += 1) {
    blackOffsets.forEach((offset, index) => {
      if (offset < 0) {
        return;
      }

      const midiNote = baseMidi + (octave * 12) + offset;
      const activeClass = activeNotes.has(midiNote) ? ' is-active' : '';
      keys.push(`<button type="button" class="sample-creator-piano__key sample-creator-piano__key--black sample-creator-piano__key--black-${octave}-${index}${activeClass}" data-action="sample-creator-piano-note" data-midi="${midiNote}">${midiNote}</button>`);
    });
  }

  return `<div class="sample-creator-piano">${keys.join('')}</div>`;
};

export const renderSampleCreatorWorkspace = ({
  snapshot,
  targetSample,
  keyboardOctave,
  renderJob,
}: SampleCreatorRenderOptions): string => {
  const definition = SYNTH_DEFINITIONS[snapshot.selectedSynth];
  const presets = SYNTH_PRESETS.filter((preset) => preset.synth === snapshot.selectedSynth);
  const groupedControls = ['oscillators', 'amp', 'filter', 'motion', 'fx', 'performance']
    .map((section) => {
      const controls = definition.parameterIds
        .filter((paramId) => SYNTH_PARAMETERS[paramId].section === section)
        .map((paramId) => renderRangeControl(snapshot, paramId))
        .join('');

      if (!controls) {
        return '';
      }

      return `
        <section class="sample-creator-card">
          <div class="sample-creator-card__head">
            <p class="metric-label">${escapeHtml(section)}</p>
          </div>
          <div class="sample-creator-control-grid">
            ${controls}
          </div>
        </section>
      `;
    })
    .join('');

  const lastRender = snapshot.lastRender;
  const baseMidi = 36 + (keyboardOctave * 12);
  const activeNotes = new Set(snapshot.activeNotes);
  const recordActionLabel = snapshot.recordState === 'recording' ? 'Stop record' : 'Start record';
  const backendLabel = snapshot.backend === 'mock'
    ? 'JS fallback (debug)'
    : snapshot.backend === 'wasm'
      ? 'Wasm core'
      : 'Unavailable';
  const backendDetails = snapshot.backendError
    ? `Error: ${snapshot.backendError}`
    : snapshot.previewSampleRate
      ? `Preview ${snapshot.previewSampleRate} Hz | Bake ${snapshot.bakeSampleRate} Hz`
      : `Bake ${snapshot.bakeSampleRate} Hz`;

  return `
    <section class="sample-creator-workspace">
      <div class="sample-creator-head">
        <div>
          <p class="panel-label">Sample Creator</p>
          <h2 class="panel-title">${escapeHtml(definition.label)}</h2>
          <p class="hint">${escapeHtml(definition.description)}</p>
        </div>
        <div class="sample-creator-head__actions">
          <button type="button" class="toolbar-button${snapshot.inputArm === 'synth' ? ' is-active' : ''}" data-action="sample-creator-arm-synth">Arm Synth</button>
          <button type="button" class="toolbar-button${snapshot.inputArm === 'tracker' ? ' is-active' : ''}" data-action="sample-creator-arm-tracker">Arm Tracker</button>
          <button type="button" class="toolbar-button" data-action="sample-creator-close">Back to tracker</button>
        </div>
      </div>

      <div class="sample-creator-meta">
        <div class="sample-creator-card">
          <p class="metric-label">Target sample</p>
          <strong class="sample-creator-target">Slot ${String(targetSample.index + 1).padStart(2, '0')} ${escapeHtml(targetSample.name || 'Empty slot')}</strong>
          <p class="hint">MIDI ${snapshot.midiAvailable ? 'connected' : 'not connected'} | Input armed to ${escapeHtml(snapshot.inputArm)}</p>
        </div>
        <div class="sample-creator-card">
          <p class="metric-label">Backend</p>
          <strong class="sample-creator-target">${escapeHtml(backendLabel)}</strong>
          <p class="hint">${escapeHtml(backendDetails)}</p>
        </div>
        <div class="sample-creator-card">
          <p class="metric-label">Synth</p>
          <div class="sample-creator-segmented">
            <button type="button" class="icon-button${snapshot.selectedSynth === 'core-sub' ? ' is-active' : ''}" data-action="sample-creator-select-synth" data-synth="core-sub">CoreSub</button>
            <button type="button" class="icon-button${snapshot.selectedSynth === 'acid303' ? ' is-active' : ''}" data-action="sample-creator-select-synth" data-synth="acid303">Acid303</button>
          </div>
          <label class="sample-creator-select-wrap">
            <span class="metric-label">Preset</span>
            <select class="sample-creator-select" data-input="sample-creator-preset">
              ${presets.map((preset) => `<option value="${preset.id}" ${preset.id === snapshot.selectedPresetId ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="sample-creator-card">
          <p class="metric-label">Render</p>
          <div class="sample-creator-render-grid">
            <label class="sample-creator-inline-field">
              <span>Name</span>
              <input type="text" data-input="sample-creator-name" value="${escapeHtml(renderJob.sampleName)}" maxlength="22" />
            </label>
            <label class="sample-creator-inline-field">
              <span>Duration</span>
              <input type="number" data-input="sample-creator-duration" value="${renderJob.durationSeconds}" min="0.05" max="6" step="0.05" />
            </label>
            <label class="sample-creator-inline-field">
              <span>Tail</span>
              <input type="number" data-input="sample-creator-tail" value="${renderJob.tailSeconds}" min="0" max="4" step="0.05" />
            </label>
            <label class="sample-creator-inline-field">
              <span>Root note</span>
              <input type="number" data-input="sample-creator-note" value="${renderJob.midiNote}" min="24" max="96" step="1" />
            </label>
            <label class="sample-creator-inline-field">
              <span>Volume</span>
              <input type="number" data-input="sample-creator-volume" value="${renderJob.volume}" min="0" max="64" step="1" />
            </label>
            <label class="sample-creator-inline-field">
              <span>Fine tune</span>
              <input type="number" data-input="sample-creator-finetune" value="${renderJob.fineTune}" min="-8" max="7" step="1" />
            </label>
            <label class="sample-creator-inline-field">
              <span>Bake rate</span>
              <select class="sample-creator-select" data-input="sample-creator-samplerate">
                <option value="48000" ${snapshot.bakeSampleRate === 48000 ? 'selected' : ''}>48 kHz</option>
                <option value="44100" ${snapshot.bakeSampleRate === 44100 ? 'selected' : ''}>44.1 kHz</option>
                <option value="22050" ${snapshot.bakeSampleRate === 22050 ? 'selected' : ''}>22.05 kHz</option>
                <option value="11025" ${snapshot.bakeSampleRate === 11025 ? 'selected' : ''}>11.025 kHz</option>
              </select>
            </label>
          </div>
          <div class="sample-creator-checks">
            <label><input type="checkbox" data-input="sample-creator-normalize" ${renderJob.normalize ? 'checked' : ''} /> Normalize</label>
            <label><input type="checkbox" data-input="sample-creator-fadeout" ${renderJob.fadeOut ? 'checked' : ''} /> Fade tail</label>
          </div>
          <div class="sample-creator-render-actions">
            <button type="button" class="toolbar-button" data-action="sample-creator-preview-note">Preview one-shot</button>
            <button type="button" class="toolbar-button" data-action="sample-creator-stop">Stop live</button>
            <button type="button" class="toolbar-button${snapshot.recordState === 'recording' ? ' is-active' : ''}" data-action="sample-creator-record">${recordActionLabel}</button>
            <button type="button" class="toolbar-button" data-action="sample-creator-bake">Bake to slot ${String(targetSample.index + 1).padStart(2, '0')}</button>
            <button type="button" class="toolbar-button" data-action="sample-creator-commit-recording" ${snapshot.recordState !== 'captured' ? 'disabled' : ''}>Commit capture</button>
            <button type="button" class="toolbar-button" data-action="sample-creator-discard-recording" ${snapshot.recordState === 'idle' ? 'disabled' : ''}>Discard capture</button>
          </div>
          <p class="hint">${escapeHtml(snapshot.status)}</p>
        </div>
      </div>

      <div class="sample-creator-piano-card sample-creator-card">
        <div class="sample-creator-card__head">
          <p class="metric-label">Keyboard and piano</p>
          <span class="hint">Octave ${keyboardOctave} | Live preview uses note-on/note-off.</span>
        </div>
        ${renderPiano(baseMidi, activeNotes)}
      </div>

      <div class="sample-creator-grid">
        ${groupedControls}
        <section class="sample-creator-card">
          <div class="sample-creator-card__head">
            <p class="metric-label">Last bake</p>
          </div>
          <div class="sample-creator-last-render">
            <strong>${escapeHtml(lastRender?.name ?? 'No rendered sample yet')}</strong>
            <span>${lastRender ? `${lastRender.data.length} samples at ${lastRender.sampleRate} Hz` : 'Render a sample to populate the tracker slot.'}</span>
            <span>${lastRender ? `Peak ${Math.round(lastRender.peak * 100)}%` : ''}</span>
          </div>
        </section>
        <section class="sample-creator-card">
          <div class="sample-creator-card__head">
            <p class="metric-label">Recorded capture</p>
            <span class="hint">${snapshot.recordState === 'captured' ? `${snapshot.recordedDurationSeconds.toFixed(2)} s | Peak ${Math.round(snapshot.recordedPeak * 100)}%` : snapshot.recordState}</span>
          </div>
          ${renderRecordedWaveform(snapshot.recordedWaveform)}
        </section>
      </div>
    </section>
  `;
};
