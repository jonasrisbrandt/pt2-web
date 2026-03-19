#include <math.h>
#include <string.h>

#include "synth_engine.h"

static bool pt2_param_is_smoothed(int32_t param_id)
{
	return param_id != PT2_PARAM_WAVEFORM && param_id != PT2_PARAM_ACCENT;
}

static void pt2_voice_reset(pt2SynthVoice_t *voice)
{
	memset(voice, 0, sizeof (*voice));
	pt2_env_reset(&voice->ampEnv);
	pt2_svf_reset(&voice->filter);
}

static void pt2_clear_fx_state(pt2SynthEngine_t *engine)
{
	memset(engine->delayBufferL, 0, sizeof (engine->delayBufferL));
	memset(engine->delayBufferR, 0, sizeof (engine->delayBufferR));
	memset(engine->chorusBufferL, 0, sizeof (engine->chorusBufferL));
	memset(engine->chorusBufferR, 0, sizeof (engine->chorusBufferR));
	engine->delayWritePos = 0;
	engine->chorusWritePos = 0;
	engine->lfoPhase = 0.0f;
	engine->chorusPhase = 0.0f;
	engine->masterDcBlock.x1 = 0.0f;
	engine->masterDcBlock.y1 = 0.0f;
}

static void pt2_panic_voices(pt2SynthEngine_t *engine)
{
	int32_t i;
	for (i = 0; i < PT2_SYNTH_MAX_VOICES; ++i)
		pt2_voice_reset(&engine->voices[i]);

	engine->focusedVoiceIndex = 0;
}

static void pt2_set_default_patch(pt2SynthEngine_t *engine, int32_t synth_id)
{
	int32_t param_id;

	memset(engine->params, 0, sizeof (engine->params));
	engine->selectedSynth = synth_id;

	engine->params[PT2_PARAM_MASTER_GAIN] = 0.72f;
	engine->params[PT2_PARAM_WAVEFORM] = (synth_id == PT2_SYNTH_ACID303) ? 0.0f : 1.0f;
	engine->params[PT2_PARAM_AMP_ATTACK] = 0.006f;
	engine->params[PT2_PARAM_AMP_DECAY] = (synth_id == PT2_SYNTH_ACID303) ? 0.18f : 0.22f;
	engine->params[PT2_PARAM_AMP_SUSTAIN] = (synth_id == PT2_SYNTH_ACID303) ? 0.05f : 0.62f;
	engine->params[PT2_PARAM_AMP_RELEASE] = (synth_id == PT2_SYNTH_ACID303) ? 0.12f : 0.28f;
	engine->params[PT2_PARAM_FILTER_CUTOFF] = (synth_id == PT2_SYNTH_ACID303) ? 0.42f : 0.68f;
	engine->params[PT2_PARAM_FILTER_RESONANCE] = (synth_id == PT2_SYNTH_ACID303) ? 0.74f : 0.22f;
	engine->params[PT2_PARAM_FILTER_ENV_AMOUNT] = (synth_id == PT2_SYNTH_ACID303) ? 0.85f : 0.28f;
	engine->params[PT2_PARAM_DRIVE] = (synth_id == PT2_SYNTH_ACID303) ? 0.48f : 0.18f;
	engine->params[PT2_PARAM_OSC_MIX] = (synth_id == PT2_SYNTH_ACID303) ? 1.0f : 0.72f;
	engine->params[PT2_PARAM_SUB_MIX] = (synth_id == PT2_SYNTH_ACID303) ? 0.0f : 0.44f;
	engine->params[PT2_PARAM_NOISE_MIX] = (synth_id == PT2_SYNTH_ACID303) ? 0.0f : 0.06f;
	engine->params[PT2_PARAM_DETUNE] = (synth_id == PT2_SYNTH_ACID303) ? 0.0f : 0.12f;
	engine->params[PT2_PARAM_LFO_RATE] = 3.6f;
	engine->params[PT2_PARAM_LFO_AMOUNT] = (synth_id == PT2_SYNTH_ACID303) ? 0.03f : 0.16f;
	engine->params[PT2_PARAM_DELAY_TIME] = (synth_id == PT2_SYNTH_ACID303) ? 0.26f : 0.33f;
	engine->params[PT2_PARAM_DELAY_FEEDBACK] = (synth_id == PT2_SYNTH_ACID303) ? 0.28f : 0.24f;
	engine->params[PT2_PARAM_DELAY_MIX] = (synth_id == PT2_SYNTH_ACID303) ? 0.12f : 0.18f;
	engine->params[PT2_PARAM_CHORUS_DEPTH] = (synth_id == PT2_SYNTH_ACID303) ? 0.0f : 0.38f;
	engine->params[PT2_PARAM_CHORUS_MIX] = (synth_id == PT2_SYNTH_ACID303) ? 0.0f : 0.20f;
	engine->params[PT2_PARAM_ACCENT] = (synth_id == PT2_SYNTH_ACID303) ? 0.5f : 0.0f;
	engine->params[PT2_PARAM_SLIDE_TIME] = (synth_id == PT2_SYNTH_ACID303) ? 0.12f : 0.0f;
	engine->params[PT2_PARAM_PULSE_WIDTH] = 0.5f;

	for (param_id = 0; param_id < PT2_PARAM_COUNT; ++param_id)
		pt2_smooth1_init(&engine->smoothers[param_id], engine->params[param_id], 0.010f, 48000.0f);
}

