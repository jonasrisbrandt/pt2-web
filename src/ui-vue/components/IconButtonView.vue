<template>
  <button
    type="button"
    :class="['icon-button', { 'icon-button--small': small, 'is-active': active }]"
    :data-action="action"
    :disabled="disabled"
  >
    <span
      style="display: contents"
      v-html="iconHtml"
    />
    <span class="sr-only">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  action: string;
  iconHtml: string;
  label: string;
  disabled?: boolean;
  small?: boolean;
  active?: boolean;
}>(), {
  disabled: false,
  small: false,
  active: false,
});
</script>
