# motionBatch API Quick Reference

## Installation & Import
```typescript
import { motionBatch } from '@g-motion/animation';
```

## Basic Syntax
```typescript
motionBatch(targets)
  .mark(options)
  .mark(options)
  .animate(playbackOptions);
```

## API Methods

### motionBatch(targets?: any[])
Creates a batch animation builder.

**Parameters:**
- `targets`: Array of animation targets (objects, DOM elements, selectors, or entity IDs)

**Returns:** `MotionBatchBuilder`

```typescript
// Array of plain objects
const particles = Array.from({ length: 1000 }, () => ({ x: 0, y: 0 }));
motionBatch(particles);

// DOM elements
const elements = document.querySelectorAll('.particle');
motionBatch(Array.from(elements));

// Entity IDs
motionBatch([entity1Id, entity2Id, ...]);
```

### .mark(options: PerEntityMarkOptions)
Add a keyframe with optional per-entity customization.

**Options:**
```typescript
interface PerEntityMarkOptions {
  // Target values (static or computed per-entity)
  to?: Record<string, number> |
       ((index: number, entityId: number, target?: any) => Record<string, number>);

  // Duration (static or computed per-entity)
  time?: number |
         ((index: number, entityId: number) => number);

  // Easing function
  easing?: ((t: number) => number) | string;

  // Physics options
  spring?: SpringOptions;
  inertia?: InertiaOptions;

  // Stagger delay between entities (ms)
  stagger?: number;
}
```

**Chainable:** Returns `this` for method chaining

```typescript
// Static values - all particles animate the same
batch.mark({ to: { opacity: 0 }, time: 500 });

// Per-entity function - each particle animates differently
batch.mark({
  to: (index) => ({
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  }),
  time: (index) => 800 + index * 50,  // Staggered timing
});
```

### .animate(options?)
Execute the animation.

**Options:**
```typescript
interface AnimateOptions {
  onUpdate?: (val: any) => void;  // Called every frame
  delay?: number;                  // Initial delay (ms)
  repeat?: number;                 // Number of repeats
}
```

**Returns:** `BatchAnimationControl`

```typescript
const batch = motionBatch(particles)
  .mark({ to: { opacity: 0 }, time: 500 })
  .animate({
    onUpdate: () => renderFrame(),
    delay: 100,
    repeat: 2,
  });
```

## BatchAnimationControl API

Once you call `.animate()`, you get a `BatchAnimationControl` object for playback:

### Playback Methods
```typescript
batch.play();       // Resume animation
batch.pause();      // Pause animation
batch.stop();       // Stop and reset
batch.destroy();    // Clean up and remove entities
```

### Query Methods
```typescript
batch.getEntityIds();      // Get entity IDs: number[]
batch.getControls();       // Get AnimationControl[]: individual controls
batch.getCount();          // Get particle count: number
```

## Patterns & Examples

### Pattern 1: Radial Burst (Fireworks)
```typescript
const particles = Array.from({ length: 1000 }, () => ({ x, y, opacity: 1 }));

motionBatch(particles)
  .mark({
    to: (index, _, target) => {
      const angle = (index / 1000) * Math.PI * 2;
      const distance = 300;
      return {
        x: target.x + Math.cos(angle) * distance,
        y: target.y + Math.sin(angle) * distance,
        opacity: 0,
      };
    },
    time: 800,
    easing: 'easeOutQuad',
  })
  .animate({ onUpdate: render });
```

### Pattern 2: Sequential Cascade
```typescript
motionBatch(elements)
  .mark({
    to: { scale: 1.2 },
    time: 300,
    stagger: 50,  // Each element starts 50ms later
  })
  .mark({
    to: { scale: 1 },
    time: 300,
  })
  .animate();
```

### Pattern 3: Spiral Animation
```typescript
motionBatch(particles)
  .mark({
    to: (index) => {
      const angle = (index / count) * Math.PI * 4;  // 2 rotations
      const distance = 50 + (index / count) * 300;
      return {
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance,
      };
    },
    time: 1200,
  })
  .animate();
```

### Pattern 4: Physics (Spring/Inertia)
```typescript
motionBatch(objects)
  .mark({
    to: { x: 100, y: 100 },
    spring: { stiffness: 100, damping: 10 },
  })
  .animate();
```

### Pattern 5: Dynamic Duration Per-Entity
```typescript
motionBatch(elements)
  .mark({
    to: { x: endX },
    time: (index) => 500 + Math.random() * 1000,  // 500-1500ms per element
  })
  .animate();
```

## Performance Tips

1. **Use Function Parameters**: Compute complex patterns with functions instead of pre-computing
2. **Batch Large Sets**: Group 1000+ entities into single batch operation
3. **Cleanup**: Call `batch.destroy()` or remove elements to prevent memory leaks
4. **Stagger Wisely**: Use `stagger` for sequential effects, not for performance
5. **Pre-allocate**: Create objects/DOM elements before batching

## Comparison with motion()

### Single Entity
```typescript
import { motion } from '@g-motion/animation';

motion(target)
  .mark({ to: { x: 100 }, time: 500 })
  .animate();
```

### Batch of Entities (1000+)
```typescript
import { motionBatch } from '@g-motion/animation';

const particles = [...];
motionBatch(particles)
  .mark({ to: (i) => ({ x: 100 * i }), time: 500 })
  .animate();
```

## Common Patterns

### Update Callback with onUpdate
```typescript
let frameCount = 0;
motionBatch(particles)
  .mark({ to: { x: 100 }, time: 500 })
  .animate({
    onUpdate: () => {
      frameCount++;
      renderAllParticles(particles);
    },
  });
```

### Cleanup After Animation
```typescript
const batch = motionBatch(particles).mark({...}).animate();

setTimeout(() => {
  batch.destroy(true);  // Removes DOM and cleans up entities
}, animationDuration);
```

### Stagger Effect
```typescript
// Each element starts 100ms after the previous
motionBatch(elements)
  .mark({
    to: { opacity: 1 },
    time: 500,
    stagger: 100,  // 100ms between each start
  })
  .animate();
```

## Advanced: Function Context

When using function parameters, the callback receives:
- **index**: Zero-based index in the array (0 to targets.length-1)
- **entityId**: Internal entity ID assigned by Motion
- **target**: The original target object/element

```typescript
motionBatch(particles)
  .mark({
    to: (index, entityId, target) => {
      console.log(`Particle ${index} (entity ${entityId})`);
      console.log('Original target:', target);
      return { x: 100 };
    },
  })
  .animate();
```

## Limitations & Considerations

1. **No onComplete Callback**: Use batch.destroy() or setTimeout instead
2. **Individual Control**: Each animation is independent, not synchronized
3. **Render Updates**: onUpdate is called once per frame, not per-entity
4. **DOM Performance**: For 5000+ DOM elements, consider Canvas/WebGL

## Real-World Use Cases

- 🎆 **Fireworks**: Radial particle burst patterns
- 🌧️ **Weather**: Rain/snow/dust particle systems
- 🎯 **Game FX**: Explosion effects, hit sparks, collectible animations
- 📊 **Data Viz**: Animated bar chart updates, scatter plot transitions
- ✨ **UI Effects**: Staggered list animations, cascade opens
- 🔮 **Generative Art**: Complex movement patterns synchronized across entities