static float pt2_map_cutoff_hz(float normalized_cutoff, float sample_rate)
{
	const float minimum_hz = 20.0f;
	const float maximum_hz = pt2_clamp_float(sample_rate * 0.45f, 4000.0f, 18000.0f);
	return minimum_hz * powf(maximum_hz / minimum_hz, pt2_clamp_float(normalized_cutoff, 0.0f, 1.0f));
}

static float pt2_get_param(pt2SynthEngine_t *engine, int32_t param_id)
{
	if (!pt2_param_is_smoothed(param_id))
		return engine->params[param_id];

	return pt2_smooth1_process(&engine->smoothers[param_id], engine->params[param_id]);
}

static void pt2_capture_taps(
	pt2SynthEngine_t *engine,
	float osc_a,
	float osc_b,
	float mix,
	float filtered,
	float driven,
	float amp,
	float master)
{
	engine->tapHistory[PT2_TAP_OSC_A][engine->tapWritePos] = osc_a;
	engine->tapHistory[PT2_TAP_OSC_B][engine->tapWritePos] = osc_b;
	engine->tapHistory[PT2_TAP_MIX][engine->tapWritePos] = mix;
	engine->tapHistory[PT2_TAP_FILTER][engine->tapWritePos] = filtered;
	engine->tapHistory[PT2_TAP_DRIVE][engine->tapWritePos] = driven;
	engine->tapHistory[PT2_TAP_AMP][engine->tapWritePos] = amp;
	engine->tapHistory[PT2_TAP_MASTER][engine->tapWritePos] = master;
	engine->tapWritePos = (engine->tapWritePos + 1) % PT2_SYNTH_TELEMETRY_POINTS;
}

static pt2SynthVoice_t *pt2_allocate_voice(pt2SynthEngine_t *engine, int32_t midi_note, float velocity)
{
	pt2SynthVoice_t *voice = NULL;
	int32_t i;

	if (engine->selectedSynth == PT2_SYNTH_ACID303)
	{
		voice = &engine->voices[0];
		if (voice->active && pt2_clamp_float(engine->params[PT2_PARAM_SLIDE_TIME], 0.0f, 1.5f) > 0.001f)
		{
			voice->targetFreq = pt2_midi_to_freq(midi_note);
			voice->midiNote = midi_note;
			voice->held = true;
			voice->velocity = velocity;
			pt2_env_note_on(&voice->ampEnv);
			engine->focusedVoiceIndex = 0;
			return voice;
		}
	}
	else
	{
		for (i = 0; i < PT2_SYNTH_MAX_VOICES; ++i)
		{
			if (!engine->voices[i].active)
			{
				voice = &engine->voices[i];
				break;
			}
		}
	}

	if (voice == NULL)
		voice = &engine->voices[0];

	pt2_voice_reset(voice);
	voice->active = true;
	voice->held = true;
	voice->midiNote = midi_note;
	voice->velocity = velocity;
	voice->currentFreq = pt2_midi_to_freq(midi_note);
	voice->targetFreq = voice->currentFreq;
	pt2_env_note_on(&voice->ampEnv);
	engine->focusedVoiceIndex = (int32_t)(voice - engine->voices);
	return voice;
}

