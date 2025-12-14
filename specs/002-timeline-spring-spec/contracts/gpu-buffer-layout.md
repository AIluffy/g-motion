# GPU Buffer Layout — Motion Timeline

Date: 2025-12-12

## Goals
- Deterministic, GPU-friendly packing for segments and per-track descriptors
- Structure-of-Arrays alignment; 16-byte alignment for compute

## Layout Overview

### Per-Track Descriptor (aligned 16 bytes)
- u32 `trackId`
- u32 `firstSegmentIndex`
- u32 `segmentCount`
- u32 `flags` (bitfield: roving, hasSpring, hasInertia)

### Segment Table (SoA)
- f32[] `startTimeMs`
- f32[] `endTimeMs`
- u32[] `mode` (0=linear,1=bezier,2=hold,3=spring,4=inertia,5=autoBezier)
- u32[] `springMode` (0=none,1=physics,2=duration)
- f32[] `stiffness`
- f32[] `damping`
- f32[] `mass`
- f32[] `durationMs`
- f32[] `initialVelocity`
- f32[] `bezierCx1` / `bezierCy1` / `bezierCx2` / `bezierCy2`
- u32[] `valueOffset` (offset into value buffer)
- u32[] `valueLength` (vector length)

### Values Buffer (SoA per property)
- Packed property arrays (e.g., x[], y[], opacity[])

## Notes
- Times converted to ms in CPU packing (frames via `timeMs = frames * (1000/fps)`).
- Roving segments pre-assigned times using arc-length + curvature smoothing; total duration preserved.
- Segments use single mode per `[mark_i, mark_{i+1}]`.
 - Packing module location: implement CPU packing in `packages/animation/src/systems/gpu/packBuffers.ts` (or equivalent), separate from interpolation logic for clarity.
 - GPU eligibility: respect thresholds (e.g., segments > 2000) and provide deterministic CPU fallback with verification.
