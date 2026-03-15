# Repository Rules

## Language
- All maintained repository text must be written in English.
- All code comments must be written in English.
- All UI copy, status messages, error messages, README content, script output, and policy files must be written in English.

## Licensing
- Do not remove, weaken, or rewrite existing BSD-3-Clause copyright and disclaimer notices.
- Preserve upstream attribution and bundled license files for vendored code.
- Do not add third-party code unless its license provenance is explicit and documented in the repository.

## Vendoring
- `vendor/p2-clone` is a modified vendored snapshot used to build the wasm core.
- Treat `vendor/p2-clone` as the release source of truth for the current web port.
- Upstream syncs must be explicit, reviewed, and documented. Never do blind vendor refreshes.

## Performance
- Performance is non-negotiable.
- Never accept a refactor that makes runtime performance worse unless there is an explicit, documented approval.
- Avoid unnecessary allocations, full-DOM rebuilds on hot paths, avoidable canvas redraw work, and abstraction layers that add measurable runtime cost.
- Prefer simple, predictable code paths over clever indirection in hot code.

## Frontend Refactors
- Preserve the current functionality exactly.
- Preserve the current UI appearance exactly.
- Do not introduce a UI framework unless explicitly requested in a later task.
- Favor pragmatic maintainability improvements over heavy pattern application.

## Generated Files and Hygiene
- Do not commit generated artifacts unless the repository explicitly intends to track them.
- Do not commit machine-specific absolute paths, usernames, or local environment data.
- Keep `.gitignore` current when new generated outputs appear.