static float pt2_render_voice(
	pt2SynthEngine_t *engine,
	pt2SynthVoice_t *voice,
	float sample_rate,
	float lfo_value,
	float *focused_osc_a,
	float *focused_osc_b,
	float *focused_mix,
	float *focused_filter,
	float *focused_drive,
	float *focused_amp)
{
	const int32_t oversample = 2;
	const float attack = pt2_clamp_float(engine->params[PT2_PARAM_AMP_ATTACK], 0.001f, 4.0f);
	const float decay = pt2_clamp_float(engine->params[PT2_PARAM_AMP_DECAY], 0.001f, 4.0f);
	const float sustain = pt2_clamp_float(engine->params[PT2_PARAM_AMP_SUSTAIN], 0.0f, 1.0f);
	const float release = pt2_clamp_float(engine->params[PT2_PARAM_AMP_RELEASE], 0.001f, 8.0f);
	const int32_t waveform = pt2_clamp_int32((int32_t)lroundf(engine->params[PT2_PARAM_WAVEFORM]), 0, 2);
	const float pulse_width = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_PULSE_WIDTH), 0.08f, 0.92f);
	const float osc_mix = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_OSC_MIX), 0.0f, 1.0f);
	const float sub_mix = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_SUB_MIX), 0.0f, 1.0f);
	const float noise_mix = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_NOISE_MIX), 0.0f, 1.0f);
	const float detune = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_DETUNE), 0.0f, 0.5f);
	const float drive = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_DRIVE), 0.0f, 1.0f);
	const float cutoff_base = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_FILTER_CUTOFF), 0.02f, 0.98f);
	const float resonance = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_FILTER_RESONANCE), 0.0f, 0.97f);
	const float env_amount = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_FILTER_ENV_AMOUNT), -1.0f, 1.0f);
	const float slide_time = pt2_clamp_float(engine->params[PT2_PARAM_SLIDE_TIME], 0.0f, 2.0f);
	float phase_inc_a;
	float phase_inc_b;
	float phase_inc_sub;
	float env_level;
	float accumulated = 0.0f;
	int32_t step;

	if (!voice->active)
		return 0.0f;

	if (slide_time > 0.0f && fabsf(voice->targetFreq - voice->currentFreq) > 0.001f)
	{
		const float glide = 1.0f - expf(-1.0f / (sample_rate * (slide_time + 0.001f)));
		voice->currentFreq += (voice->targetFreq - voice->currentFreq) * glide;
	}
	else
	{
		voice->currentFreq = voice->targetFreq;
	}

	env_level = pt2_env_process(&voice->ampEnv, attack, decay, sustain, release, sample_rate);
	if (voice->ampEnv.stage == PT2_ENV_IDLE)
	{
		voice->active = false;
		return 0.0f;
	}

	phase_inc_a = voice->currentFreq / (sample_rate * oversample);
	phase_inc_b = (voice->currentFreq * (1.0f + (detune * 0.03f))) / (sample_rate * oversample);
	phase_inc_sub = (voice->currentFreq * 0.5f) / (sample_rate * oversample);

	for (step = 0; step < oversample; ++step)
	{
		float osc_a = 0.0f;
		float osc_b = 0.0f;
		float sub = 0.0f;
		float noise = 0.0f;
		float mixed = 0.0f;
		float cutoff_norm = 0.0f;
		float cutoff_hz = 0.0f;
		float g = 0.0f;
		float k = 0.0f;
		float low = 0.0f;
		float band = 0.0f;
		float high = 0.0f;
		float filtered = 0.0f;
		float driven = 0.0f;

		switch (waveform)
		{
			case 1:
				osc_a = pt2_osc_pulse_polyblep(voice->phaseA, phase_inc_a, pulse_width);
				osc_b = pt2_osc_pulse_polyblep(voice->phaseB, phase_inc_b, pulse_width);
			break;
			case 2:
				osc_a = pt2_osc_tri_polyblep(voice->phaseA, phase_inc_a, 0.5f, &voice->triStateA);
				osc_b = pt2_osc_tri_polyblep(voice->phaseB, phase_inc_b, 0.5f, &voice->triStateB);
			break;
			default:
				osc_a = pt2_osc_saw_polyblep(voice->phaseA, phase_inc_a);
				osc_b = pt2_osc_saw_polyblep(voice->phaseB, phase_inc_b);
			break;
		}

		sub = pt2_osc_pulse_polyblep(voice->phaseSub, phase_inc_sub, 0.5f) * 0.75f;
		noise = pt2_rng_signed(&engine->noiseState) * 0.25f;

		if (engine->selectedSynth == PT2_SYNTH_ACID303)
		{
			osc_b = 0.0f;
			sub = 0.0f;
			noise = 0.0f;
		}

		mixed = (osc_a * osc_mix)
			+ (osc_b * (1.0f - osc_mix) * 0.82f)
			+ (sub * sub_mix)
			+ (noise * noise_mix);

		if (engine->selectedSynth == PT2_SYNTH_ACID303)
		{
			const float accent = pt2_clamp_float(engine->params[PT2_PARAM_ACCENT], 0.0f, 1.0f);
			mixed *= 1.0f + (accent * voice->velocity * 0.35f);
		}

		cutoff_norm = cutoff_base + (((env_level * 2.0f) - 1.0f) * env_amount * 0.35f) + (lfo_value * pt2_clamp_float(engine->params[PT2_PARAM_LFO_AMOUNT], 0.0f, 1.0f) * 0.10f);
		cutoff_norm = pt2_clamp_float(cutoff_norm, 0.01f, 0.99f);
		cutoff_hz = pt2_map_cutoff_hz(cutoff_norm, sample_rate * oversample);
		pt2_svf_set(cutoff_hz, resonance, sample_rate * oversample, &g, &k);
		pt2_svf_process(&voice->filter, g, k, tanhf(mixed), &low, &band, &high);
		filtered = low;
		driven = tanhf(filtered * (1.0f + (drive * 6.0f)));
		accumulated += driven;

		if (((int32_t)(voice - engine->voices)) == engine->focusedVoiceIndex)
		{
			*focused_osc_a = osc_a;
			*focused_osc_b = osc_b;
			*focused_mix = mixed;
			*focused_filter = filtered;
			*focused_drive = driven;
		}

		voice->phaseA += phase_inc_a;
		voice->phaseB += phase_inc_b;
		voice->phaseSub += phase_inc_sub;
		voice->phaseA -= floorf(voice->phaseA);
		voice->phaseB -= floorf(voice->phaseB);
		voice->phaseSub -= floorf(voice->phaseSub);

		engine->lastCutoffNorm = cutoff_norm;
		engine->lastResonance = resonance;
	}

	accumulated *= 0.5f;
	accumulated *= env_level * (0.4f + (voice->velocity * 0.6f));
	*focused_amp = accumulated;
	engine->lastAmpEnv = env_level;
	engine->lastFilterEnv = pt2_clamp_float(0.5f + (((env_level * 2.0f) - 1.0f) * env_amount * 0.5f), 0.0f, 1.0f);
	engine->lastDrive = drive;
	return accumulated;
}

