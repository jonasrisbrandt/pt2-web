# Web/Modern Code Review Baseline

## Findings addressed in this pass

1. The repository contained two overlapping browser UI implementations.
   - Active path: `src/bootstrap.ts -> src/appMain.ts`
   - Inactive path: `src/main.ts -> src/app.ts`
   - Risk: duplicated maintenance, divergent behavior, and accidental edits against dead code.
   - Action: the inactive path was removed so the active UI architecture is unambiguous.

2. `src/appMain.ts` embedded many pure helper functions and constants at the top of the file.
   - Risk: reduced readability and harder future extraction into smaller UI modules.
   - Action: shared pure helpers and constants were moved to `src/ui/appShared.ts`.

3. The repository mixed English and Swedish in maintained project text.
   - Risk: inconsistent contributor guidance and lower public release quality.
   - Action: maintained docs and runtime text are being standardized to English.

4. The repository tracked build outputs and development artifacts.
   - Risk: noisy history, oversized public repository, and local path leakage.
   - Action: `.gitignore` was added and tracked build outputs were removed from the git index.

## Remaining review targets

1. `src/appMain.ts` is still large and mixes orchestration, DOM rendering, and canvas drawing responsibilities.
   - Next direction: split by concern without changing rendered output or hot-path performance.

2. The active UI still rebuilds major DOM sections eagerly.
   - Next direction: reduce structural churn only where it can be proven behavior-safe and visually identical.

3. The wasm bridge and UI shell still need deeper profiling around snapshot updates, canvas redraw cadence, and allocation patterns.
   - Next direction: measure first, then optimize hot paths.
