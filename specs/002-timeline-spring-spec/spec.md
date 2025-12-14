# Feature Specification: Motion Timeline & Spring API Specification

**Feature Branch**: `002-timeline-spring-spec`
**Created**: 2025-12-12
**Status**: Draft
**Input**: User description: "Motion Timeline & Spring Spec - Standardize motion/track/mark/timeline API semantics, data structures, runtime behavior, and compilation pipeline. Support both time (absolute) and duration (relative), with full Spring support (duration-based and physics-based) at both mark and track levels."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Evaluate Mixed Time Models (Priority: P1)

Animation engine implementer evaluates a `Timeline` containing both absolute-time marks (AE-style keyframe times) and duration-based segments, across multiple `Track`s, producing deterministic motion values with `spring.mode` set per mark or per track.

**Why this priority**: Core engine correctness and determinism enable all downstream consumers (libraries, UI, GPU compilers).

**Independent Test**: Provide a JSON spec with mixed absolute and duration segments and verify motion outputs match acceptance scenarios across `localTime`, `KeySegment` transitions, spring and inertia behaviors.

**Acceptance Scenarios**:

1. **Given** a `Timeline` with `currentTime = 1500ms`, **When** a `Track` has marks at 1000ms and 2000ms and an intervening duration-based tween of 400ms, **Then** `localTime` resolves per segment and interpolation is computed according to `interp` priority producing expected motion value.
2. **Given** `spring.mode = physics` at track-level and `spring.mode = duration` at a mark-level override, **When** evaluating the segment, **Then** the segment uses mark-level spring mode per precedence rules and outputs expected spring response curve.


### User Story 2 - Author & Serialize Tracks (Priority: P2)

Library maintainer authors `Track`s and batch `mark()` arrays, sets `spring`/`inertia`, and `duration`, then exports a serializable JSON schema and a GPU-friendly buffer layout for compilation into WebGPU/ECS delivery.

**Why this priority**: Schema and buffer outputs are required for toolchain integration and runtime compilation.

**Independent Test**: Validate produced JSON against schema, and buffer layout against alignment and packing rules; parse both to reconstruct identical logical model.

**Acceptance Scenarios**:

1. **Given** a set of marks with `interp: autoBezier`, **When** exporting schema, **Then** the computed control points and resolved interpolation priorities are represented and validated by the schema.
2. **Given** roving spatial points without explicit times, **When** compiling buffer, **Then** the engine assigns time via roving rules and buffer times reflect uniform speed allocation.


### User Story 3 - Timeline UI Scrubbing & Roving (Priority: P3)

Timeline UI developer scrubs `currentTime`, uses `adjust()` for AE-like editing (nudge, retime), batch-adds `mark[]`, toggles `hold` vs `spring`/`inertia`, and enables `roving` for spatial paths to maintain uniform motion without explicit times.

**Why this priority**: Ensures UI contracts are clear and predictable for editing and preview.

**Independent Test**: Drive `Timeline` via `seek()` and `play/pause`; add/remove marks and verify consistent `localTime` segmentation and visual motion continuity.

**Acceptance Scenarios**:

1. **Given** a polyline path with roving enabled and path length L, **When** marks are created without times, **Then** time allocation is proportional to curve length with constant speed constraint.
2. **Given** overlapping marks with differing `interp` at the same absolute time, **When** the UI resolves the effective mark, **Then** precedence rules select a single interpolation strategy and evaluation remains deterministic.


### Edge Cases

 - `inertia` segments following `spring` must define carry-over velocity rules; default: use final spring velocity as initial inertia velocity.

## Requirements *(mandatory)*

### Functional Requirements

 - **FR-003**: System MUST support `interp` types: `linear | bezier | hold | spring | inertia | autoBezier` with a defined priority and fallback order.
 - **FR-006**: System MUST accept batch `mark()` arrays for creation/update; operations are atomic per track and produce deterministic ordering. Provide AE-like `adjust()` operations (retime, shift, scale, nudge) applied to selected marks.
 - **FR-009**: System MUST expose `Timeline` controls: `play() | pause() | seek(time) | currentTime | fps | duration` and define their effect on `localTime` and evaluation. AE-like `adjust()` MUST preserve relative ordering and segment integrity.
 - **FR-016**: System MUST allow `spring` configs at mark-level to specify initial velocities and target settling behavior for `physics` mode; `inertia` configs MAY specify deceleration and snap-to behavior.
 - **FR-023**: Roving MUST use uniform-speed arc-length parameterization with curvature-aware smoothing. Engine SHOULD provide configurable smoothing strength; defaults MUST ensure visually stable motion and preserve total duration.
	- **FR-024**: API MUST accept `ease` as an alias of `interp` for authoring convenience. Mapping rules MUST be documented and validated.
	- **FR-025**: Roving smoothing MUST default to a curvature-aware kernel (e.g., Gaussian with sigma=1.0 over a 5-segment window) and allow strength/window configuration within safe bounds.
	- **FR-026**: Inertia defaults MUST be defined: deceleration uses exponential decay with configurable half-life (default 250ms); snap-to threshold defaults to 1.0 unit (configurable) with optional target.

Unclear items requiring decision:


### Key Entities *(include if feature involves data)*

 - **RovingResolver**: Procedure and parameters for assigning times to spatial points based on path length.
 - **InertiaConfig**: Parameters for inertia segments (initial velocity source, deceleration, snap-to thresholds) compatible with duration/physics interplay.
 - **AdjustOperation**: Selection and transformation of mark times (shift, scale, nudge) with constraints and validation for AE-like panel controls.

## Success Criteria *(mandatory)*

### Measurable Outcomes

 - **SC-006**: `adjust()` operations on 1000 marks complete under 50ms and maintain deterministic ordering and segment continuity.

## Clarifications

### Session 2025-12-12

- Q: When track-level and mark-level `spring.mode` conflict, what is the precedence and do we allow mixed-mode within a single segment? → A: Mark overrides; no merge.
 - Q: What is the default timeline timebase and fps, and do we support frames? → A: Dual-mode; default ms@60; frames optional.
 - Q: What exact formula should `roving` use for time allocation over variable curvature paths? → A: Uniform speed, curvature-smoothed.

Applied changes:
- FR-021 resolved: Mark-level `spring.mode` (and config) overrides track-level defaults. Segments are single-mode per `[mark_i, mark_{i+1}]`; no sub-splitting for mixed-mode. Buffer layout and evaluation remain deterministic.
 - FR-022 resolved: Canonical default timebase is milliseconds with `fps = 60`. Projects MAY opt-in to frame-based timebase via a project-level switch; conversion rules: `timeMs = frames * (1000 / fps)`; evaluation and serialization MUST remain deterministic regardless of selected mode.
 - FR-023 resolved: `roving` allocates time by piecewise arc length to target uniform speed, with curvature-aware smoothing to reduce jitter on high-curvature segments. Guidance: sample path to compute arc length per segment; assign `t_i = (L_i / L_total) * T_total`; apply a smoothing kernel over neighboring segments to stabilize instantaneous velocity without changing total duration.
	- FR-024/FR-025/FR-026: Authoring alias `ease→interp` supported and validated; default roving smoothing kernel (Gaussian, sigma=1.0, window=5) provided with configurable bounds; inertia defaults defined (exponential deceleration half-life=250ms; snap-to threshold=1.0 unit).



