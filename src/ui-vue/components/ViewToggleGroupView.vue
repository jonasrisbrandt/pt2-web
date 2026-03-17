<template>
  <ToolbarButtonView
    v-for="button in buttons"
    :key="button.action"
    :action="button.action"
    :icon-html="button.iconHtml"
    :label="button.label"
    :active="button.active"
  />
</template>

<script setup lang="ts">
import type { ToolbarButtonRenderOptions } from '../../ui-modern/components/appShellRenderer';
import ToolbarButtonView from './ToolbarButtonView.vue';

defineProps<{
  buttons: ToolbarButtonRenderOptions[];
}>();
</script>
