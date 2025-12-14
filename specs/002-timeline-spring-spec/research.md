# Research — Motion Timeline & Spring API

Date: 2025-12-12
Branch: 002-timeline-spring-spec
Spec: specs/002-timeline-spring-spec/spec.md

## Decisions

### D1: Spring precedence
- Decision: Mark-level overrides track-level; no segment merging.
- Rationale: Deterministic evaluation; simpler segment model and buffer packing.
- Alternatives: Track default unless mark full config (less ergonomic); mixed-mode sub-splitting (complex runtime).

### D2: Timeline timebase
- Decision: Dual-mode with default milliseconds at fps=60; frames optional via project switch.
- Rationale: AE parity with frames when needed; canonical default ensures determinism.
- Alternatives: Frames default (impacts broader web ergonomics); ms-only (limits AE parity).

### D3: Roving allocation formula
- Decision: Uniform speed via arc-length parameterization with curvature-aware smoothing.
- Rationale: Visual stability on high curvature while preserving duration; predictable motion.
- Alternatives: Strict arc-length (can jitter), easing windows per endpoints (more artistic, less predictable).

## Best Practices

- Chainable builders: immutable-ish chaining with internal timeline state; commit on `animate()` or `build()`.
- JSON schema: explicit enums (`interp`, `spring.mode`), numeric ranges, monotonic time validations; optional `roving`.
- GPU buffer: SoA packing; segment table with `[startIndex, endIndex, mode, flags]`; alignment to 16 bytes; precomputed tangents/control points.
- Error handling: clear messages for negative durations, conflicting marks, non-monotonic times (unless roving).

## Patterns

- AE-like `adjust()`: offset + scale transform for selected marks; preserve ordering; collision resolution rules.
- Spring/Inertia interplay: carry-over velocity default from spring → inertia segment; configurable via options.
- Determinism: all floating calculations use stable paths; when GPU differs, fallback CPU verification.
