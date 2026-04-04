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
      <section class="sample-creator-card">
        <div class="sample-creator-card__head">
          <p class="metric-label">Target Slot</p>
          <strong class="sample-creator-target">Slot {{ targetSlotNumber }}</strong>
        </div>
        <strong class="sample-creator-target">{{ targetSampleLabel }}</strong>
        <label class="sample-creator-select-wrap">
          <span class="metric-label">Import destination</span>
          <select
            class="sample-creator-select"
            data-input="sample-creator-target-slot"
          >
            <option
              v-for="slot in sampleSlots"
              :key="slot.index"
              :value="slot.index"
              :selected="slot.index === renderJob.targetSlot"
            >{{ formatSlotLabel(slot.index, slot.name) }}</option>
          </select>
        </label>
        <p class="hint">
          Bake and capture both write to this slot.
          <template v-if="selectedTargetSample">
            {{ selectedTargetSample.length > 0 ? ` Current length ${selectedTargetSample.length} bytes.` : ' Slot is currently empty.' }}
          </template>
        </p>
      </section>
      <section class="sample-creator-card">
        <div class="sample-creator-card__head">
          <p class="metric-label">Backend</p>
          <strong class="sample-creator-target">{{ backendLabel }}</strong>
        </div>
        <p class="hint">{{ backendDetails }}</p>
      </section>
      <section class="sample-creator-card">
        <div class="sample-creator-card__head">
          <p class="metric-label">Synth</p>
          <span class="hint">{{ midiInputLabel }}</span>
        </div>
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
      </section>
    </div>

    <div class="sample-creator-grid sample-creator-grid--primary">
      <section class="sample-creator-card sample-creator-card--bake">
        <div class="sample-creator-card__head">
          <div>
            <p class="metric-label">Bake Sample</p>
            <p class="hint">Render a controlled synth note directly into the target slot.</p>
          </div>
          <span class="hint">Slot {{ targetSlotNumber }}</span>
        </div>

        <div class="sample-creator-render-grid sample-creator-render-grid--meta">
          <label class="sample-creator-inline-field sample-creator-inline-field--wide">
            <span>Sample Name</span>
            <input
              type="text"
              data-input="sample-creator-name"
              :value="renderJob.sampleName"
              maxlength="22"
            />
          </label>
          <label class="sample-creator-inline-field">
            <span>Bake Rate</span>
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

        <div class="sample-creator-render-controls">
          <SampleCreatorRenderControlView
            label="Render Note"
            input-key="sample-creator-note"
            :value="renderJob.midiNote"
            :min="24"
            :max="96"
            :step="1"
            :display-value="renderNoteLabel"
          />
          <SampleCreatorRenderControlView
            label="Velocity"
            input-key="sample-creator-velocity"
            :value="renderJob.velocity"
            :min="0.05"
            :max="1"
            :step="0.01"
            :display-value="velocityLabel"
          />
          <SampleCreatorRenderControlView
            label="Hold Time"
            input-key="sample-creator-duration"
            :value="renderJob.durationSeconds"
            :min="0.05"
            :max="6"
            :step="0.05"
            :display-value="holdTimeLabel"
          />
          <SampleCreatorRenderControlView
            label="Release Tail"
            input-key="sample-creator-tail"
            :value="renderJob.tailSeconds"
            :min="0"
            :max="4"
            :step="0.05"
            :display-value="releaseTailLabel"
          />
          <SampleCreatorRenderControlView
            label="Volume"
            input-key="sample-creator-volume"
            :value="renderJob.volume"
            :min="0"
            :max="64"
            :step="1"
            :display-value="volumeLabel"
          />
          <SampleCreatorRenderControlView
            label="Fine Tune"
            input-key="sample-creator-finetune"
            :value="renderJob.fineTune"
            :min="-8"
            :max="7"
            :step="1"
            :display-value="fineTuneLabel"
          />
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
            data-action="sample-creator-preview-bake"
          >Preview Baked Note</button>
          <button
            type="button"
            class="toolbar-button toolbar-button--primary"
            data-action="sample-creator-bake"
          >Bake to Target Slot</button>
        </div>

        <div class="sample-creator-last-render">
          <strong>{{ lastRenderName }}</strong>
          <span>{{ lastRenderSummary }}</span>
          <span>{{ lastRenderPeak }}</span>
        </div>
      </section>

      <section class="sample-creator-card sample-creator-card--capture">
        <div class="sample-creator-card__head">
          <div>
            <p class="metric-label">Capture Performance</p>
            <p class="hint">Record a live performance from MIDI or the on-screen keyboard, then commit it to the target slot.</p>
          </div>
          <span class="hint">{{ captureStateLabel }}</span>
        </div>

        <div class="sample-creator-capture-summary">
          <strong>{{ captureInputLabel }}</strong>
          <span>{{ captureSummary }}</span>
        </div>

        <div class="sample-creator-render-actions">
          <button
            type="button"
            :class="['toolbar-button', { 'is-active': snapshot.recordState === 'recording' }]"
            data-action="sample-creator-capture"
          >{{ captureActionLabel }}</button>
          <button
            type="button"
            class="toolbar-button"
            data-action="sample-creator-stop-live"
          >Stop Live Notes</button>
          <button
            type="button"
            class="toolbar-button toolbar-button--primary"
            data-action="sample-creator-commit-capture"
            :disabled="snapshot.recordState !== 'captured'"
          >Commit Capture to Target Slot</button>
          <button
            type="button"
            class="toolbar-button"
            data-action="sample-creator-discard-capture"
            :disabled="snapshot.recordState === 'idle'"
          >Discard Capture</button>
        </div>

        <SampleCreatorWaveformView :waveform="snapshot.recordedWaveform" />
        <p class="hint">{{ snapshot.status }}</p>
      </section>
    </div>

    <div class="sample-creator-piano-card sample-creator-card">
      <div class="sample-creator-card__head">
        <p class="metric-label">Keyboard and piano</p>
        <span class="hint">Keyboard octave {{ keyboardOctave }} | Visible range {{ pianoRangeLabel }}</span>
      </div>
      <SampleCreatorPianoView
        :start-absolute="pianoStartAbsolute"
        :end-absolute="pianoEndAbsolute"
        :range-label="pianoRangeLabel"
        :can-shift-down="pianoCanShiftDown"
        :can-shift-up="pianoCanShiftUp"
        :active-notes="activeNotes"
        :flash-note="pianoFlashNote"
        :flash-token="pianoFlashToken"
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
          <p class="metric-label">{{ section.label }}</p>
        </div>
        <div class="sample-creator-control-grid">
          <SampleCreatorControlView
            v-for="paramId in section.paramIds"
            :key="paramId"
            :synth-id="snapshot.selectedSynth"
            :param-id="paramId"
            :value="snapshot.patch[paramId]"
          />
        </div>
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
import { SYNTH_DEFINITIONS, SYNTH_PRESETS, getParameterDefinitionForSynth } from '../../core/synthConfig';
import type { SampleSlot } from '../../core/trackerTypes';
import type { SampleCreatorRenderOptions } from '../../ui-modern/components/appShellRenderer';
import SampleCreatorControlView from './SampleCreatorControlView.vue';
import SampleCreatorPianoView from './SampleCreatorPianoView.vue';
import SampleCreatorRenderControlView from './SampleCreatorRenderControlView.vue';
import SampleCreatorTelemetryPanel from './SampleCreatorTelemetryPanel.vue';
import SampleCreatorWaveformView from './SampleCreatorWaveformView.vue';

