# Spring DOM Render Fix

## Problem
SpringSystem updated `Transform` object properties, but the DOM didn't reflect the changes.

## Root Cause
**Data path mismatch:**
1. `SpringSystem` (order 19) wrote values only to the AoS `Transform` object
2. `RenderSystem` (order 30) passed both AoS `Transform` AND typed `TransformTyped` buffers to renderers
3. DOM renderer **prefers typed buffers** when available, reading from `TransformTyped.buffers[key][index]`
4. Since typed buffers were never updated by SpringSystem, the renderer used stale values (usually 0)
5. Result: Transform object had correct values, but DOM rendered with zeros → no visible animation

## Solution
Updated `SpringSystem` to write to **both** typed buffers and AoS objects:

### Changes in [packages/plugins/spring/src/spring-system.ts](packages/plugins/spring/src/spring-system.ts):

1. **Fetch typed Transform buffers** at archetype level:
```typescript
const typedBuffers: Record<string, Float32Array | Float64Array | Int32Array | undefined> = {
  x: archetype.getTypedBuffer('Transform', 'x'),
  y: archetype.getTypedBuffer('Transform', 'y'),
  rotate: archetype.getTypedBuffer('Transform', 'rotate'),
  scaleX: archetype.getTypedBuffer('Transform', 'scaleX'),
  // ... all transform properties
};
```

2. **Write to typed buffers first** (DOM renderer priority):
```typescript
// Write to typed buffer if available
if (typedBuffers[key]) {
  typedBuffers[key]![i] = newValue;
  handled = true;
}

// Also write to AoS Transform for compatibility
if (transform && key in transform) {
  (transform as any)[key] = newValue;
  handled = true;
}
```

3. **Snap to target in both paths** when at rest:
```typescript
if (typedBuffers[key]) {
  typedBuffers[key]![i] = targetValue;
}
if (transform && key in transform) {
  (transform as any)[key] = targetValue;
}
```

## Data Flow After Fix
```
SpringSystem (order 19)
  ↓ writes to typedBuffers[key][i] = newValue
  ↓ writes to transform[key] = newValue

RenderSystem (order 30)
  ↓ passes TransformTyped { index, buffers } + Transform object

DOM Renderer
  ↓ reads typedBuffers[key][index] ✅ (updated by SpringSystem)
  ↓ OR fallback to transform[key] ✅ (also updated)
  ↓ builds CSS transform string
  ↓ applies to element.style.transform
```

## Validation
- Build: ✅ All packages compiled successfully
- Examples: ✅ Spring route bundle generated
- Type safety: ✅ No TypeScript errors

## Impact
- Spring animations now render correctly in DOM
- Performance optimized: typed buffers reduce object property lookups
- Backward compatible: AoS path still works for non-DOM renderers
- Consistent with `InterpolationSystem` and `TimeSystem` dual-write patterns

## Related Files
- [packages/plugins/spring/src/spring-system.ts](packages/plugins/spring/src/spring-system.ts) - Fixed
- [packages/core/src/systems/render.ts](packages/core/src/systems/render.ts) - Passes typed buffers
- [packages/plugins/dom/src/renderer.ts](packages/plugins/dom/src/renderer.ts) - Reads typed buffers first
- [packages/animation/src/systems/interpolation.ts](packages/animation/src/systems/interpolation.ts) - Reference dual-write pattern
