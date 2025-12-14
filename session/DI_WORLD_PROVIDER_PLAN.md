# DI World Provider Plan

This document outlines the staged migration from `World.get()` to a DI-friendly `WorldProvider`.

- New module: packages/core/src/worldProvider.ts
  - `setDefault(world)` — set default world.
  - `useWorld()` — get current world (lazy create via `World.get()` for compatibility).
  - `withWorld(world, fn)` — temporarily scope a world during tests.

- Animation wiring changes
  - `motion(target, { world })` optional injection.
  - `new MotionBuilder(target, { world })` stores injected world.
  - `AnimationControl` now accepts optional `world` and uses provider or fallback.

- Backward compatibility
  - If provider is unavailable, fallback to `World.get()`; no public API break.

- Completed wiring
  - ✅ `WorldProvider` exported from `@g-motion/core`.
  - ✅ `motion(target, { world })` and `MotionBuilder` accept optional world.
  - ✅ `AnimationControl` constructor accepts world parameter.
  - ✅ Batch animations propagate world to all child controls.
  - ✅ All methods use injected world or provider fallback.

- System migration completed
  - ✅ All core systems migrated to `WorldProvider.useWorld()`.
  - ✅ Spring and Inertia plugin systems migrated.
  - ✅ Multi-world isolation test added.

- Lint guidance
  - Added note in `oxlint.json` to watch for `World.get()` patterns.
  - Recommendation: Use code review to enforce `WorldProvider.useWorld()` or constructor DI.
  - Exceptions: Tests may use `World.get()` for backward compatibility verification.

- Phase 1 complete
  - DI foundation established with `WorldProvider`.
  - All animation APIs and systems support optional world injection.
  - Tests verify multi-world isolation.
  - Migration path documented for future development.
