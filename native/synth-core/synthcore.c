#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "synthcore.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define PT2_SYNTH_MAX_VOICES 8
#define PT2_SYNTH_MAX_PREVIEW_FRAMES 2048
#define PT2_SYNTH_MAX_RENDER_SAMPLES 524288
#define PT2_SYNTH_DELAY_BUFFER 131072
#define PT2_SYNTH_CHORUS_BUFFER 8192

enum
{
	PT2_SYNTH_CORE_SUB = 0,
	PT2_SYNTH_ACID303 = 1
};

enum
{
	PT2_FILTER_LADDER_LP24 = 0
};

enum
{
	PT2_PARAM_MASTER_GAIN = 0,
	PT2_PARAM_WAVEFORM = 1,
	PT2_PARAM_AMP_ATTACK = 2,
	PT2_PARAM_AMP_DECAY = 3,
	PT2_PARAM_AMP_SUSTAIN = 4,
	PT2_PARAM_AMP_RELEASE = 5,
	PT2_PARAM_FILTER_CUTOFF = 6,
	PT2_PARAM_FILTER_RESONANCE = 7,
	PT2_PARAM_FILTER_ENV_AMOUNT = 8,
	PT2_PARAM_DRIVE = 9,
	PT2_PARAM_OSC_MIX = 10,
	PT2_PARAM_SUB_MIX = 11,
	PT2_PARAM_NOISE_MIX = 12,
	PT2_PARAM_DETUNE = 13,
	PT2_PARAM_LFO_RATE = 14,
	PT2_PARAM_LFO_AMOUNT = 15,
	PT2_PARAM_DELAY_TIME = 16,
	PT2_PARAM_DELAY_FEEDBACK = 17,
	PT2_PARAM_DELAY_MIX = 18,
	PT2_PARAM_CHORUS_DEPTH = 19,
	PT2_PARAM_CHORUS_MIX = 20,
	PT2_PARAM_ACCENT = 21,
	PT2_PARAM_SLIDE_TIME = 22,
	PT2_PARAM_PULSE_WIDTH = 23,
	PT2_PARAM_COUNT = 24
};

enum
{
	PT2_ENV_IDLE = 0,
	PT2_ENV_ATTACK = 1,
	PT2_ENV_DECAY = 2,
	PT2_ENV_SUSTAIN = 3,
	PT2_ENV_RELEASE = 4
};

typedef struct pt2SynthVoice_t
{
	bool active;
	bool held;
	int32_t midiNote;
	float velocity;
	float phaseA;
	float phaseB;
	float phaseSub;
	float envLevel;
	int32_t envStage;
	float filterStage[4];
	float currentFreq;
	float targetFreq;
} pt2SynthVoice_t;

static pt2SynthVoice_t pt2SynthVoices[PT2_SYNTH_MAX_VOICES];
static float pt2SynthParams[PT2_PARAM_COUNT];
static int32_t pt2SelectedSynth = PT2_SYNTH_CORE_SUB;
static float pt2PreviewBuffer[PT2_SYNTH_MAX_PREVIEW_FRAMES * 2];
static int32_t pt2PreviewLength = 0;
static int8_t pt2RenderedSample[PT2_SYNTH_MAX_RENDER_SAMPLES];
static int32_t pt2RenderedSampleLength = 0;
static float pt2DelayBufferL[PT2_SYNTH_DELAY_BUFFER];
static float pt2DelayBufferR[PT2_SYNTH_DELAY_BUFFER];
static float pt2ChorusBufferL[PT2_SYNTH_CHORUS_BUFFER];
static float pt2ChorusBufferR[PT2_SYNTH_CHORUS_BUFFER];
static int32_t pt2DelayWritePos = 0;
static int32_t pt2ChorusWritePos = 0;
static uint32_t pt2NoiseState = 0x12345678u;
static float pt2LfoPhase = 0.0f;
static float pt2ChorusPhase = 0.0f;

static float pt2ClampFloat(float value, float low, float high)
{
	if (value < low)
		return low;

	if (value > high)
		return high;

	return value;
}

static int32_t pt2ClampInt32(int32_t value, int32_t low, int32_t high)
{
	if (value < low)
		return low;

	if (value > high)
		return high;

	return value;
}

