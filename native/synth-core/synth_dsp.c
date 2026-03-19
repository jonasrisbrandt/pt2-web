#include <math.h>

#include "synth_dsp.h"

static float pt2_fast_exp_cutoff(float cutoff_hz, float sample_rate)
{
	return expf(-2.0f * (float)M_PI * cutoff_hz / sample_rate);
}

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

float pt2_osc_saw303(float phase, float dt)
{
	return -pt2_osc_saw_polyblep(phase, dt);
}

float pt2_osc_square303(float phase, float dt)
{
	float shifted_phase = phase + 0.525f;
	float saw;

	if (shifted_phase >= 1.0f)
		shifted_phase -= 1.0f;

	saw = pt2_osc_saw303(shifted_phase, dt);
	return -tanhf((4.0f * saw) + 1.9f);
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

void pt2_decay_env_reset(pt2DecayEnv_t *env)
{
	env->level = 0.0f;
	env->coeff = 0.0f;
}

void pt2_decay_env_trigger(pt2DecayEnv_t *env, float decay_ms, float sample_rate)
{
	decay_ms = pt2_clamp_float(decay_ms, 0.05f, 4000.0f);
	env->coeff = expf(-1.0f / (0.001f * decay_ms * sample_rate));
	env->level = 1.0f;
}

float pt2_decay_env_process(pt2DecayEnv_t *env)
{
	env->level *= env->coeff;
	return env->level;
}

void pt2_onepole_reset(pt2OnePoleState_t *state)
{
	state->b0 = 1.0f;
	state->b1 = 0.0f;
	state->a1 = 0.0f;
	state->x1 = 0.0f;
	state->y1 = 0.0f;
}

void pt2_onepole_set_lowpass(pt2OnePoleState_t *state, float cutoff_hz, float sample_rate)
{
	const float x = pt2_fast_exp_cutoff(pt2_clamp_float(cutoff_hz, 1.0f, sample_rate * 0.45f), sample_rate);
	state->b0 = 1.0f - x;
	state->b1 = 0.0f;
	state->a1 = x;
}

void pt2_onepole_set_highpass(pt2OnePoleState_t *state, float cutoff_hz, float sample_rate)
{
	const float x = pt2_fast_exp_cutoff(pt2_clamp_float(cutoff_hz, 1.0f, sample_rate * 0.45f), sample_rate);
	state->b0 = 0.5f * (1.0f + x);
	state->b1 = -state->b0;
	state->a1 = x;
}

void pt2_onepole_set_allpass(pt2OnePoleState_t *state, float cutoff_hz, float sample_rate)
{
	const float t = tanf((float)M_PI * pt2_clamp_float(cutoff_hz, 1.0f, sample_rate * 0.45f) / sample_rate);
	const float x = (t - 1.0f) / (t + 1.0f);
	state->b0 = x;
	state->b1 = 1.0f;
	state->a1 = -x;
}

float pt2_onepole_process(pt2OnePoleState_t *state, float input)
{
	const float output = (state->b0 * input) + (state->b1 * state->x1) + (state->a1 * state->y1);
	state->x1 = input;
	state->y1 = output;
	return output;
}

void pt2_biquad_reset(pt2BiquadState_t *state)
{
	state->b0 = 1.0f;
	state->b1 = 0.0f;
	state->b2 = 0.0f;
	state->a1 = 0.0f;
	state->a2 = 0.0f;
	state->x1 = 0.0f;
	state->x2 = 0.0f;
	state->y1 = 0.0f;
	state->y2 = 0.0f;
}

void pt2_biquad_set_notch(pt2BiquadState_t *state, float frequency_hz, float bandwidth_octaves, float sample_rate)
{
	const float w = 2.0f * (float)M_PI * pt2_clamp_float(frequency_hz, 1.0f, sample_rate * 0.45f) / sample_rate;
	const float s = sinf(w);
	const float c = cosf(w);
	const float alpha = s * sinhf(0.5f * logf(2.0f) * pt2_clamp_float(bandwidth_octaves, 0.01f, 8.0f) * w / pt2_clamp_float(s, 1.0e-5f, 1.0f));
	const float scale = 1.0f / (1.0f + alpha);

	state->a1 = 2.0f * c * scale;
	state->a2 = (alpha - 1.0f) * scale;
	state->b0 = scale;
	state->b1 = -2.0f * c * scale;
	state->b2 = scale;
}

float pt2_biquad_process(pt2BiquadState_t *state, float input)
{
	const float output = (state->b0 * input) + (state->b1 * state->x1) + (state->b2 * state->x2) + (state->a1 * state->y1) + (state->a2 * state->y2);
	state->x2 = state->x1;
	state->x1 = input;
	state->y2 = state->y1;
	state->y1 = output;
	return output;
}

void pt2_acid_filter_reset(pt2AcidFilterState_t *state)
{
	state->y1 = 0.0f;
	state->y2 = 0.0f;
	state->y3 = 0.0f;
	state->y4 = 0.0f;
	pt2_onepole_reset(&state->feedbackHighpass);
}

void pt2_acid_filter_set_feedback_highpass(pt2AcidFilterState_t *state, float cutoff_hz, float sample_rate)
{
	pt2_onepole_set_highpass(&state->feedbackHighpass, cutoff_hz, sample_rate);
}

float pt2_acid_filter_process(pt2AcidFilterState_t *state, float input, float cutoff_hz, float resonance, float sample_rate)
{
	const float wc = (2.0f * (float)M_PI * pt2_clamp_float(cutoff_hz, 40.0f, sample_rate * 0.20f)) / sample_rate;
	const float wc2 = wc * wc;
	const float r = (1.0f - expf(-3.0f * pt2_clamp_float(resonance, 0.0f, 0.99f))) / (1.0f - expf(-3.0f));
	float tmp;
	float b0;
	float k;
	float g;
	float fx;
	float y0;

	tmp = (wc2 * -0.013412813f) + (0.081687391f * wc) - 0.236503676f;
	tmp = (wc2 * tmp) + (0.443973959f * wc) - 0.629735112f;
	tmp = (wc2 * tmp) + (0.752969146f * wc) - 0.824988246f;
	tmp = (wc2 * tmp) + (0.873641908f * wc) - 0.916458011f;
	tmp = (wc2 * tmp) + (0.958319247f * wc) - 0.999999523f;
	tmp = (wc2 * tmp) + (1.0f * wc) - 1.0f;
	b0 = 1.0f + tmp;

	fx = wc * 0.11253954f;
	b0 = (0.00045522346f + (6.1922188f * fx)) / (1.0f + (12.358354f * fx) + (4.4156346f * fx * fx));
	k = fx * (fx * (fx * (fx * (fx * (fx + 7198.6997f) - 5837.7915f) - 476.47308f) + 614.95612f) + 213.87126f) + 16.998793f;
	g = k * 0.05882353f;
	g = ((g - 1.0f) * r) + 1.0f;
	g = g * (1.0f + r);
	k *= r;

	y0 = input - pt2_onepole_process(&state->feedbackHighpass, k * state->y4);
	state->y1 += 2.0f * b0 * (y0 - state->y1 + state->y2);
	state->y2 += b0 * (state->y1 - (2.0f * state->y2) + state->y3);
	state->y3 += b0 * (state->y2 - (2.0f * state->y3) + state->y4);
	state->y4 += b0 * (state->y3 - (2.0f * state->y4));
	return 2.0f * g * state->y4;
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
