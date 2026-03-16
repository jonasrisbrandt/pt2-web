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
- The vendored PP20 import path now uses a locally adapted, license-clean depacker derived from libxmp.
- Module export still writes plain `.mod` files; PP20 export is reserved for future work.

## Credits

- Original Amiga ProTracker lineage: Amiga Freelancers (Lars Hamre, Anders Hamre, Sven Vahsen, Rune Johnsrud), followed by Peter "Crayon" Hanning and Anders Ramsay for the later 2.x line that this project references historically.
- `p2-clone` core: Olav "8bitbubsy" Sorensen.
- `pt2-web` web port and UI shell: Jonas Risbrandt`.

The original Amiga ProTracker software is part of the historical lineage for this project, but its source code is not vendored in this repository.

## Project References

- `p2-clone`
  - Upstream project: `https://github.com/8bitbubsy/pt2-clone`
  - Role here: vendored tracker core and wasm build input.
- `libxmp`
  - Upstream project: `https://github.com/libxmp/libxmp`
  - Role here: upstream basis for the PP20 depacker adaptation in `vendor/p2-clone/src/modloaders/pt2_pp_unpack.c`.
- `miniflac`
  - Upstream project: `https://github.com/jprjr/miniflac`
  - Role here: vendored FLAC sample loading header used by `p2-clone`.
- `lucide`
  - Upstream project: `https://lucide.dev`
  - Role here: runtime icon set used by the web UI.
- `Freedesktop.org Resources`
  - Upstream location: `vendor/p2-clone/release/other/Freedesktop.org Resources`
  - Role here: preserved upstream desktop packaging resources from `p2-clone`.

## License Summary

- `pt2-web` maintained code in this repository uses the root `LICENSE` and is BSD 3-Clause.
- `vendor/p2-clone` is BSD 3-Clause and remains separately attributed to its upstream project.
- `vendor/p2-clone/src/modloaders/pt2_pp_unpack.c` is a local adaptation of libxmp's PP20 depacker and is tracked here as MIT-attributed third-party code with preserved upstream credit notes and a local MIT license copy in `licenses/libxmp-MIT.txt`.
- `vendor/p2-clone/src/smploaders/miniflac.h` carries a permissive BSD-0-style notice from upstream, preserved in `vendor/p2-clone/src/smploaders/miniflac license.txt`.
- The runtime `lucide` icon package is ISC licensed and also carries an MIT notice for Feather-derived portions.
- `vendor/p2-clone/release/other/Freedesktop.org Resources` keeps its upstream BSD-2-Clause-style notice.

This summary covers the application code and bundled third-party components that matter for repository transparency. Development tools such as TypeScript and Vite keep their own upstream licenses, but they are not separately vendored in this repository.

For the exact third-party mapping, see `THIRD_PARTY_NOTICES.md`.

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