static float pt2MidiToFreq(int32_t midiNote)
{
	return 440.0f * powf(2.0f, ((float)midiNote - 69.0f) / 12.0f);
}

static float pt2FrandCentered(void)
{
	pt2NoiseState = (pt2NoiseState * 1664525u) + 1013904223u;
	return ((float)((pt2NoiseState >> 8) & 0xFFFF) / 32767.5f) - 1.0f;
}

static float pt2FastTanh(float value)
{
	const float absValue = fabsf(value);
	return value / (1.0f + absValue);
}

static void pt2ClearFxState(void)
{
	memset(pt2DelayBufferL, 0, sizeof (pt2DelayBufferL));
	memset(pt2DelayBufferR, 0, sizeof (pt2DelayBufferR));
	memset(pt2ChorusBufferL, 0, sizeof (pt2ChorusBufferL));
	memset(pt2ChorusBufferR, 0, sizeof (pt2ChorusBufferR));
	pt2DelayWritePos = 0;
	pt2ChorusWritePos = 0;
	pt2LfoPhase = 0.0f;
	pt2ChorusPhase = 0.0f;
}

static void pt2PanicVoices(void)
{
	memset(pt2SynthVoices, 0, sizeof (pt2SynthVoices));
}

static void pt2SetDefaultPatch(int32_t synthId)
{
	memset(pt2SynthParams, 0, sizeof (pt2SynthParams));
	pt2SelectedSynth = synthId;

	pt2SynthParams[PT2_PARAM_MASTER_GAIN] = 0.72f;
	pt2SynthParams[PT2_PARAM_WAVEFORM] = (synthId == PT2_SYNTH_ACID303) ? 0.0f : 1.0f;
	pt2SynthParams[PT2_PARAM_AMP_ATTACK] = 0.006f;
	pt2SynthParams[PT2_PARAM_AMP_DECAY] = (synthId == PT2_SYNTH_ACID303) ? 0.18f : 0.22f;
	pt2SynthParams[PT2_PARAM_AMP_SUSTAIN] = (synthId == PT2_SYNTH_ACID303) ? 0.05f : 0.62f;
	pt2SynthParams[PT2_PARAM_AMP_RELEASE] = (synthId == PT2_SYNTH_ACID303) ? 0.12f : 0.28f;
	pt2SynthParams[PT2_PARAM_FILTER_CUTOFF] = (synthId == PT2_SYNTH_ACID303) ? 0.42f : 0.68f;
	pt2SynthParams[PT2_PARAM_FILTER_RESONANCE] = (synthId == PT2_SYNTH_ACID303) ? 0.74f : 0.22f;
	pt2SynthParams[PT2_PARAM_FILTER_ENV_AMOUNT] = (synthId == PT2_SYNTH_ACID303) ? 0.85f : 0.28f;
	pt2SynthParams[PT2_PARAM_DRIVE] = (synthId == PT2_SYNTH_ACID303) ? 0.48f : 0.18f;
	pt2SynthParams[PT2_PARAM_OSC_MIX] = (synthId == PT2_SYNTH_ACID303) ? 1.0f : 0.72f;
	pt2SynthParams[PT2_PARAM_SUB_MIX] = (synthId == PT2_SYNTH_ACID303) ? 0.0f : 0.44f;
	pt2SynthParams[PT2_PARAM_NOISE_MIX] = (synthId == PT2_SYNTH_ACID303) ? 0.0f : 0.06f;
	pt2SynthParams[PT2_PARAM_DETUNE] = (synthId == PT2_SYNTH_ACID303) ? 0.0f : 0.12f;
	pt2SynthParams[PT2_PARAM_LFO_RATE] = 3.6f;
	pt2SynthParams[PT2_PARAM_LFO_AMOUNT] = (synthId == PT2_SYNTH_ACID303) ? 0.03f : 0.16f;
	pt2SynthParams[PT2_PARAM_DELAY_TIME] = (synthId == PT2_SYNTH_ACID303) ? 0.26f : 0.33f;
	pt2SynthParams[PT2_PARAM_DELAY_FEEDBACK] = (synthId == PT2_SYNTH_ACID303) ? 0.28f : 0.24f;
	pt2SynthParams[PT2_PARAM_DELAY_MIX] = (synthId == PT2_SYNTH_ACID303) ? 0.12f : 0.18f;
	pt2SynthParams[PT2_PARAM_CHORUS_DEPTH] = (synthId == PT2_SYNTH_ACID303) ? 0.0f : 0.38f;
	pt2SynthParams[PT2_PARAM_CHORUS_MIX] = (synthId == PT2_SYNTH_ACID303) ? 0.0f : 0.2f;
	pt2SynthParams[PT2_PARAM_ACCENT] = (synthId == PT2_SYNTH_ACID303) ? 0.5f : 0.0f;
	pt2SynthParams[PT2_PARAM_SLIDE_TIME] = (synthId == PT2_SYNTH_ACID303) ? 0.12f : 0.0f;
	pt2SynthParams[PT2_PARAM_PULSE_WIDTH] = 0.5f;
}

