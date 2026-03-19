<template>
  <div class="sample-creator-piano-shell">
    <div class="sample-creator-piano-toolbar">
      <span class="metric-label">Range {{ rangeLabel }}</span>
      <div class="sample-creator-piano-toolbar__actions">
        <button
          type="button"
          class="icon-button"
          data-action="sample-creator-piano-range-down"
          :disabled="!canShiftDown"
        >Lower</button>
        <button
          type="button"
          class="icon-button"
          data-action="sample-creator-piano-range-up"
          :disabled="!canShiftUp"
        >Higher</button>
      </div>
    </div>
    <div class="sample-creator-piano-canvas-wrap">
      <canvas
        ref="canvasRef"
        class="sample-creator-piano-canvas"
        data-role="sample-creator-piano-canvas"
        aria-label="Sample Creator piano keyboard"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  createPianoGlowLevels,
  decayPianoGlowLevels,
  drawPianoCanvas,
  triggerPianoGlow,
} from '../../ui/pianoCanvasShared';

const PIANO_HEIGHT = 220;
const FRAME_INTERVAL_MS = 1000 / 60;

const props = defineProps<{
  startAbsolute: number;
  endAbsolute: number;
  rangeLabel: string;
  canShiftDown: boolean;
  canShiftUp: boolean;
  activeNotes: ReadonlySet<number>;
  flashNote: number | null;
  flashToken: number;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);

let pianoGlowLevels = createPianoGlowLevels(1, props.startAbsolute, props.endAbsolute);
let previousActiveNotes = new Set<number>();
let pianoLastFrameAt: number | null = null;
let animationFrame = 0;
let lastPaintAt = 0;

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
};

const redraw = (): void => {
  if (!canvasRef.value) {
    return;
  }

  drawPianoCanvas({
    canvas: canvasRef.value,
    pianoGlowLevels,
    heldNotes: props.activeNotes,
    height: PIANO_HEIGHT,
    startAbsolute: props.startAbsolute,
    endAbsolute: props.endAbsolute,
    drawRoundedRect,
  });
};

const resetGlowLevels = (): void => {
  pianoGlowLevels = createPianoGlowLevels(1, props.startAbsolute, props.endAbsolute);
  previousActiveNotes = new Set(props.activeNotes);
  pianoLastFrameAt = null;
};

const tick = (timestamp: number): void => {
  animationFrame = window.requestAnimationFrame(tick);
  if (timestamp - lastPaintAt < FRAME_INTERVAL_MS) {
    return;
  }

  lastPaintAt = timestamp;
  pianoLastFrameAt = decayPianoGlowLevels(
    pianoGlowLevels,
    pianoLastFrameAt,
    props.startAbsolute,
    props.endAbsolute,
  );
  redraw();
};

watch(
  () => [props.startAbsolute, props.endAbsolute] as const,
  () => {
    resetGlowLevels();
    redraw();
  },
  { immediate: true },
);

watch(
  () => props.activeNotes,
  (activeNotes) => {
    const nextActiveNotes = new Set(activeNotes);
    for (const note of nextActiveNotes) {
      if (!previousActiveNotes.has(note)) {
        triggerPianoGlow(pianoGlowLevels, 0, note, props.startAbsolute, props.endAbsolute);
      }
    }
    previousActiveNotes = nextActiveNotes;
    redraw();
  },
  { immediate: true },
);

watch(
  () => props.flashToken,
  () => {
    if (props.flashNote !== null) {
      triggerPianoGlow(pianoGlowLevels, 0, props.flashNote, props.startAbsolute, props.endAbsolute);
      redraw();
    }
  },
);

onMounted(() => {
  redraw();
  animationFrame = window.requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  if (animationFrame !== 0) {
    window.cancelAnimationFrame(animationFrame);
  }
});
</script>
