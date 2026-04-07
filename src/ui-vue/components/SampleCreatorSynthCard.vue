<template>
  <section class="sample-creator-card">
    <div class="sample-creator-card__head">
      <p class="metric-label">Synth</p>
      <span class="hint">{{ model.midiInputLabel }}</span>
    </div>
    <div class="sample-creator-segmented">
      <button
        type="button"
        :class="['icon-button', { 'is-active': model.selectedSynth === 'core-sub' }]"
        @click="emit('select-synth', 'core-sub')"
      >CoreSub</button>
      <button
        type="button"
        :class="['icon-button', { 'is-active': model.selectedSynth === 'acid303' }]"
        @click="emit('select-synth', 'acid303')"
      >Acid303</button>
    </div>
    <label class="sample-creator-select-wrap">
      <span class="metric-label">Preset</span>
      <select
        class="sample-creator-select"
        :value="model.selectedPresetId"
        @change="handlePresetChange"
      >
        <option
          v-for="option in model.presetOptions"
          :key="String(option.value)"
          :value="option.value"
        >{{ option.label }}</option>
      </select>
    </label>
  </section>
</template>

<script setup lang="ts">
import type { SynthId } from '../../core/synthTypes';
import type { SampleCreatorSynthViewModel } from '../../ui-modern/components/appShellRenderer';

defineProps<{
  model: SampleCreatorSynthViewModel;
}>();

const emit = defineEmits<{
  'select-synth': [synth: SynthId];
  'select-preset': [presetId: string];
}>();

const handlePresetChange = (event: Event): void => {
  const target = event.target as HTMLSelectElement | null;
  if (!target) {
    return;
  }

  emit('select-preset', target.value);
};
</script>
