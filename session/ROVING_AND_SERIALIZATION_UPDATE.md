# Roving, Serialization, and GPU Packing Update (2025-12-12)

## Scope
- Implemented roving resolver (arc-length with Gaussian smoothing) to assign times to marks lacking explicit timestamps.
- Added inertia defaults and ease alias normalization.
- Added builder serialization to JSON schema shape and GPU buffer packing helper.
- Improved adjust() collision handling and added roving helper tests.

## Details
- `packages/animation/src/systems/rovingResolver.ts`: Roving now computes segment lengths from value deltas, smooths with Gaussian kernel (radius=2, sigma=1), distributes durations, assigns start/end times, and keeps tracks sorted. Exposes smoothing/distribution helpers for tests.
- `packages/animation/src/api/validation.ts`: Normalizes ease→easing, applies inertia defaults (deceleration=4, snapTo=1) for schema-driven defaults.
- `packages/animation/src/api/builder.ts`: Marks normalized pre-validation; added `toJSON()` emitting schema-aligned payload with timeline/tracks/marks.
- `packages/animation/src/api/adjust.ts`: Adjust now preserves ordering, resolves collisions, clamps overlapping segments safely.
- `packages/animation/src/systems/gpu/packBuffers.ts`: CPU-side SoA packing per GPU contract; exported via package index.
- `packages/animation/tests/roving.spec.ts`: Added unit coverage for duration distribution and smoothing behavior.
- `specs/002-timeline-spring-spec/tasks.md`: Marked T009, T019, T020, T021, T032, T023 complete.

## Validation
- `pnpm --filter @g-motion/animation test -- --runInBand --filter roving` → pass (suite total 24 passed, 2 skipped, includes new roving tests).

## Follow-ups
- Builders folder (T004/T005) completed via compatibility wrappers.
- Consider richer roving path-length estimation for multi-property paths.
- Wire GPU packing into actual compute submission and extend serialization to include track defaults/ids.

## Additional Updates (Builders & Packaging)
- Created compatibility wrappers per tasks:
	- `packages/animation/src/builders/motionBuilder.ts`
	- `packages/animation/src/builders/motionBatchBuilder.ts`
- Added repo-level `.npmignore` to exclude build artifacts, locks, env files, and caches from publish scope.