static float pt2Oscillator(float phase, int32_t waveform, float pulseWidth)
{
	switch (waveform)
	{
		case 1:
			return (phase < pulseWidth) ? 1.0f : -1.0f;
		case 2:
			return 1.0f - (4.0f * fabsf(phase - 0.5f));
		default:
			return (phase * 2.0f) - 1.0f;
	}
}

static float pt2EnvelopeStep(pt2SynthVoice_t *voice, float sampleRate)
{
	const float attack = pt2ClampFloat(pt2SynthParams[PT2_PARAM_AMP_ATTACK], 0.001f, 4.0f);
	const float decay = pt2ClampFloat(pt2SynthParams[PT2_PARAM_AMP_DECAY], 0.001f, 4.0f);
	const float sustain = pt2ClampFloat(pt2SynthParams[PT2_PARAM_AMP_SUSTAIN], 0.0f, 1.0f);
	const float release = pt2ClampFloat(pt2SynthParams[PT2_PARAM_AMP_RELEASE], 0.001f, 8.0f);

	switch (voice->envStage)
	{
		case PT2_ENV_ATTACK:
			voice->envLevel += 1.0f / (attack * sampleRate);
			if (voice->envLevel >= 1.0f)
			{
				voice->envLevel = 1.0f;
				voice->envStage = PT2_ENV_DECAY;
			}
		break;

		case PT2_ENV_DECAY:
			voice->envLevel -= (1.0f - sustain) / (decay * sampleRate);
			if (voice->envLevel <= sustain)
			{
				voice->envLevel = sustain;
				voice->envStage = PT2_ENV_SUSTAIN;
			}
		break;

		case PT2_ENV_SUSTAIN:
			voice->envLevel = sustain;
		break;

		case PT2_ENV_RELEASE:
			voice->envLevel -= 1.0f / (release * sampleRate);
			if (voice->envLevel <= 0.0f)
			{
				voice->envLevel = 0.0f;
				voice->envStage = PT2_ENV_IDLE;
				voice->active = false;
			}
		break;

		default:
			voice->envLevel = 0.0f;
		break;
	}

	return voice->envLevel;
}

static float pt2MapCutoffHz(float normalizedCutoff, float sampleRate)
{
	const float minimumHz = 28.0f;
	const float maximumHz = pt2ClampFloat((sampleRate * 0.45f), 4000.0f, 18000.0f);
	return minimumHz * powf(maximumHz / minimumHz, pt2ClampFloat(normalizedCutoff, 0.0f, 1.0f));
}

