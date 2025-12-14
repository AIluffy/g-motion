# Agent Notes — @g-motion/plugin-dom

Purpose: DOM rendering plugin for Motion. Registers `Transform` component and `DOMRenderSystem` when a DOM target is animated.

## Commands
- Build: `pnpm --filter @g-motion/plugin-dom run build`
- Dev/watch: `pnpm --filter @g-motion/plugin-dom run dev`
- Test: `pnpm --filter @g-motion/plugin-dom test`

## Key files
- src/index.ts — plugin entry
- src/components/transform.ts — component shape
- src/renderer.ts — applies transforms to DOM

## Guidelines
- Keep per-frame DOM writes minimal; batch style updates to avoid layout thrash.
- Maintain public exports in package.json; update examples if API changes.
- Add Vitest coverage near any behavior change.
