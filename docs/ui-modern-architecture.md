# UI Modern Architecture

## Purpose
- Keep the current UI and behavior exactly as they are.
- Improve maintainability without introducing framework overhead.
- Preserve or improve performance on hot paths.

## Current Direction
- `src/appMain.ts` is the composition root.
- `src/ui-modern/session` owns DOM/session setup.
- `src/ui-modern/controllers` owns interaction, file flow, live UI updates, and event wiring.
- `src/ui-modern/components` owns pure rendering and markup generation.
- `src/ui-modern/classic` owns classic bridge helpers and classic debug support.

## Architectural Rules
- Prefer small, concrete modules over generic abstractions.
- Keep renderers pure when practical.
- Keep controllers imperative and direct.
- Avoid indirection that adds runtime cost without reducing real complexity.
- Do not introduce a UI framework unless there is an explicit later decision to do so.

## Boundaries
- `appMain.ts`
  - Compose modules.
  - Hold app-level state.
  - Coordinate engine snapshots, rendering, and lifecycle.
- `components`
  - Build markup strings.
  - Draw canvases.
  - Avoid engine mutations.
- `controllers`
  - Handle user intent and translate it to engine calls or state updates.
  - Avoid owning long-lived view structure.
- `classic`
  - Isolate compatibility logic for the original ProTracker canvas path.

## Performance Rules
- Treat canvas rendering, snapshot updates, keyboard flow, and pointer flow as hot paths.
- Avoid unnecessary DOM queries in tight loops.
- Avoid rebuilding large DOM sections unless structure actually changed.
- Keep data flow explicit and shallow.
- Prefer passing plain values and callbacks over heavy object graphs.

## Refactor Rules
- Preserve the exact current DOM output where behavior depends on it.
- Preserve CSS hooks and `data-*` contracts.
- Extract only when the new module has a clear responsibility.
- Stop extracting when orchestration becomes clearer but not fragmented.

## Next Steps
- Keep shrinking `appMain.ts` only where there is a clear cohesion win.
- Prefer moving remaining shell/lifecycle helpers into focused modules over adding more layers.
- If a future framework migration is considered, treat these modules as the migration seams rather than rewriting behavior first.
