<template>
  <label class="sample-creator-control">
    <span class="sample-creator-control__label">{{ definition.label }}</span>
    <input
      class="sample-creator-control__input"
      data-input="sample-creator-param"
      :data-param="paramId"
      type="range"
      :min="definition.min"
      :max="definition.max"
      :step="definition.step"
      :value="value"
    />
    <span class="sample-creator-control__value">{{ displayValue }}</span>
  </label>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { SYNTH_PARAMETERS } from '../../core/synthConfig';
import type { SynthParamId } from '../../core/synthTypes';

const props = defineProps<{
  paramId: SynthParamId;
  value: number;
}>();

const definition = computed(() => SYNTH_PARAMETERS[props.paramId]);
const displayValue = computed(() => definition.value.formatter?.(props.value) ?? props.value.toFixed(2));
</script>