static float pt2VoiceFilter(pt2SynthVoice_t *voice, float input, float sampleRate, float envelopeLevel)
{
	float cutoff = pt2ClampFloat(pt2SynthParams[PT2_PARAM_FILTER_CUTOFF], 0.02f, 0.98f);
	const float resonance = pt2ClampFloat(pt2SynthParams[PT2_PARAM_FILTER_RESONANCE], 0.0f, 0.97f);
	const float envAmount = pt2ClampFloat(pt2SynthParams[PT2_PARAM_FILTER_ENV_AMOUNT], -1.0f, 1.0f);
	cutoff += ((envelopeLevel * 2.0f) - 1.0f) * envAmount * 0.34f;
	cutoff += sinf(pt2LfoPhase) * pt2ClampFloat(pt2SynthParams[PT2_PARAM_LFO_AMOUNT], 0.0f, 1.0f) * 0.11f;
	cutoff = pt2ClampFloat(cutoff, 0.0f, 1.0f);

	const float cutoffHz = pt2MapCutoffHz(cutoff, sampleRate);
	const float g = 1.0f - expf((-2.0f * (float)M_PI * cutoffHz) / sampleRate);
	const float compensatedResonance = resonance * (4.15f - (3.3f * g));
	float stageInput = input - (voice->filterStage[3] * compensatedResonance);
	stageInput = pt2FastTanh(stageInput);

	for (int32_t stage = 0; stage < 4; stage++)
	{
		voice->filterStage[stage] += g * (stageInput - voice->filterStage[stage]);
		stageInput = pt2FastTanh(voice->filterStage[stage]);
	}

	return voice->filterStage[3] * (1.0f + ((1.0f - cutoff) * 0.18f));
}

static pt2SynthVoice_t *pt2AllocateVoice(int32_t midiNote, float velocity)
{
	pt2SynthVoice_t *voice = NULL;
	if (pt2SelectedSynth == PT2_SYNTH_ACID303)
	{
		voice = &pt2SynthVoices[0];
		if (voice->active && pt2ClampFloat(pt2SynthParams[PT2_PARAM_SLIDE_TIME], 0.0f, 1.5f) > 0.001f)
		{
			voice->targetFreq = pt2MidiToFreq(midiNote);
			voice->midiNote = midiNote;
			voice->held = true;
			voice->velocity = velocity;
			voice->envStage = PT2_ENV_ATTACK;
			return voice;
		}
	}
	else
	{
		for (int32_t i = 0; i < PT2_SYNTH_MAX_VOICES; i++)
		{
			if (!pt2SynthVoices[i].active)
			{
				voice = &pt2SynthVoices[i];
				break;
			}
		}
	}

	if (voice == NULL)
		voice = &pt2SynthVoices[0];

	memset(voice, 0, sizeof (*voice));
	voice->active = true;
	voice->held = true;
	voice->midiNote = midiNote;
	voice->velocity = velocity;
	voice->envStage = PT2_ENV_ATTACK;
	voice->currentFreq = pt2MidiToFreq(midiNote);
	voice->targetFreq = voice->currentFreq;
	return voice;
}

