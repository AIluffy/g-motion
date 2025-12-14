# Quickstart: Motion Engine

## Installation

```bash
npm install @g-motion/core @g-motion/animation
```

## Basic Usage

### 1. Simple Number

```typescript
import { motion } from '@g-motion/animation';

// Animate a number from 0 to 100
const control = motion(0)
  .mark({ to: 100, duration: 1000 })
  .animate({
    onUpdate: (val) => console.log(val)
  });
```

### 2. DOM Animation

```typescript
import { motion } from '@g-motion/animation';

// Animate a DOM element
// Automatically handles transform styles
motion('#box')
  .mark({
    to: { x: 100, rotate: 90 },
    duration: 500,
    easing: 'easeOut'
  })
  .animate();
```

### 3. Timeline Sequence

```typescript
import { motion } from '@g-motion/animation';

motion('.card')
  .mark({ to: { opacity: 1, y: 0 }, duration: 500 }) // Fade in
  .mark({ to: { scale: 1.1 }, duration: 200 })       // Pulse up
  .mark({ to: { scale: 1.0 }, duration: 200 })       // Pulse down
  .animate({ delay: 200 });
```

### 4. Object Animation

```typescript
const hero = { x: 0, hp: 100 };

motion(hero)
  .mark({ to: { x: 500, hp: 50 }, duration: 2000 })
  .animate({
    onUpdate: () => renderHero(hero)
  });
```

## Advanced: Plugins

```typescript
import { motion, registerPlugin } from '@g-motion/animation';
import { SpringPhysics } from '@g-motion/plugin-spring';

registerPlugin(SpringPhysics);

motion('#box')
  .mark({
    to: { x: 100 },
    easing: 'spring(100, 10)' // Use spring physics
  })
  .animate();
```
