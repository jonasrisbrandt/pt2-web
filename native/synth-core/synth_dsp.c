#include <math.h>

#include "synth_dsp.h"

float pt2_clamp_float(float value, float low, float high)
{
	if (value < low)
		return low;

	if (value > high)
		return high;

	return value;
}

int32_t pt2_clamp_int32(int32_t value, int32_t low, int32_t high)
{
	if (value < low)
		return low;

	if (value > high)
		return high;

	return value;
}

float pt2_midi_to_freq(int32_t midi_note)
{
	return 440.0f * powf(2.0f, ((float)midi_note - 69.0f) / 12.0f);
}

float pt2_rng_signed(uint32_t *state)
{
	*state = (*state * 1664525u) + 1013904223u;
	return ((float)((*state >> 8) & 0xFFFFu) / 32767.5f) - 1.0f;
}

float pt2_rng_uniform(uint32_t *state)
{
	*state = (*state * 1664525u) + 1013904223u;
	return (float)((*state >> 8) & 0xFFFFu) / 65535.0f;
}

float pt2_tpdf_dither(uint32_t *state)
{
	return pt2_rng_uniform(state) - pt2_rng_uniform(state);
}

void pt2_smooth1_init(pt2Smooth1_t *smoother, float value, float tau_seconds, float sample_rate)
{
	if (tau_seconds < 1e-6f)
		tau_seconds = 1e-6f;

	smoother->z = value;
	smoother->a = expf(-1.0f / (tau_seconds * sample_rate));
}

float pt2_smooth1_process(pt2Smooth1_t *smoother, float target)
{
	smoother->z = target + (smoother->a * (smoother->z - target));
	return smoother->z;
}

void pt2_env_reset(pt2Envelope_t *env)
{
	env->level = 0.0f;
	env->stage = PT2_ENV_IDLE;
}

void pt2_env_note_on(pt2Envelope_t *env)
{
	env->stage = PT2_ENV_ATTACK;
}

void pt2_env_note_off(pt2Envelope_t *env)
{
	if (env->stage != PT2_ENV_IDLE)
		env->stage = PT2_ENV_RELEASE;
}

float pt2_env_process(
	pt2Envelope_t *env,
	float attack_seconds,
	float decay_seconds,
	float sustain_level,
	float release_seconds,
	float sample_rate)
{
	switch (env->stage)
	{
		case PT2_ENV_ATTACK:
			env->level += 1.0f / (attack_seconds * sample_rate);
			if (env->level >= 1.0f)
			{
				env->level = 1.0f;
				env->stage = PT2_ENV_DECAY;
			}
		break;

		case PT2_ENV_DECAY:
			env->level -= (1.0f - sustain_level) / (decay_seconds * sample_rate);
			if (env->level <= sustain_level)
			{
				env->level = sustain_level;
				env->stage = PT2_ENV_SUSTAIN;
			}
		break;

		case PT2_ENV_SUSTAIN:
			env->level = sustain_level;
		break;

		case PT2_ENV_RELEASE:
			env->level -= 1.0f / (release_seconds * sample_rate);
			if (env->level <= 0.0f)
			{
				env->level = 0.0f;
				env->stage = PT2_ENV_IDLE;
			}
		break;

		default:
			env->level = 0.0f;
		break;
	}

	return env->level;
}

float pt2_poly_blep(float t, float dt)
{
	if (t < dt)
	{
		t /= dt;
		return t + t - (t * t) - 1.0f;
	}

	if (t > 1.0f - dt)
	{
		t = (t - 1.0f) / dt;
		return (t * t) + t + t + 1.0f;
	}

	return 0.0f;
}

float pt2_osc_saw_polyblep(float phase, float dt)
{
	float sample = (2.0f * phase) - 1.0f;
	sample -= pt2_poly_blep(phase, dt);
	return sample;
}

float pt2_osc_pulse_polyblep(float phase, float dt, float pulse_width)
{
	float sample = (phase < pulse_width) ? 1.0f : -1.0f;
	float second_edge = phase - pulse_width;
	if (second_edge < 0.0f)
		second_edge += 1.0f;

	sample += pt2_poly_blep(phase, dt);
	sample -= pt2_poly_blep(second_edge, dt);
	return sample;
}

float pt2_osc_tri_polyblep(float phase, float dt, float pulse_width, float *integrator_state)
{
	const float leak = 0.995f;
	const float square = pt2_osc_pulse_polyblep(phase, dt, pulse_width);
	*integrator_state = (leak * *integrator_state) + (square * dt * 4.0f);
	return pt2_clamp_float(*integrator_state, -1.0f, 1.0f);
}

void pt2_svf_reset(pt2SvfState_t *state)
{
	state->ic1eq = 0.0f;
	state->ic2eq = 0.0f;
}

void pt2_svf_set(float cutoff_hz, float resonance, float sample_rate, float *g, float *k)
{
	const float q = 0.55f + ((1.0f - pt2_clamp_float(resonance, 0.0f, 0.97f)) * 15.0f);
	const float nyquist = sample_rate * 0.49f;
	cutoff_hz = pt2_clamp_float(cutoff_hz, 12.0f, nyquist);
	*g = tanf((float)M_PI * cutoff_hz / sample_rate);
	*k = 1.0f / q;
}

void pt2_svf_process(
	pt2SvfState_t *state,
	float g,
	float k,
	float input,
	float *lowpass,
	float *bandpass,
	float *highpass)
{
	const float a1 = 1.0f / (1.0f + (g * (g + k)));
	const float a2 = g * a1;
	const float a3 = g * a2;
	const float v3 = input - state->ic2eq;
	const float v1 = (a1 * state->ic1eq) + (a2 * v3);
	const float v2 = state->ic2eq + (a2 * state->ic1eq) + (a3 * v3);

	*highpass = input - (k * v1) - v2;
	*bandpass = v1;
	*lowpass = v2;

	state->ic1eq = (2.0f * v1) - state->ic1eq;
	state->ic2eq = (2.0f * v2) - state->ic2eq;
}

float pt2_dc_block_process(pt2DcBlockState_t *state, float input)
{
	const float r = 0.995f;
	const float output = input - state->x1 + (r * state->y1);
	state->x1 = input;
	state->y1 = output;
	return output;
}

float pt2_delay_read_linear(const float *buffer, int32_t size, int32_t write_pos, float delay_samples)
{
	float read_pos = (float)write_pos - delay_samples;
	while (read_pos < 0.0f)
		read_pos += (float)size;

	{
		const int32_t base_index = ((int32_t)read_pos) % size;
		const int32_t next_index = (base_index + 1) % size;
		const float frac = read_pos - floorf(read_pos);
		const float a = buffer[base_index];
		const float b = buffer[next_index];
		return a + ((b - a) * frac);
	}
}
