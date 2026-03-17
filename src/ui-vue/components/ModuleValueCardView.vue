<template>
  <div class="module-card module-card--readout">
    <span class="metric-label">{{ label }}</span>
    <div class="module-readout">
      <strong
        class="module-readout__value"
        :data-role="`metric-${role}`"
      >{{ value }}</strong>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ModuleValueCardRenderOptions } from '../../ui-modern/components/appShellRenderer';

defineProps<ModuleValueCardRenderOptions>();
</script>
