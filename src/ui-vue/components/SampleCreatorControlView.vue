<template>
  <label class="sample-creator-control">
    <span class="sample-creator-control__label">{{ definition.label }}</span>
    <input
      class="sample-creator-control__input"
      type="range"
      :min="definition.min"
      :max="definition.max"
      :step="definition.step"
      :value="value"
      @input="handleInput"
    />
    <span class="sample-creator-control__value">{{ displayValue }}</span>
  </label>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getParameterDefinitionForSynth } from '../../core/synthConfig';
import type { SynthId, SynthParamId } from '../../core/synthTypes';

const props = defineProps<{
  synthId: SynthId;
  paramId: SynthParamId;
  value: number;
}>();

const emit = defineEmits<{
  change: [paramId: SynthParamId, value: number];
}>();

const definition = computed(() => getParameterDefinitionForSynth(props.synthId, props.paramId));
const displayValue = computed(() => definition.value.formatter?.(props.value) ?? props.value.toFixed(2));

const handleInput = (event: Event): void => {
  const target = event.target as HTMLInputElement | null;
  if (!target) {
    return;
  }

  emit('change', props.paramId, Number(target.value));
};
</script>