static void pt2_apply_fx(pt2SynthEngine_t *engine, float input, float sample_rate, float *left, float *right)
{
	const float chorus_depth = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_CHORUS_DEPTH), 0.0f, 1.0f);
	const float chorus_mix = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_CHORUS_MIX), 0.0f, 1.0f);
	const float delay_time = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_DELAY_TIME), 0.02f, 0.8f);
	const float delay_feedback = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_DELAY_FEEDBACK), 0.0f, 0.92f);
	const float delay_mix = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_DELAY_MIX), 0.0f, 1.0f);
	const float chorus_base = 24.0f + (chorus_depth * 170.0f);
	const float chorus_mod = (sinf(engine->chorusPhase) * 0.5f) + 0.5f;
	const float chorus_delay_l = chorus_base + (chorus_depth * 24.0f) + (chorus_mod * chorus_depth * 180.0f);
	const float chorus_delay_r = chorus_base + (chorus_depth * 24.0f) + ((1.0f - chorus_mod) * chorus_depth * 180.0f);
	const float delay_samples = pt2_clamp_float(delay_time * sample_rate, 64.0f, (float)(PT2_SYNTH_DELAY_BUFFER - 2));
	const float dry_gain = pt2_clamp_float(1.0f - (0.30f * chorus_mix) - (0.42f * delay_mix), 0.20f, 1.0f);
	float chorus_l;
	float chorus_r;
	float delayed_l;
	float delayed_r;

	engine->chorusBufferL[engine->chorusWritePos] = input;
	engine->chorusBufferR[engine->chorusWritePos] = input;
	chorus_l = pt2_delay_read_linear(engine->chorusBufferL, PT2_SYNTH_CHORUS_BUFFER, engine->chorusWritePos, chorus_delay_l);
	chorus_r = pt2_delay_read_linear(engine->chorusBufferR, PT2_SYNTH_CHORUS_BUFFER, engine->chorusWritePos, chorus_delay_r);
	engine->chorusWritePos = (engine->chorusWritePos + 1) % PT2_SYNTH_CHORUS_BUFFER;

	delayed_l = pt2_delay_read_linear(engine->delayBufferL, PT2_SYNTH_DELAY_BUFFER, engine->delayWritePos, delay_samples);
	delayed_r = pt2_delay_read_linear(engine->delayBufferR, PT2_SYNTH_DELAY_BUFFER, engine->delayWritePos, delay_samples);
	engine->delayBufferL[engine->delayWritePos] = input + (delayed_l * delay_feedback);
	engine->delayBufferR[engine->delayWritePos] = input + (delayed_r * delay_feedback);
	engine->delayWritePos = (engine->delayWritePos + 1) % PT2_SYNTH_DELAY_BUFFER;

	*left = (input * dry_gain) + (chorus_l * chorus_mix) + (delayed_l * delay_mix);
	*right = (input * dry_gain) + (chorus_r * chorus_mix) + (delayed_r * delay_mix);
}

