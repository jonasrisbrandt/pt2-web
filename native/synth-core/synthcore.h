#pragma once

#include <stdint.h>

int32_t pt2_synth_boot(void);
void pt2_synth_reset(void);
void pt2_synth_set_synth(int32_t synthId);
void pt2_synth_set_param(int32_t paramId, float value);
void pt2_synth_set_bpm(float bpm);
void pt2_synth_note_on(int32_t midiNote, float velocity);
void pt2_synth_note_off(int32_t midiNote);
void pt2_synth_panic(void);
void pt2_synth_render_preview(int32_t frames, int32_t sampleRate);
const float *pt2_synth_preview_buffer(void);
int32_t pt2_synth_preview_buffer_length(void);
void pt2_synth_render_sample(int32_t midiNote, float velocity, float durationSeconds, float tailSeconds, int32_t sampleRate, int32_t normalize, int32_t fadeOut);
const int8_t *pt2_synth_sample_buffer(void);
int32_t pt2_synth_sample_buffer_length(void);
const float *pt2_synth_telemetry_buffer(void);
int32_t pt2_synth_telemetry_buffer_length(void);
