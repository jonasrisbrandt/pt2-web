# Third-Party Notices

## p2-clone
- Location: `vendor/p2-clone`
- Upstream project: `https://github.com/8bitbubsy/pt2-clone`
- License: BSD 3-Clause
- Notes: This repository vendors a modified snapshot of `p2-clone` for the web/wasm port. Upstream license files are preserved under `vendor/p2-clone`.

## miniflac
- Location: `vendor/p2-clone/src/smploaders/miniflac.h`
- Notice file: `vendor/p2-clone/src/smploaders/miniflac license.txt`
- License summary: permissive BSD-0-style notice as documented by upstream

## Freedesktop.org Resources
- Location: `vendor/p2-clone/release/other/Freedesktop.org Resources`
- Notice file: `vendor/p2-clone/release/other/Freedesktop.org Resources/LICENSE`

## Release blocker
- `vendor/p2-clone/src/modloaders/pt2_pp_unpack.c` contains a source comment that does not establish clear license provenance.
- Public release readiness remains blocked until that code path is verified or replaced without compatibility loss.