static int32_t pt2_count_active_voices(const pt2SynthEngine_t *engine)
{
	int32_t active = 0;
	int32_t i;
	for (i = 0; i < PT2_SYNTH_MAX_VOICES; ++i)
	{
		if (engine->voices[i].active)
			++active;
	}
	return active;
}

static void pt2_render_frames(pt2SynthEngine_t *engine, int32_t frames, float sample_rate, float *destination)
{
	int32_t frame;

	frames = pt2_clamp_int32(frames, 0, PT2_SYNTH_MAX_PREVIEW_FRAMES);
	engine->lastSampleRate = sample_rate;

	for (frame = 0; frame < frames; ++frame)
	{
		const float master_gain = pt2_clamp_float(pt2_get_param(engine, PT2_PARAM_MASTER_GAIN), 0.0f, 1.25f);
		const float lfo_rate = pt2_clamp_float(engine->params[PT2_PARAM_LFO_RATE], 0.0f, 18.0f);
		const float lfo_value = sinf(engine->lfoPhase);
		float focused_osc_a = 0.0f;
		float focused_osc_b = 0.0f;
		float focused_mix = 0.0f;
		float focused_filter = 0.0f;
		float focused_drive = 0.0f;
		float focused_amp = 0.0f;
		float dry = 0.0f;
		float left = 0.0f;
		float right = 0.0f;
		float mono = 0.0f;
		int32_t voice_index;

		engine->lastLfo = lfo_value;

		for (voice_index = 0; voice_index < PT2_SYNTH_MAX_VOICES; ++voice_index)
		{
			dry += pt2_render_voice(
				engine,
				&engine->voices[voice_index],
				sample_rate,
				lfo_value,
				&focused_osc_a,
				&focused_osc_b,
				&focused_mix,
				&focused_filter,
				&focused_drive,
				&focused_amp);
		}

		pt2_apply_fx(engine, dry, sample_rate, &left, &right);

		left = pt2_dc_block_process(&engine->masterDcBlock, left * master_gain);
		right *= master_gain;
		left = pt2_clamp_float(left, -1.0f, 1.0f);
		right = pt2_clamp_float(right, -1.0f, 1.0f);

		destination[(frame * 2) + 0] = left;
		destination[(frame * 2) + 1] = right;

		mono = (left + right) * 0.5f;
		engine->lastPeak = fmaxf(engine->lastPeak, fabsf(mono));
		pt2_capture_taps(engine, focused_osc_a, focused_osc_b, focused_mix, focused_filter, focused_drive, focused_amp, mono);

		engine->lfoPhase += (2.0f * (float)M_PI * lfo_rate) / sample_rate;
		engine->chorusPhase += (2.0f * (float)M_PI * 0.23f) / sample_rate;
		if (engine->lfoPhase > (2.0f * (float)M_PI))
			engine->lfoPhase -= (2.0f * (float)M_PI);
		if (engine->chorusPhase > (2.0f * (float)M_PI))
			engine->chorusPhase -= (2.0f * (float)M_PI);
	}

	engine->previewLength = frames * 2;
	if (frames > 0)
		engine->telemetryVersion += 1u;
}

