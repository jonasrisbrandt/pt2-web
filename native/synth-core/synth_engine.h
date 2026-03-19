#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "synth_dsp.h"

#define PT2_SYNTH_MAX_VOICES 8
#define PT2_SYNTH_MAX_PREVIEW_FRAMES 2048
#define PT2_SYNTH_MAX_RENDER_SAMPLES 524288
#define PT2_SYNTH_DELAY_BUFFER 131072
#define PT2_SYNTH_CHORUS_BUFFER 8192
#define PT2_SYNTH_TELEMETRY_POINTS 96
#define PT2_SYNTH_TELEMETRY_TAP_COUNT 7
#define PT2_SYNTH_TELEMETRY_CURVE_COUNT 4
#define PT2_SYNTH_TELEMETRY_HEADER_SIZE 16
#define PT2_SYNTH_TELEMETRY_BUFFER_LENGTH \
	(PT2_SYNTH_TELEMETRY_HEADER_SIZE + (PT2_SYNTH_TELEMETRY_TAP_COUNT * PT2_SYNTH_TELEMETRY_POINTS) + (PT2_SYNTH_TELEMETRY_CURVE_COUNT * PT2_SYNTH_TELEMETRY_POINTS))

enum
{
	PT2_SYNTH_CORE_SUB = 0,
	PT2_SYNTH_ACID303 = 1
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
	PT2_TAP_OSC_A = 0,
	PT2_TAP_OSC_B = 1,
	PT2_TAP_MIX = 2,
	PT2_TAP_FILTER = 3,
	PT2_TAP_DRIVE = 4,
	PT2_TAP_AMP = 5,
	PT2_TAP_MASTER = 6
};

typedef struct pt2SynthVoice_t
{
	bool active;
	bool held;
	bool acidLegato;
	int32_t midiNote;
	float velocity;
	float currentFreq;
	float targetFreq;
	float phaseA;
	float phaseB;
	float phaseSub;
	float triStateA;
	float triStateB;
	float triStateSub;
	float acidAccent;
	float acidAmpRelease;
	pt2Envelope_t ampEnv;
	pt2SvfState_t filter;
	pt2DecayEnv_t acidMainEnv;
	pt2AcidFilterState_t acidFilter;
	pt2OnePoleState_t acidEnvShape1;
	pt2OnePoleState_t acidEnvShape2;
	pt2OnePoleState_t acidPreHighpass;
	pt2OnePoleState_t acidPostHighpass;
	pt2OnePoleState_t acidAllpass;
	pt2OnePoleState_t acidAmpSmoother;
	pt2BiquadState_t acidNotch;
} pt2SynthVoice_t;

typedef struct pt2SynthEngine_t
{
	int32_t selectedSynth;
	float params[PT2_PARAM_COUNT];
	pt2Smooth1_t smoothers[PT2_PARAM_COUNT];
	float previewBuffer[PT2_SYNTH_MAX_PREVIEW_FRAMES * 2];
	int32_t previewLength;
	float renderedMono[PT2_SYNTH_MAX_RENDER_SAMPLES];
	int8_t renderedSample[PT2_SYNTH_MAX_RENDER_SAMPLES];
	int32_t renderedSampleLength;
	pt2SynthVoice_t voices[PT2_SYNTH_MAX_VOICES];
	float delayBufferL[PT2_SYNTH_DELAY_BUFFER];
	float delayBufferR[PT2_SYNTH_DELAY_BUFFER];
	float chorusBufferL[PT2_SYNTH_CHORUS_BUFFER];
	float chorusBufferR[PT2_SYNTH_CHORUS_BUFFER];
	int32_t delayWritePos;
	int32_t chorusWritePos;
	uint32_t noiseState;
	uint32_t ditherState;
	float lfoPhase;
	float chorusPhase;
	pt2DcBlockState_t masterDcBlock;
	int32_t focusedVoiceIndex;
	float lastSampleRate;
	float lastPeak;
	float lastCutoffNorm;
	float lastResonance;
	float lastAmpEnv;
	float lastFilterEnv;
	float lastLfo;
	float lastDrive;
	float tapHistory[PT2_SYNTH_TELEMETRY_TAP_COUNT][PT2_SYNTH_TELEMETRY_POINTS];
	int32_t tapWritePos;
	uint32_t telemetryVersion;
	int32_t acidHeldNotes[PT2_SYNTH_MAX_VOICES];
	float acidHeldVelocities[PT2_SYNTH_MAX_VOICES];
	int32_t acidHeldCount;
} pt2SynthEngine_t;

void pt2_synth_engine_boot(pt2SynthEngine_t *engine);
void pt2_synth_engine_reset(pt2SynthEngine_t *engine);
void pt2_synth_engine_set_synth(pt2SynthEngine_t *engine, int32_t synth_id);
void pt2_synth_engine_set_param(pt2SynthEngine_t *engine, int32_t param_id, float value);
void pt2_synth_engine_note_on(pt2SynthEngine_t *engine, int32_t midi_note, float velocity);
void pt2_synth_engine_note_off(pt2SynthEngine_t *engine, int32_t midi_note);
void pt2_synth_engine_panic(pt2SynthEngine_t *engine);
void pt2_synth_engine_render_preview(pt2SynthEngine_t *engine, int32_t frames, int32_t sample_rate);
void pt2_synth_engine_render_sample(
	pt2SynthEngine_t *engine,
	int32_t midi_note,
	float velocity,
	float duration_seconds,
	float tail_seconds,
	int32_t sample_rate,
	int32_t normalize,
	int32_t fade_out);
void pt2_synth_engine_fill_telemetry(const pt2SynthEngine_t *engine, float *buffer, int32_t length);
