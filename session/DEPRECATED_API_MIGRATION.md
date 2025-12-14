# Deprecated API Migration Guide

## Overview
Several legacy APIs have been removed in favor of the unified `motion()` API. This document helps you migrate from deprecated APIs.

## Removed APIs

### 1. motionBatch() - REMOVED ✅
**Status**: Completely removed as of latest version

**Old API**:
```ts
import { motionBatch } from '@g-motion/animation';

motionBatch(targets)
  .mark([{ to: 100, time: 800 }])
  .animate();
```

**New API** (use `motion()` with array):
```ts
import { motion } from '@g-motion/animation';

motion(targets)
  .mark({ to: 100, time: 800 })
  .animate();
```

### 2. BatchAnimationControl - REMOVED ✅
**Status**: Type removed, `AnimationControl` now handles both single and batch

**Old Type**:
```ts
const control: AnimationControl | BatchAnimationControl = motion(targets).animate();
```

**New Type**:
```ts
const control: AnimationControl = motion(targets).animate();
```

### 3. PerEntityMarkOptions - REMOVED ✅
**Status**: Replaced by function support in `MarkOptions`

**Old Pattern**:
```ts
motionBatch(particles).mark([
  { to: { x: 100 }, time: 800 },
  { to: { x: 200 }, time: 800 },
]);
```

**New Pattern** (per-entity functions):
```ts
motion(particles).mark({
  to: (index) => ({ x: 100 + index * 100 }),
  time: 800,
});
```

## Migration Steps

### Step 1: Replace motionBatch() with motion()
```ts
// Before
import { motionBatch } from '@g-motion/animation';
const batch = motionBatch([...elements]);

// After
import { motion } from '@g-motion/animation';
const batch = motion([...elements]);
```

### Step 2: Convert mark() array to single object with functions
```ts
// Before
motionBatch(particles).mark([
  { to: { x: positions[0] }, time: 800 },
  { to: { x: positions[1] }, time: 800 },
  // ... one per entity
]);

// After
motion(particles).mark({
  to: (index) => ({ x: positions[index] }),
  time: 800,
});
```

### Step 3: Update type annotations
```ts
// Before
import { AnimationControl, BatchAnimationControl } from '@g-motion/animation';
const ref = useRef<AnimationControl | BatchAnimationControl | null>(null);

// After
import { AnimationControl } from '@g-motion/animation';
const ref = useRef<AnimationControl | null>(null);
```

### Step 4: Use stagger for delayed starts
```ts
// Before (manual per-entity delay calculation)
motionBatch(particles).mark([
  { to: 100, time: 800, delay: 0 },
  { to: 100, time: 800, delay: 50 },
  { to: 100, time: 800, delay: 100 },
]);

// After (built-in stagger)
motion(particles).mark({
  to: 100,
  time: 800,
  stagger: 50,
});
```

## Why the Change?

1. **Simpler API**: One function (`motion()`) handles all cases
2. **Better TypeScript**: Single return type (`AnimationControl`)
3. **More Flexible**: Per-entity functions support dynamic values
4. **Less Code**: Built-in stagger eliminates manual delay calculations
5. **Consistent**: Array syntax in `mark()` now reserved for timeline segments

## Related Documentation

- [Unified Motion API Quick Reference](./UNIFIED_MOTION_API_QUICK_REF.md)
- [Unified Motion API Guide](./UNIFIED_MOTION_API.md)
- Product docs: [PRODUCT.md](../PRODUCT.md)
- Architecture: [ARCHITECTURE.md](../ARCHITECTURE.md)

## Historical Session Docs (Reference Only)

The following session docs reference the old `motionBatch()` API and are kept for historical reference:
- BATCH_ANIMATION_QUICK_START.md
- BATCH_ANIMATION_API_QUICK_REFERENCE.md
- BATCH_ANIMATION_API_IMPLEMENTATION.md
- FIREWORKS_EXAMPLE.md
- Various BURST_* docs

**Note**: Do NOT use these as implementation guides. Use the unified `motion()` API documented above.
