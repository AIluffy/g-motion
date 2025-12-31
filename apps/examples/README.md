Welcome to your new TanStack app!

# Getting Started

To run this application:

```bash
pnpm install
# apps/examples

Example React app showcasing Motion usage with @g-motion/animation.

## Run
```bash
pnpm install
pnpm dev        # or pnpm --filter ./apps/examples dev
```

## Build / Test
```bash
pnpm build      # turbo builds all; filter with pnpm build:apps
pnpm test       # repo tests; filter if needed
```

## What to look at
- src/routes/index.tsx — hub page with inline timeline/repeat demo and links to routes.
- src/routes/animation-controller-demo.tsx — animation controller usage demo (player controls, seek, loop, speed).
- src/components/player-controller.tsx — reusable player controller UI for AnimationControl.
- src/routes/dom.tsx — DOM transform demo with controls.
- src/routes/object.tsx — object/callback demo reflecting values in React state.
- src/main.tsx — app bootstrap (Vite + TanStack Router).

## Using Motion here
```ts
import { motion } from '@g-motion/animation';

motion('#box').mark({ to: { x: 160, y: 40 } }).animate();

// Fan-out to multiple DOM elements via selector
motion('.item').mark({ to: { x: 100 }, time: 500 }).animate();

// Group mixed targets inside an array
const el = document.getElementById('box');
const obj = { value: 0 };
motion([el, obj, 42, '.item']).mark({ to: { value: 10 }, time: 300 }).animate();
```

If you change public APIs in packages/*, update these demos accordingly and re-run `pnpm dev` to verify behavior.
