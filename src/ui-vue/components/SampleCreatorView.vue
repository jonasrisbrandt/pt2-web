<template>
  <section
    v-if="snapshot"
    class="sample-creator-workspace"
  >
    <div class="sample-creator-head">
      <div>
        <p class="panel-label">Sample Creator</p>
        <h2 class="panel-title">{{ definition.label }}</h2>
        <p class="hint">{{ definition.description }}</p>
      </div>
      <div class="sample-creator-head__actions">
        <button
          type="button"
          :class="['toolbar-button', { 'is-active': snapshot.inputArm === 'synth' }]"
          data-action="sample-creator-arm-synth"
        >Arm Synth</button>
        <button
          type="button"
          :class="['toolbar-button', { 'is-active': snapshot.inputArm === 'tracker' }]"
          data-action="sample-creator-arm-tracker"
        >Arm Tracker</button>
        <button
          type="button"
          class="toolbar-button"
          data-action="sample-creator-close"
        >Back to tracker</button>
      </div>
    </div>

    <div class="sample-creator-meta">
      <div class="sample-creator-card">
        <p class="metric-label">Target sample</p>
        <strong class="sample-creator-target">Slot {{ targetSampleLabel }}</strong>
        <p class="hint">MIDI {{ snapshot.midiAvailable ? 'connected' : 'not connected' }} | Input armed to {{ snapshot.inputArm }}</p>
      </div>
      <div class="sample-creator-card">
        <p class="metric-label">Backend</p>
        <strong class="sample-creator-target">{{ backendLabel }}</strong>
        <p class="hint">{{ backendDetails }}</p>
      </div>
      <div class="sample-creator-card">
        <p class="metric-label">Synth</p>
        <div class="sample-creator-segmented">
          <button
            type="button"
            :class="['icon-button', { 'is-active': snapshot.selectedSynth === 'core-sub' }]"
            data-action="sample-creator-select-synth"
            data-synth="core-sub"
          >CoreSub</button>
          <button
            type="button"
            :class="['icon-button', { 'is-active': snapshot.selectedSynth === 'acid303' }]"
            data-action="sample-creator-select-synth"
            data-synth="acid303"
          >Acid303</button>
        </div>
        <label class="sample-creator-select-wrap">
          <span class="metric-label">Preset</span>
          <select
            class="sample-creator-select"
            data-input="sample-creator-preset"
          >
            <option
              v-for="preset in presets"
              :key="preset.id"
              :value="preset.id"
              :selected="preset.id === snapshot.selectedPresetId"
            >{{ preset.name }}</option>
          </select>
        </label>
      </div>
      <div class="sample-creator-card">
        <p class="metric-label">Render</p>
        <div class="sample-creator-render-grid">
          <label class="sample-creator-inline-field">
            <span>Name</span>
            <input
              type="text"
              data-input="sample-creator-name"
              :value="renderJob.sampleName"
              maxlength="22"
            />
          </label>
          <label class="sample-creator-inline-field">
            <span>Duration</span>
            <input
              type="number"
              data-input="sample-creator-duration"
              :value="renderJob.durationSeconds"
              min="0.05"
              max="6"
              step="0.05"
            />
          </label>
          <label class="sample-creator-inline-field">
            <span>Tail</span>
            <input
              type="number"
              data-input="sample-creator-tail"
              :value="renderJob.tailSeconds"
              min="0"
              max="4"
              step="0.05"
            />
          </label>
          <label class="sample-creator-inline-field">
            <span>Root note</span>
            <input
              type="number"
              data-input="sample-creator-note"
              :value="renderJob.midiNote"
              min="24"
              max="96"
              step="1"
            />
          </label>
          <label class="sample-creator-inline-field">
            <span>Volume</span>
            <input
              type="number"
              data-input="sample-creator-volume"
              :value="renderJob.volume"
              min="0"
              max="64"
              step="1"
            />
          </label>
          <label class="sample-creator-inline-field">
            <span>Fine tune</span>
            <input
              type="number"
              data-input="sample-creator-finetune"
              :value="renderJob.fineTune"
              min="-8"
              max="7"
              step="1"
            />
          </label>
          <label class="sample-creator-inline-field">
            <span>Bake rate</span>
            <select
              class="sample-creator-select"
              data-input="sample-creator-samplerate"
            >
              <option
                v-for="option in bakeRateOptions"
                :key="option.value"
                :value="option.value"
                :selected="option.value === snapshot.bakeSampleRate"
              >{{ option.label }}</option>
            </select>
          </label>
        </div>
        <div class="sample-creator-checks">
          <label><input
            type="checkbox"
            data-input="sample-creator-normalize"
            :checked="renderJob.normalize"
          /> Normalize</label>
          <label><input
            type="checkbox"
            data-input="sample-creator-fadeout"
            :checked="renderJob.fadeOut"
          /> Fade tail</label>
        </div>
        <div class="sample-creator-render-actions">
          <button
            type="button"
            class="toolbar-button"
            data-action="sample-creator-preview-note"
          >Preview one-shot</button>
          <button
            type="button"
            class="toolbar-button"
            data-action="sample-creator-stop"
          >Stop live</button>
          <button
            type="button"
            :class="['toolbar-button', { 'is-active': snapshot.recordState === 'recording' }]"
            data-action="sample-creator-record"
          >{{ recordActionLabel }}</button>
          <button
            type="button"
            class="toolbar-button"
            data-action="sample-creator-bake"
          >Bake to slot {{ targetSlotNumber }}</button>
          <button
            type="button"
            class="toolbar-button"
            data-action="sample-creator-commit-recording"
            :disabled="snapshot.recordState !== 'captured'"
          >Commit capture</button>
          <button
            type="button"
            class="toolbar-button"
            data-action="sample-creator-discard-recording"
            :disabled="snapshot.recordState === 'idle'"
          >Discard capture</button>
        </div>
        <p class="hint">{{ snapshot.status }}</p>
      </div>
    </div>

    <div class="sample-creator-piano-card sample-creator-card">
      <div class="sample-creator-card__head">
        <p class="metric-label">Keyboard and piano</p>
        <span class="hint">Octave {{ keyboardOctave }} | Live preview uses note-on/note-off.</span>
      </div>
      <SampleCreatorPianoView
        :base-midi="baseMidi"
        :active-notes="activeNotes"
      />
    </div>

    <section class="sample-creator-card sample-creator-card--telemetry">
      <div class="sample-creator-card__head">
        <p class="metric-label">Synth displays</p>
        <span class="hint">Embedded oscillator, modulation, filter, and output views.</span>
      </div>
      <SampleCreatorTelemetryPanel :telemetry="telemetry" />
    </section>

    <div class="sample-creator-grid">
      <section
        v-for="section in controlSections"
        :key="section.id"
        class="sample-creator-card"
      >
        <div class="sample-creator-card__head">
          <p class="metric-label">{{ section.id }}</p>
        </div>
        <div class="sample-creator-control-grid">
          <SampleCreatorControlView
            v-for="paramId in section.paramIds"
            :key="paramId"
            :param-id="paramId"
            :value="snapshot.patch[paramId]"
          />
        </div>
      </section>
      <section class="sample-creator-card">
        <div class="sample-creator-card__head">
          <p class="metric-label">Last bake</p>
        </div>
        <div class="sample-creator-last-render">
          <strong>{{ lastRenderName }}</strong>
          <span>{{ lastRenderSummary }}</span>
          <span>{{ lastRenderPeak }}</span>
        </div>
      </section>
      <section class="sample-creator-card">
        <div class="sample-creator-card__head">
          <p class="metric-label">Recorded capture</p>
          <span class="hint">{{ recordSummary }}</span>
        </div>
        <SampleCreatorWaveformView :waveform="snapshot.recordedWaveform" />
      </section>
    </div>
  </section>
  <section
    v-else
    class="sample-creator-workspace"
  >
    <div class="sample-creator-card">
      <p class="panel-label">Sample Creator</p>
      <h2 class="panel-title">Initializing synth engine...</h2>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { SYNTH_DEFINITIONS, SYNTH_PARAMETERS, SYNTH_PRESETS } from '../../core/synthConfig';
