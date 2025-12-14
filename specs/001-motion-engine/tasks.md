---
description: "Task list for Motion Engine Core implementation"
---

# Tasks: Motion Engine Core

**Input**: Design documents from `/specs/001-motion-engine/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Independent test criteria defined per user story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- `packages/core/src/`: Core ECS runtime
- `packages/animation/src/`: High-level API and Timeline logic
- `packages/plugins/src/`: Built-in plugins (DOM, Transform)
- `packages/utils/src/`: Shared utilities

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create project structure for core, animation, plugins, and utils packages
- [x] T002 Initialize TypeScript configuration for all packages with strict mode
- [x] T003 [P] Configure Vitest for monorepo testing
- [x] T004 [P] Setup build scripts (rslib) for all packages

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core ECS infrastructure and Plugin System that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create `ComponentRegistry` in `packages/core/src/registry.ts` (SoA schema definition)
- [x] T006 Create `EntityManager` in `packages/core/src/entity.ts` (ID generation, Archetype mapping)
- [x] T007 Implement `Archetype` storage in `packages/core/src/archetype.ts` (SoA buffers)
- [x] T008 Implement `SystemScheduler` in `packages/core/src/scheduler.ts` (System loop, dt calculation)
- [x] T009 Define `MotionPlugin` interface and loader in `packages/core/src/plugin.ts`
- [x] T010 Create `TransformComponent` definition in `packages/plugins/src/transform/component.ts`
- [x] T011 Create `MotionStateComponent` definition in `packages/core/src/components/state.ts`
- [x] T042 [P] Create `ColorComponent` definition in `packages/plugins/src/color/component.ts`
- [x] T043 [P] Create `CSSVarComponent` definition in `packages/plugins/src/cssvar/component.ts`

**Checkpoint**: Core ECS runtime and Plugin system operational.

---

## Phase 3: User Story 1 - Simple Number Animation (Priority: P1) 🎯 MVP

**Goal**: Animate a raw number from start to end using `motion(val).mark().animate()`.

**Independent Test**: `motion(0).mark({ to: 100 }).animate()` logs 0 to 100.

### Tests for User Story 1

- [x] T012 [P] [US1] Create integration test for number animation in `packages/animation/tests/number.test.ts`

### Implementation for User Story 1

- [x] T013 [P] [US1] Create `TimelineComponent` definition in `packages/core/src/components/timeline.ts`
- [x] T014 [US1] Implement `motion()` factory and `MotionBuilder` in `packages/animation/src/api/builder.ts` (Target resolution)
- [x] T015 [US1] Implement `TimelineSystem` in `packages/animation/src/systems/timeline.ts` (Keyframe progress calculation)
- [x] T016 [US1] Implement `InterpolationSystem` in `packages/animation/src/systems/interpolation.ts` (Lerp logic)
- [x] T017 [US1] Implement `AnimationControl` (play/pause) in `packages/animation/src/api/control.ts`
- [x] T018 [US1] Wire up `TimeSystem` in `packages/core/src/systems/time.ts`

**Checkpoint**: Numeric animation works in memory.

---

## Phase 4: User Story 2 - DOM Animation (Priority: P1)

**Goal**: Animate DOM elements (CSS transform).

**Independent Test**: `motion('#box').mark({ to: { x: 100 } })` updates style transform.

### Tests for User Story 2

- [x] T019 [P] [US2] Create integration test for DOM Transform in `packages/plugins/tests/dom.test.ts`

### Implementation for User Story 2

- [x] T020 [P] [US2] Create `RenderComponent` definition in `packages/core/src/components/render.ts`
- [x] T021 [US2] Implement `DOMRenderer` plugin in `packages/plugins/src/dom/renderer.ts` (CSS Typed OM / string fallback)
- [x] T022 [US2] Implement `RenderSystem` in `packages/core/src/systems/render.ts` (Dispatch to renderer)
- [x] T023 [US2] Update `motion()` to handle DOM Selector/Element targets in `packages/animation/src/api/targets.ts`

**Checkpoint**: DOM elements animate on screen.

---

## Phase 5: User Story 3 - Chained Sequential Animation (Priority: P2)

**Goal**: Support multiple `.mark()` calls for sequences.

**Independent Test**: Animation A completes, then Animation B starts.

### Tests for User Story 3

- [x] T024 [P] [US3] Create test for chained `.mark()` sequences in `packages/animation/tests/chain.test.ts`

### Implementation for User Story 3

- [x] T025 [US3] Update `MotionBuilder.mark()` to append to `TimelineComponent` tracks in `packages/animation/src/api/builder.ts`
- [x] T026 [US3] Update `TimelineSystem` to handle multi-keyframe searching in `packages/animation/src/systems/timeline.ts`
- [x] T027 [US3] Implement `delay` and `repeat` logic in `TimelineSystem`

**Checkpoint**: Complex sequences work.

---

## Phase 6: User Story 4 - Massive GPU Animation (Priority: P2)

**Goal**: Offload numeric animation to WebGPU Compute Shaders.

**Independent Test**: 5000 entities animate with WebGPU context active.

### Tests for User Story 4

- [x] T028 [P] [US4] Create benchmark test for 5000 entities in `apps/examples/src/benchmark.ts`

### Implementation for User Story 4

- [x] T029 [P] [US4] Create `WebGPUComputePlugin` skeleton in `packages/plugins/src/webgpu/plugin.ts`
- [x] T030 [US4] Implement `BatchSamplingSystem` in `packages/core/src/systems/batch.ts` (Gather data for GPU)
- [x] T031 [US4] Implement WGSL shader for interpolation in `packages/plugins/src/webgpu/shaders/interpolate.wgsl`
- [x] T032 [US4] Implement buffer sync (CPU->GPU write) in `packages/plugins/src/webgpu/buffer.ts`
- [x] T044 [US4] Implement double buffering logic in `packages/plugins/src/webgpu/buffer.ts` to prevent read/write conflicts
- [x] T033 [US4] Add fallback logic (detect WebGPU support) in `packages/core/src/scheduler.ts`

**Checkpoint**: High-performance batch mode works.

---

## Phase 7: User Story 5 - Custom System Extension (Priority: P3)

**Goal**: Allow users to register custom logic (e.g., Spring Physics).

**Independent Test**: Custom system modifies component values correctly.

### Tests for User Story 5

- [x] T034 [P] [US5] Create test for custom system registration in `packages/core/tests/custom-system.test.ts`

### Implementation for User Story 5

- [x] T035 [US5] Implement `registerSystem` API in `packages/core/src/app.ts`
- [x] T036 [US5] Validate custom system ordering/scheduling in `packages/core/src/scheduler.ts`
- [x] T037 [US5] Create example `SpringPhysicsSystem` in `packages/plugins/src/physics/spring.ts`

**Checkpoint**: Extensibility proven.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, final cleanup, and performance tuning.

- [x] T038 Update `README.md` in root and packages with usage guide
- [x] T039 Create `CONTRIBUTING.md` for plugin developers
- [x] T040 [P] Add JSDoc comments to all public APIs
- [x] T041 Run final performance profile on `apps/examples`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Blocks all user stories.
- **User Stories (Phase 3+)**: 
  - US1 (Number) depends on Foundational.
  - US2 (DOM) depends on Foundational + US1 (API).
  - US3 (Chain) depends on US1.
  - US4 (GPU) depends on US1.
  - US5 (Custom) depends on Foundational.

### Parallel Opportunities

- **Setup**: All T001-T004 can run in parallel.
- **Foundational**: Component registry (T005), Entity Manager (T006), and Plugin Interface (T009) can be developed in parallel.
- **Story Implementation**: 
  - US2 (DOM) and US4 (GPU) can proceed in parallel after US1 is done.
  - Tests for any story can be written in parallel with implementation.

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. **Core**: Build ECS + Plugin Registry.
2. **Animation**: Build `motion()` for numbers (US1).
3. **DOM**: Add DOM Renderer (US2).
4. **Validation**: Verify basic "move box" demo.

### High Performance Upgrade (User Story 4)

1. Once MVP is stable, implement WebGPU plugin.
2. Verify fallback mechanism.

### Extensibility (User Story 5)

1. Verify public API allows 3rd party system registration.