void pt2_synth_engine_boot(pt2SynthEngine_t *engine)
{
	memset(engine, 0, sizeof (*engine));
	engine->noiseState = 0x12345678u;
	engine->ditherState = 0x87654321u;
	pt2_synth_engine_reset(engine);
}

void pt2_synth_engine_reset(pt2SynthEngine_t *engine)
{
	pt2_panic_voices(engine);
	pt2_clear_fx_state(engine);
	memset(engine->tapHistory, 0, sizeof (engine->tapHistory));
	engine->tapWritePos = 0;
	engine->previewLength = 0;
	engine->renderedSampleLength = 0;
	engine->lastPeak = 0.0f;
	engine->lastSampleRate = 48000.0f;
	engine->lastCutoffNorm = 0.5f;
	engine->lastResonance = 0.0f;
	engine->lastAmpEnv = 0.0f;
	engine->lastFilterEnv = 0.5f;
	engine->lastLfo = 0.0f;
	engine->lastDrive = 0.0f;
	pt2_set_default_patch(engine, PT2_SYNTH_CORE_SUB);
	engine->telemetryVersion += 1u;
}

void pt2_synth_engine_set_synth(pt2SynthEngine_t *engine, int32_t synth_id)
{
	if (synth_id != PT2_SYNTH_ACID303)
		synth_id = PT2_SYNTH_CORE_SUB;

	pt2_panic_voices(engine);
	pt2_clear_fx_state(engine);
	pt2_set_default_patch(engine, synth_id);
	engine->telemetryVersion += 1u;
}

void pt2_synth_engine_set_param(pt2SynthEngine_t *engine, int32_t param_id, float value)
{
	if (param_id < 0 || param_id >= PT2_PARAM_COUNT)
		return;

	engine->params[param_id] = value;
	engine->telemetryVersion += 1u;
}

void pt2_synth_engine_note_on(pt2SynthEngine_t *engine, int32_t midi_note, float velocity)
{
	midi_note = pt2_clamp_int32(midi_note, 24, 96);
	velocity = pt2_clamp_float(velocity, 0.05f, 1.0f);
	pt2_allocate_voice(engine, midi_note, velocity)->active = true;
	engine->telemetryVersion += 1u;
}

void pt2_synth_engine_note_off(pt2SynthEngine_t *engine, int32_t midi_note)
{
	int32_t i;
	for (i = 0; i < PT2_SYNTH_MAX_VOICES; ++i)
	{
		pt2SynthVoice_t *voice = &engine->voices[i];
		if (voice->active && voice->midiNote == midi_note)
		{
			voice->held = false;
			pt2_env_note_off(&voice->ampEnv);
			if (engine->selectedSynth == PT2_SYNTH_ACID303)
				break;
		}
	}

	engine->telemetryVersion += 1u;
}

void pt2_synth_engine_panic(pt2SynthEngine_t *engine)
{
	pt2_panic_voices(engine);
	pt2_clear_fx_state(engine);
	engine->telemetryVersion += 1u;
}

void pt2_synth_engine_render_preview(pt2SynthEngine_t *engine, int32_t frames, int32_t sample_rate)
{
	sample_rate = pt2_clamp_int32(sample_rate, 22050, 96000);
	engine->lastPeak = 0.0f;
	pt2_render_frames(engine, frames, (float)sample_rate, engine->previewBuffer);
}

