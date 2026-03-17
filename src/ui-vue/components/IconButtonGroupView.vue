<template>
  <IconButtonView
    v-for="button in buttons"
    :key="button.action"
    :action="button.action"
    :icon-html="button.iconHtml"
    :label="button.label"
    :disabled="button.disabled ?? false"
    :small="button.small ?? false"
    :active="button.active ?? false"
  />
</template>

<script setup lang="ts">
import type { IconButtonRenderOptions } from '../../ui-modern/components/appShellRenderer';
import IconButtonView from './IconButtonView.vue';

defineProps<{
  buttons: IconButtonRenderOptions[];
}>();
</script>
