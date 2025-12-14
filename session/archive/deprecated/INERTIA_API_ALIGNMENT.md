# Inertia API alignment

- Added `snap` (alias of `end`), `modifyTarget`, `bounds`, `clamp`, `bounce` object/false, `handoff` to spring, and `velocitySource` for `auto` velocity.
- Builder normalizes `resistance/duration` to `timeConstant` (fixed formula), merges inertia options, and carries clamp/bounce/handoff/snap into the component.
- InertiaSystem now applies modifyTarget → snap → bounds, honors clamp/bounce=false, and can trigger handoff-to-spring when decay/bounce settles.
- Examples show clamp and handoff; README documents new options; tests cover snap alias, clamp, bounce=false, velocitySource, and handoff storage.

Default handoff target: use explicit `to` when provided; otherwise fall back to boundary.
