# @g-motion/plugin-dom

DOM integration for Motion. Provides `Transform` component and `DOMRenderSystem` so Motion timelines can mutate DOM elements.

## Use
```ts
import { motion } from '@g-motion/animation';

motion('#box')
	.mark({ to: { x: 120, y: 40, scaleX: 1.1 } })
	.animate();
```

When `motion()` detects a DOM target, it registers Transform + DOM renderer automatically.

## Develop
- Build: `pnpm --filter @g-motion/plugin-dom run build`
- Test: `pnpm --filter @g-motion/plugin-dom test`

## Key files
- src/components/transform.ts — Transform component shape
- src/renderer.ts — applies transform values to DOM (translate/scale/rotate)
- src/index.ts — plugin entry

## Notes
- Keep DOM writes batched per frame; avoid layout thrash.
- Public exports must stay aligned with package.json `exports`.
