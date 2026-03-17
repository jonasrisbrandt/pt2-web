<template>
  <span :class="['track-label', `track-label--${channel + 1}`, { 'is-muted': muted }]">
    <button
      type="button"
      :class="['track-mute-button', { 'is-muted': muted }]"
      :data-role="`track-mute-${channel}`"
      data-action="toggle-track-mute"
      :data-channel="channel"
      :aria-pressed="muted ? 'true' : 'false'"
      :aria-label="`${muted ? 'Unmute' : 'Mute'} track ${channel + 1}`"
    >
      <span
        style="display: contents"
        v-html="muteIconHtml"
      />
    </button>
    <span>Track {{ channel + 1 }}</span>
  </span>
</template>

<script setup lang="ts">
import type { TrackHeaderRenderOptions } from '../../ui-modern/components/appShellRenderer';

defineProps<TrackHeaderRenderOptions>();
</script>
