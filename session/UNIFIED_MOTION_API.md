# Unified Motion API - Implementation Complete

## Summary

Successfully merged MotionBuilder and MotionBatchBuilder functionality into a single unified `motion()` API that seamlessly handles both single and multiple entity animations.

## What Changed

### 1. Enhanced MotionBuilder
- Now accepts single targets OR arrays of targets
- Automatically detects batch mode when array is provided
- Stores original mark options for per-entity resolution
- Creates individual entity builders during animate phase

### 2. Updated MarkOptions Type
```typescript
export type MarkOptions = {
  to?: any | ((index: number, entityId: number, target?: any) => any);
  time?: number | ((index: number, entityId: number) => number);
  duration?: number;
  easing?: Easing;
  interp?: 'linear' | 'bezier' | 'hold' | 'autoBezier';
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
  spring?: SpringOptions;
  inertia?: InertiaOptions;
  stagger?: number; // NEW: stagger delay between entities (ms)
};
```

### 3. Enhanced AnimationControl
- Internally tracks array of entity IDs
- Supports batch control operations (play/pause/stop for all entities)
- New methods:
  - `getEntityIds()`: Get all entity IDs
  - `getControls()`: Get individual controls for batch
  - `getCount()`: Get count of entities
  - `isBatchAnimation()`: Check if batch
  - `destroy(removeEntities)`: Clean up batch animations

### 4. Simplified Entry Point
```typescript
// packages/animation/src/index.ts
export const motion = (target: any) => {
  initEngine();

  // CSS selector with multiple matches → batch
  if (typeof target === 'string' && document) {
    const nodeList = document.querySelectorAll(target);
    if (nodeList.length > 1) {
      return builderMotion(Array.from(nodeList));
    }
  }

  // builderMotion now handles both single and array
  return builderMotion(target);
};
```

### 5. Deprecated (Backward Compatible)
- `MotionBatchBuilder`: Still available but marked @deprecated
- `BatchAnimationControl`: Still available but marked @deprecated
- `motionBatch()`: Now delegates to `motion()` internally

## Usage Examples

### Single Entity (unchanged)
```typescript
motion({ x: 0 })
  .mark([{ to: { x: 100 }, time: 1000 }])
  .animate();
```

### Multiple Entities (NEW simplified API)
```typescript
const particles = [{ x: 0 }, { x: 0 }, { x: 0 }];

motion(particles)
  .mark([{ to: { x: 100 }, time: 1000 }])
  .animate();
```

### Per-Entity Functions (NEW)
```typescript
motion(particles)
  .mark([{
    to: (index, entityId, target) => ({
      x: 100 + index * 10,
      y: 50 + index * 5
    }),
    time: 1000
  }])
  .animate();
```

### Stagger Support (NEW)
```typescript
motion(particles)
  .mark([{
    to: { x: 100 },
    time: 1000,
    stagger: 50  // 50ms delay between each entity
  }])
  .animate();
```

### Dynamic Time Per Entity
```typescript
motion(particles)
  .mark([{
    to: { x: 100 },
    time: (index) => 800 + index * 100  // Different duration per entity
  }])
  .animate();
```

### Batch Control
```typescript
const control = motion(particles)
  .mark([{ to: { x: 100 }, time: 1000 }])
  .animate();

control.pause();  // Pauses all entities
control.play();   // Resumes all
control.stop();   // Stops all
control.destroy(true);  // Clean up and remove entities

console.log(control.getCount());  // 3
console.log(control.isBatchAnimation());  // true
```

## Benefits

1. **Unified API**: Single `motion()` function for all use cases
2. **Simpler Mental Model**: No need to choose between motion() and motionBatch()
3. **Automatic Detection**: Batch mode activated automatically for arrays
4. **Per-Entity Customization**: Functions in mark options for dynamic values
5. **Backward Compatible**: Old motionBatch() API still works
6. **Type Safe**: Full TypeScript support with proper types
7. **Consistent Control**: Same AnimationControl interface for single and batch

## Migration Guide

### Before
```typescript
import { motion, motionBatch } from '@g-motion/animation';

// Single
motion(target).mark([...]).animate();

// Batch
motionBatch(targets).mark([...]).animate();
```

### After
```typescript
import { motion } from '@g-motion/animation';

// Single (unchanged)
motion(target).mark([...]).animate();

// Batch (simplified)
motion(targets).mark([...]).animate();
```

## Implementation Details

### Architecture
- MotionBuilder now has `isBatch` flag to track mode
- Stores `markOptionsHistory` to preserve original functions
- `animateBatch()` private method resolves per-entity values
- Creates individual MotionBuilder per entity during animate
- Returns unified AnimationControl with batch capabilities

### Per-Entity Resolution Flow
1. User calls `mark()` with functions in options
2. For batch mode, store original options in history
3. On `animate()`, iterate through each target
4. For each target, resolve functions with (index, entityId, target)
5. Create individual MotionBuilder with resolved values
6. Collect all controls and return BatchAnimationControl

### Stagger Implementation
- Stagger value accumulated per entity: `totalStagger = index * stagger`
- Added to global delay: `delay: globalDelay + totalStagger`
- Each entity starts at progressively later time

## Testing

Added comprehensive test suite in `tests/unified-api.test.ts`:
- ✅ Single entity animation
- ✅ Array of entities
- ✅ Per-entity functions
- ✅ Stagger support
- ✅ Unified control methods
- ✅ Mixed use cases

All existing tests continue to pass, ensuring backward compatibility.

## Files Modified

Core Implementation:
- `packages/animation/src/api/builder.ts` - Enhanced MotionBuilder
- `packages/animation/src/api/control.ts` - Enhanced AnimationControl
- `packages/animation/src/api/validation.ts` - Updated validation types
- `packages/animation/src/index.ts` - Simplified entry point

Deprecated (but maintained):
- `packages/animation/src/api/batch.ts` - Added @deprecated tags

Examples Updated:
- `apps/examples/src/routes/particles-burst.tsx` - Using new motion(array) API

Tests:
- `packages/animation/tests/unified-api.test.ts` - New comprehensive tests

## Performance

No performance regression - batch operations use same underlying systems:
- Individual entity creation per target
- Same ECS archetype storage
- Same GPU/CPU rendering paths
- Unified control adds minimal overhead (array iteration)

## Next Steps

Consider in future updates:
1. Add `.spread()` API for easy distribution patterns
2. Add `.sequence()` for dependent animations
3. Optimize batch entity creation with BurstManager
4. Add batch-specific easing curves

## Conclusion

The unified `motion()` API provides a cleaner, more intuitive interface while maintaining full backward compatibility. Users can now animate single or multiple entities with the same API, using per-entity functions for dynamic customization and stagger for sequential effects.

**Status**: ✅ Implementation Complete, All Tests Passing, Backward Compatible
