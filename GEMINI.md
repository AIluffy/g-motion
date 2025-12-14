# Motion — Agent Guide

This file summarizes the essentials for an agent working on the Motion monorepo.

## Stack
- pnpm + turbo monorepo, TypeScript strict.
- rslib for package builds, vitest for tests.
- oxfmt/oxlint for formatting/lint.

## Commands
- Dev: `pnpm dev`
- Build: `pnpm build` (or `pnpm build:packages`, `pnpm build:apps`)
- Tests: `pnpm test` (filter: `pnpm --filter @g-motion/core test`)
- Example app: `cd apps/examples && pnpm dev`

## Architecture
- `@g-motion/core`: ECS runtime (World, Archetype) + systems (time, timeline, interpolation, render, batch, webgpu).
- `@g-motion/animation`: public `motion()` builder; TimelineSystem + InterpolationSystem wiring.
- `@g-motion/plugin-dom`: Transform component + DOMRenderSystem auto-registered for DOM targets.
- Specs: specs/001-motion-engine; WebGPU guides: WEBGPU_COMPUTE_SUMMARY.md, WEBGPU_INTEGRATION_GUIDE.md.

## Agent Rules
- Preserve strict TS and declaration output; avoid loosening compiler options.
- When changing public exports, update examples and run build + tests.
- Add focused vitest coverage near behavior changes.
- Performance-sensitive: Archetype buffers, scheduler, batch/webgpu systems—avoid extra allocations and keep data contiguous.

<!-- MANUAL ADDITIONS START -->
<!-- Add any temporary instructions for the current sprint here. -->
<!-- MANUAL ADDITIONS END -->