static float pt2RenderVoice(pt2SynthVoice_t *voice, float sampleRate)
{
	if (!voice->active)
		return 0.0f;

	const float slideTime = pt2ClampFloat(pt2SynthParams[PT2_PARAM_SLIDE_TIME], 0.0f, 2.0f);
	if (slideTime > 0.0f && fabsf(voice->targetFreq - voice->currentFreq) > 0.001f)
	{
		const float glide = 1.0f - expf(-1.0f / (sampleRate * (slideTime + 0.001f)));
		voice->currentFreq += (voice->targetFreq - voice->currentFreq) * glide;
	}
	else
	{
		voice->currentFreq = voice->targetFreq;
	}

	const float envelopeLevel = pt2EnvelopeStep(voice, sampleRate);
	if (!voice->active)
		return 0.0f;

	const int32_t waveform = pt2ClampInt32((int32_t)lrintf(pt2SynthParams[PT2_PARAM_WAVEFORM]), 0, 2);
	const float pulseWidth = pt2ClampFloat(pt2SynthParams[PT2_PARAM_PULSE_WIDTH], 0.08f, 0.92f);
	const float detuneSemitones = pt2ClampFloat(pt2SynthParams[PT2_PARAM_DETUNE], 0.0f, 0.5f);
	const float oscMix = pt2ClampFloat(pt2SynthParams[PT2_PARAM_OSC_MIX], 0.0f, 1.0f);
	const float subMix = pt2ClampFloat(pt2SynthParams[PT2_PARAM_SUB_MIX], 0.0f, 1.0f);
	const float noiseMix = pt2ClampFloat(pt2SynthParams[PT2_PARAM_NOISE_MIX], 0.0f, 1.0f);
	const float oversampledRate = sampleRate * 2.0f;
	const float phaseIncA = voice->currentFreq / oversampledRate;
	const float phaseIncB = (voice->currentFreq * (1.0f + (detuneSemitones * 0.03f))) / oversampledRate;
	const float phaseIncSub = (voice->currentFreq * 0.5f) / oversampledRate;
	float accumulated = 0.0f;

	for (int32_t oversample = 0; oversample < 2; oversample++)
	{
		float oscA = pt2Oscillator(voice->phaseA, waveform, pulseWidth);
		float oscB = pt2Oscillator(voice->phaseB, waveform == 0 ? 1 : waveform - 1, pulseWidth);
		float sub = pt2Oscillator(voice->phaseSub, 1, 0.5f);
		float noise = pt2FrandCentered();

		if (pt2SelectedSynth == PT2_SYNTH_ACID303)
		{
			oscB = 0.0f;
			sub = 0.0f;
			noise = 0.0f;
		}

		float sample = (oscA * oscMix)
			+ (oscB * (1.0f - oscMix) * 0.82f)
			+ (sub * subMix * 0.75f)
			+ (noise * noiseMix * 0.35f);

		if (pt2SelectedSynth == PT2_SYNTH_ACID303)
			sample *= 1.0f + (pt2ClampFloat(pt2SynthParams[PT2_PARAM_ACCENT], 0.0f, 1.0f) * voice->velocity * 0.35f);

		const float filtered = pt2VoiceFilter(voice, sample, oversampledRate, envelopeLevel);
		float driven = filtered * (1.0f + (pt2ClampFloat(pt2SynthParams[PT2_PARAM_DRIVE], 0.0f, 1.0f) * 7.5f));
		driven = pt2FastTanh(driven);
		accumulated += driven;

		voice->phaseA += phaseIncA;
		voice->phaseB += phaseIncB;
		voice->phaseSub += phaseIncSub;

		voice->phaseA -= floorf(voice->phaseA);
		voice->phaseB -= floorf(voice->phaseB);
		voice->phaseSub -= floorf(voice->phaseSub);
	}

	accumulated *= 0.5f;
	accumulated *= envelopeLevel * (0.4f + (voice->velocity * 0.6f));
	return accumulated;
}

static void pt2ApplyFx(float dry, float *left, float *right, float sampleRate)
{
	const float chorusDepth = pt2ClampFloat(pt2SynthParams[PT2_PARAM_CHORUS_DEPTH], 0.0f, 1.0f);
	const float chorusMix = pt2ClampFloat(pt2SynthParams[PT2_PARAM_CHORUS_MIX], 0.0f, 1.0f);
	const float delayTimeSeconds = pt2ClampFloat(pt2SynthParams[PT2_PARAM_DELAY_TIME], 0.02f, 0.8f);
	const float delayFeedback = pt2ClampFloat(pt2SynthParams[PT2_PARAM_DELAY_FEEDBACK], 0.0f, 0.92f);
	const float delayMix = pt2ClampFloat(pt2SynthParams[PT2_PARAM_DELAY_MIX], 0.0f, 1.0f);

	pt2ChorusBufferL[pt2ChorusWritePos] = dry;
	pt2ChorusBufferR[pt2ChorusWritePos] = dry;

	const float chorusMod = (sinf(pt2ChorusPhase) * 0.5f) + 0.5f;
	const float chorusDepthSamples = 180.0f + (chorusDepth * 760.0f);
	const int32_t chorusDelayL = 120 + (int32_t)(chorusDepthSamples * chorusMod);
	const int32_t chorusDelayR = 120 + (int32_t)(chorusDepthSamples * (1.0f - chorusMod));
	int32_t chorusReadL = pt2ChorusWritePos - chorusDelayL;
	int32_t chorusReadR = pt2ChorusWritePos - chorusDelayR;
	while (chorusReadL < 0)
		chorusReadL += PT2_SYNTH_CHORUS_BUFFER;
	while (chorusReadR < 0)
		chorusReadR += PT2_SYNTH_CHORUS_BUFFER;
	const float chorusSampleL = pt2ChorusBufferL[chorusReadL];
	const float chorusSampleR = pt2ChorusBufferR[chorusReadR];
	pt2ChorusWritePos = (pt2ChorusWritePos + 1) % PT2_SYNTH_CHORUS_BUFFER;

	const int32_t delaySamples = pt2ClampInt32((int32_t)(delayTimeSeconds * sampleRate), 64, PT2_SYNTH_DELAY_BUFFER - 1);
	int32_t delayRead = pt2DelayWritePos - delaySamples;
	while (delayRead < 0)
		delayRead += PT2_SYNTH_DELAY_BUFFER;

	const float delayedL = pt2DelayBufferL[delayRead];
	const float delayedR = pt2DelayBufferR[delayRead];
	pt2DelayBufferL[pt2DelayWritePos] = dry + (delayedL * delayFeedback);
	pt2DelayBufferR[pt2DelayWritePos] = dry + (delayedR * delayFeedback);
	pt2DelayWritePos = (pt2DelayWritePos + 1) % PT2_SYNTH_DELAY_BUFFER;

	const float dryMix = pt2ClampFloat(1.0f - (0.35f * chorusMix) - (0.45f * delayMix), 0.25f, 1.0f);
	*left = (dry * dryMix)
		+ (chorusSampleL * chorusMix)
		+ (delayedL * delayMix);
	*right = (dry * dryMix)
		+ (chorusSampleR * chorusMix)
		+ (delayedR * delayMix);
}

