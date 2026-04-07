<template>
  <section class="sample-creator-card sample-creator-card--capture">
    <div class="sample-creator-card__head">
      <div>
        <p class="metric-label">Capture Performance</p>
        <p class="hint">Record a live performance from MIDI or the on-screen keyboard, then commit it to the target slot.</p>
      </div>
      <span class="hint">{{ model.stateLabel }}</span>
    </div>

    <div class="sample-creator-capture-summary">
      <strong>{{ model.inputLabel }}</strong>
      <span>{{ model.summary }}</span>
    </div>

    <div class="sample-creator-action-toolbar">
      <ToolIconButtonView
        action=""
        :icon-html="model.recording ? model.stopIconHtml : model.recordIconHtml"
        :label="model.recording ? 'Stop capture' : 'Start capture'"
        :active="model.recording"
        :on-click="() => emit('toggle-capture')"
      />
      <ToolIconButtonView
        action=""
        :icon-html="model.playIconHtml"
        label="Play captured sample"
        :disabled="!model.capturedSample"
        :on-click="() => emit('play')"
      />
      <ToolIconButtonView
        action=""
        :icon-html="model.bakeIconHtml"
        label="Commit capture to target slot"
        :disabled="!model.capturedSample"
        :on-click="() => emit('commit')"
      />
      <ToolIconButtonView
        action=""
        :icon-html="model.deleteIconHtml"
        label="Discard capture"
        :disabled="!model.recording && !model.capturedSample"
        :on-click="() => emit('discard')"
      />
    </div>

    <SampleWaveformDisplayView
      :sample="model.capturedSample"
      empty-message="No recorded capture yet."
    />
    <p class="hint">{{ model.status }}</p>
  </section>
</template>

<script setup lang="ts">
import type { SampleCreatorCaptureViewModel } from '../../ui-modern/components/appShellRenderer';
import SampleWaveformDisplayView from './SampleWaveformDisplayView.vue';
import ToolIconButtonView from './ToolIconButtonView.vue';

defineProps<{
  model: SampleCreatorCaptureViewModel;
}>();

const emit = defineEmits<{
  'toggle-capture': [];
  play: [];
  commit: [];
  discard: [];
}>();
</script>
