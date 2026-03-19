<template>
  <div class="sample-creator-signal-display">
    <div class="sample-creator-signal-display__head">
      <p class="metric-label">{{ title }}</p>
      <span class="hint">{{ detail }}</span>
    </div>
    <div class="sample-creator-signal-plot">
      <svg
        viewBox="0 0 100 48"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line
          v-if="mode === 'waveform'"
          x1="0"
          y1="24"
          x2="100"
          y2="24"
          class="sample-creator-signal-plot__baseline"
        />
        <polyline
          :points="points"
          :class="['sample-creator-signal-plot__line', `is-${tone}`]"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  title: string;
  detail?: string;
  values: Float32Array;
  mode?: 'waveform' | 'curve';
  tone?: 'lime' | 'cyan' | 'amber' | 'rose';
}>(), {
  detail: '',
  mode: 'waveform',
  tone: 'lime',
});

const points = computed(() => {
  const values = props.values;
  if (!values || values.length === 0) {
    return '';
  }

  return Array.from(values, (value, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
    const safeValue = Number.isFinite(value) ? value : 0;
    const normalized = props.mode === 'curve'
      ? Math.min(1, Math.max(0, safeValue))
      : ((Math.min(1, Math.max(-1, safeValue)) * 0.5) + 0.5);
    const y = 44 - (normalized * 40);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
});
</script>