void pt2_synth_engine_render_sample(
	pt2SynthEngine_t *engine,
	int32_t midi_note,
	float velocity,
	float duration_seconds,
	float tail_seconds,
	int32_t sample_rate,
	int32_t normalize,
	int32_t fade_out)
{
	int32_t note_frames;
	int32_t tail_frames;
	int32_t total_frames;
	int32_t offset = 0;
	float peak = 0.0f;

	sample_rate = pt2_clamp_int32(sample_rate, 8000, 96000);
	duration_seconds = pt2_clamp_float(duration_seconds, 0.05f, 6.0f);
	tail_seconds = pt2_clamp_float(tail_seconds, 0.0f, 4.0f);
	note_frames = (int32_t)(duration_seconds * sample_rate);
	tail_frames = (int32_t)(tail_seconds * sample_rate);
	total_frames = pt2_clamp_int32(note_frames + tail_frames, 1, PT2_SYNTH_MAX_RENDER_SAMPLES);

	pt2_synth_engine_panic(engine);
	pt2_synth_engine_note_on(engine, midi_note, velocity);
	engine->lastPeak = 0.0f;

	while (offset < total_frames)
	{
		int32_t chunk = pt2_clamp_int32(total_frames - offset, 1, PT2_SYNTH_MAX_PREVIEW_FRAMES);
		int32_t frame;

		if (offset < note_frames && offset + chunk > note_frames)
			chunk = note_frames - offset;

		if (chunk <= 0)
		{
			pt2_synth_engine_note_off(engine, midi_note);
			continue;
		}

		pt2_render_frames(engine, chunk, (float)sample_rate, engine->previewBuffer);
		for (frame = 0; frame < chunk; ++frame)
		{
			const float mono = (engine->previewBuffer[(frame * 2) + 0] + engine->previewBuffer[(frame * 2) + 1]) * 0.5f;
			engine->renderedMono[offset + frame] = mono;
			peak = fmaxf(peak, fabsf(mono));
		}

		offset += chunk;
		if (offset == note_frames)
			pt2_synth_engine_note_off(engine, midi_note);
	}

	if (normalize != 0 && peak > 0.0001f)
	{
		const float gain = 0.92f / peak;
		int32_t i;
		for (i = 0; i < total_frames; ++i)
			engine->renderedMono[i] *= gain;

		peak = 0.92f;
	}

	if (fade_out != 0 && total_frames > 16)
	{
		const int32_t fade_length = pt2_clamp_int32(total_frames / 10, 16, 4096);
		const int32_t start = total_frames - fade_length;
		int32_t i;
		for (i = 0; i < fade_length; ++i)
			engine->renderedMono[start + i] *= 1.0f - ((float)i / (float)fade_length);
	}

	{
		int32_t i;
		for (i = 0; i < total_frames; ++i)
		{
			float sample = pt2_clamp_float(engine->renderedMono[i], -1.0f, 1.0f);
			sample += pt2_tpdf_dither(&engine->ditherState) * (1.0f / 255.0f);
			engine->renderedSample[i] = (int8_t)pt2_clamp_int32((int32_t)lroundf(sample * 127.0f), -128, 127);
		}
	}

	engine->renderedSampleLength = total_frames;
	engine->lastPeak = peak;
	engine->telemetryVersion += 1u;
	pt2_synth_engine_panic(engine);
}

