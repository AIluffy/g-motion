# Research Findings: Motion Engine Core

**Feature**: Motion Engine Core
**Date**: 2025-12-05

## Task A: Transform Interpolation Baseline

**Goal**: Determine best practices for high-performance transform interpolation (x/y/rotate/scale) and DOM rendering.

### Findings
1.  **Interpolation**:
    -   Using individual typed arrays (`Float32Array`) for each property component (SoA layout) is generally faster for batch processing than array-of-objects (AoS).
    -   `gl-matrix` is the industry standard for matrix math if full 4x4 matrix interpolation is needed, but for simple CSS transforms (translate/rotate/scale), direct component-wise linear interpolation (LERP) is significantly cheaper and sufficient.
    -   **Decision**: Use custom component-wise LERP functions operating on SoA `Float32Array` buffers. Avoid full matrix decomposition/recomposition unless absolutely necessary (e.g., matrix3d inputs).

2.  **DOM Rendering**:
    -   **String Concatenation**: Constructing the `transform` string (e.g., `translate(x, y) rotate(r)`) is the most readable and standard way but generates garbage.
    -   **Matrix3d**: Constructing a `matrix3d(...)` string is faster for the browser's compositing thread but harder to debug.
    -   **CSS Typed OM**: `attributeStyleMap.set('transform', ...)` is the modern, high-perf standard, skipping string parsing.
    -   **Decision**: Use **CSS Typed OM** where available. Fallback to optimized string concatenation (using cached template strings) for older browsers.

## Task B: WebGPU Compute Animation

**Goal**: Evaluate feasibility and architecture for offloading animation to WebGPU.

### Findings
1.  **Data Layout**:
    -   **Structure of Arrays (SoA)** is critical for WebGPU Compute Shaders. It allows coalesced memory access (e.g., thread 0 reads x[0], thread 1 reads x[1]).
    -   AoS (Array of Structures) leads to uncoalesced access and performance penalties.
    -   **Decision**: Enforce SoA layout for all component data in the Core ECS.

2.  **Easing in WGSL**:
    -   Easing functions (linear, easeInQuad, cubic-bezier) must be implemented directly in WGSL.
    -   Lookup textures (sampling a curve) are an alternative but require texture fetches. Pure math (pow, smoothstep) is faster on ALU-bound compute shaders.
    -   **Decision**: Port standard Penner equations to a WGSL module library.

3.  **Buffer Synchronization**:
    -   CPU -> GPU: `device.queue.writeBuffer` for start/end values.
    -   GPU -> CPU: Requires `mapAsync` which is slow (async). Avoid reading back for DOM rendering if possible.
    -   **Hybrid**: If driving DOM, GPU compute is likely overkill due to readback latency. GPU Compute is best for driving **WebGL/WebGPU renderers** (data stays on GPU).
    -   **Strategy**: For DOM targets, use WASM/CPU SIMD. For "Massive GPU Animation" user story (particles), assume the renderer is also WebGL/WebGPU.
    -   **Decision**: WebGPU Compute plugin will primarily target WebGL/WebGPU renderers. For DOM, verify if readback latency (< 1 frame) is acceptable, otherwise stick to CPU/WASM.

## Task C: Deep Object Interpolation

**Goal**: Strategy for efficient interpolation of nested JS objects.

### Findings
1.  **Diffing**:
    -   Recursive diffing at runtime is expensive.
    -   **Decision**: "Flatten" the object graph at animation creation time.
    -   Map `obj.nested.x` to a flat array index or specific `NumericComponent` with a "path" metadata.
    -   At render time, reconstruct the object or (better) set properties directly via generated setters.

2.  **Access Paths**:
    -   String paths (`"nested.x"`) with `split('.')` are slow in hot loops.
    -   **Decision**: Use pre-compiled accessor functions: `(obj, val) => obj.nested.x = val` generated once at startup.

## Task D: Plugin System API

**Goal**: Design a unified registration protocol.

### Findings
1.  **Registration**:
    -   Patterns like `app.plugin(Plugin)` (Vue/Bevy) are standard.
    -   Plugins should return a definition object containing:
        -   `components`: Array of Component definitions.
        -   `systems`: Array of System functions/classes.
        -   `setup(world)`: Init hook.
    -   **Decision**: Adoption of a `MotionPlugin` interface.

## Task E: Timeline Data Structures

**Goal**: Structure for `motion().add().animate()`.

### Findings
1.  **Data Structure**:
    -   A Linked List of "Animation Nodes" is flexible for appending.
    -   However, random access (seek) is O(N).
    -   **Decision**: Flatten the chain into a **Timeline Track** (Array) of intervals `[startTime, endTime, startVal, endVal, easing]`.
    -   Seek becomes binary search O(log N).

## Alternatives Considered

-   **WASM for Core**: Considered AssemblyScript/Rust for the core loop. Rejected for MVP to keep build simple, but architecture (ECS/SoA) keeps the door open.
-   **React-Spring style physics**: Considered making physics default. Rejected in favor of deterministic "duration-based" tweens as default, with Physics as a plugin, to match the "Timeline" user story requirement.

## Final Decisions for Implementation

1.  **ECS**: Custom Archetype-based, SoA storage.
2.  **Math**: Custom lightweight LERP, no heavy matrix lib.
3.  **GPU**: SoA layout, Compute Shaders for WebGL targets, investigate Readback for DOM.
4.  **Object**: Flattening strategy + compiled accessors.
