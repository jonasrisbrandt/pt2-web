<template>
  <section class="sample-creator-card">
    <div class="sample-creator-card__head">
      <p class="metric-label">Target</p>
      <strong class="sample-creator-target">Slot {{ model.slotNumber }}</strong>
    </div>
    <strong class="sample-creator-target">{{ model.sampleLabel }}</strong>
    <div class="sample-creator-render-grid sample-creator-render-grid--meta">
      <label class="sample-creator-select-wrap sample-creator-inline-field sample-creator-inline-field--wide">
        <span class="metric-label">Slot</span>
        <select
          class="sample-creator-select"
          :value="model.selectedSlot"
          @change="handleSlotChange"
        >
          <option
            v-for="option in model.slotOptions"
            :key="String(option.value)"
            :value="option.value"
          >{{ option.label }}</option>
        </select>
      </label>
      <label class="sample-creator-select-wrap sample-creator-inline-field">
        <span class="metric-label">Bake rate</span>
        <select
          class="sample-creator-select"
          :value="model.selectedBakeRate"
          @change="handleBakeRateChange"
        >
          <option
            v-for="option in model.bakeRateOptions"
            :key="String(option.value)"
            :value="option.value"
          >{{ option.label }}</option>
        </select>
      </label>
    </div>
    <p class="hint">{{ model.hint }}</p>
  </section>
</template>

<script setup lang="ts">
import type { SampleCreatorTargetViewModel } from '../../ui-modern/components/appShellRenderer';

const props = defineProps<{
  model: SampleCreatorTargetViewModel;
}>();

const emit = defineEmits<{
  'slot-change': [slot: number];
  'bake-rate-change': [sampleRate: number];
}>();

const handleSlotChange = (event: Event): void => {
  const target = event.target as HTMLSelectElement | null;
  if (!target) {
    return;
  }

  emit('slot-change', Number(target.value));
};

const handleBakeRateChange = (event: Event): void => {
  const target = event.target as HTMLSelectElement | null;
  if (!target) {
    return;
  }

  emit('bake-rate-change', Number(target.value));
};
</script>
