<template>
  <label class="sample-creator-render-control">
    <div class="sample-creator-render-control__head">
      <span class="sample-creator-control__label">{{ props.label }}</span>
      <input
        v-if="editing"
        ref="inlineInput"
        class="sample-creator-render-control__number tool-popover__inline-input"
        :data-input="props.inputKey"
        type="number"
        :min="props.min"
        :max="props.max"
        :step="props.step"
        :value="props.value"
        @blur="stopEditing"
        @keydown.enter="stopEditing"
        @keydown.escape.prevent="cancelEditing"
      />
      <button
        v-else
        type="button"
        class="tool-popover__value-button sample-creator-render-control__value-button"
        @click.prevent="startEditing"
      >{{ props.displayValue }}</button>
    </div>
    <input
      class="sample-creator-render-control__range tool-popover__slider"
      :data-input="props.inputKey"
      type="range"
      :min="props.min"
      :max="props.max"
      :step="props.step"
      :value="props.value"
    />
    <span
      v-if="props.helperText"
      class="sample-creator-render-control__hint"
    >{{ props.helperText }}</span>
  </label>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  label: string;
  inputKey: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  helperText?: string;
}>();

const editing = ref(false);
const inlineInput = ref<HTMLInputElement | null>(null);

const startEditing = (): void => {
  editing.value = true;
};

const stopEditing = (): void => {
  editing.value = false;
};

const cancelEditing = (): void => {
  editing.value = false;
};

watch(editing, async (value) => {
  if (!value) {
    return;
  }

  await nextTick();
  inlineInput.value?.focus();
  inlineInput.value?.select();
});
</script>
