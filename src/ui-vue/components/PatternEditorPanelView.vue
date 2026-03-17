<template>
  <article :class="['panel', 'pattern-panel', 'editor-panel-shell', { 'is-collapsed': collapsed }]">
    <div class="panel-head compact panel-head--section">
      <div class="panel-heading-copy">
        <button
          type="button"
          class="section-heading-button"
          data-action="toggle-section-editor"
          :aria-expanded="collapsed ? 'false' : 'true'"
        >
          <span class="section-heading-button__copy">
            <span class="panel-label">Pattern editor</span>
          </span>
          <span
            class="section-heading-button__icon"
            aria-hidden="true"
            v-html="collapseIconHtml"
          />
        </button>
      </div>
      <div class="panel-head-actions">
        <div class="octave-control">
          <span class="octave-label">Octave</span>
          <button
            type="button"
            :class="['icon-button', 'icon-button--octave', { 'is-active': octaveOneActive }]"
            data-action="octave-set-1"
            :aria-pressed="octaveOneActive ? 'true' : 'false'"
          >1</button>
          <button
            type="button"
            :class="['icon-button', 'icon-button--octave', { 'is-active': octaveTwoActive }]"
            data-action="octave-set-2"
            :aria-pressed="octaveTwoActive ? 'true' : 'false'"
          >2</button>
          <span
            class="sr-only"
            data-role="octave-value"
          >Octave {{ octave }}</span>
        </div>
      </div>
    </div>
    <div class="panel-body">
      <div class="pattern-header">
        <span>Row</span>
        <TrackHeaderView
          v-for="trackHeader in trackHeaders"
          :key="trackHeader.channel"
          v-bind="trackHeader"
        />
      </div>
      <div
        class="pattern-canvas-host"
        data-role="pattern-host"
      />
    </div>
  </article>
</template>

<script setup lang="ts">
import type { PatternPanelRenderOptions } from '../../ui-modern/components/appShellRenderer';
import TrackHeaderView from './TrackHeaderView.vue';

defineProps<PatternPanelRenderOptions>();
</script>
