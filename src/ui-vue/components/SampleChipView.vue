<template>
  <button
    :class="['sample-chip', { 'is-selected': sample.index === selectedSample, 'is-empty': sample.length <= 0 }]"
    type="button"
    data-action="select-sample"
    :data-sample="sample.index"
  >
    <SampleWaveformView
      :sample-index="sample.index"
      :values="previewValues"
    />
    <span class="sample-chip__index">{{ sampleNumber }}</span>
    <strong
      v-if="sample.length > 0"
      class="sample-chip__name"
    >{{ label }}</strong>
    <span
      v-else
      class="sample-chip__empty"
      aria-hidden="true"
    >+</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SampleSlot } from '../../core/trackerTypes';
import { getSampleCardLabel } from '../../ui-modern/components/markupRenderer';
import SampleWaveformView from './SampleWaveformView.vue';

const props = defineProps<{
  sample: SampleSlot;
  selectedSample: number;
  previewValues: ArrayLike<number>;
}>();

const sampleNumber = computed(() => String(props.sample.index + 1).padStart(2, '0'));
const label = computed(() => getSampleCardLabel(props.sample));
</script>
