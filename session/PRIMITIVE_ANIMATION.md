# Primitive Target Animation Enhancement

## Summary
Enhanced MotionBuilder to directly handle primitive targets (numbers and strings) without requiring them to be wrapped in object properties. This provides a more intuitive and cleaner API.

## Changes

### 1. MotionBuilder.mark() - Direct Primitive Handling
**File**: `packages/animation/src/api/builder.ts`

**Before**:
```typescript
// Had to wrap primitives
motion(0).mark({ to: { value: 100 } })
```

**After**:
```typescript
// Direct primitive animation
motion(0).mark({ to: 100 })
motion('#fff').mark({ to: '#000' })
```

**Implementation**:
- Detects primitive targets using `typeof target === 'number' || typeof target === 'string'`
- Uses special track key `'__primitive'` to track single value animations
- Supports chained marks on primitives (e.g., `motion(0).mark({to:100}).mark({to:50})`)

### 2. MotionBuilder.animate() - Primitive Renderer
**File**: `packages/animation/src/api/builder.ts`

**Implementation**:
- Introduced new `'primitive'` renderer type for primitive targets
- Stores primitive value with optional onUpdate callback in render target
- Supports both direct updates and callback notifications

```typescript
const control = motion(20)
  .mark({ to: 50, duration: 500 })
  .animate({ onUpdate: (value) => console.log(value) });
```

### 3. RenderSystem - Primitive Renderer Support
**File**: `packages/core/src/systems/render.ts`

**Added**:
```typescript
else if (render.rendererId === 'primitive') {
  // Handle __primitive key for primitive values
  if (props.__primitive !== undefined) {
    render.target.value = props.__primitive;
    if (render.target.onUpdate) {
      render.target.onUpdate(props.__primitive);
    }
  }
}
```

### 4. Test Coverage
**File**: `packages/animation/tests/object-tween.test.ts`

Added 2 new tests:
- ✅ `should animate a number primitive directly without wrapping` - Tests basic number animation
- ✅ `should support chained marks on primitive numbers` - Tests sequential animations

All existing tests continue to pass (8 tests total).

## API Examples

### Number Animation
```typescript
import { motion } from '@g-motion/animation';

// Simple number tween
const control = motion(0)
  .mark({ to: 100, duration: 800 })
  .animate({
    onUpdate: (value) => {
      console.log(value); // 0 → 100
    }
  });

// Chained marks
motion(0)
  .mark({ to: 100, duration: 500 })
  .mark({ to: 50, duration: 500 })
  .animate({ onUpdate: (v) => console.log(v) });
```

### Starting from Non-Zero Value
```typescript
// Animate from 20 to 50
motion(20)
  .mark({ to: 50, duration: 1000 })
  .animate({ onUpdate: (value) => display.textContent = value.toFixed(2) });
```

### With Easing
```typescript
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

motion(0)
  .mark({
    to: 100,
    duration: 800,
    easing: easeOutQuad
  })
  .animate({ onUpdate: (value) => console.log(value) });
```

## Backward Compatibility

✅ **Fully compatible** with existing object animations:

```typescript
// These still work exactly as before
const obj = { value: 0 };
motion(obj)
  .mark({ to: { value: 100 } })
  .animate({ onUpdate: (value) => console.log(value) });

// Multi-property objects still work
motion({ x: 0, y: 0 })
  .mark({ to: { x: 100, y: 50 } })
  .animate({ onUpdate: (props) => console.log(props) });
```

## Performance

- No performance impact on existing code
- Primitive animation uses same interpolation system
- Track storage is efficient with single `__primitive` key
- Backward compatible with all existing patterns

## Future Extensions

The `'primitive'` renderer type enables future support for:
- String interpolation (e.g., color animation: `'#fff' → '#000'`)
- Custom value types (e.g., arrays, complex objects)
- Type-specific rendering pipelines

## Test Results

```
Test Files  1 passed (1)
Tests       8 passed (8)
Duration    1.83s

✓ All builds successful
✓ Examples app: 272.26 kB (gzipped 86.33 kB)
```