const props = defineProps<SampleCreatorRenderOptions>();

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SECTION_LABELS: Record<string, string> = {
  oscillators: 'Oscillators',
  amp: 'Amp',
  filter: 'Filter',
  motion: 'Motion',
  fx: 'FX',
  performance: 'Performance',
};

const formatSlotNumber = (slot: number): string => String(slot + 1).padStart(2, '0');
const formatSlotLabel = (slot: number, name: string): string => `Slot ${formatSlotNumber(slot)} ${name || 'Empty slot'}`;
const formatSampleSlotDisplay = (sample: SampleSlot | null, slotNumber: string): string => {
  if (!sample) {
    return 'Empty slot';
  }

  const trimmedName = sample.name.trim();
  if (trimmedName.length > 0) {
    return trimmedName;
  }

  return sample.length > 0 ? `SAMPLE ${slotNumber}` : 'Empty slot';
};
const formatMidiNote = (value: number): string => {
  const midiNote = Math.round(value);
  const octave = Math.floor(midiNote / 12) - 1;
  return `${NOTE_NAMES[midiNote % 12] ?? 'C'}${octave}`;
};

const snapshot = computed(() => props.snapshot);
const telemetry = computed(() => props.telemetry);
const renderJob = computed(() => props.renderJob);
const sampleSlots = computed(() => props.sampleSlots);
const keyboardOctave = computed(() => props.keyboardOctave);
const pianoStartAbsolute = computed(() => props.pianoStartAbsolute);
const pianoEndAbsolute = computed(() => props.pianoEndAbsolute);
const pianoRangeLabel = computed(() => props.pianoRangeLabel);
const pianoCanShiftDown = computed(() => props.pianoCanShiftDown);
const pianoCanShiftUp = computed(() => props.pianoCanShiftUp);
const pianoFlashNote = computed(() => props.pianoFlashNote);
const pianoFlashToken = computed(() => props.pianoFlashToken);

