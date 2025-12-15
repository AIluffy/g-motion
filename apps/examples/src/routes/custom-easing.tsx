import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { motion, type AnimationControl } from '@g-motion/animation';
import { app } from '@g-motion/core';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { linkButtonClass } from '@/components/ui/link-styles';

const boxId = 'custom-easing-box';
const bezier = { x1: 0.4, y1: 0.0, x2: 0.2, y2: 1.0 };

// CPU cubic-bezier easing (function name must match WGSL fn for GPU lookup)
function cubicBezierEase(t: number): number {
  const { x1, y1, x2, y2 } = bezier;
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
}

// WGSL counterpart injected into the compute shader
const cubicBezierEaseWgsl = `
fn cubicBezierEase(t: f32) -> f32 {
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

let registered = false;
function ensureGpuEasing() {
  if (registered) return;
  registered = true;
  app.registerGpuEasing('cubicBezierEase', cubicBezierEase, cubicBezierEaseWgsl);
}

export const Route = createFileRoute('/custom-easing')({
  component: CustomEasingDemo,
});

function CustomEasingDemo() {
  const controlRef = useRef<AnimationControl | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    ensureGpuEasing();
    return () => controlRef.current?.stop();
  }, []);

  const reset = () => {
    const el = document.getElementById(boxId);
    if (el) {
      el.style.transform = 'translate3d(0px, 0px, 0px) scale(1, 1) rotate(0deg)';
    }
  };

  const start = () => {
    controlRef.current?.stop();
    const control = motion(`#${boxId}`)
      .mark([{ to: { x: 220, y: 0, rotate: 10 }, at: 800, ease: cubicBezierEase }])
      .mark([{ to: { x: 0, y: 0, rotate: 0 }, at: 1400, ease: cubicBezierEase }])
      .animate({ repeat: 0 });
    controlRef.current = control;
    setIsRunning(true);
    window.setTimeout(() => setIsRunning(false), 1500);
  };

  const stop = () => {
    controlRef.current?.stop();
    setIsRunning(false);
    reset();
  };

  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Custom easing</p>
            <h1 className="text-2xl font-semibold text-slate-50">Cubic-bezier on CPU + GPU</h1>
            <p className="text-slate-300">
              Registers a cubic-bezier easing, injects WGSL into the compute shader, and uses it for
              DOM transforms.
            </p>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Animated box</CardTitle>
            <CardDescription>
              The easing curve is custom (0.4, 0.0, 0.2, 1.0). GPU path uses injected WGSL; CPU path
              uses the JS function.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative h-48 flex-1 rounded-lg border border-slate-800 bg-slate-900/60">
                <div
                  id={boxId}
                  className="absolute left-8 top-14 h-16 w-16 rounded-lg bg-indigo-400 shadow-lg shadow-indigo-800/50"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={start} disabled={isRunning}>
                  {isRunning ? 'Running…' : 'Start with cubic-bezier'}
                </Button>
                <Button variant="ghost" onClick={stop}>
                  Stop / reset
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="text-sm text-slate-300">
            The easing function is registered via{' '}
            <span className="font-mono text-slate-100">app.registerGpuEasing</span>. On
            WebGPU-capable browsers the compute pipeline recompiles to include the WGSL.
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
