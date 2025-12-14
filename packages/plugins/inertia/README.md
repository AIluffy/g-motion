# @g-motion/plugin-inertia

Inertia physics plugin for G-Motion animation engine, providing momentum-based motion with exponential decay and optional boundary bounce.

Inspired by [Popmotion's inertia animation](https://popmotion.io/#quick-start-animation-inertia).

## Features

- **Velocity-driven motion**: Animations driven by initial velocity rather than target position
- **Exponential decay**: Natural deceleration simulating friction/momentum
- **Snap-to control**: GSAP-inspired end parameter for precise landing (exact value, array, or custom function)
- **Automatic velocity tracking**: Track property changes and calculate velocity automatically (via VelocityTracker)
- **Boundary bounce**: Optional spring physics when hitting min/max boundaries
- **Track-level independence**: Different tracks can use different physics (inertia, spring, or standard)
- **Implicit boundaries**: Automatically infer boundaries from `to` parameter based on velocity direction
- **Function-based velocity**: Support dynamic velocity calculation at animation start

## Installation

```bash
pnpm add @g-motion/plugin-inertia
```

## Usage

### Basic Decay Animation

```typescript
import { motion } from '@g-motion/animation';
import '@g-motion/plugin-inertia'; // Auto-registers the plugin

// Pure decay with no boundaries
motion('#element')
  .mark({
    inertia: {
      velocity: 800, // Units per second
      power: 0.8, // Target distance factor (optional)
      timeConstant: 350, // Decay duration in ms (optional)
    },
  })
  .animate();
```

### Explicit Boundary Bounce

```typescript
motion('#element')
  .mark({
    inertia: {
      velocity: 1000,
      min: 0,
      max: 500,
      bounceStiffness: 400, // Spring stiffness for bounce
      bounceDamping: 10, // Spring damping for bounce
    },
  })
  .animate();
```

### Implicit Boundary from 'to' Parameter

When `to` is provided, it acts as a boundary based on velocity direction:
- `velocity > 0`: `to` becomes the **max** boundary
- `velocity < 0`: `to` becomes the **min** boundary

```typescript
motion('#element')
  .mark({
    to: { x: 300 }, // Acts as max boundary (velocity is positive)
    inertia: {
      velocity: 600,
    },
  })
  .animate();
```

### Dynamic Velocity (e.g., from drag gesture)

```typescript
let dragVelocity = 0;

// ... track drag velocity during interaction ...

motion('#element')
  .mark({
    inertia: {
      velocity: () => dragVelocity, // Resolved at animation start
    },
  })
  .animate();
```

### Snap to Exact Value

Ensure the animation ends at a specific position:

```typescript
motion('#element')
  .mark({
    inertia: {
      velocity: 800,
      end: 500, // Will end exactly at 500px
    },
  })
  .animate();
```

### Snap to Grid/Array

Perfect for carousels, tabs, or grid layouts:

```typescript
// Snap to closest value in array
motion('#element')
  .mark({
    inertia: {
      velocity: 1000,
      end: [0, 100, 200, 300, 400], // Snaps to nearest value
    },
  })
  .animate();
```

### Custom Snap Function

Use a function for advanced snap logic:

```typescript
// Snap to 50px increments
motion('#element')
  .mark({
    inertia: {
      velocity: 750,
      end: (naturalEnd) => Math.round(naturalEnd / 50) * 50,
    },
  })
  .animate();

// Wheel spinner: snap to degrees
motion('#wheel')
  .mark({
    inertia: {
      velocity: 2000,
      end: (naturalEnd) => Math.round(naturalEnd / 45) * 45, // 8 segments
    },
  })
  .animate();
```

### Automatic Velocity Tracking

Track property changes and calculate velocity automatically:

```typescript
import { VelocityTracker } from '@g-motion/plugin-inertia';

const element = document.querySelector('#draggable');

// Start tracking x and y properties
VelocityTracker.track(element, ['x', 'y']);

// ... user drags element ...

// Get tracked velocity at animation start
motion(element)
  .mark({
    inertia: {
      velocity: 'auto', // Uses VelocityTracker (future feature)
      velocitySource: (track) => VelocityTracker.getVelocity(element, track),
      // OR manually retrieve:
      // velocity: VelocityTracker.getVelocity(element, 'x')
    },
  })
  .animate();

// Stop tracking when done
VelocityTracker.untrack(element);
```

### Mixed Physics (track-level independence)

Different tracks can use different physics:

```typescript
import '@g-motion/plugin-spring';
import '@g-motion/plugin-inertia';

// X-axis uses inertia, Y-axis uses spring
motion('#element')
  .mark({
    to: { x: 300, y: 100 },
    inertia: { velocity: 800 }, // Applied to x-axis
  })
  .mark({
    to: { y: 100 },
    spring: { stiffness: 200, damping: 15 }, // Applied to y-axis
  })
  .animate();
```

## API Reference

### InertiaOptions

```typescript
interface InertiaOptions {
  velocity?: number | 'auto' | (() => number);
  velocitySource?: (track: string, ctx: { target: any }) => number; // For 'auto'

  // Snap-to control (GSAP-inspired)
  snap?: number | number[] | ((naturalEnd: number) => number); // Preferred
  end?: number | number[] | ((naturalEnd: number) => number); // Alias
  modifyTarget?: (target: number) => number;

  // Boundary constraints
  bounds?: { min?: number; max?: number };
  min?: number;
  max?: number;
  clamp?: boolean; // Clamp instead of bounce

  // Physics parameters
  resistance?: number;
  duration?: number | { min: number; max: number }; // normalized to timeConstant
  power?: number;
  timeConstant?: number;

  // Bounce parameters
  bounce?: false | { stiffness?: number; damping?: number; mass?: number };
  bounceStiffness?: number; // Legacy
  bounceDamping?: number; // Legacy
  bounceMass?: number; // Legacy

  // Optional handoff into spring when decay/bounce completes
  handoff?: { type: 'spring'; to?: number };

  // Completion thresholds
  restSpeed?: number;
  restDelta?: number;
}
```

### Snap-To Behavior

The `end` parameter calculates a snap target based on the natural end position:

1. **Natural end calculation**: `currentValue + velocity * (timeConstant / 1000)`
2. **Snap target processing**:
   - `number`: Uses exact value as snap target
   - `number[]`: Finds closest value in array
   - `function`: Calls function with natural end, returns snap target
3. **Boundary integration**: Snap target acts as boundary (max if velocity > 0, min if velocity < 0)
4. **Physics**: Decays until reaching snap target, then spring bounce to settle

### Physics Formula

**Decay phase** (no boundary hit):
```
velocity(t) = velocity₀ × exp(-t / timeConstant)
position(t) = position₀ + ∫ velocity(t) dt
```

**Bounce phase** (boundary hit):
- Switches to spring physics using semi-implicit Euler integration
- Target position is the boundary value
- Uses `bounceStiffness`, `bounceDamping`, and `bounceMass` parameters

### Completion Conditions

Animation completes when **all tracks** satisfy:
1. `|velocity| < restSpeed`, AND
2. Position is stable (within `restDelta` of target/boundary)

## Comparison with Spring Plugin

| Aspect | Inertia | Spring |
|--------|---------|--------|
| **Driving Force** | Initial velocity | Target position |
| **Physics** | Exponential decay | Hooke's law (F = -kx) |
| **Use Case** | Momentum/flick gestures | Natural settle to target |
| **Duration** | Controlled by `timeConstant` | Physics-determined |
| **Boundaries** | Optional with bounce | N/A |
| **Target** | Calculated from velocity & power | Explicit `to` value |

## Examples

See the [examples app](../../apps/examples/src/routes/inertia.tsx) for interactive demonstrations:
- Pure decay animation
- Boundary bounce behavior
- Implicit boundary inference
- Mixed physics (inertia + spring)
- Dynamic velocity control
- **Snap to exact value** (GSAP-inspired)
- **Snap to grid/array** (carousel, tabs)
- **Custom snap function** (wheel spinner, custom logic)

## Manual Registration

The plugin auto-registers in browser environments. For manual registration:

```typescript
import { app } from '@g-motion/core';
import { InertiaPlugin } from '@g-motion/plugin-inertia';

InertiaPlugin.setup(app);
```

## Conflict Detection

Using both `spring` and `inertia` on the same track will throw an error:

```typescript
// ❌ This will throw an error
motion('#element')
  .mark({
    to: { x: 100 },
    spring: { stiffness: 200 },
    inertia: { velocity: 500 }, // Conflict!
  })
  .animate();
```

Use different tracks or choose one physics model per property.

## License

MIT
