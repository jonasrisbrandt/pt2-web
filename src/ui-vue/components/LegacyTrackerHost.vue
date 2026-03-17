<template>
  <FatalScreen
    v-if="startupError"
    :message="startupError"
  />
  <div
    v-else
    ref="host"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useTrackerApplicationHost } from '../composables/useTrackerApplicationHost';
import FatalScreen from './FatalScreen.vue';

const host = ref<HTMLElement | null>(null);
const { startupError } = useTrackerApplicationHost(host);
</script>
