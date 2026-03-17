<template>
  <div class="sample-creator-piano">
    <button
      v-for="key in whiteKeys"
      :key="`white-${key.midiNote}`"
      type="button"
      :class="['sample-creator-piano__key', { 'is-active': key.active }]"
      data-action="sample-creator-piano-note"
      :data-midi="key.midiNote"
    >{{ key.midiNote }}</button>
    <button
      v-for="key in blackKeys"
      :key="`black-${key.midiNote}`"
      type="button"
      :class="['sample-creator-piano__key', 'sample-creator-piano__key--black', key.className, { 'is-active': key.active }]"
      data-action="sample-creator-piano-note"
      :data-midi="key.midiNote"
    >{{ key.midiNote }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  baseMidi: number;
  activeNotes: ReadonlySet<number>;
}>();

const whiteOffsets = [0, 2, 4, 5, 7, 9, 11];
const blackOffsets = [1, 3, -1, 6, 8, 10];

const whiteKeys = computed(() => {
  const keys: Array<{ midiNote: number; active: boolean }> = [];
  for (let octave = 0; octave < 2; octave += 1) {
    for (const offset of whiteOffsets) {
      const midiNote = props.baseMidi + (octave * 12) + offset;
      keys.push({
        midiNote,
        active: props.activeNotes.has(midiNote),
      });
    }
  }
  return keys;
});

const blackKeys = computed(() => {
  const keys: Array<{ midiNote: number; className: string; active: boolean }> = [];
  for (let octave = 0; octave < 2; octave += 1) {
    blackOffsets.forEach((offset, index) => {
      if (offset < 0) {
        return;
      }
      const midiNote = props.baseMidi + (octave * 12) + offset;
      keys.push({
        midiNote,
        className: `sample-creator-piano__key--black-${octave}-${index}`,
        active: props.activeNotes.has(midiNote),
      });
    });
  }
  return keys;
});
</script>
