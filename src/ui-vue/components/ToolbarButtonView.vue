<template>
  <button
    type="button"
    :class="['toolbar-button', { 'is-active': active }]"
    :data-action="action"
  >
    <span
      style="display: contents"
      v-html="iconHtml"
    />
    <span>{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  action: string;
  iconHtml: string;
  label: string;
  active: boolean;
}>();
</script>