void pt2_synth_engine_fill_telemetry(const pt2SynthEngine_t *engine, float *buffer, int32_t length)
{
	int32_t offset = 0;
	int32_t tap;
	int32_t point;
	int32_t focused_note = 0;
	float amp_curve_cache[PT2_SYNTH_TELEMETRY_POINTS];

	if (length < PT2_SYNTH_TELEMETRY_BUFFER_LENGTH)
		return;

	if (engine->focusedVoiceIndex >= 0 && engine->focusedVoiceIndex < PT2_SYNTH_MAX_VOICES)
		focused_note = engine->voices[engine->focusedVoiceIndex].midiNote;

	buffer[offset++] = (float)engine->telemetryVersion;
	buffer[offset++] = (float)focused_note;
	buffer[offset++] = (float)pt2_count_active_voices(engine);
	buffer[offset++] = engine->lastSampleRate;
	buffer[offset++] = engine->lastCutoffNorm;
	buffer[offset++] = engine->lastResonance;
	buffer[offset++] = engine->lastAmpEnv;
	buffer[offset++] = engine->lastFilterEnv;
	buffer[offset++] = engine->lastLfo;
	buffer[offset++] = engine->lastDrive;
	buffer[offset++] = (engine->focusedVoiceIndex >= 0 && engine->focusedVoiceIndex < PT2_SYNTH_MAX_VOICES)
		? engine->voices[engine->focusedVoiceIndex].velocity
		: 0.0f;
	buffer[offset++] = (float)engine->selectedSynth;
	buffer[offset++] = engine->lastPeak;
	buffer[offset++] = (float)engine->previewLength;
	buffer[offset++] = (float)engine->tapWritePos;
	buffer[offset++] = 0.0f;

	for (tap = 0; tap < PT2_SYNTH_TELEMETRY_TAP_COUNT; ++tap)
	{
		for (point = 0; point < PT2_SYNTH_TELEMETRY_POINTS; ++point)
		{
			const int32_t ring_index = (engine->tapWritePos + point) % PT2_SYNTH_TELEMETRY_POINTS;
			buffer[offset++] = engine->tapHistory[tap][ring_index];
		}
	}

	{
		const float attack = pt2_clamp_float(engine->params[PT2_PARAM_AMP_ATTACK], 0.001f, 4.0f);
		const float decay = pt2_clamp_float(engine->params[PT2_PARAM_AMP_DECAY], 0.001f, 4.0f);
		const float sustain = pt2_clamp_float(engine->params[PT2_PARAM_AMP_SUSTAIN], 0.0f, 1.0f);
		const float release = pt2_clamp_float(engine->params[PT2_PARAM_AMP_RELEASE], 0.001f, 8.0f);
		const float total_time = attack + decay + release + 0.001f;
		const float env_amount = pt2_clamp_float(engine->params[PT2_PARAM_FILTER_ENV_AMOUNT], -1.0f, 1.0f);
		const float lfo_amount = pt2_clamp_float(engine->params[PT2_PARAM_LFO_AMOUNT], 0.0f, 1.0f);
		const float resonance = pt2_clamp_float(engine->lastResonance, 0.0f, 0.97f);
		const float q = 0.55f + ((1.0f - resonance) * 15.0f);
		const float cutoff_hz = pt2_map_cutoff_hz(engine->lastCutoffNorm, engine->lastSampleRate <= 1.0f ? 48000.0f : engine->lastSampleRate);

		for (point = 0; point < PT2_SYNTH_TELEMETRY_POINTS; ++point)
		{
			const float t = (float)point / (float)(PT2_SYNTH_TELEMETRY_POINTS - 1);
			const float time = t * total_time;
			float amp_curve = 0.0f;

			if (time < attack)
				amp_curve = time / attack;
			else if (time < attack + decay)
				amp_curve = 1.0f - ((1.0f - sustain) * ((time - attack) / decay));
			else
			{
				const float release_time = time - attack - decay;
				const float release_ratio = pt2_clamp_float(release_time / release, 0.0f, 1.0f);
				amp_curve = sustain * (1.0f - release_ratio);
			}

			amp_curve_cache[point] = amp_curve;
			buffer[offset++] = amp_curve;
		}

		for (point = 0; point < PT2_SYNTH_TELEMETRY_POINTS; ++point)
			buffer[offset++] = pt2_clamp_float(0.5f + (((amp_curve_cache[point] * 2.0f) - 1.0f) * env_amount * 0.5f), 0.0f, 1.0f);

		for (point = 0; point < PT2_SYNTH_TELEMETRY_POINTS; ++point)
		{
			const float t = (float)point / (float)(PT2_SYNTH_TELEMETRY_POINTS - 1);
			buffer[offset++] = sinf((float)(M_PI * 2.0) * t) * lfo_amount;
		}

		for (point = 0; point < PT2_SYNTH_TELEMETRY_POINTS; ++point)
		{
			const float t = (float)point / (float)(PT2_SYNTH_TELEMETRY_POINTS - 1);
			const float hz = 20.0f * powf(1000.0f, t * 1.15f);
			const float ratio = hz / pt2_clamp_float(cutoff_hz, 20.0f, 20000.0f);
			const float denom = sqrtf(((1.0f - (ratio * ratio)) * (1.0f - (ratio * ratio))) + ((ratio / q) * (ratio / q)));
			buffer[offset++] = pt2_clamp_float((denom <= 1e-5f ? 1.0f : 1.0f / denom) * 0.35f, 0.0f, 1.0f);
		}
	}
}