const definition = computed(() => SYNTH_DEFINITIONS[snapshot.value?.selectedSynth ?? 'acid303']);
const presets = computed(() => SYNTH_PRESETS.filter((preset) => preset.synth === (snapshot.value?.selectedSynth ?? 'acid303')));
const controlSections = computed(() =>
  ['oscillators', 'amp', 'filter', 'motion', 'fx', 'performance']
    .map((sectionId) => ({
      id: sectionId,
      label: SECTION_LABELS[sectionId] ?? sectionId,
      paramIds: definition.value.parameterIds.filter((paramId) => getParameterDefinitionForSynth(definition.value.id, paramId).section === sectionId),
    }))
    .filter((section) => section.paramIds.length > 0),
);
const selectedTargetSample = computed<SampleSlot | null>(() =>
  sampleSlots.value[renderJob.value.targetSlot]
  ?? props.targetSample
  ?? null,
);
const targetSlotNumber = computed(() => formatSlotNumber(renderJob.value.targetSlot));
const targetSampleLabel = computed(() => formatSampleSlotDisplay(selectedTargetSample.value, targetSlotNumber.value));
const backendLabel = computed(() => {
  if (!snapshot.value) {
    return 'Unavailable';
  }
  return snapshot.value.backend === 'wasm' ? 'Wasm core' : 'Unavailable';
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
const captureActionLabel = computed(() => snapshot.value?.recordState === 'recording' ? 'Stop Capture' : 'Start Capture');
const captureStateLabel = computed(() => {
  switch (snapshot.value?.recordState) {
    case 'recording':
      return 'Capturing live performance';
    case 'captured':
      return `Ready for Slot ${targetSlotNumber.value}`;
    default:
      return 'Idle';
  }
});
const captureInputLabel = computed(() =>
  `MIDI ${snapshot.value?.midiAvailable ? 'connected' : 'not connected'} | Input armed to ${snapshot.value?.inputArm ?? 'synth'}`,
);
const midiInputLabel = computed(() => snapshot.value?.midiAvailable ? 'MIDI connected' : 'MIDI not connected');
const activeNotes = computed(() => new Set(snapshot.value?.activeNotes ?? []));
const renderNoteLabel = computed(() => `${formatMidiNote(renderJob.value.midiNote)} (${Math.round(renderJob.value.midiNote)})`);
const velocityLabel = computed(() => `${Math.round(renderJob.value.velocity * 100)}%`);
const holdTimeLabel = computed(() => `${renderJob.value.durationSeconds.toFixed(renderJob.value.durationSeconds < 1 ? 2 : 1)} s`);
const releaseTailLabel = computed(() => `${renderJob.value.tailSeconds.toFixed(renderJob.value.tailSeconds < 1 ? 2 : 1)} s`);
const volumeLabel = computed(() => String(Math.round(renderJob.value.volume)));
const fineTuneLabel = computed(() => renderJob.value.fineTune > 0 ? `+${Math.round(renderJob.value.fineTune)}` : String(Math.round(renderJob.value.fineTune)));
const lastRenderName = computed(() => snapshot.value?.lastRender?.name ?? 'No baked sample yet');
const lastRenderSummary = computed(() => snapshot.value?.lastRender
  ? `${snapshot.value.lastRender.data.length} samples at ${snapshot.value.lastRender.sampleRate} Hz into Slot ${targetSlotNumber.value}`
  : `Bake a sample to import it into Slot ${targetSlotNumber.value}.`);
const lastRenderPeak = computed(() => snapshot.value?.lastRender ? `Peak ${Math.round(snapshot.value.lastRender.peak * 100)}%` : '');
const captureSummary = computed(() => {
  if (!snapshot.value) {
    return 'Waiting for synth engine.';
  }
  if (snapshot.value.recordState === 'captured') {
    return `${snapshot.value.recordedDurationSeconds.toFixed(2)} s | Peak ${Math.round(snapshot.value.recordedPeak * 100)}%`;
  }
  if (snapshot.value.recordState === 'recording') {
    return 'Recording live synth output now.';
  }
  return `Capture a live performance, then commit it to Slot ${targetSlotNumber.value}.`;
});
</script>
