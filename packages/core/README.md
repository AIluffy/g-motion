# @g-motion/core

ECS runtime and systems for Motion. Provides World, Archetype storage, scheduler, and core systems (time, timeline, interpolation, render, batch, webgpu).

## Develop
- Install: `pnpm install`
- Build: `pnpm --filter @g-motion/core run build`
- Test: `pnpm --filter @g-motion/core test`

## Architecture
- **World**: singleton holding component registry, entity manager, scheduler, archetypes.
- **Archetype**: groups entities by component signature; contiguous buffers for cache-friendly access.
- **Systems**: time → timeline → interpolation → render; batch/webgpu for large workloads.
- **Plugins**: register components/systems via MotionPlugin (e.g., WebGPUComputePlugin in webgpu/plugin.ts).

## Key files
- src/world.ts — World singleton and archetype management
- src/archetype.ts — buffer storage for components
- src/systems/time.ts — clocks and delta updates
- src/systems/render.ts — applies Render components
- src/systems/batch.ts, src/systems/webgpu.ts — batching and GPU compute path
- src/webgpu/* — buffer/shader orchestration

## Contracts
- Keep component buffers contiguous; avoid per-frame allocations in hot paths.
- Preserve public exports in src/index.ts and package.json `exports`.
- When adding components/systems, ensure registration paths are updated and tests cover new behavior.
