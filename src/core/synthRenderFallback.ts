import type {
  RenderJob,
  RenderedSample,
  SynthSnapshot,
  SynthTelemetryCurveId,
  SynthTelemetrySnapshot,
  SynthTelemetryTapId,
} from './synthTypes';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const midiToFreq = (note: number): number => 440 * (2 ** ((note - 69) / 12));
const TAU = Math.PI * 2;
const TELEMETRY_POINTS = 96;

const oscillator = (phase: number, waveform: number, pulseWidth: number): number => {
  switch (waveform) {
    case 1:
      return phase < pulseWidth ? 1 : -1;
    case 2:
      return 1 - (4 * Math.abs(phase - 0.5));
    default:
      return (phase * 2) - 1;
  }
};

const envelopeAt = (
  timeSeconds: number,
  noteDuration: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
): number => {
  if (timeSeconds < attack) {
    return attack <= 0 ? 1 : timeSeconds / attack;
  }

  if (timeSeconds < attack + decay) {
    const ratio = decay <= 0 ? 1 : (timeSeconds - attack) / decay;
    return 1 - ((1 - sustain) * ratio);
  }

  if (timeSeconds < noteDuration) {
    return sustain;
  }

  const releaseTime = timeSeconds - noteDuration;
  if (releaseTime >= release) {
    return 0;
  }

  const ratio = release <= 0 ? 1 : releaseTime / release;
  return sustain * (1 - ratio);
};

