<template>
  <input
    v-if="editing"
    class="inline-rename-input"
    :data-inline-rename="target"
    :maxlength="maxLength"
    :value="value"
  />
  <button
    v-else
    type="button"
    class="inline-name-display"
    :data-rename-target="target"
  >{{ displayValue }}</button>
</template>

<script setup lang="ts">
import type { InlineNameFieldRenderOptions } from '../../ui-modern/components/viewModels';

defineProps<InlineNameFieldRenderOptions>();
</script>
