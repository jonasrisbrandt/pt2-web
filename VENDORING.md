# Vendoring Policy

`vendor/p2-clone` contains the modified C source used to build the wasm core for this project.

## Rules
- Keep upstream license files and attribution intact.
- Prefer small, reviewable vendor updates over large blind refreshes.
- Document any intentional divergence from upstream when it affects the build, exported API, or module/sample compatibility.
- Do not assume the external checkout is the current source of truth. The vendored snapshot is the public build input for this repository.

## Sync workflow
- Use `scripts/sync-upstream.ps1` only as a starting point for a sync.
- Review the resulting diff before accepting any upstream changes.
- Rebuild the wasm output and verify the web UI behavior after each sync.
