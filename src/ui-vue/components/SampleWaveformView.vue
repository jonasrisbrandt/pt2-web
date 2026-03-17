<template>
  <svg
    class="sample-chip__wave"
    viewBox="0 0 240 72"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient
        :id="`sample-wave-fill-${sampleIndex}`"
        x1="0%"
        y1="0%"
        x2="100%"
        y2="0%"
      >
        <stop offset="0%" stop-color="rgba(212,255,117,0.03)" />
        <stop offset="55%" stop-color="rgba(120,240,191,0.08)" />
        <stop offset="100%" stop-color="rgba(138,199,255,0.03)" />
      </linearGradient>
      <linearGradient
        :id="`sample-wave-stroke-${sampleIndex}`"
        x1="0%"
        y1="0%"
        x2="100%"
        y2="0%"
      >
        <stop offset="0%" stop-color="rgba(212,255,117,0.34)" />
        <stop offset="55%" stop-color="rgba(239,248,231,0.52)" />
        <stop offset="100%" stop-color="rgba(138,199,255,0.3)" />
      </linearGradient>
    </defs>
    <path
      :d="areaPath"
      :fill="`url(#sample-wave-fill-${sampleIndex})`"
    />
    <polyline
      :points="linePoints"
      fill="none"
      :stroke="`url(#sample-wave-stroke-${sampleIndex})`"
      stroke-width="1.2"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  sampleIndex: number;
  values: ArrayLike<number>;
}>();

const WIDTH = 240;
const HEIGHT = 72;
const CENTER_Y = HEIGHT / 2;

const waveformValues = computed(() => Array.from(props.values));

const linePoints = computed(() => {
  const stepX = waveformValues.value.length > 1 ? WIDTH / (waveformValues.value.length - 1) : WIDTH;
  return waveformValues.value
    .map((value, index) => {
      const x = (index * stepX).toFixed(2);
      const y = (CENTER_Y - ((value / 128) * (HEIGHT * 0.3))).toFixed(2);
      return `${x},${y}`;
    })
    .join(' ');
});

const areaPath = computed(() => {
  const stepX = waveformValues.value.length > 1 ? WIDTH / (waveformValues.value.length - 1) : WIDTH;
  return waveformValues.value
    .map((value, index) => {
      const x = (index * stepX).toFixed(2);
      const y = (CENTER_Y - ((value / 128) * (HEIGHT * 0.3))).toFixed(2);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ') + ` L ${WIDTH} ${CENTER_Y.toFixed(2)} L 0 ${CENTER_Y.toFixed(2)} Z`;
});
</script>
