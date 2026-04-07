<template>
  <button
    type="button"
    :class="['tool-icon-button', { 'is-active': active }]"
    :data-action="action || null"
    :data-role="role || null"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
    @click="handleClick"
  >
    <span v-html="iconHtml" />
    <span
      v-if="valueText"
      class="tool-icon-button__value"
      aria-hidden="true"
    >{{ valueText }}</span>
    <span class="sr-only">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  action?: string;
  iconHtml: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  role?: string;
  valueText?: string;
  onClick?: (() => void) | null;
}>(), {
  active: false,
  disabled: false,
  action: '',
  role: '',
  valueText: '',
  onClick: null,
});

const handleClick = (): void => {
  props.onClick?.();
};
</script>
