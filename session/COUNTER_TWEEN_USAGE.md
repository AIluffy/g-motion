# Counter Tween Quick Usage Guide

## Basic Number Animation

Animate a number from 0 to 100 with onUpdate callback:

```typescript
import { motion } from '@g-motion/animation';

const handleStart = () => {
  motion(0)
    .mark({ to: 100, duration: 900 })
    .animate({
      onUpdate: (value) => {
        setDisplay(Math.round(value));
      }
    });
};
```

## Object Counter (Most Common)

Animate an object property for counter display:

```typescript
import { motion } from '@g-motion/animation';
import { useState, useRef } from 'react';

function Counter() {
  const targetRef = useRef({ value: 0 });
  const [display, setDisplay] = useState(0);

  const startAnimation = () => {
    targetRef.current.value = 0;

    motion(targetRef.current)
      .mark({ to: { value: 100 }, duration: 900 })
      .mark({ to: { value: 20 }, duration: 500 })
      .mark({ to: { value: 60 }, duration: 400 })
      .animate({
        onUpdate: () => {
          setDisplay(Math.round(targetRef.current.value));
        }
      });
  };

  return (
    <div>
      <div className="text-5xl font-bold">{display}</div>
      <button onClick={startAnimation}>Start Tween</button>
    </div>
  );
}
```

## Multi-Property Animation

Animate multiple properties at once:

```typescript
const data = { x: 0, y: 0, opacity: 1 };

motion(data)
  .mark({ to: { x: 100, y: 50, opacity: 0.5 }, duration: 500 })
  .animate({
    onUpdate: (props) => {
      // props contains { x, y, opacity } or individual values
      updateDisplay(props);
    }
  });
```

## Direct Object Update (No Callback)

Animation updates object directly without callback:

```typescript
const data = { count: 0 };

motion(data)
  .mark({ to: { count: 1000 }, duration: 1000 })
  .animate(); // data.count will be updated automatically

// Later, just read the value
console.log(data.count); // Will be interpolated value
```

## Animation Control

Control playback with returned control object:

```typescript
const control = motion(0)
  .mark({ to: 100, duration: 1000 })
  .animate({ onUpdate });

// Pause/resume/stop
control.pause();
control.play();
control.stop();
control.seek(500); // Seek to 500ms
```

## Easing

Apply easing functions to smooth animations:

```typescript
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

motion(0)
  .mark({
    to: 100,
    duration: 800,
    easing: easeOutQuad
  })
  .animate({ onUpdate });
```

## Examples

See working examples in the Motion example app:
- **Number tween**: `/object` route - Counter animation with callbacks
- **DOM animation**: `/dom` route - Transform animations
- **Fireworks**: `/fireworks` route - High-volume animation with GPU acceleration
