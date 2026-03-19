import type { SynthEngine } from './synthEngine';
import { SYNTH_DEFINITIONS, SYNTH_PARAMETERS, SYNTH_PRESETS, applyPresetToPatch, createInitialSynthSnapshot } from './synthConfig';
import { buildRenderedSampleFromCapture, createWaveformPreview, stereoToMono, type CapturedPreviewAudio } from './synthAudioUtils';
import { SynthPreviewDriver } from './synthPreviewDriver';
import { buildSynthTelemetryFallback } from './synthRenderFallback';
import type { RenderJob, RenderedSample, SynthCommand, SynthEvent, SynthSnapshot, SynthTelemetrySnapshot } from './synthTypes';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const midiToFreq = (note: number): number => 440 * (2 ** ((note - 69) / 12));

interface MockVoice {
  midiNote: number;
  velocity: number;
  phase: number;
  subPhase: number;
  released: boolean;
  level: number;
}

export class MockSynthEngine implements SynthEngine {
  private snapshot: SynthSnapshot = createInitialSynthSnapshot();
  private listeners = new Set<(event: SynthEvent) => void>();
  private previewDriver: SynthPreviewDriver | null = null;
  private voices: MockVoice[] = [];
  private recordedAudio: CapturedPreviewAudio | null = null;
  private telemetryVersion = 1;

  async init(): Promise<void> {
    this.previewDriver = new SynthPreviewDriver(
      (frameCount, sampleRate) => this.renderFrames(frameCount, sampleRate),
      {
        onSampleRateChange: (sampleRate) => {
          this.snapshot.previewSampleRate = Math.round(sampleRate);
          this.emitSnapshot();
        },
        onRenderError: (error) => {
          this.snapshot.status = `Mock preview error: ${error.message}`;
          this.emitSnapshot();
        },
      },
    );
    this.snapshot.ready = true;
    this.snapshot.backend = 'mock';
    this.snapshot.backendStatus = 'debug-fallback';
    this.snapshot.backendError = null;
    this.snapshot.status = 'Sample Creator is using the debug JS fallback.';
    this.emitSnapshot();
  }

  async dispose(): Promise<void> {
    this.listeners.clear();
    if (this.previewDriver) {
      await this.previewDriver.dispose();
      this.previewDriver = null;
    }
  }

