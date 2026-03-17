<template>
  <div
    v-if="!polylinePoints"
    class="sample-creator-waveform sample-creator-waveform--empty"
  >No recorded capture yet.</div>
  <div
    v-else
    class="sample-creator-waveform"
  >
    <svg
      viewBox="0 0 100 50"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline :points="polylinePoints" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  waveform: Int8Array | null;
}>();

const polylinePoints = computed(() => {
  const waveform = props.waveform;
  if (!waveform || waveform.length === 0) {
    return '';
  }

  return Array.from(waveform, (value, index) => {
    const x = waveform.length <= 1 ? 0 : (index / (waveform.length - 1)) * 100;
    const normalized = (value ?? 0) / 127;
    const y = 50 - (normalized * 42);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
});
</script>
