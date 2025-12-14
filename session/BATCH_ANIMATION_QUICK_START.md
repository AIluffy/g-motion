# Quick Start: motionBatch for Particle Systems

## 60-Second Overview

The `motionBatch` API lets you animate 1000+ entities at once with per-entity customization:

```typescript
import { motionBatch } from '@g-motion/animation';

// Create particles
const particles = Array.from({ length: 1000 }, () => ({
  x: 0, y: 0, opacity: 1
}));

// Animate with per-entity customization
motionBatch(particles)
  .mark({
    to: (index) => ({                    // Function: customize per particle
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      opacity: 0,
    }),
    time: 800,
    easing: 'easeOutQuad',
  })
  .animate();
```

## Installation

```bash
pnpm install @g-motion/animation
```

## Basic Usage

### 1. Simple Fade Out
```typescript
import { motionBatch } from '@g-motion/animation';

const elements = document.querySelectorAll('.particle');

motionBatch(Array.from(elements))
  .mark({ to: { opacity: 0 }, time: 500 })
  .animate();
```

### 2. Staggered Animation
```typescript
motionBatch(elements)
  .mark({
    to: { scale: 1.5 },
    time: 300,
    stagger: 50,  // Each starts 50ms after previous
  })
  .mark({
    to: { scale: 1 },
    time: 300,
  })
  .animate();
```

### 3. Radial Burst (Fireworks)
```typescript
const particles = Array.from({ length: 300 }, () => ({
  x: centerX,
  y: centerY,
  opacity: 1,
  scale: 1,
}));

motionBatch(particles)
  .mark({
    to: (index) => {
      const angle = (index / 300) * Math.PI * 2;
      const distance = 200;
      return {
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance,
        opacity: 0,
        scale: 0.1,
      };
    },
    time: 800,
    easing: 'easeOutQuad',
  })
  .animate();
```

### 4. With Update Callback
```typescript
const batch = motionBatch(particles)
  .mark({ to: { x: 100, y: 100 }, time: 1000 })
  .animate({
    onUpdate: () => {
      // Called every frame
      render();
    },
  });

// Playback control
batch.play();
batch.pause();
batch.stop();
```

### 5. Cleanup
```typescript
const batch = motionBatch(particles)
  .mark({ to: { opacity: 0 }, time: 800 })
  .animate();

// After animation completes
batch.destroy(true);  // Remove entities and DOM
```

## Common Patterns

### Pattern: Spiral Out
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

### Pattern: Cascade Effect
```typescript
motionBatch(elements)
  .mark({
    to: { opacity: 1 },
    time: 500,
    easing: 'easeOutCubic',
  })
  .animate({
    delay: (index) => index * 50,  // Each element delays more
  });
```

### Pattern: Wave Motion
```typescript
motionBatch(particles)
  .mark({
    to: (index) => ({
      y: baseY + Math.sin((index / count) * Math.PI) * amplitude,
      x: baseX + (index / count) * 500,
    }),
    time: 1000,
  })
  .animate();
```

## API Quick Reference

### motionBatch(targets)
- **targets**: Array of objects, DOM elements, or entity IDs
- **Returns**: MotionBatchBuilder

### .mark(options)
- **to**: Static object OR function `(index, entityId, target) => object`
- **time**: Number OR function `(index, entityId) => number`
- **easing**: Easing function or name ('easeInQuad', 'easeOutQuad', etc.)
- **stagger**: Delay between each entity start (ms)
- **spring/inertia**: Physics options (optional)

### .animate(options)
- **onUpdate**: Callback called every frame
- **delay**: Initial delay before animation starts (ms)
- **repeat**: Number of times to repeat

### BatchAnimationControl
- **play()**: Resume animation
- **pause()**: Pause animation
- **stop()**: Stop and reset
- **destroy()**: Clean up entities
- **getEntityIds()**: Get all entity IDs
- **getCount()**: Get number of entities

## Real-World Examples

### Fireworks on Click
```typescript
function createFireworks(event: MouseEvent) {
  const particles = Array.from({ length: 200 }, () => ({
    x: event.clientX,
    y: event.clientY,
    opacity: 1,
  }));

  motionBatch(particles)
    .mark({
      to: (index) => {
        const angle = Math.random() * Math.PI * 2;
        const distance = 150 + Math.random() * 150;
        return {
          x: event.clientX + Math.cos(angle) * distance,
          y: event.clientY + Math.sin(angle) * distance,
          opacity: 0,
        };
      },
      time: 800,
    })
    .animate();
}

document.addEventListener('click', createFireworks);
```

### Staggered List Items
```typescript
const items = document.querySelectorAll('.list-item');

motionBatch(Array.from(items))
  .mark({
    to: { opacity: 1, x: 0 },
    time: 500,
    easing: 'easeOutQuad',
  })
  .animate({
    delay: (index) => index * 100,  // Stagger each item
  });
```

### Weather Effect (Rain)
```typescript
function createRaindrops() {
  const raindrops = Array.from({ length: 50 }, () => ({
    x: Math.random() * window.innerWidth,
    y: -10,
    opacity: 0.7,
  }));

  motionBatch(raindrops)
    .mark({
      to: {
        y: window.innerHeight,
        opacity: 0,
      },
      time: (index) => 1000 + Math.random() * 500,
    })
    .animate();
}

setInterval(createRaindrops, 200);
```

### Game Explosion FX
```typescript
function createExplosion(x: number, y: number) {
  const particles = Array.from({ length: 100 }, () => ({
    x, y, scale: 1,
  }));

  const batch = motionBatch(particles)
    .mark({
      to: (index) => {
        const angle = (index / 100) * Math.PI * 2;
        return {
          x: x + Math.cos(angle) * 300,
          y: y + Math.sin(angle) * 300,
          scale: 0,
        };
      },
      time: 600,
      easing: 'easeOutQuad',
    })
    .animate();

  // Auto-cleanup
  setTimeout(() => batch.destroy(true), 700);
}
```

## Performance Tips

1. **Group by Count**: 100-500 particles per batch works best
2. **Use Functions**: Compute values at animate time, not beforehand
3. **Cleanup**: Always call destroy() or remove DOM after animation
4. **Stagger Wisely**: Use small stagger (0-100ms) for sequential effects
5. **Multiple Batches**: OK to create 10+ batches for complex scenes

## Troubleshooting

### Particles not animating?
- Check targets array is not empty
- Verify .mark() and .animate() are called
- Use .animate({ onUpdate: () => render() }) if using custom rendering

### Animation lags?
- Reduce particle count (try 500 instead of 1000)
- Simplify to() function (avoid heavy computations)
- Check browser performance metrics (DevTools)

### Cleanup issues?
- Always call batch.destroy(true) when done
- Or remove DOM elements manually after animation

## See Also

- Full API Documentation: `BATCH_ANIMATION_API_QUICK_REFERENCE.md`
- Implementation Details: `BATCH_ANIMATION_API_IMPLEMENTATION.md`
- Example: `/particles-burst` route in examples app
- Motion Spec: `specs/001-motion-engine/spec.md`

## Try It Now

```bash
cd apps/examples
pnpm dev
# Visit http://localhost:5173/particles-burst
```

Enjoy high-performance particle animations! 🎆
