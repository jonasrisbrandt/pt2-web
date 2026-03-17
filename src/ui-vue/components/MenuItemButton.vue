<template>
  <button
    type="button"
    :class="['menu-item', { 'is-disabled': disabled }]"
    :data-action="action"
    :disabled="disabled"
  >
    <span>{{ label }}</span>
    <span
      v-if="subtle"
      class="menu-item__meta"
    >{{ subtle }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  action: string;
  label: string;
  disabled?: boolean;
  subtle?: string;
}>();
</script>
