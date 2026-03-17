<template>
  <div class="module-card module-card--stepper">
    <span class="metric-label">{{ label }}</span>
    <div class="module-stepper">
      <strong
        class="module-stepper__value"
        :data-role="`metric-${role}`"
      >{{ value }}</strong>
      <div class="module-stepper__buttons">
        <button
          type="button"
          class="icon-button icon-button--small"
          :data-action="upAction"
          :disabled="!enabled"
        >
          <span
            style="display: contents"
            v-html="upIconHtml"
          />
          <span class="sr-only">Increase {{ label }}</span>
        </button>
        <button
          type="button"
          class="icon-button icon-button--small"
          :data-action="downAction"
          :disabled="!enabled"
        >
          <span
            style="display: contents"
            v-html="downIconHtml"
          />
          <span class="sr-only">Decrease {{ label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ModuleStepperCardRenderOptions } from '../../ui-modern/components/appShellRenderer';

defineProps<ModuleStepperCardRenderOptions>();
</script>
