<template>
  <div
    v-if="telemetry"
    class="sample-creator-telemetry"
  >
    <div class="sample-creator-telemetry__summary">
      <div class="sample-creator-telemetry__metric">
        <span class="metric-label">Focus</span>
        <strong>{{ focusLabel }}</strong>
      </div>
      <div class="sample-creator-telemetry__metric">
        <span class="metric-label">Voices</span>
        <strong>{{ telemetry.activeVoiceCount }}</strong>
      </div>
      <div class="sample-creator-telemetry__metric">
        <span class="metric-label">Cutoff / Reso</span>
        <strong>{{ runtimeLabel }}</strong>
      </div>
      <div class="sample-creator-telemetry__metric">
        <span class="metric-label">Peak</span>
        <strong>{{ peakLabel }}</strong>
      </div>
    </div>

    <div class="sample-creator-display-grid">
      <SampleCreatorSignalDisplay title="Oscillator A" detail="Band-limited source" :values="telemetry.taps.oscA" tone="lime" />
      <SampleCreatorSignalDisplay title="Oscillator B" detail="Detuned companion" :values="telemetry.taps.oscB" tone="cyan" />
      <SampleCreatorSignalDisplay title="Mixer" detail="Pre-filter voice sum" :values="telemetry.taps.mix" tone="amber" />
      <SampleCreatorSignalDisplay title="Filter" detail="Post-SVF waveform" :values="telemetry.taps.filter" tone="rose" />
      <SampleCreatorSignalDisplay title="Drive" detail="Post-shaper" :values="telemetry.taps.drive" tone="amber" />
      <SampleCreatorSignalDisplay title="Amp / Out" detail="Voice or master contour" :values="telemetry.taps.master" tone="lime" />
      <SampleCreatorSignalDisplay title="Amp Envelope" detail="ADSR shape" :values="telemetry.curves.ampEnv" mode="curve" tone="lime" />
      <SampleCreatorSignalDisplay title="Filter Envelope" detail="Applied filter motion" :values="telemetry.curves.filterEnv" mode="curve" tone="cyan" />
      <SampleCreatorSignalDisplay title="LFO" detail="Current modulation shape" :values="telemetry.curves.lfo" tone="rose" />
      <SampleCreatorSignalDisplay title="Filter Curve" detail="Response estimate" :values="telemetry.curves.filterResponse" mode="curve" tone="amber" />
    </div>
  </div>
  <div
    v-else
    class="sample-creator-telemetry sample-creator-telemetry--empty"
  >
    <p class="hint">Start preview playback or tweak parameters to populate the synth displays.</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SynthTelemetrySnapshot } from '../../core/synthTypes';
import SampleCreatorSignalDisplay from './SampleCreatorSignalDisplay.vue';

const props = defineProps<{
  telemetry: SynthTelemetrySnapshot | null;
}>();

const telemetry = computed(() => props.telemetry);
const focusLabel = computed(() => telemetry.value?.focusedMidiNote ? `MIDI ${telemetry.value.focusedMidiNote}` : 'Idle');
const runtimeLabel = computed(() => telemetry.value
  ? `${Math.round(telemetry.value.runtime.cutoff * 100)}% / ${Math.round(telemetry.value.runtime.resonance * 100)}%`
  : '0% / 0%');
const peakLabel = computed(() => telemetry.value ? `${Math.round(telemetry.value.peak * 100)}%` : '0%');
</script>