export const renderSynthSampleFallback = (
  snapshot: SynthSnapshot,
  job: RenderJob,
): RenderedSample => {
  const sampleRate = job.sampleRate;
  const sampleCount = Math.max(1, Math.floor((job.durationSeconds + job.tailSeconds) * sampleRate));
  const data = new Int8Array(sampleCount);
  const waveform = Math.round(snapshot.patch.waveform);
  const noteDuration = clamp(job.durationSeconds, 0.02, 8);
  const gain = clamp(snapshot.patch.masterGain, 0, 1.25);
  const drive = 1 + (snapshot.patch.drive * 7);
  const attack = clamp(snapshot.patch.ampAttack, 0.001, 2);
  const decay = clamp(snapshot.patch.ampDecay, 0.01, 2.5);
  const sustain = clamp(snapshot.patch.ampSustain, 0, 1);
  const release = clamp(snapshot.patch.ampRelease, 0.01, 3.5);
  const filterBase = clamp(snapshot.patch.filterCutoff, 0.02, 0.98);
  const resonance = clamp(snapshot.patch.filterResonance, 0, 0.95);
  const filterEnvAmount = clamp(snapshot.patch.filterEnvAmount, -1, 1);
  const oscMix = clamp(snapshot.patch.oscMix, 0, 1);
  const subMix = clamp(snapshot.patch.subMix, 0, 1);
  const noiseMix = clamp(snapshot.patch.noiseMix, 0, 1);
  const detune = clamp(snapshot.patch.detune, 0, 0.5);
  const lfoRate = clamp(snapshot.patch.lfoRate, 0, 18);
  const lfoAmount = clamp(snapshot.patch.lfoAmount, 0, 1);
  const pulseWidth = clamp(snapshot.patch.pulseWidth, 0.08, 0.92);
  const accent = snapshot.selectedSynth === 'acid303' ? clamp(snapshot.patch.accent, 0, 1) : 0;
  const chorusDepth = clamp(snapshot.patch.chorusDepth, 0, 1);
  const chorusMix = clamp(snapshot.patch.chorusMix, 0, 1);
  const delayTime = clamp(snapshot.patch.delayTime, 0.02, 0.8);
  const delayFeedback = clamp(snapshot.patch.delayFeedback, 0, 0.92);
  const delayMix = clamp(snapshot.patch.delayMix, 0, 1);

  const baseFreq = midiToFreq(job.midiNote);
  const detunedFreq = baseFreq * (1 + (detune * 0.03));
  let phaseA = 0;
  let phaseB = 0;
  let phaseSub = 0;
  let low = 0;
  let band = 0;
  let peak = 0;

  const chorusBufferLength = Math.max(256, Math.floor(sampleRate * 0.04));
  const chorusBuffer = new Float32Array(chorusBufferLength);
  let chorusWriteIndex = 0;
  let chorusPhase = 0;

  const delayBufferLength = Math.max(1024, Math.floor(sampleRate * 1.2));
  const delayBuffer = new Float32Array(delayBufferLength);
  let delayWriteIndex = 0;
  const delaySamples = Math.max(1, Math.floor(delayTime * sampleRate));

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const ampEnv = envelopeAt(time, noteDuration, attack, decay, sustain, release);
    const filterEnv = envelopeAt(time, noteDuration, attack * 0.35, decay, sustain, release);
    const lfo = Math.sin((time * lfoRate) * TAU) * lfoAmount;

    const oscA = oscillator(phaseA, waveform, pulseWidth);
    const oscB = snapshot.selectedSynth === 'acid303'
      ? 0
      : oscillator(phaseB, waveform === 0 ? 1 : waveform - 1, pulseWidth);
    const sub = snapshot.selectedSynth === 'acid303'
      ? 0
      : oscillator(phaseSub, 1, 0.5) * 0.75;
    const noise = snapshot.selectedSynth === 'acid303'
      ? 0
      : (((Math.random() * 2) - 1) * 0.35);

    let sample = (oscA * oscMix)
      + (oscB * (1 - oscMix) * 0.82)
      + (sub * subMix)
      + (noise * noiseMix);

    if (snapshot.selectedSynth === 'acid303') {
      sample *= 1 + (accent * job.velocity * 0.45);
    }

    let cutoff = filterBase + (filterEnv * filterEnvAmount * 0.55) + (lfo * 0.2);
    cutoff = clamp(cutoff, 0.01, 0.99);
    const frequency = 2 * Math.sin(Math.PI * cutoff * 0.5);
    const damping = 1 - (resonance * 0.82);
    low += frequency * band;
    const high = sample - low - (damping * band);
    band += frequency * high;
    sample = low;

    sample = Math.tanh(sample * drive);
    sample *= ampEnv * gain * (0.4 + (job.velocity * 0.6));

    chorusBuffer[chorusWriteIndex] = sample;
    const chorusOffset = 6 + Math.floor((chorusDepth * ((Math.sin(chorusPhase) * 0.5) + 0.5)) * (chorusBufferLength * 0.5));
    const chorusReadIndex = (chorusWriteIndex - chorusOffset + chorusBufferLength) % chorusBufferLength;
    const chorusSample = chorusBuffer[chorusReadIndex] ?? 0;
    chorusWriteIndex = (chorusWriteIndex + 1) % chorusBufferLength;
    chorusPhase += TAU * 0.18 / sampleRate;

    let wet = sample + ((chorusSample - sample) * chorusMix);

    const delayReadIndex = (delayWriteIndex - delaySamples + delayBufferLength) % delayBufferLength;
    const delayed = delayBuffer[delayReadIndex] ?? 0;
    delayBuffer[delayWriteIndex] = wet + (delayed * delayFeedback);
    delayWriteIndex = (delayWriteIndex + 1) % delayBufferLength;
    wet += delayed * delayMix;

    peak = Math.max(peak, Math.abs(wet));
    data[index] = clamp(Math.round(wet * 127), -128, 127);

    phaseA = (phaseA + (baseFreq / sampleRate)) % 1;
    phaseB = (phaseB + (detunedFreq / sampleRate)) % 1;
    phaseSub = (phaseSub + ((baseFreq * 0.5) / sampleRate)) % 1;
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

  const loopStart = clamp(job.loopStart & ~1, 0, Math.max(0, data.length - 2));
  return {
    name: job.sampleName.slice(0, 22),
    data,
    volume: clamp(job.volume, 0, 64),
    fineTune: clamp(job.fineTune, -8, 7),
    loopStart,
    loopLength: clamp(job.loopLength & ~1, 2, Math.max(2, data.length - loopStart)),
    sampleRate,
    peak,
    midiNote: job.midiNote,
  };
};

export const renderSynthPreviewFallback = (
  snapshot: SynthSnapshot,
  frameCount: number,
  sampleRate: number,
): Float32Array => {
  const result = new Float32Array(frameCount * 2);
  if (snapshot.activeNotes.length === 0) {
    return result;
  }

  const preview = renderSynthSampleFallback(snapshot, {
    midiNote: snapshot.activeNotes[0],
    velocity: 1,
    durationSeconds: frameCount / sampleRate,
    tailSeconds: 0,
    sampleRate,
    normalize: false,
    fadeOut: false,
    targetSlot: snapshot.targetSampleSlot,
    sampleName: 'preview',
    volume: 64,
    fineTune: 0,
    loopStart: 0,
    loopLength: 2,
  });

  for (let index = 0; index < frameCount; index += 1) {
    const sample = (preview.data[index] ?? 0) / 127;
    result[index * 2] = sample;
    result[(index * 2) + 1] = sample;
  }

  return result;
};

