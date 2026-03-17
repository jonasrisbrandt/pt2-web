<template>
  <section class="fatal-screen">
    <p class="eyebrow">ProTracker 2 web clone</p>
    <h1>Startup failed</h1>
    <p>{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>
