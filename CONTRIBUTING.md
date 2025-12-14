# Contributing to Motion (≤1 page)

## Setup
- `pnpm install`
- Dev/watch: `pnpm dev`
- Build: `pnpm build` (or `pnpm --filter @g-motion/core run build`)
- Test: `pnpm test` (or `pnpm --filter @g-motion/core test`)
- Benchmark: `pnpm bench` (performance benchmarks in packages/*/benchmarks/)

## Guidelines
- Keep TypeScript strict and declaration output intact.
- Public API/exports changes must update examples and docs; add targeted Vitest coverage.
- Favor small, focused changes; avoid per-frame allocations in core systems (Archetype, scheduler, batch/webgpu).
- Performance-critical changes should include benchmark tests (packages/*/benchmarks/) to verify improvements.
- Use centralized types from @g-motion/core/types; avoid duplicate type definitions.
- Access shared resources via AppContext singleton (avoid globalThis).

## ECS Module Split Rules (Hard Requirements)
1) Component files: ≤50 lines; if larger, split data vs logic.
2) Each System in its own folder with: index.ts (≤150 lines), pipeline.ts (≤80 lines), *.compute.wgsl (≤80 lines).
3) Shader logic separate from JS: one shader per file; no long inline WGSL.
4) Scheduler only orders systems (≤150 lines); no business logic inside.
5) GPU management (buffers/pipelines/timestamps) lives in dedicated modules, not business code.
6) Renderers are isolated per target (DOM/Canvas/WebGL/WebGPU) with no cross-references.
7) Plugins extend via “component + system”; core ECS behavior/types must not be modified.
8) Any file >400 lines must be split before submission; check file length pre-PR.

## Workflow
1) Read relevant spec (specs/001-motion-engine) and package README.
2) Implement code + nearby tests.
3) Run `pnpm lint` / `pnpm format` if needed.
4) Validate with `pnpm build` and `pnpm test` (or filtered commands).
5) For performance changes, add/update benchmarks and run `pnpm bench` to verify improvements.
6) Update examples (apps/examples) if API/behavior changes.
7) Update session docs (session/) if adding major features or optimizations.

## Plugin authoring (minimal)
```ts
import { MotionPlugin, MotionApp } from '@g-motion/core';

export const MyPlugin: MotionPlugin = {
    name: 'MyPlugin',
    setup(app: MotionApp) {
        app.registerComponent('MyData', { /* schema */ });
        app.registerSystem(class MySystem {
            update(world) {
                // process entities with MyData
            }
        });
    },
};
```

## Pointers
- Core ECS: packages/core/src
  - AppContext: packages/core/src/context.ts
  - Types: packages/core/src/types.ts
  - Archetype (O(1) lookup): packages/core/src/archetype.ts
  - Timeline (binary search): packages/core/src/components/timeline.ts
- Animation API: packages/animation/src
  - Interpolation (pre-allocation): packages/animation/src/systems/interpolation.ts
- DOM plugin: packages/plugins/dom
  - Renderer (element caching): packages/plugins/dom/src/renderer.ts
- Spring plugin: packages/plugins/spring
- Inertia plugin: packages/plugins/inertia
- Benchmarks: packages/*/benchmarks/*.bench.ts
- Specs: specs/001-motion-engine
- Optimization docs: session/README.md (entry point for optimization documentation)