  dispatch(command: SynthCommand): void {
    switch (command.type) {
      case 'synth/select': {
        const next = applyPresetToPatch(command.synth, SYNTH_PRESETS.find((preset) => preset.synth === command.synth)?.id ?? '');
        this.snapshot.selectedSynth = command.synth;
        this.snapshot.patch = next.patch;
        this.snapshot.selectedPresetId = next.presetId;
        this.recordedAudio = null;
        this.snapshot.recordState = 'idle';
        this.snapshot.recordedWaveform = null;
        this.snapshot.status = `Loaded ${SYNTH_DEFINITIONS[command.synth].label}.`;
        this.voices = [];
        break;
      }
      case 'preset/load': {
        const next = applyPresetToPatch(this.snapshot.selectedSynth, command.presetId);
        this.snapshot.patch = next.patch;
        this.snapshot.selectedPresetId = next.presetId;
        this.snapshot.status = `Preset ${SYNTH_PRESETS.find((preset) => preset.id === next.presetId)?.name ?? 'loaded'}.`;
        break;
      }
      case 'param/set':
        this.snapshot.patch[command.id] = clamp(command.value, SYNTH_PARAMETERS[command.id].min, SYNTH_PARAMETERS[command.id].max);
        this.snapshot.status = `${SYNTH_PARAMETERS[command.id].label} updated.`;
        break;
      case 'preview/note-on':
        if (this.snapshot.selectedSynth === 'acid303') {
          this.voices = [];
        }
        this.voices.push({
          midiNote: command.midiNote,
          velocity: clamp(command.velocity ?? 1, 0.05, 1),
          phase: 0,
          subPhase: 0,
          released: false,
          level: 1,
        });
        this.snapshot.activeNotes = Array.from(new Set([...this.snapshot.activeNotes, command.midiNote])).sort((a, b) => a - b);
        this.snapshot.status = `Preview note ${command.midiNote} playing.`;
        void this.previewDriver?.ensureStarted().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.snapshot.status = `Mock preview error: ${message}`;
          this.emitSnapshot();
        });
        break;
      case 'preview/note-off':
        this.voices = this.voices.map((voice) => voice.midiNote === command.midiNote ? { ...voice, released: true } : voice);
        this.snapshot.activeNotes = this.snapshot.activeNotes.filter((note) => note !== command.midiNote);
        break;
      case 'preview/panic':
        this.voices = [];
        this.snapshot.activeNotes = [];
        this.snapshot.status = 'Preview stopped.';
        void this.previewDriver?.suspend();
        break;
      case 'bake-rate/set':
        this.snapshot.bakeSampleRate = clamp(command.sampleRate, 11025, 48000);
        break;
      case 'record/start':
        this.recordedAudio = null;
        this.snapshot.recordState = 'recording';
        this.snapshot.recordedWaveform = null;
        this.snapshot.recordedDurationSeconds = 0;
        this.snapshot.recordedPeak = 0;
        this.previewDriver?.startRecording();
        this.snapshot.status = 'Recording synth preview...';
        break;
      case 'record/stop': {
        const capture = this.previewDriver?.stopRecording() ?? null;
        this.applyCapture(capture);
        break;
      }
      case 'record/discard':
        this.previewDriver?.discardRecording();
        this.recordedAudio = null;
        this.snapshot.recordState = 'idle';
        this.snapshot.recordedWaveform = null;
        this.snapshot.recordedDurationSeconds = 0;
        this.snapshot.recordedPeak = 0;
        this.snapshot.status = 'Recorded preview discarded.';
        break;
      case 'target-slot/set':
        this.snapshot.targetSampleSlot = clamp(command.slot, 0, 30);
        break;
      case 'input-arm/set':
        this.snapshot.inputArm = command.target;
        break;
      case 'midi/set-available':
        this.snapshot.midiAvailable = command.available;
        break;
    }

    this.emitSnapshot();
  }

  getSnapshot(): SynthSnapshot {
    return structuredClone(this.snapshot);
  }

  getTelemetry(): SynthTelemetrySnapshot | null {
    if (!this.snapshot.ready) {
      return null;
    }

    const activeNote = this.snapshot.activeNotes[0] ?? this.voices[0]?.midiNote ?? null;
    const sampleRate = this.snapshot.previewSampleRate ?? this.snapshot.bakeSampleRate;
    if (activeNote !== null) {
      this.telemetryVersion += 1;
    }
    return buildSynthTelemetryFallback(this.snapshot, sampleRate, activeNote, this.telemetryVersion);
  }

  async renderSample(job: RenderJob): Promise<RenderedSample> {
    const rendered = this.renderOffline(job);
    this.snapshot.lastRender = rendered;
    this.snapshot.status = `Rendered ${rendered.name} from ${SYNTH_DEFINITIONS[this.snapshot.selectedSynth].label}.`;
    this.emitSnapshot();
    return rendered;
  }

  getRecordedSample(job: RenderJob): RenderedSample | null {
    if (!this.recordedAudio) {
      return null;
    }

    const rendered = buildRenderedSampleFromCapture(this.recordedAudio, job);
    if (!rendered) {
      return null;
    }

    this.snapshot.lastRender = rendered;
    this.snapshot.status = `Committed recorded preview to ${rendered.name}.`;
    this.emitSnapshot();
    return rendered;
  }

  subscribe(listener: (event: SynthEvent) => void): () => void {
    this.listeners.add(listener);
    listener({ type: 'snapshot', snapshot: this.getSnapshot() });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitSnapshot(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener({ type: 'snapshot', snapshot });
    }
  }

  private applyCapture(capture: CapturedPreviewAudio | null): void {
    this.recordedAudio = capture;
    if (!capture) {
      this.snapshot.recordState = 'idle';
      this.snapshot.status = 'No recorded preview captured.';
      this.emitSnapshot();
      return;
    }

    const mono = stereoToMono(capture.interleavedStereo);
    let peak = 0;
    for (const sample of mono) {
      peak = Math.max(peak, Math.abs(sample));
    }

    this.snapshot.recordState = 'captured';
    this.snapshot.recordedWaveform = createWaveformPreview(mono);
    this.snapshot.recordedDurationSeconds = mono.length / capture.sampleRate;
    this.snapshot.recordedPeak = peak;
    this.snapshot.status = 'Recorded preview captured.';
    this.emitSnapshot();
  }

  private renderFrames(frameCount: number, sampleRate: number): Float32Array {
    const result = new Float32Array(frameCount * 2);
    const waveform = Math.round(this.snapshot.patch.waveform);
    const release = clamp(this.snapshot.patch.ampRelease, 0.01, 3.5);
    const cutoff = clamp(this.snapshot.patch.filterCutoff, 0.05, 0.95);
    const gain = clamp(this.snapshot.patch.masterGain, 0, 1.2);

    for (let frame = 0; frame < frameCount; frame += 1) {
      let sample = 0;
      this.voices = this.voices.filter((voice) => voice.level > 0.0001);

      for (const voice of this.voices) {
        const freq = midiToFreq(voice.midiNote);
        const phaseIncrement = freq / sampleRate;
        const subIncrement = (freq * 0.5) / sampleRate;
        const oscillators = waveform === 0
          ? ((voice.phase * 2) - 1)
          : waveform === 1
            ? (voice.phase < this.snapshot.patch.pulseWidth ? 1 : -1)
            : 1 - (4 * Math.abs(voice.phase - 0.5));
        const sub = (voice.subPhase < 0.5 ? 1 : -1) * this.snapshot.patch.subMix * 0.5;
        const noise = ((Math.random() * 2) - 1) * this.snapshot.patch.noiseMix * 0.15;

        let next = (oscillators * this.snapshot.patch.oscMix) + sub + noise;
        next *= voice.velocity * voice.level * gain;
        next *= 0.25 + cutoff;
        next = Math.tanh(next * (1 + (this.snapshot.patch.drive * 4)));
        sample += next;

        voice.phase = (voice.phase + phaseIncrement) % 1;
        voice.subPhase = (voice.subPhase + subIncrement) % 1;
        if (voice.released) {
          voice.level = Math.max(0, voice.level - (1 / (sampleRate * release)));
        }
      }

      result[frame * 2] = sample;
      result[(frame * 2) + 1] = sample;
    }

    return result;
  }

  private renderOffline(job: RenderJob): RenderedSample {
    const sampleCount = Math.max(1, Math.floor((job.durationSeconds + job.tailSeconds) * job.sampleRate));
    const voice: MockVoice = {
      midiNote: job.midiNote,
      velocity: clamp(job.velocity, 0.05, 1),
      phase: 0,
      subPhase: 0,
      released: false,
      level: 1,
    };

    const waveform = Math.round(this.snapshot.patch.waveform);
    const gain = clamp(this.snapshot.patch.masterGain, 0, 1.2);
    const release = clamp(this.snapshot.patch.ampRelease, 0.01, 3.5);
    const releaseStart = Math.floor(job.durationSeconds * job.sampleRate);
    const data = new Int8Array(sampleCount);
    let peak = 0;

    for (let index = 0; index < sampleCount; index += 1) {
      if (index >= releaseStart) {
        voice.released = true;
      }

      const freq = midiToFreq(voice.midiNote);
      const phaseIncrement = freq / job.sampleRate;
      const subIncrement = (freq * 0.5) / job.sampleRate;
      const oscillators = waveform === 0
        ? ((voice.phase * 2) - 1)
        : waveform === 1
          ? (voice.phase < this.snapshot.patch.pulseWidth ? 1 : -1)
          : 1 - (4 * Math.abs(voice.phase - 0.5));
      let sample = oscillators * voice.level * voice.velocity * gain;
      sample = Math.tanh(sample * (1 + (this.snapshot.patch.drive * 4)));
      peak = Math.max(peak, Math.abs(sample));
      data[index] = clamp(Math.round(sample * 127), -128, 127);
      voice.phase = (voice.phase + phaseIncrement) % 1;
      voice.subPhase = (voice.subPhase + subIncrement) % 1;
      if (voice.released) {
        voice.level = Math.max(0, voice.level - (1 / (job.sampleRate * release)));
      }
    }

    if (job.normalize && peak > 0.0001) {
      const gainScale = 0.92 / peak;
      for (let index = 0; index < data.length; index += 1) {
        data[index] = clamp(Math.round((data[index] / 127) * gainScale * 127), -128, 127);
      }
    }

    if (job.fadeOut) {
      const fadeLength = Math.max(32, Math.min(4096, Math.floor(data.length / 10)));
      for (let index = 0; index < fadeLength; index += 1) {
        const sampleIndex = data.length - fadeLength + index;
        const ratio = 1 - (index / fadeLength);
        data[sampleIndex] = clamp(Math.round(data[sampleIndex] * ratio), -128, 127);
      }
    }

    const loopStart = clamp(job.loopStart, 0, Math.max(0, data.length - 2));
    return {
      name: job.sampleName.slice(0, 22),
      data,
      volume: clamp(job.volume, 0, 64),
      fineTune: clamp(job.fineTune, -8, 7),
      loopStart,
      loopLength: clamp(job.loopLength, 2, Math.max(2, data.length - loopStart)),
      sampleRate: job.sampleRate,
      peak,
      midiNote: job.midiNote,
    };
  }
}
