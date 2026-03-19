#pragma once

#include <stdint.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

typedef struct pt2Smooth1_t
{
	float z;
	float a;
} pt2Smooth1_t;

typedef struct pt2Envelope_t
{
	float level;
	int32_t stage;
} pt2Envelope_t;

typedef struct pt2SvfState_t
{
	float ic1eq;
	float ic2eq;
} pt2SvfState_t;

typedef struct pt2DcBlockState_t
{
	float x1;
	float y1;
} pt2DcBlockState_t;

enum
{
	PT2_ENV_IDLE = 0,
	PT2_ENV_ATTACK = 1,
	PT2_ENV_DECAY = 2,
	PT2_ENV_SUSTAIN = 3,
	PT2_ENV_RELEASE = 4
};

float pt2_clamp_float(float value, float low, float high);
int32_t pt2_clamp_int32(int32_t value, int32_t low, int32_t high);
float pt2_midi_to_freq(int32_t midi_note);
float pt2_rng_signed(uint32_t *state);
float pt2_rng_uniform(uint32_t *state);
float pt2_tpdf_dither(uint32_t *state);
void pt2_smooth1_init(pt2Smooth1_t *smoother, float value, float tau_seconds, float sample_rate);
float pt2_smooth1_process(pt2Smooth1_t *smoother, float target);
void pt2_env_reset(pt2Envelope_t *env);
void pt2_env_note_on(pt2Envelope_t *env);
void pt2_env_note_off(pt2Envelope_t *env);
float pt2_env_process(
	pt2Envelope_t *env,
	float attack_seconds,
	float decay_seconds,
	float sustain_level,
	float release_seconds,
	float sample_rate);
float pt2_poly_blep(float t, float dt);
float pt2_osc_saw_polyblep(float phase, float dt);
float pt2_osc_pulse_polyblep(float phase, float dt, float pulse_width);
float pt2_osc_tri_polyblep(float phase, float dt, float pulse_width, float *integrator_state);
void pt2_svf_reset(pt2SvfState_t *state);
void pt2_svf_set(float cutoff_hz, float resonance, float sample_rate, float *g, float *k);
void pt2_svf_process(
	pt2SvfState_t *state,
	float g,
	float k,
	float input,
	float *lowpass,
	float *bandpass,
	float *highpass);
float pt2_dc_block_process(pt2DcBlockState_t *state, float input);
float pt2_delay_read_linear(const float *buffer, int32_t size, int32_t write_pos, float delay_samples);
