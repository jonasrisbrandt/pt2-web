<template>
  <section class="sample-creator-card sample-creator-card--bake">
    <div class="sample-creator-card__head">
      <div>
        <p class="metric-label">Bake Sample</p>
        <p class="hint">Render a controlled synth note directly into the target slot.</p>
      </div>
      <span class="hint">Slot {{ model.slotNumber }}</span>
    </div>

    <div class="sample-creator-action-toolbar">
      <ToolIconButtonView
        action=""
        :icon-html="model.playIconHtml"
        label="Preview baked note"
        :on-click="() => emit('preview')"
      />
      <ToolIconButtonView
        action=""
        :icon-html="model.recordIconHtml"
        :label="model.learnEnabled ? 'Stop bake learn' : 'Learn from live note'"
        :active="model.learnEnabled"
        :on-click="() => emit('toggle-learn')"
      />
      <ToolIconButtonView
        action=""
        :icon-html="model.bakeIconHtml"
        label="Bake to target slot"
        :on-click="() => emit('bake')"
      />
    </div>
    <p class="hint">Play a note from MIDI or the piano to update render note, velocity, and hold time.</p>

    <div class="sample-creator-render-controls">
      <SampleCreatorRenderControlView
        v-for="control in model.controls"
        :key="control.id"
        :label="control.label"
        :model-value="control.value"
        :min="control.min"
        :max="control.max"
        :step="control.step"
        :display-value="control.displayValue"
        :helper-text="control.helperText"
        @update:model-value="(value) => emit('control-change', control.id, value)"
      />
    </div>

    <div class="sample-creator-checks">
      <label class="sample-creator-check">
        <input
          type="checkbox"
          :checked="model.normalize"
          @change="handleNormalizeChange"
        />
        <span>Normalize</span>
      </label>
      <label class="sample-creator-check">
        <input
          type="checkbox"
          :checked="model.fadeOut"
          @change="handleFadeChange"
        />
        <span>Fade tail</span>
      </label>
    </div>

    <div class="sample-creator-last-render">
      <strong>{{ model.lastRenderName }}</strong>
      <span>{{ model.lastRenderSummary }}</span>
      <span>{{ model.lastRenderPeak }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { SampleCreatorBakeViewModel, SampleCreatorRenderControlViewModel } from '../../ui-modern/components/appShellRenderer';
import SampleCreatorRenderControlView from './SampleCreatorRenderControlView.vue';
import ToolIconButtonView from './ToolIconButtonView.vue';

defineProps<{
  model: SampleCreatorBakeViewModel;
}>();

const emit = defineEmits<{
  preview: [];
  'toggle-learn': [];
  bake: [];
  'control-change': [id: SampleCreatorRenderControlViewModel['id'], value: number];
  'normalize-change': [enabled: boolean];
  'fade-change': [enabled: boolean];
}>();

const handleNormalizeChange = (event: Event): void => {
  const target = event.target as HTMLInputElement | null;
  if (!target) {
    return;
  }

  emit('normalize-change', target.checked);
};

const handleFadeChange = (event: Event): void => {
  const target = event.target as HTMLInputElement | null;
  if (!target) {
    return;
  }

  emit('fade-change', target.checked);
};
</script>
