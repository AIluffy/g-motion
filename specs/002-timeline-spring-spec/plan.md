# Implementation Plan: Motion Timeline & Spring API

**Branch**: `002-timeline-spring-spec` | **Date**: 2025-12-12 | **Spec**: specs/002-timeline-spring-spec/spec.md
**Input**: Feature specification from `specs/002-timeline-spring-spec/spec.md`

## Summary

Top-level chainable API aligned with AE panels supporting mixed absolute-time and duration models, track-level single-property rails, batch `mark[]`, `spring` and `inertia` via plugins, AE-like `adjust()` operations, and serialization to JSON schema and GPU-friendly buffer layout. Deterministic runtime flow: `timeline → track.localTime → segment interp/spring/inertia → value`.

## Technical Context

- Language/Version: TypeScript (Strict Mode)
- Primary Dependencies: `@g-motion/core` (ECS), `@g-motion/animation` (builders/systems), plugins: `@g-motion/plugin-spring`, `@g-motion/plugin-inertia`, `@g-motion/plugin-dom`
- Storage: N/A (in-memory ECS archetypes; JSON serialization only)
- Testing: Vitest (unit/integration); perf benches in `packages/*/benchmarks/`
- Target Platform: Browser (DOM/SVG/Canvas/WebGL/WebGPU); optional Node for tests
- Project Type: Monorepo packages per CONTRIBUTING
- Performance Goals: 60fps typical; 2000+ CPU entities; 5000+ GPU tweens; `adjust()` on 1000 marks <50ms
- Constraints: Deterministic evaluation; SoA storage; no per-frame allocations in hot paths; plugin isolation
- Scale/Scope: Tracks with 10k marks; batch entities 1k–10k; GPU path when eligible

## Constitution Check

GATE: Must pass.
- Easy & Unified API: Chainable `motion().track().set()/mark().adjust()`; AE-like ergonomics → PASS
- Production Ready: Strict TS, tests, perf benches → PASS (tests to be added in Phase 1 tasks)
- Performance First: ECS archetypes, preallocation, GPU offload path → PASS
- DX: Clear errors/validation; perf metrics hooks in animation systems → PASS (ensure messages in Phase 1)
- Modular Monorepo: Builders in `@g-motion/animation`, physics in plugins → PASS
- Cross-Platform Rendering: DOM/SVG/Canvas/WebGL covered via renderer → PASS
- ECS Plugin Architecture: No core mutations; physics via plugins → PASS

## Project Structure

Documentation (this feature)
```text
specs/002-timeline-spring-spec/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── json-schema.motion-timeline.json
│   └── gpu-buffer-layout.md
└── tasks.md   (Phase 2 by /speckit.tasks)
```

Source Code (monorepo packages)
```text
packages/
  animation/
    src/
      builders/
        motionBuilder.ts
        motionBatchBuilder.ts
      api/
        timeline.ts
        track.ts
        adjust.ts
      systems/
        timelineSystem.ts
        interpolationSystem.ts
        rovingResolver.ts
    tests/
      chainable-api.spec.ts
      roving.spec.ts
      spring-inertia.spec.ts

  core/
    src/  # ECS (World, Archetype, ComponentRegistry, SystemScheduler)

  plugins/
    dom/
    spring/
    inertia/
```

**Structure Decision**: Builders/API in `@g-motion/animation`; physics/inertia in plugins; ECS core untouched.

## Tasks

- [ ] Phase 0: Research decisions consolidation (precedence, timebase, roving)
  - [ ] Write `research.md` with Decision/Rationale/Alternatives

- [ ] Phase 1: Design & Contracts
  - [ ] Write `data-model.md` (entities, fields, relationships, validation)
  - [ ] Author `contracts/json-schema.motion-timeline.json` (schema for MotionInstance/Timeline/Track/Mark/Segment)
  - [ ] Author `contracts/gpu-buffer-layout.md` (packed fields, alignment, segment tables)
  - [ ] Write `quickstart.md` with chainable API examples (from user request)
  - [ ] Update agent context via `.specify/scripts/bash/update-agent-context.sh copilot`
  - [ ] Add Vitest spec outlines in `packages/animation/tests/`

- [ ] Phase 2 (Planning only): Implementation sequencing
  - [ ] Builders: `motion()`, `.track()`, `.set(time, to, options)`, `.mark([])`, `.adjust({ offset, scale })`
  - [ ] Systems: timeline, interpolation, spring/inertia integration, roving resolver
  - [ ] Serialization: JSON schema emit; buffer packing for GPU
  - [ ] Validation: deterministic evaluation + error messages; schema validation

## Open Questions

1) Inertia defaults: deceleration curve and snap-to thresholds (proposal: exponential decay with configurable half-life).
2) Adjust constraints: collision resolution when scaled/offset marks overlap (proposal: stable sort by time, then resolve ties by track order).
3) GPU eligibility: minimum segment count or entity thresholds to offload (proposal: >2000 segments).