import type { SampleCreatorRenderOptions } from '../../ui-modern/components/appShellRenderer';
import SampleCreatorControlView from './SampleCreatorControlView.vue';
import SampleCreatorPianoView from './SampleCreatorPianoView.vue';
import SampleCreatorTelemetryPanel from './SampleCreatorTelemetryPanel.vue';
import SampleCreatorWaveformView from './SampleCreatorWaveformView.vue';

const props = defineProps<SampleCreatorRenderOptions>();

const snapshot = computed(() => props.snapshot);
const telemetry = computed(() => props.telemetry);
const targetSample = computed(() => props.targetSample);
const renderJob = computed(() => props.renderJob);
const keyboardOctave = computed(() => props.keyboardOctave);

const definition = computed(() => SYNTH_DEFINITIONS[snapshot.value?.selectedSynth ?? 'core-sub']);
const presets = computed(() => SYNTH_PRESETS.filter((preset) => preset.synth === (snapshot.value?.selectedSynth ?? 'core-sub')));
const controlSections = computed(() =>
  ['oscillators', 'amp', 'filter', 'motion', 'fx', 'performance']
    .map((sectionId) => ({
      id: sectionId,
      paramIds: definition.value.parameterIds.filter((paramId) => SYNTH_PARAMETERS[paramId].section === sectionId),
    }))
    .filter((section) => section.paramIds.length > 0),
);
const targetSlotNumber = computed(() => String((targetSample.value?.index ?? 0) + 1).padStart(2, '0'));
const targetSampleLabel = computed(() => `${targetSlotNumber.value} ${targetSample.value?.name || 'Empty slot'}`);
const backendLabel = computed(() => {
  if (!snapshot.value) {
    return 'Unavailable';
  }
  if (snapshot.value.backend === 'mock') {
    return 'JS fallback (debug)';
  }
  if (snapshot.value.backend === 'wasm') {
    return 'Wasm core';
  }
  return 'Unavailable';
});
const backendDetails = computed(() => {
  if (!snapshot.value) {
    return 'Synth engine is not ready yet.';
  }
  if (snapshot.value.backendError) {
    return `Error: ${snapshot.value.backendError}`;
  }
  if (snapshot.value.previewSampleRate) {
    return `Preview ${snapshot.value.previewSampleRate} Hz | Bake ${snapshot.value.bakeSampleRate} Hz`;
  }
  return `Bake ${snapshot.value.bakeSampleRate} Hz`;
});
const bakeRateOptions = [
  { value: 48000, label: '48 kHz' },
  { value: 44100, label: '44.1 kHz' },
  { value: 22050, label: '22.05 kHz' },
  { value: 11025, label: '11.025 kHz' },
];
const recordActionLabel = computed(() => snapshot.value?.recordState === 'recording' ? 'Stop record' : 'Start record');
const baseMidi = computed(() => 36 + (keyboardOctave.value * 12));
const activeNotes = computed(() => new Set(snapshot.value?.activeNotes ?? []));
const lastRenderName = computed(() => snapshot.value?.lastRender?.name ?? 'No rendered sample yet');
const lastRenderSummary = computed(() => snapshot.value?.lastRender
  ? `${snapshot.value.lastRender.data.length} samples at ${snapshot.value.lastRender.sampleRate} Hz`
  : 'Render a sample to populate the tracker slot.');
const lastRenderPeak = computed(() => snapshot.value?.lastRender ? `Peak ${Math.round(snapshot.value.lastRender.peak * 100)}%` : '');
const recordSummary = computed(() => snapshot.value?.recordState === 'captured'
  ? `${snapshot.value.recordedDurationSeconds.toFixed(2)} s | Peak ${Math.round(snapshot.value.recordedPeak * 100)}%`
  : (snapshot.value?.recordState ?? 'idle'));
</script>