static void pt2RenderFrames(int32_t frames, float sampleRate, float *destination)
{
	frames = pt2ClampInt32(frames, 0, PT2_SYNTH_MAX_PREVIEW_FRAMES);
	const float lfoRate = pt2ClampFloat(pt2SynthParams[PT2_PARAM_LFO_RATE], 0.0f, 18.0f);
	const float masterGain = pt2ClampFloat(pt2SynthParams[PT2_PARAM_MASTER_GAIN], 0.0f, 1.25f);

	for (int32_t i = 0; i < frames; i++)
	{
		float dry = 0.0f;
		for (int32_t voiceIndex = 0; voiceIndex < PT2_SYNTH_MAX_VOICES; voiceIndex++)
			dry += pt2RenderVoice(&pt2SynthVoices[voiceIndex], sampleRate);

		float left = 0.0f;
		float right = 0.0f;
		pt2ApplyFx(dry, &left, &right, sampleRate);

		left = pt2ClampFloat(left * masterGain, -1.0f, 1.0f);
		right = pt2ClampFloat(right * masterGain, -1.0f, 1.0f);

		destination[(i * 2) + 0] = left;
		destination[(i * 2) + 1] = right;

		pt2LfoPhase += (2.0f * (float)M_PI * lfoRate) / sampleRate;
		pt2ChorusPhase += (2.0f * (float)M_PI * 0.23f) / sampleRate;
		if (pt2LfoPhase > 2.0f * (float)M_PI)
			pt2LfoPhase -= 2.0f * (float)M_PI;
		if (pt2ChorusPhase > 2.0f * (float)M_PI)
			pt2ChorusPhase -= 2.0f * (float)M_PI;
	}

	pt2PreviewLength = frames * 2;
}

int32_t pt2_synth_boot(void)
{
	pt2_synth_reset();
	return 1;
}

void pt2_synth_reset(void)
{
	pt2PanicVoices();
	pt2ClearFxState();
	pt2PreviewLength = 0;
	pt2RenderedSampleLength = 0;
	pt2SetDefaultPatch(PT2_SYNTH_CORE_SUB);
}

void pt2_synth_set_synth(int32_t synthId)
{
	if (synthId != PT2_SYNTH_ACID303)
		synthId = PT2_SYNTH_CORE_SUB;

	pt2PanicVoices();
	pt2ClearFxState();
	pt2SetDefaultPatch(synthId);
}

void pt2_synth_set_param(int32_t paramId, float value)
{
	if (paramId < 0 || paramId >= PT2_PARAM_COUNT)
		return;

	pt2SynthParams[paramId] = value;
}

