<template>
  <template
    v-for="card in cards"
    :key="`${card.kind}:${card.role}`"
  >
    <ModuleStepperCardView
      v-if="card.kind === 'stepper'"
      v-bind="card"
    />
    <ModuleValueCardView
      v-else
      v-bind="card"
    />
  </template>
</template>

<script setup lang="ts">
import type { ModuleCardRenderOptions } from '../../ui-modern/components/appShellRenderer';
import ModuleStepperCardView from './ModuleStepperCardView.vue';
import ModuleValueCardView from './ModuleValueCardView.vue';

defineProps<{
  cards: ModuleCardRenderOptions[];
}>();
</script>
