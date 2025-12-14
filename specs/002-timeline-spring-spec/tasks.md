---

description: "Task list for Motion Timeline & Spring API"
---

# Tasks: Motion Timeline & Spring API

**Input**: Design documents from `specs/002-timeline-spring-spec/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

## Phase 1: Setup (Shared Infrastructure)

 - [X] T001 Create feature docs folder structure per plan in specs/002-timeline-spring-spec/
- [X] T002 [P] Add `packages/animation/tests/` scaffold files matching plan.md
- [X] T003 [P] Ensure `pnpm` workspace picks up new files by running `pnpm -w list` (no code change)

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T004 Create `packages/animation/src/builders/motionBuilder.ts`
- [X] T005 [P] Create `packages/animation/src/builders/motionBatchBuilder.ts`
- [X] T006 [P] Create API shells: `packages/animation/src/api/timeline.ts`, `packages/animation/src/api/track.ts`, `packages/animation/src/api/adjust.ts`
- [X] T007 Wire baseline systems: `packages/animation/src/systems/timelineSystem.ts`, `packages/animation/src/systems/interpolationSystem.ts`, `packages/animation/src/systems/rovingResolver.ts`
- [ ] T008 Add validation utilities per schema in `packages/animation/src/api/validation.ts`
- [X] T009 [P] Add tests scaffolds: `packages/animation/tests/chainable-api.spec.ts`, `packages/animation/tests/roving.spec.ts`, `packages/animation/tests/spring-inertia.spec.ts`

**Checkpoint**: Foundation ready — user stories can start.

---

## Phase 3: User Story 1 — Evaluate Mixed Time Models (Priority: P1)

**Goal**: Deterministic evaluation across mixed absolute/duration segments with mark-level precedence and spring/inertia support.
**Independent Test**: Given mixed segments and `currentTime`, computed values match expected; localTime resolves correctly per segment.

### Implementation for User Story 1

- [X] T010 [P] [US1] Implement `localTime` calculation in `packages/animation/src/api/timeline.ts`
- [X] T011 [P] [US1] Implement `interp` resolution order (linear|bezier|hold|spring|inertia|autoBezier) in `packages/animation/src/systems/interpolationSystem.ts`
- [X] T012 [US1] Implement `spring.mode` precedence (mark overrides; single-mode per segment) in `packages/animation/src/systems/interpolationSystem.ts`
- [X] T013 [US1] Integrate inertia after spring with carry-over velocity rule in `packages/animation/src/systems/interpolationSystem.ts`
- [X] T014 [US1] Add schema validation errors for invalid duration/unsupported interp in `packages/animation/src/api/validation.ts`
- [ ] T015 [US1] Serialize evaluation flow to JSON via `contracts/json-schema.motion-timeline.json` (round-trip coverage in tests)
- [X] T031 [US1] Parse/apply `spring.initialVelocity`, `inertia.deceleration`, and `inertia.snapTo` in evaluation (`packages/animation/src/systems/interpolationSystem.ts`)

**Checkpoint**: US1 independently testable.

### Parallel Examples (US1)
- [P] T010, T011 can be implemented in parallel (different files).
- [P] T014 can be parallel with T012/T013 (validation utilities).

---

## Phase 4: User Story 2 — Author & Serialize Tracks (Priority: P2)

**Goal**: Author tracks and batch marks, export JSON schema and GPU-friendly buffer layout.
**Independent Test**: JSON schema validation passes; buffer compiles to GPU/ECS and round-trips to logical model.

### Implementation for User Story 2

 - [X] T016 [P] [US2] Implement `motion(target).mark([])` batch processing in `packages/animation/src/api/builder.ts`
- [X] T017 [P] [US2] Implement `motion(target).track(prop).set(start,end,options)` in `packages/animation/src/api/track.ts`
- [X] T018 [US2] Implement `adjust({ offset, scale })` AE-like transforms in `packages/animation/src/api/adjust.ts`
- [X] T019 [US2] Emit JSON schema from builder state in `packages/animation/src/builders/motionBuilder.ts`
- [X] T020 [US2] Implement GPU buffer packing in `packages/animation/src/systems/interpolationSystem.ts` per `specs/002-timeline-spring-spec/contracts/gpu-buffer-layout.md`
- [X] T021 [US2] Roving resolver: arc-length + curvature smoothing in `packages/animation/src/systems/rovingResolver.ts`
- [X] T032 [P] [US2] Implement schema-driven defaults and validation for inertia deceleration and snap-to in `packages/animation/src/api/validation.ts`
 - [X] T036 [P] [US2] Implement `ease`→`interp` alias mapping in builders/validation (`packages/animation/src/api/builder.ts`, `packages/animation/src/api/validation.ts`)

**Checkpoint**: US2 independently testable — authoring, serialization, packing.

### Parallel Examples (US2)
- [P] T016, T017, T018 in parallel (different files).
- [P] T019 and T020 in parallel (builder vs system).

---

## Phase 5: User Story 3 — Timeline UI Scrubbing & Roving (Priority: P3)

**Goal**: UI scrubbing and mark editing with deterministic outcomes; roving produces uniform-speed paths.
**Independent Test**: Scrubbing updates motion values; adding/removing marks preserves segment integrity; roving yields visually stable motion.

### Implementation for User Story 3

- [ ] T022 [P] [US3] Implement `play/pause/seek/currentTime/fps/duration` control APIs in `packages/animation/src/api/timeline.ts`
- [X] T023 [US3] Ensure `adjust()` preserves ordering and segment continuity in `packages/animation/src/api/adjust.ts`
- [ ] T024 [US3] Integrate UI contract events (create/update/delete marks, scrub) as typed hooks in `packages/animation/src/api/timeline.ts`
- [ ] T025 [US3] Validate roving results and clamp seek outside bounds in `packages/animation/src/systems/rovingResolver.ts`

**Checkpoint**: US3 independently testable — scrubbing, editing, roving.

### Parallel Examples (US3)
- [P] T022 and T024 in parallel (same file but separate modules/functions permissible).
- [P] T023 and T025 parallel (adjust vs roving).

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T026 [P] Documentation updates in `specs/002-timeline-spring-spec/quickstart.md`
- [ ] T027 Performance optimization passes across `packages/animation/src/systems/*`
- [X] T028 [P] Add additional unit tests in `packages/animation/tests/`
- [ ] T029 Error messages and DX improvements (clear validation errors)
- [ ] T030 Run quickstart validation and examples (`apps/examples`) alignment
- [ ] T033 [P] Expose perf metrics hooks (FPS, segment counts, GPU offload decisions) in `packages/animation/src/systems/*`
- [ ] T034 Define GPU eligibility thresholds and config surface (e.g., offload when segments > 2000) in `packages/animation/src/systems/gpu/config.ts`
- [ ] T035 Implement deterministic CPU fallback with optional verification pass when GPU is unavailable or below threshold

---

## Dependencies & Execution Order

- Setup → Foundational → User Stories (US1 → US2 → US3) → Polish
- US1 has no dependency on US2/US3; US2 and US3 are independent but may share utilities
- Parallel opportunities noted per phase; adhere to [P] markers

## Implementation Strategy

- MVP: Deliver US1 first (deterministic evaluation)
- Incremental: US2 serialization/packs; US3 UI scrubbing/roving
- Each story independently testable and demonstrable
