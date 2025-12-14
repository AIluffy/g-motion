# Motion Engine

High-performance, modular animation engine for the web, built on an Archetype ECS with optional WebGPU offload.

## Packages
- **@g-motion/core**: ECS runtime (World, Archetype), time/render/batch/webgpu systems.
- **@g-motion/animation**: Public `motion()` builder, timeline + interpolation systems.
- **@g-motion/plugin-dom**: DOM transform component + renderer.
- **@g-motion/utils**: Shared utilities.

## Quick Start
```bash
pnpm install
pnpm build       # or pnpm dev
pnpm test        # vitest via turbo
```

Basic usage:
```ts
import { motion } from '@g-motion/animation';

// Number tween
motion(0).mark({ to: 100 }).animate();

// DOM transform
motion('#box').mark({ to: { x: 100 } }).animate();
```

## Architecture Snapshot
- Archetype ECS: entities grouped by component signature for cache locality.
- Systems pipeline: Time -> Timeline -> Interpolation -> Render; optional Batch/WebGPU for large workloads.
- Plugins: add property handling, systems, or renderers (e.g., DOM plugin registers Transform + DOM renderer).

## Workflows
- Dev/watch: `pnpm dev`
- Build all: `pnpm build` (or `pnpm build:packages`, `pnpm build:apps`)
- Test all: `pnpm test` (filter: `pnpm --filter @g-motion/core test`)
- Example app: `cd apps/examples && pnpm dev`

## References
- Specs: specs/001-motion-engine
- WebGPU guides: WEBGPU_COMPUTE_SUMMARY.md, WEBGPU_INTEGRATION_GUIDE.md
