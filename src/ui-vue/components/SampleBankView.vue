<template>
  <SampleChipView
    v-for="item in items"
    :key="item.sample.index"
    :sample="item.sample"
    :selected-sample="item.selectedSample"
    :preview-values="item.previewValues"
  />
</template>

<script setup lang="ts">
import type { SampleBankRenderOptions } from '../../ui-modern/components/appShellRenderer';
import SampleChipView from './SampleChipView.vue';

defineProps<SampleBankRenderOptions>();
</script>
