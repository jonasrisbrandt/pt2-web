<template>
  <TrackHeaderView
    v-for="trackHeader in trackHeaders"
    :key="trackHeader.channel"
    v-bind="trackHeader"
  />
</template>

<script setup lang="ts">
import type { TrackHeaderRenderOptions } from '../../ui-modern/components/appShellRenderer';
import TrackHeaderView from './TrackHeaderView.vue';

defineProps<{
  trackHeaders: TrackHeaderRenderOptions[];
}>();
</script>
