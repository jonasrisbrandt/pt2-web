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
import { useLegacyTrackerApplication } from '../composables/useLegacyTrackerApplication';
import FatalScreen from './FatalScreen.vue';

const host = ref<HTMLElement | null>(null);
const { startupError } = useLegacyTrackerApplication(host);
</script>
