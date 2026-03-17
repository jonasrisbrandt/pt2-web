<template>
  <article :class="['panel', 'sample-editor-panel', 'editor-panel-shell', { 'is-collapsed': collapsed }]">
    <div class="panel-head compact panel-head--section sample-editor-head">
      <div class="panel-heading-copy">
        <button
          type="button"
          class="section-heading-button"
          data-action="toggle-section-editor"
          :aria-expanded="collapsed ? 'false' : 'true'"
        >
          <span class="section-heading-button__copy">
            <span class="panel-label">Sample editor</span>
          </span>
          <span
            class="section-heading-button__icon"
            aria-hidden="true"
            v-html="collapseIconHtml"
          />
        </button>
        <h2
          class="panel-title panel-title--editable panel-title--section-detail"
          v-html="`Sample ${sampleNumber} ${selectedSampleTitleHtml}`"
        />
      </div>
      <div class="panel-head-actions">
        <div class="sample-editor-toolbar">
          <ToolIconButtonView
            :action="samplePreviewPlaying ? 'sample-editor-stop' : 'sample-editor-preview'"
            :icon-html="samplePreviewPlaying ? stopIconHtml : playIconHtml"
            :label="samplePreviewPlaying ? 'Stop preview' : 'Play preview'"
            :active="samplePreviewPlaying"
            :disabled="sample.length <= 0"
            role="sample-editor-preview-toggle"
          />
          <ToolIconButtonView
            action="sample-editor-toggle-loop"
            :icon-html="loopIconHtml"
            :label="loopEnabled ? 'Disable loop' : 'Enable loop'"
            :active="loopEnabled"
            :disabled="!editable || sample.length <= 1"
          />
          <span
            class="toolbar-divider"
            aria-hidden="true"
          />
          <div class="tool-popover-anchor">
            <ToolIconButtonView
              action="sample-editor-open-volume"
              :icon-html="volumeIconHtml"
              :label="`Volume ${sample.volume}`"
              :active="volumePopoverOpen"
              :disabled="!editable || sample.length <= 0"
              :value-text="String(sample.volume)"
            />
            <div :class="['tool-popover', { 'is-open': volumePopoverOpen }]" data-role="sample-editor-volume-popover">
              <div class="tool-popover__head">
                <span class="tool-popover__label">Volume</span>
                <input
                  v-if="volumeEditOpen"
                  class="tool-popover__inline-input"
                  data-inline-sample-number="volume"
                  type="number"
                  min="0"
                  max="64"
                  step="1"
                  :value="volumeEditValue"
                  :disabled="!editable"
                />
                <button
                  v-else
                  type="button"
                  class="tool-popover__value-button"
                  data-popover-value-edit="volume"
                  data-role="sample-editor-volume-display"
                >{{ sample.volume }}</button>
              </div>
              <input
                class="tool-popover__slider"
                data-input="sample-volume"
                type="range"
                min="0"
                max="64"
                step="1"
                :value="sample.volume"
                :disabled="!editable"
              />
            </div>
          </div>
          <div class="tool-popover-anchor">
            <ToolIconButtonView
              action="sample-editor-open-finetune"
              :icon-html="fineTuneIconHtml"
              :label="`Fine tune ${fineTuneValue}`"
              :active="fineTunePopoverOpen"
              :disabled="!editable || sample.length <= 0"
              :value-text="fineTuneValue"
            />
            <div :class="['tool-popover', { 'is-open': fineTunePopoverOpen }]" data-role="sample-editor-finetune-popover">
              <div class="tool-popover__head">
                <span class="tool-popover__label">Fine tune</span>
                <input
                  v-if="fineTuneEditOpen"
                  class="tool-popover__inline-input"
                  data-inline-sample-number="fineTune"
                  type="number"
                  min="-8"
                  max="7"
                  step="1"
                  :value="fineTuneEditValue"
                  :disabled="!editable"
                />
                <button
                  v-else
                  type="button"
                  class="tool-popover__value-button"
                  data-popover-value-edit="fineTune"
                  data-role="sample-editor-finetune-display"
                >{{ fineTuneValue }}</button>
              </div>
              <input
                class="tool-popover__slider"
                data-input="sample-finetune"
                type="range"
                min="-8"
                max="7"
                step="1"
                :value="sample.fineTune"
                :disabled="!editable"
              />
            </div>
          </div>
          <span
            class="toolbar-divider"
            aria-hidden="true"
          />
          <ToolIconButtonView
            action="sample-editor-show-selection"
            :icon-html="showSelectionIconHtml"
            label="Show selection"
            :disabled="!hasSelection"
          />
          <ToolIconButtonView
            action="sample-editor-show-all"
            :icon-html="showAllIconHtml"
            label="Show all"
            :disabled="sample.length <= 0"
          />
          <ToolIconButtonView
            action="sample-editor-crop"
            :icon-html="cropIconHtml"
            label="Crop selection"
            :disabled="!(editable && hasSelection)"
          />
          <ToolIconButtonView
            action="sample-editor-cut"
            :icon-html="cutIconHtml"
            label="Cut selection"
            :disabled="!(editable && hasSelection)"
          />
          <span
            class="toolbar-divider"
            aria-hidden="true"
          />
          <ToolIconButtonView
            action="sample-editor-close"
            :icon-html="backIconHtml"
            label="Back to pattern"
          />
        </div>
      </div>
    </div>
    <div class="panel-body">
      <div
        class="sample-editor-host"
        data-role="sample-editor-host"
      />
      <div class="sample-editor-scrollbar-wrap">
        <input
          class="sample-editor-scrollbar"
          data-input="sample-editor-scroll"
          type="range"
          min="0"
          :max="scrollMax"
          step="1"
          :value="scrollValue"
          :disabled="sample.length <= 0"
        />
      </div>
      <div class="sample-editor-meta">
        <div class="module-card module-card--readout">
          <span class="metric-label">Length</span>
          <div class="module-readout">
            <strong class="module-readout__value" data-role="sample-editor-length">{{ sample.length }}</strong>
          </div>
        </div>
        <div class="module-card module-card--readout">
          <span class="metric-label">Visible</span>
          <div class="module-readout">
            <strong class="module-readout__value" data-role="sample-editor-visible">{{ view.start }} - {{ view.end }}</strong>
          </div>
        </div>
        <div class="module-card module-card--readout">
          <span class="metric-label">Loop</span>
          <div class="module-readout">
            <strong class="module-readout__value" data-role="sample-editor-loop">{{ snapshot.sampleEditor.loopStart }} - {{ snapshot.sampleEditor.loopEnd }}</strong>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { clamp } from '../../ui/appShared';
import type { SampleEditorPanelRenderOptions } from '../../ui-modern/components/markupRenderer';
import ToolIconButtonView from './ToolIconButtonView.vue';

const props = defineProps<SampleEditorPanelRenderOptions>();

const sample = computed(() => props.snapshot.samples[props.snapshot.selectedSample]);
const sampleNumber = computed(() => String(sample.value.index + 1).padStart(2, '0'));
const loopEnabled = computed(() => sample.value.loopLength > 2 && sample.value.length > 2);
const hasSelection = computed(() =>
  props.snapshot.sampleEditor.selectionStart !== null
  && props.snapshot.sampleEditor.selectionEnd !== null
  && props.snapshot.sampleEditor.selectionEnd - props.snapshot.sampleEditor.selectionStart >= 2,
);
const scrollMax = computed(() => Math.max(0, sample.value.length - props.view.length));
const scrollValue = computed(() => clamp(props.view.start, 0, scrollMax.value));
const fineTuneValue = computed(() => (sample.value.fineTune > 0 ? `+${sample.value.fineTune}` : String(sample.value.fineTune)));
</script>
