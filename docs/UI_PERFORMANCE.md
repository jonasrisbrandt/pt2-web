# UI Performance Notes

## Purpose
- Capture the UI and rendering performance lessons learned during the Vue migration and visualization-engine work.
- Provide concrete guardrails so future changes do not reintroduce avoidable regressions.

## Core Findings
- The main regressions were caused by visible UI work, not by tracker audio playback.
- If audio keeps playing while CPU drops sharply when the tab is hidden, the problem is almost certainly in the visible UI/render path.
- The expensive paths were:
  - high-frequency playback scheduling on high-refresh-rate displays
  - visualization redraw cadence
  - repeated redraws of tracker canvases during playback
  - repeated color parsing, per-frame object churn, and generic draw-command overhead in visualization code
- Vue itself was not the primary bottleneck once cold-shell renders were removed from the playback hot path.

## Architecture Rules
- Treat the UI as two classes of work:
  - cold UI: layout, menus, shell structure, panels, modal state, sample metadata
  - hot UI: playback state, visualization redraw, pattern cursor/highlight, small transport indicators
- Do not run full-shell renders on playback ticks.
- Do not mix Vue-owned DOM nodes with imperative DOM mutation on the same controls.
- Keep canvases and visualization rendering as imperative islands behind stable hosts.
- Prefer narrow typed view models and typed actions over string-template HTML generation.

## Playback and Scheduling Rules
- Cap the playback/UI coordinator to 60 Hz.
- Cap visualization redraw independently from tracker/audio cadence.
- Use `requestAnimationFrame` with an internal time gate for stable frame pacing.
- Do not let UI work scale with monitor refresh rate. High-refresh displays must not drive 120/144/240 Hz UI updates unless explicitly intended and measured.
- Poll live tracker state at a lower cadence than visualization redraw. A separate live-state cadence around 20 Hz is acceptable for transport/pattern metrics.

## Visualization Rules
- WebGL reduces per-frame cost, but it does not remove CPU cost.
- CPU time still exists for:
  - frame building
  - buffer/uniform uploads
  - draw submission
  - browser compositor/raster work
- For visualization work, first reduce frame count, then reduce per-frame cost.
- Use specialized draw primitives when a mode would otherwise emit hundreds of small generic commands.
- `signal-trails` is an example where a dedicated `trail-columns` primitive was justified and materially improved performance.
- Cache parsed colors and reusable alpha ramps.
- Reuse typed arrays and command buffers on hot paths.

## Proven Practical Rules
- Avoid allocating new arrays, maps, or command lists per playback frame.
- Avoid rebuilding icon SVG or HTML strings on playback paths.
- Avoid remounting canvases unless the host or mode actually changed.
- Avoid drawing the pattern canvas unless the visible state actually changed.
- Prefer fixed-size history/ring buffers over `push`/`shift` history management.

## Debugging and Verification
- Use `?perf=1` when changing UI playback behavior.
- Keep the perf overlay working. It is a debugging tool, not optional cleanup.
- The perf overlay should make it easy to inspect at least:
  - `playback.tick`
  - `playback.getLiveState`
  - `ui.syncModernPlaybackUi`
  - `ui.draw.pattern`
  - `ui.draw.visualization.*`
  - `ui.render.cold.*`
- When investigating regressions, compare at least:
  - `piano`
  - `quad-classic`
  - `spectrum`
  - `signal-trails`
- A new UI change is not acceptable until the measured hot-path cost is understood.

## Regression Policy
- Any UI or rendering refactor must be assumed risky until measured.
- Do not trade "cleaner architecture" for worse runtime behavior without explicit approval.
- If a change fixes correctness but adds hot-path cost, follow up immediately with a measurement-backed optimization pass.
- If a performance issue is observed, profile first. Do not bounce between speculative fixes.
