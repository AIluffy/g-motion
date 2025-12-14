# Data Model — Motion Timeline & Spring API

Date: 2025-12-12

## Entities

- MotionInstance
  - id: string | number
  - tracks: Track[]
  - timeline: Timeline

- Timeline
  - currentTime: number (ms or frames via project mode)
  - duration: number
  - fps: number (default 60)
  - state: "playing" | "paused"

- Track
  - id: string
  - property: string (e.g., "x", "opacity")
  - marks: Mark[] (ordered)
  - defaults:
    - interp: Interp (default "linear")
    - spring?: SpringConfig
    - inertia?: InertiaConfig
    - roving?: boolean

- Mark
  - time?: number (ms or frames; optional if roving)
  - to: number | object
  - duration?: number (ms)
  - interp?: Interp
  - spring?: SpringConfig
  - inertia?: InertiaConfig

- KeySegment (implicit)
  - start: Mark
  - end: Mark
  - mode: Interp | Spring | Inertia | Hold
  - localTime: number (computed: globalTime - segmentStartTime)

- Interp
  - type: "linear" | "bezier" | "hold" | "spring" | "inertia" | "autoBezier"
  - bezier?: { cx1: number, cy1: number, cx2: number, cy2: number }
  - easeAlias?: string (authoring alias mapped to `type`; e.g., "linear")

- SpringConfig
  - mode: "physics" | "duration"
  - stiffness?: number
  - damping?: number
  - mass?: number
  - duration?: number
  - initialVelocity?: number

- InertiaConfig
  - deceleration?: number
  - snapTo?: number | { threshold: number, target?: number }
  - initialVelocity?: number

## Defaults

- Interp: default "linear"; `ease` accepted as alias and mapped to `interp` during validation.
- Roving smoothing: Gaussian kernel with sigma=1.0 over 5-segment window (configurable bounds).
- Inertia: exponential decay with half-life=250ms (default); snap-to threshold=1.0 unit if target unspecified.

## Relationships

- MotionInstance 1..* Track
- Track 1..* Mark
- Mark . next → defines KeySegment

## Validation Rules

- Duration must be > 0 when provided
- Absolute times must be monotonic per track unless `roving`
- `spring.mode` precedence: mark overrides track; single mode per segment
- `inertia` segments following `spring` default initialVelocity from spring final velocity
- `autoBezier` requires at least two marks
- `ease` alias MUST resolve to a valid `interp` enum (reject unknown values)
- Roving smoothing parameters MUST remain within safe bounds (window ∈ [3, 11], sigma ∈ [0.5, 3.0])

## State Transitions

- Timeline: play → pause (no changes to marks)
- Adjust: applying `{ offset, scale }` to selected marks preserves relative order; ties resolved by property order

