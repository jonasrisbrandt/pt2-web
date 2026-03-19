#include "native/synth-core/synth_engine.h"
int main(void) {
  pt2SynthEngine_t engine;
  pt2_synth_engine_boot(&engine);
  pt2_synth_engine_set_synth(&engine, PT2_SYNTH_ACID303);
  pt2_synth_engine_note_on(&engine, 48, 1.0f);
  pt2_synth_engine_render_preview(&engine, 128, 48000);
  pt2_synth_engine_note_on(&engine, 55, 1.0f);
  pt2_synth_engine_render_preview(&engine, 128, 48000);
  pt2_synth_engine_note_off(&engine, 55);
  pt2_synth_engine_render_preview(&engine, 128, 48000);
  pt2_synth_engine_note_off(&engine, 48);
  pt2_synth_engine_render_preview(&engine, 128, 48000);
  return 0;
}
