# Quickstart — Chainable API

## Examples

```ts
// Single target with tracks and adjust
motion('a')
  .track('x')
    .set(0, 100)
    .set(100, 150, { ease: 'linear' })
  .track('y')
    .set(0, 300)
    .set(100, 500, { spring: {} })
  .adjust({ offset: -100, scale: 0.5 })
  .animate();

// Batch mark authoring
motion('box').mark([
  { time: 0, to: { x: 0 } },
  { time: 300, to: { x: 200 } },
  { time: 800, to: { y: 10, x: 300 } },
]).animate();

// Numeric tween
motion(100).set(100, 200).animate();

// Mark array with easing
motion(100).mark([
  { time: 100, to: 200, ease: 'linear' }
]).animate();

// Multiple DOM elements via selector fan-out
motion('.item')
  .mark({ to: { x: 100 }, time: 500 })
  .animate();

// Heterogeneous array of targets (numbers, objects, selectors, elements)
const obj = { value: 0 };
const el = typeof document !== 'undefined' ? document.createElement('div') : undefined;
motion([42, obj, '.item', el!])
  .mark({ to: { value: 10 }, time: 300 })
  .animate();
```

## Notes
- `set(startTime, endTime, options?)` sets a segment; `options` may include `ease | spring | inertia`.
- `mark([...])` adds keyframes in batch; schema is serializable.
- `adjust({ offset, scale })` retimes selected marks AE-style; ordering preserved.
- Deterministic evaluation; JSON schema and GPU buffer layout available under `contracts/`.
- Targets:
  - Accepts single number, object, element, or selector.
  - Arrays of mixed targets are supported via `motion([...])` (routes to batch). `motionBatch([...])` is an alias delegating to `motion([...])`.
  - Selectors that match multiple elements fan-out to batch automatically when `document` is available.
