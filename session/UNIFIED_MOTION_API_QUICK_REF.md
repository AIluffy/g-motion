# Unified Motion API - Quick Reference

## Single Line Summary
`motion()` now handles both single AND multiple entity animations with per-entity customization.

## API Signature

```typescript
motion(target: any | any[]): MotionBuilder
```

## Basic Usage

### Single Entity
```typescript
motion({ x: 0 }).mark([{ to: { x: 100 }, time: 1000 }]).animate();
```

### Multiple Entities
```typescript
const particles = [{ x: 0 }, { x: 0 }, { x: 0 }];
motion(particles).mark([{ to: { x: 100 }, time: 1000 }]).animate();
```

## Per-Entity Functions

### Dynamic Target Values
```typescript
motion(particles).mark([{
  to: (index, entityId, target) => ({
    x: 100 + index * 10,
    y: Math.random() * 100
  }),
  time: 1000
}]).animate();
```

### Dynamic Duration
```typescript
motion(particles).mark([{
  to: { x: 100 },
  time: (index) => 800 + index * 100
}]).animate();
```

## Stagger

```typescript
motion(particles).mark([{
  to: { x: 100 },
  time: 1000,
  stagger: 50  // 50ms delay between each
}]).animate();
```

## Control Methods

```typescript
const control = motion(targets).mark([...]).animate();

// Playback
control.play();
control.pause();
control.stop();

// Info
control.getCount();           // Number of entities
control.isBatchAnimation();   // true/false
control.getEntityIds();       // [id1, id2, ...]
control.getControls();        // [control1, control2, ...]

// Cleanup
control.destroy(true);        // Remove entities
```

## Common Patterns

### Explosion/Fireworks
```typescript
motion(particles).mark([{
  to: (i) => {
    const angle = (i / particles.length) * Math.PI * 2;
    return {
      x: Math.cos(angle) * 300,
      y: Math.sin(angle) * 300,
      opacity: 0
    };
  },
  time: 800
}]).animate();
```

### Wave Effect
```typescript
motion(elements).mark([{
  to: { y: -20 },
  time: 300,
  stagger: 50
}]).animate();
```

### Random Scatter
```typescript
motion(items).mark([{
  to: () => ({
    x: Math.random() * 500,
    y: Math.random() * 500,
    rotation: Math.random() * 360
  }),
  time: 1000
}]).animate();
```

## Migration from motionBatch()

### Before
```typescript
import { motionBatch } from '@g-motion/animation';

motionBatch(targets).mark([...]).animate();
```

### After
```typescript
import { motion } from '@g-motion/animation';

motion(targets).mark([...]).animate();
```

**Note:** `motionBatch()` still works but is deprecated.

## Type Definitions

```typescript
type MarkOptions = {
  to?: any | ((index: number, entityId: number, target?: any) => any);
  time?: number | ((index: number, entityId: number) => number);
  duration?: number;
  easing?: Easing;
  stagger?: number;
  // ... other options
};
```

## Tips

1. **Auto-Detection**: Arrays automatically trigger batch mode
2. **Functions**: Use functions for per-entity customization
3. **Stagger**: Perfect for sequential animations
4. **Performance**: No overhead for single entities
5. **Control**: Unified interface for single and batch

## See Also

- [Full Documentation](./UNIFIED_MOTION_API.md)
- [Examples](../../apps/examples/src/routes/particles-burst.tsx)
