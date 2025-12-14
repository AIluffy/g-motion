# Implementation Plan: Motion Engine Core

**Branch**: `001-motion-engine` | **Date**: 2025-12-05 | **Spec**: [specs/001-motion-engine/spec.md](spec.md)
**Input**: Feature specification from `/specs/001-motion-engine/spec.md`

## Summary

The goal is to build a unified, high-performance animation engine with a simple chained API (`motion(target).mark(...).animate()`).
The core architecture is based on **Archetype ECS** (Entity Component System) to support high performance and decoupling.
Features include:
1.  **Unified API**: Supports number, DOM, object targets.
2.  **Plugin System**: Extensible properties, interpolation, and rendering.
3.  **High Performance**: Default CPU execution, with **WebGPU Compute Shader** offloading for massive batch animations.
4.  **Multi-backend**: Decoupled rendering for DOM, Canvas, WebGL, etc.

## Technical Context

**Language/Version**: TypeScript 5.0+ (Strict Mode)
**Primary Dependencies**:
-   `@webgpu/types` (for WebGPU dev)
-   `vitest` (for testing)
-   `gl-matrix` (Verified in Research: Optional but available if matrix math needed)
**Storage**: N/A (Runtime memory only)
**Testing**: Vitest (Unit for ECS/Systems, Integration for API/Renderer)
**Target Platform**: Modern Browsers (Chrome/Edge/Firefox/Safari) supporting ES6+ and WebGPU (optional fallback).
**Project Type**: Monorepo (pnpm + turbo) with multiple packages (`core`, `animation`, `plugins`, `utils`).
**Performance Goals**:
-   Factory overhead < 0.2ms
-   2000 CPU tweens @ 60fps
-   5000 GPU animations @ 60fps
**Constraints**:
-   Must fallback to CPU if WebGPU unavailable.
-   Zero runtime dependencies for `core` preferred.
**Scale/Scope**: Core engine + basic plugins (Transform, DOM Renderer).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

-   [x] **I. Easy to Use**: Plan uses `motion(target)` simple API.
-   [x] **II. Production Ready**: Strict TS, Vitest, perf goals defined.
-   [x] **III. Performance First**: Archetype ECS + WebGPU Compute Shaders mandated.
-   [x] **IV. Developer Experience**: Not detailed yet, but plan implies structured errors/logs.
-   [x] **V. Modular Monorepo**: Plan adheres to `packages/core`, `packages/animation`, etc.
-   [x] **VI. Cross-Platform Rendering**: RenderSystem decoupling included in spec.
-   [x] **VII. ECS Plugin Architecture**: Plugin system is a core functional requirement.

## Project Structure

### Documentation (this feature)

```text
specs/001-motion-engine/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API interfaces)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
packages/
├── core/                  # ECS Runtime, Scheduler, ComponentRegistry
│   ├── src/
│   │   ├── archetype/
│   │   ├── system/
│   │   ├── query/
│   │   └── index.ts
│   └── tests/
├── animation/             # High-level motion() API, Timeline
│   ├── src/
│   │   ├── api/
│   │   ├── timeline/
│   │   └── index.ts
│   └── tests/
├── plugins/               # Built-in plugins (Transform, DOMRenderer, Easing)
│   ├── src/
│   │   ├── transform/
│   │   ├── dom/
│   │   ├── easing/
│   │   └── index.ts
│   └── tests/
├── utils/                 # Shared math/helpers
│   ├── src/
│   └── tests/
apps/
├── examples/              # Usage demos (DOM, 5000 particles)
└── docs/                  # API docs
```

**Structure Decision**: Adopts the Modular Monorepo Architecture from Constitution Principle V.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| :--- | :--- | :--- |
| **Archetype ECS** | High perf batch processing (SoA) & decoupling | **OOP/Class-based**: Hard to optimize for cache locality & massive parallel updates (GPU). |
| **WebGPU Compute** | 5000+ objects @ 60fps requirement | **CPU only**: Cannot sustain high concurrency for visualization/games. |
| **Plugin System** | Extensibility (Physics, Custom Renderers) | **Monolithic**: Hard to maintain & tree-shake unused features. |