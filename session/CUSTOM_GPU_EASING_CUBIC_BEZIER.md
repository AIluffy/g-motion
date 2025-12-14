# Custom GPU Easing: Cubic Bezier Example

This example shows how to register a custom easing backed by both CPU JS and GPU WGSL using a cubic-bezier curve. Use it before creating animations so the WebGPU pipeline can include the function.

## 1) Define cubic-bezier easing (CPU + WGSL)
```ts
import { app } from '@g-motion/core';

// Control points (p1x, p1y, p2x, p2y)
const bezier = { x1: 0.4, y1: 0.0, x2: 0.2, y2: 1.0 };

// CPU easing: numeric solve of x(t)=time -> y(t)
function cubicBezier({ x1, y1, x2, y2 }: typeof bezier) {
  return function bezierEase(t: number): number {
    // Newton-Raphson with a few steps is enough for easing curves
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;

    let x = t;
    for (let i = 0; i < 5; i++) {
      const f = ((ax * x + bx) * x + cx) * x - t;
      const df = (3 * ax * x + 2 * bx) * x + cx;
      if (Math.abs(df) < 1e-6) break;
      x -= f / df;
    }
    const y = ((ay * x + by) * x + cy) * x;
    return y;
  };
}

const bezierJs = cubicBezier(bezier);

// WGSL easing: evaluates the same cubic-bezier at t
const bezierWgsl = `
fn bezierEase(t: f32) -> f32 {
    let x1: f32 = ${bezier.x1};
    let y1: f32 = ${bezier.y1};
    let x2: f32 = ${bezier.x2};
    let y2: f32 = ${bezier.y2};

    let cx = 3.0 * x1;
    let bx = 3.0 * (x2 - x1) - cx;
    let ax = 1.0 - cx - bx;
    let cy = 3.0 * y1;
    let by = 3.0 * (y2 - y1) - cy;
    let ay = 1.0 - cy - by;

    // Newton-Raphson to invert x(t) ≈ t
    var x = t;
    for (var i = 0; i < 5; i = i + 1) {
        let fx = ((ax * x + bx) * x + cx) * x - t;
        let dfx = (3.0 * ax * x + 2.0 * bx) * x + cx;
        if (abs(dfx) < 1e-6) { break; }
        x = x - fx / dfx;
    }
    let y = ((ay * x + by) * x + cy) * x;
    return y;
}
`;

app.registerGpuEasing('bezierEase', bezierJs, bezierWgsl);
```

## 2) Use it in an animation
```ts
import { motion } from '@g-motion/animation';

// After registering above, reference by function name
motion('#box')
  .mark({ to: { x: 200, y: 40 }, duration: 800, easing: bezierJs })
  .animate();
```

## Notes
- The function name `bezierEase` must match in both JS and WGSL.
- Register once on startup; the compute pipeline will rebuild to include the WGSL.
- If WebGPU is unavailable, the CPU easing still applies; GPU will use it when available.
- Adjust control points as needed; keep them in [0,1] for typical easing curves.
