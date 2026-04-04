<template>
  <label class="sample-creator-render-control">
    <div class="sample-creator-render-control__head">
      <span class="sample-creator-control__label">{{ props.label }}</span>
      <span class="sample-creator-control__value">{{ props.displayValue }}</span>
    </div>
    <div class="sample-creator-render-control__inputs">
      <input
        class="sample-creator-render-control__range"
        :data-input="props.inputKey"
        type="range"
        :min="props.min"
        :max="props.max"
        :step="props.step"
        :value="props.value"
      />
      <input
        class="sample-creator-render-control__number"
        :data-input="props.inputKey"
        type="number"
        :min="props.min"
        :max="props.max"
        :step="props.step"
        :value="props.value"
      />
    </div>
  </label>
</template>

<script setup lang="ts">
const props = defineProps<{
  label: string;
  inputKey: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
}>();

</script>