export const buildSynthTelemetryFallback = (
  snapshot: SynthSnapshot,
  sampleRate: number,
  midiNote: number | null,
  version: number,
): SynthTelemetrySnapshot => {
  const note = midiNote ?? snapshot.activeNotes[0] ?? 48;
  const rendered = renderSynthSampleFallback(snapshot, {
    midiNote: note,
    velocity: 1,
    durationSeconds: TELEMETRY_POINTS / Math.max(1, sampleRate),
    tailSeconds: 0,
    sampleRate: Math.max(8000, sampleRate),
    normalize: false,
    fadeOut: false,
    targetSlot: snapshot.targetSampleSlot,
    sampleName: 'telemetry',
    volume: 64,
    fineTune: 0,
    loopStart: 0,
    loopLength: 2,
  });

  const signal = new Float32Array(TELEMETRY_POINTS);
  for (let index = 0; index < TELEMETRY_POINTS; index += 1) {
    signal[index] = (rendered.data[index] ?? 0) / 127;
  }

  const waveform = Math.round(snapshot.patch.waveform);
  const taps = {
    oscA: signal.slice(),
    oscB: signal.map((value, index) => value * (waveform === 2 ? 0.72 : (0.65 + ((index / TELEMETRY_POINTS) * 0.1)))),
    mix: signal.map((value) => value * 0.82),
    filter: signal.map((value) => value * (0.35 + (snapshot.patch.filterCutoff * 0.65))),
    drive: signal.map((value) => Math.tanh(value * (1 + (snapshot.patch.drive * 4)))),
    amp: signal.map((value) => value * snapshot.patch.masterGain),
    master: signal.slice(),
  } satisfies Record<SynthTelemetryTapId, Float32Array>;

  const curves = {} as Record<SynthTelemetryCurveId, Float32Array>;
  curves.ampEnv = new Float32Array(TELEMETRY_POINTS);
  curves.filterEnv = new Float32Array(TELEMETRY_POINTS);
  curves.lfo = new Float32Array(TELEMETRY_POINTS);
  curves.filterResponse = new Float32Array(TELEMETRY_POINTS);

  for (let index = 0; index < TELEMETRY_POINTS; index += 1) {
    const t = index / Math.max(1, TELEMETRY_POINTS - 1);
    const ampEnv = t < 0.18
      ? (t / 0.18)
      : (1 - ((1 - snapshot.patch.ampSustain) * Math.min(1, (t - 0.18) / 0.28)));
    curves.ampEnv[index] = clamp(ampEnv, 0, 1);
    curves.filterEnv[index] = clamp(0.5 + (((curves.ampEnv[index] * 2) - 1) * snapshot.patch.filterEnvAmount * 0.5), 0, 1);
    curves.lfo[index] = Math.sin(t * TAU) * snapshot.patch.lfoAmount;
    const rolloff = Math.pow(t, 1.25) * (1 - snapshot.patch.filterCutoff);
    curves.filterResponse[index] = clamp((1 - rolloff) * (0.65 + ((1 - snapshot.patch.filterResonance) * 0.2)), 0, 1);
  }

  let peak = 0;
  for (const value of taps.master) {
    peak = Math.max(peak, Math.abs(value));
  }

  return {
    version,
    focusedMidiNote: note,
    activeVoiceCount: Math.max(0, snapshot.activeNotes.length),
    sampleRate,
    peak,
    runtime: {
      cutoff: clamp(snapshot.patch.filterCutoff, 0, 1),
      resonance: clamp(snapshot.patch.filterResonance, 0, 1),
      ampEnv: curves.ampEnv[TELEMETRY_POINTS - 1] ?? 0,
      filterEnv: curves.filterEnv[TELEMETRY_POINTS - 1] ?? 0,
      lfo: curves.lfo[Math.floor(TELEMETRY_POINTS / 4)] ?? 0,
      drive: clamp(snapshot.patch.drive, 0, 1),
      velocity: 1,
    },
    taps,
    curves,
  };
};
