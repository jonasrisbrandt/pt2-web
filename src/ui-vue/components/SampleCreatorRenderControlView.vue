<template>
  <label class="sample-creator-render-control">
    <div class="sample-creator-render-control__head">
      <span class="sample-creator-control__label">{{ props.label }}</span>
      <input
        v-if="editing"
        ref="inlineInput"
        class="sample-creator-render-control__number tool-popover__inline-input"
        type="number"
        :min="props.min"
        :max="props.max"
        :step="props.step"
        :value="draftValue"
        @input="handleInlineInput"
        @blur="commitEditing"
        @keydown.enter="commitEditing"
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
      type="range"
      :min="props.min"
      :max="props.max"
      :step="props.step"
      :value="props.modelValue"
      @input="handleSliderInput"
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
  modelValue: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  helperText?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number];
}>();

const editing = ref(false);
const inlineInput = ref<HTMLInputElement | null>(null);
const draftValue = ref(String(props.modelValue));

const startEditing = (): void => {
  draftValue.value = String(props.modelValue);
  editing.value = true;
};

const commitEditing = (): void => {
  const numeric = Number(draftValue.value);
  if (!Number.isNaN(numeric)) {
    emit('update:modelValue', numeric);
  }
  editing.value = false;
};

const cancelEditing = (): void => {
  draftValue.value = String(props.modelValue);
  editing.value = false;
};

const handleInlineInput = (event: Event): void => {
  const target = event.target as HTMLInputElement | null;
  if (!target) {
    return;
  }

  draftValue.value = target.value;
  const numeric = Number(target.value);
  if (!Number.isNaN(numeric)) {
    emit('update:modelValue', numeric);
  }
};

const handleSliderInput = (event: Event): void => {
  const target = event.target as HTMLInputElement | null;
  if (!target) {
    return;
  }

  const numeric = Number(target.value);
  if (Number.isNaN(numeric)) {
    return;
  }

  draftValue.value = target.value;
  emit('update:modelValue', numeric);
};

watch(() => props.modelValue, (value) => {
  draftValue.value = String(value);
});

watch(editing, async (value) => {
  if (!value) {
    return;
  }

  await nextTick();
  inlineInput.value?.focus();
  inlineInput.value?.select();
});
</script>