void pt2_synth_note_on(int32_t midiNote, float velocity)
{
	midiNote = pt2ClampInt32(midiNote, 24, 96);
	velocity = pt2ClampFloat(velocity, 0.05f, 1.0f);
	pt2SynthVoice_t *voice = pt2AllocateVoice(midiNote, velocity);
	voice->active = true;
}

void pt2_synth_note_off(int32_t midiNote)
{
	for (int32_t i = 0; i < PT2_SYNTH_MAX_VOICES; i++)
	{
		pt2SynthVoice_t *voice = &pt2SynthVoices[i];
		if (voice->active && voice->midiNote == midiNote)
		{
			voice->held = false;
			voice->envStage = PT2_ENV_RELEASE;
			if (pt2SelectedSynth == PT2_SYNTH_ACID303)
				break;
		}
	}
}

void pt2_synth_panic(void)
{
	pt2PanicVoices();
	pt2ClearFxState();
}

void pt2_synth_render_preview(int32_t frames, int32_t sampleRate)
{
	sampleRate = pt2ClampInt32(sampleRate, 22050, 96000);
	pt2RenderFrames(frames, (float)sampleRate, pt2PreviewBuffer);
}

const float *pt2_synth_preview_buffer(void)
{
	return pt2PreviewBuffer;
}

int32_t pt2_synth_preview_buffer_length(void)
{
	return pt2PreviewLength;
}

void pt2_synth_render_sample(int32_t midiNote, float velocity, float durationSeconds, float tailSeconds, int32_t sampleRate, int32_t normalize, int32_t fadeOut)
{
	sampleRate = pt2ClampInt32(sampleRate, 8000, 96000);
	durationSeconds = pt2ClampFloat(durationSeconds, 0.05f, 6.0f);
	tailSeconds = pt2ClampFloat(tailSeconds, 0.0f, 4.0f);

	int32_t noteFrames = (int32_t)(durationSeconds * sampleRate);
	int32_t tailFrames = (int32_t)(tailSeconds * sampleRate);
	int32_t totalFrames = pt2ClampInt32(noteFrames + tailFrames, 1, PT2_SYNTH_MAX_RENDER_SAMPLES);

	pt2_synth_panic();
	pt2_synth_note_on(midiNote, velocity);

	float peak = 0.0001f;
	for (int32_t frame = 0; frame < totalFrames; frame++)
	{
		if (frame == noteFrames)
			pt2_synth_note_off(midiNote);

		pt2RenderFrames(1, (float)sampleRate, pt2PreviewBuffer);
		float mono = (pt2PreviewBuffer[0] + pt2PreviewBuffer[1]) * 0.5f;
		if (fabsf(mono) > peak)
			peak = fabsf(mono);

		pt2RenderedSample[frame] = (int8_t)pt2ClampInt32((int32_t)lrintf(mono * 127.0f), -128, 127);
	}

	pt2RenderedSampleLength = totalFrames;
	if (normalize != 0 && peak > 0.0001f)
	{
		const float gain = 0.92f / peak;
		for (int32_t i = 0; i < pt2RenderedSampleLength; i++)
		{
			const float normalized = ((float)pt2RenderedSample[i] / 127.0f) * gain;
			pt2RenderedSample[i] = (int8_t)pt2ClampInt32((int32_t)lrintf(normalized * 127.0f), -128, 127);
		}
	}

	if (fadeOut != 0 && pt2RenderedSampleLength > 16)
	{
		const int32_t fadeLength = pt2ClampInt32(pt2RenderedSampleLength / 10, 16, 4096);
		const int32_t start = pt2RenderedSampleLength - fadeLength;
		for (int32_t i = 0; i < fadeLength; i++)
		{
			const float gain = 1.0f - ((float)i / (float)fadeLength);
			const int32_t index = start + i;
			pt2RenderedSample[index] = (int8_t)pt2ClampInt32((int32_t)lrintf((float)pt2RenderedSample[index] * gain), -128, 127);
		}
	}

	pt2_synth_panic();
}

const int8_t *pt2_synth_sample_buffer(void)
{
	return pt2RenderedSample;
}

int32_t pt2_synth_sample_buffer_length(void)
{
	return pt2RenderedSampleLength;
}
