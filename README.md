# pt2-web

`pt2-web` is a web/wasm porting workspace around a vendored `p2-clone` core. The active application is built as a Vite + TypeScript shell around a wasm-backed tracker engine.

## Architecture

- `src/core/trackerEngine.ts` defines the stable engine contract used by the UI.
- `src/core/wasmEngine.ts` provides the wasm-backed implementation and integrates with the C adapter layer.
- `src/core/mockEngine.ts` provides the fallback engine when the wasm build is unavailable.
- `src/bootstrap.ts` is the active browser entry point.
- `src/appMain.ts` contains the active modern UI shell that also hosts the classic canvas.

## Current state

- The TypeScript application talks to the tracker through a dedicated adapter layer instead of talking directly to the legacy SDL UI.
- The UI can be developed and built without wasm thanks to the mock engine fallback.
- The vendored C tree contains web-specific adapter changes that are required by the current wasm build.
- Public release readiness is still blocked by unresolved license provenance for the PowerPacker unpacker path.

## Commands

- `npm run dev`
  - Start the web UI in development mode.
- `npm run typecheck`
  - Run TypeScript type checking.
- `npm run build:web`
  - Build the web shell only.
- `npm run build:wasm`
  - Build the wasm core through Emscripten.
- `npm run build`
  - Build the wasm core and then the web shell.

## Prepare upstream source

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-upstream.ps1
```

## Notes

- `vendor/p2-clone` is the vendored build input for the public repository.
- Keep all maintained text and comments in English.
- The current goal is feature parity with the desktop tracker while preserving the current web UI exactly during refactors.
