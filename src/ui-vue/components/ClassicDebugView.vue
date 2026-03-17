<template>
  <div
    v-if="enabled"
    class="classic-debug"
  >
    <div><span>DOM mouse</span><strong data-debug-field="dom-mouse">n/a</strong></div>
    <div><span>DOM state</span><strong data-debug-field="dom-state">n/a</strong></div>
    <div><span>Mouse abs</span><strong data-debug-field="mouse-abs">n/a</strong></div>
    <div><span>Mouse raw</span><strong data-debug-field="mouse-raw">n/a</strong></div>
    <div><span>Mouse pt2</span><strong data-debug-field="mouse-pt2">n/a</strong></div>
    <div><span>Buttons</span><strong data-debug-field="mouse-buttons">n/a</strong></div>
    <div><span>Canvas CSS</span><strong data-debug-field="canvas-css">n/a</strong></div>
    <div><span>Render</span><strong data-debug-field="video-render">n/a</strong></div>
    <div><span>Scale</span><strong data-debug-field="video-scale">n/a</strong></div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  enabled: boolean;
}>();
</script>
