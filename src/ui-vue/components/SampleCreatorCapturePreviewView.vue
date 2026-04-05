<template>
  <div class="sample-creator-capture-preview">
    <div class="sample-creator-capture-preview__host">
      <canvas ref="canvas" class="sample-creator-capture-preview__canvas" />
    </div>
    <div class="sample-editor-scrollbar-wrap">
      <input
        class="sample-editor-scrollbar"
        type="range"
        min="0"
        :max="scrollMax"
        step="1"
        :value="viewStart"
        :disabled="!props.sample || scrollMax <= 0"
        @input="handleScrollInput"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { RenderedSample } from '../../core/synthTypes';
import { clamp } from '../../ui/appShared';
import { drawStandaloneSampleEditor, type SampleEditorView } from '../../ui-modern/components/sampleWaveformRenderer';
import { drawRoundedRectPath } from '../../visualization-engine/canvasUtils';

const CAPTURE_PREVIEW_HEIGHT = 220;
const MAX_VISIBLE_SAMPLES = 16384;

const props = defineProps<{
  sample: RenderedSample | null;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const viewStart = ref(0);
const renderRevision = ref(0);
let resizeObserver: ResizeObserver | null = null;

const viewLength = computed(() => {
  if (!props.sample) {
    return 0;
  }

  return Math.min(props.sample.data.length, MAX_VISIBLE_SAMPLES);
});

const scrollMax = computed(() => {
  if (!props.sample) {
    return 0;
  }

  return Math.max(0, props.sample.data.length - viewLength.value);
});

const currentView = computed<SampleEditorView>(() => ({
  start: clamp(viewStart.value, 0, scrollMax.value),
  length: Math.max(0, viewLength.value),
  end: clamp(viewStart.value + viewLength.value, 0, props.sample?.data.length ?? 0),
}));

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  drawRoundedRectPath(ctx, x, y, width, height, radius);
};

const redraw = (): void => {
  if (!canvas.value) {
    return;
  }

  drawStandaloneSampleEditor({
    canvas: canvas.value,
    data: props.sample?.data ?? new Int8Array(0),
    height: CAPTURE_PREVIEW_HEIGHT,
    view: currentView.value,
    revision: renderRevision.value,
    loopStart: props.sample?.loopStart ?? 0,
    loopLength: props.sample?.loopLength ?? 2,
    emptyMessage: 'No recorded capture yet.',
    drawRoundedRect,
  });
};

const handleScrollInput = (event: Event): void => {
  const target = event.target as HTMLInputElement | null;
  if (!target) {
    return;
  }

  viewStart.value = clamp(Number(target.value), 0, scrollMax.value);
};

watch(() => props.sample, () => {
  renderRevision.value += 1;
  viewStart.value = 0;
  redraw();
}, { deep: false });

watch(currentView, () => {
  redraw();
});

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && canvas.value?.parentElement) {
    resizeObserver = new ResizeObserver(() => {
      redraw();
    });
    resizeObserver.observe(canvas.value.parentElement);
  }
  redraw();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>
