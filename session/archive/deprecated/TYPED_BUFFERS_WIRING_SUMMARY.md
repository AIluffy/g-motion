# Typed Buffers Wiring Summary

Date: 2025-12-14

## Changes
- InterpolationSystem now writes to typed Transform buffers (SoA) alongside AoS objects for keys: x, y, translateX/Y/Z, z, rotate/rotateX/Y/Z, scale/scaleX/Y/Z, perspective.
- TimeSystem mirrors updates to MotionState typed buffers for `currentTime` and `delay` when available.
- Added micro-benchmarks comparing object writes vs typed array writes: `packages/core/benchmarks/typed-vs-object-transform.bench.ts`.

## Rationale
- Reduce object property access in hot loops and prepare for systems/readers that consume SoA buffers directly (e.g., GPU offload, DOM renderer optimization).
- Maintain backward compatibility by continuing to update AoS component objects.

## Next Steps
- Update RenderSystem/DOM renderer to read from typed Transform buffers when present to eliminate object reads in transform building.
- Extend physics systems (spring/inertia) to emit into typed buffers.
- Add end-to-end perf benchmarks in `apps/examples` with 5k+ elements to quantify FPS improvements.

## Verification
- Build and test suites pass across core and animation.
- Benchmarks available via `pnpm bench` (ensure vitest bench runner).
