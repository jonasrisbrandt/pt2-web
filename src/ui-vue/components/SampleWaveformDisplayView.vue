<template>
  <div class="sample-waveform-display">
    <div class="sample-waveform-display__host">
      <canvas
        ref="canvas"
        class="sample-waveform-display__canvas"
        @wheel.prevent="handleCanvasWheel"
      />
    </div>
    <div class="sample-editor-scrollbar-wrap">
      <input
        ref="scrollbar"
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

const DISPLAY_HEIGHT = 220;

const props = defineProps<{
  sample: RenderedSample | null;
  emptyMessage?: string;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
const scrollbar = ref<HTMLInputElement | null>(null);
const viewStart = ref(0);
const viewLength = ref(0);
const renderRevision = ref(0);
let resizeObserver: ResizeObserver | null = null;

const scrollMax = computed(() => {
  if (!props.sample) {
    return 0;
  }

  return Math.max(0, props.sample.data.length - Math.max(1, viewLength.value));
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

const updateScrollbarThumbWidth = (): void => {
  if (!scrollbar.value || !props.sample) {
    return;
  }

  const trackWidth = scrollbar.value.clientWidth || scrollbar.value.getBoundingClientRect().width;
  if (trackWidth <= 0) {
    return;
  }

  const ratio = props.sample.data.length <= 0 ? 1 : clamp(viewLength.value / props.sample.data.length, 0, 1);
  const thumbWidth = Math.max(24, Math.round(trackWidth * ratio));
  scrollbar.value.style.setProperty('--sample-editor-thumb-width', `${Math.min(trackWidth, thumbWidth)}px`);
};

const resetView = (): void => {
  viewStart.value = 0;
  viewLength.value = props.sample?.data.length ?? 0;
};

const setView = (nextStart: number, nextLength: number): void => {
  if (!props.sample) {
    viewStart.value = 0;
    viewLength.value = 0;
    return;
  }

  const sampleLength = props.sample.data.length;
  const clampedLength = clamp(Math.round(nextLength), Math.min(64, sampleLength), Math.max(64, sampleLength));
  const maxStart = Math.max(0, sampleLength - clampedLength);
  viewLength.value = clampedLength;
  viewStart.value = clamp(Math.round(nextStart), 0, maxStart);
};

const zoomAround = (anchorOffset: number, zoomIn: boolean): void => {
  if (!props.sample || props.sample.data.length <= 0) {
    return;
  }

  const currentLength = Math.max(64, viewLength.value || props.sample.data.length);
  const nextLength = zoomIn
    ? Math.max(64, Math.round(currentLength * 0.5))
    : Math.min(props.sample.data.length, Math.round(currentLength * 2));
  const normalizedAnchor = currentLength <= 0 ? 0.5 : (anchorOffset - viewStart.value) / currentLength;
  const nextStart = anchorOffset - (nextLength * normalizedAnchor);
  setView(nextStart, nextLength);
};

const redraw = (): void => {
  if (!canvas.value) {
    return;
  }

  drawStandaloneSampleEditor({
    canvas: canvas.value,
    data: props.sample?.data ?? new Int8Array(0),
    height: DISPLAY_HEIGHT,
    view: currentView.value,
    revision: renderRevision.value,
    loopStart: props.sample?.loopStart ?? 0,
    loopLength: props.sample?.loopLength ?? 2,
    emptyMessage: props.emptyMessage ?? 'No sample data available.',
    drawRoundedRect,
  });
  updateScrollbarThumbWidth();
};

const handleScrollInput = (event: Event): void => {
  const target = event.target as HTMLInputElement | null;
  if (!target) {
    return;
  }

  viewStart.value = clamp(Number(target.value), 0, scrollMax.value);
};

const handleCanvasWheel = (event: WheelEvent): void => {
  if (!props.sample || !canvas.value || props.sample.data.length <= 0) {
    return;
  }

  const rect = canvas.value.getBoundingClientRect();
  const localX = clamp(event.clientX - rect.left, 0, rect.width);
  const ratio = rect.width <= 0 ? 0.5 : localX / rect.width;
  const anchor = currentView.value.start + (currentView.value.length * ratio);
  zoomAround(anchor, event.deltaY < 0);
};

watch(() => props.sample, () => {
  renderRevision.value += 1;
  resetView();
  redraw();
}, { deep: false });

watch(currentView, () => {
  redraw();
});

onMounted(() => {
  resetView();
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
