<template>
  <ToolIconButtonView
    v-for="button in buttons"
    :key="button.action"
    :action="button.action"
    :icon-html="button.iconHtml"
    :label="button.label"
    :active="button.active"
    :disabled="button.disabled"
    :role="button.role ?? ''"
    :value-text="button.valueText ?? ''"
  />
</template>

<script setup lang="ts">
import type { ToolIconButtonRenderOptions } from '../../ui-modern/components/appShellRenderer';
import ToolIconButtonView from './ToolIconButtonView.vue';

defineProps<{
  buttons: ToolIconButtonRenderOptions[];
}>();
</script>
