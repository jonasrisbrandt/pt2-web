<template>
  <section
    v-if="snapshot"
    class="sample-creator-workspace"
  >
    <div class="sample-creator-head">
      <div>
        <p class="panel-label">Sample Creator</p>
        <h2 class="panel-title">{{ title }}</h2>
        <p class="hint">{{ description }}</p>
      </div>
      <div class="sample-creator-head__actions">
        <button
          type="button"
          class="toolbar-button"
          @click="onClose"
        >Back to tracker</button>
      </div>
    </div>

    <div class="sample-creator-meta">
      <SampleCreatorTargetCard
        :model="target"
        @slot-change="onTargetSlotChange"
        @bake-rate-change="onBakeRateChange"
      />
      <SampleCreatorSynthCard
        :model="synth"
        @select-synth="onSynthSelect"
        @select-preset="onPresetSelect"
      />
    </div>

    <div class="sample-creator-grid sample-creator-grid--primary">
      <SampleCreatorBakeCard
        :model="bake"
        @preview="onBakePreview"
        @toggle-learn="onBakeLearnToggle"
        @bake="onBakeCommit"
        @control-change="onBakeControlChange"
        @normalize-change="onBakeNormalizeChange"
        @fade-change="onBakeFadeOutChange"
      />
      <SampleCreatorCaptureCard
        :model="capture"
        @toggle-capture="onCaptureToggle"
        @play="onCapturePlay"
        @commit="onCaptureCommit"
        @discard="onCaptureDiscard"
      />
    </div>

    <div class="sample-creator-piano-card sample-creator-card">
      <div class="sample-creator-card__head">
        <p class="metric-label">Keyboard and piano</p>
        <span class="hint">Keyboard octave {{ piano.keyboardOctave }} | Visible range {{ piano.rangeLabel }}</span>
      </div>
      <SampleCreatorPianoView
        :start-absolute="piano.startAbsolute"
        :end-absolute="piano.endAbsolute"
        :range-label="piano.rangeLabel"
        :can-shift-down="piano.canShiftDown"
        :can-shift-up="piano.canShiftUp"
        :active-notes="piano.activeNotes"
        :flash-note="piano.flashNote"
        :flash-token="piano.flashToken"
        @shift-range="onPianoRangeShift"
        @note-down="onPianoNoteDown"
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
        v-for="section in parameterSections"
        :key="section.id"
        class="sample-creator-card"
      >
        <div class="sample-creator-card__head">
          <p class="metric-label">{{ section.label }}</p>
        </div>
        <div class="sample-creator-control-grid">
          <SampleCreatorControlView
            v-for="control in section.controls"
            :key="control.paramId"
            :synth-id="control.synthId"
            :param-id="control.paramId"
            :value="control.value"
            @change="onSynthParamChange"
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
import type { SampleCreatorRenderOptions } from '../../ui-modern/components/appShellRenderer';
import SampleCreatorBakeCard from './SampleCreatorBakeCard.vue';
import SampleCreatorCaptureCard from './SampleCreatorCaptureCard.vue';
import SampleCreatorControlView from './SampleCreatorControlView.vue';
import SampleCreatorPianoView from './SampleCreatorPianoView.vue';
import SampleCreatorSynthCard from './SampleCreatorSynthCard.vue';
import SampleCreatorTargetCard from './SampleCreatorTargetCard.vue';
import SampleCreatorTelemetryPanel from './SampleCreatorTelemetryPanel.vue';

defineProps<SampleCreatorRenderOptions>();
</script>
