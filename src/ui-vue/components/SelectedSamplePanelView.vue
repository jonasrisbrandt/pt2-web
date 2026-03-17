<template>
  <section class="sample-detail-panel">
    <div class="sample-detail-head">
      <div>
        <p class="metric-label">Sample {{ sampleNumber }}</p>
        <strong
          class="sample-detail-title panel-title panel-title--editable"
          data-role="selected-sample-title"
        >
          <InlineNameFieldView v-bind="sampleTitle" />
        </strong>
      </div>
      <div class="sample-detail-actions">
        <ToolIconButtonView
          :action="samplePreviewPlaying ? 'sample-preview-stop' : 'sample-preview-play'"
          :icon-html="samplePreviewPlaying ? stopIconHtml : playIconHtml"
          :label="samplePreviewPlaying ? 'Stop preview' : 'Play preview'"
          :active="samplePreviewPlaying"
          :disabled="sample.length <= 0"
          role="sample-preview-toggle"
        />
        <ToolIconButtonView
          action="sample-editor-open"
          :icon-html="editIconHtml"
          label="Open sample editor"
          :disabled="sample.length <= 0"
        />
        <ToolIconButtonView
          v-if="featureFlags.sample_composer"
          action="sample-creator-open"
          :icon-html="createIconHtml"
          label="Open Sample Creator"
        />
        <ToolIconButtonView
          action="sample-load-selected"
          :icon-html="replaceIconHtml"
          :label="sample.length > 0 ? 'Replace sample' : 'Load sample'"
          :disabled="!editable"
        />
      </div>
    </div>
    <div
      class="sample-preview-host"
      data-role="sample-preview-host"
    />
    <p
      class="hint"
      data-role="selected-sample-hint"
    >{{ sampleHint }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { featureFlags } from '../../config/featureFlags';
import { formatSampleLength } from '../../ui/formatters';
import type { SelectedSamplePanelRenderOptions } from '../../ui-modern/components/markupRenderer';
import InlineNameFieldView from './InlineNameFieldView.vue';
import ToolIconButtonView from './ToolIconButtonView.vue';

const props = defineProps<SelectedSamplePanelRenderOptions>();

const sampleNumber = computed(() => String(props.sample.index + 1).padStart(2, '0'));
const sampleHint = computed(() => formatSampleLength(props.sample));
</script>
