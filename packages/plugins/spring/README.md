# @g-motion/plugin-spring

Spring physics plugin for Motion animation engine, inspired by Popmotion.

## Features

- Spring-based animations with physical parameters (stiffness, damping, mass)
- Semi-implicit Euler integration for stable, accurate physics
- Per-track velocity state for independent property animations
- Auto-registration on import in browser environments
- Automatic completion detection based on rest thresholds

## Installation

```bash
pnpm add @g-motion/plugin-spring
```

## Usage

```typescript
import { motion } from '@g-motion/animation';
import '@g-motion/plugin-spring'; // Auto-registers the plugin

// Animate with spring physics
motion('#box')
  .mark({
    to: { x: 200, y: 100 },
    spring: {
      stiffness: 200,  // Higher = snappier (default: 100)
      damping: 15,     // Higher = less bouncy (default: 10)
      mass: 1,         // Heavier = slower (default: 1)
      restSpeed: 10,   // Velocity threshold for completion (default: 10)
      restDelta: 0.01  // Position threshold for completion (default: 0.01)
    }
  })
  .animate();
```

## Spring Parameters

Inspired by Popmotion's spring options:

- **stiffness** (default: 100): Spring stiffness. Higher values make the spring snappier.
- **damping** (default: 10): Opposing force to stiffness. Lower values relative to stiffness create bouncier springs.
- **mass** (default: 1): Mass of the object. Heavier objects take longer to accelerate and decelerate.
- **restSpeed** (default: 10): Absolute velocity (units/sec) below which animation can complete.
- **restDelta** (default: 0.01): Distance from target at which animation can complete.

## How It Works

The plugin registers:

1. **SpringComponent**: Stores spring parameters and per-track velocity state
2. **SpringSystem**: Runs before InterpolationSystem (order: 19), calculates physics using semi-implicit Euler integration

When a `mark()` call includes a `spring` option, the animation uses physics-based motion instead of easing-based interpolation.

### Duration vs. Physics

Spring animations are **physics-driven** and do not use the `time` parameter from `mark()`. The animation completes naturally when the spring reaches its rest state (determined by `restSpeed` and `restDelta` thresholds), not at a fixed time.

```typescript
// The time parameter is ignored for spring animations
motion('#box').mark({
  to: { x: 200 },
  time: 1000,  // This is ignored when spring is present
  spring: { stiffness: 100, damping: 10 }
}).animate();

// Animation completes when spring physics settle, not after 1000ms
```

This allows for natural, realistic motion that adapts to the spring parameters rather than forcing completion at an arbitrary time.

## Examples

### Bouncy spring

```typescript
motion('#element').mark({
  to: { x: 300 },
  spring: { stiffness: 100, damping: 5 } // Low damping = bouncy
}).animate();
```

### Stiff, quick spring

```typescript
motion('#element').mark({
  to: { x: 300 },
  spring: { stiffness: 400, damping: 30 } // High values = quick, no bounce
}).animate();
```

### Heavy object

```typescript
motion('#element').mark({
  to: { x: 300 },
  spring: { mass: 5, stiffness: 100, damping: 20 } // Sluggish movement
}).animate();
```
