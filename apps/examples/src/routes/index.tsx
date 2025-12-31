import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimationControl } from '@g-motion/animation';

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

const timelineBoxId = 'timeline-demo-box';

export const Route = createFileRoute('/')({
  component: Hub,
});

function Hub() {
  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-col gap-3">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Motion Examples</p>
          <h1 className="text-3xl font-semibold text-slate-50">@g-motion/animation live demos</h1>
          <p className="max-w-3xl text-slate-300">
            Small examples showing the chainable Motion builder for DOM transforms and
            callback/object tweens. Routes below split the demos; the inline card demonstrates a
            simple timeline with repeat-like yoyo behavior.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/dom" className={linkButtonClass('primary')}>
              Open DOM demo
            </Link>
            <Link to="/dom-3d" className={linkButtonClass('ghost')}>
              Open 3D DOM demo
            </Link>
            <Link to="/object" className={linkButtonClass('ghost')}>
              Open callback demo
            </Link>
            <Link to={'/animate' as any} className={linkButtonClass('ghost')}>
              Open animate() demo
            </Link>
            <Link to="/webgpu" className={linkButtonClass('ghost')}>
              GPU stress test
            </Link>
            <Link to="/gpu-config" className={linkButtonClass('ghost')}>
              GPU configuration
            </Link>
            <Link to="/custom-easing" className={linkButtonClass('ghost')}>
              Custom easing (GPU)
            </Link>
            <Link to="/spring" className={linkButtonClass('ghost')}>
              Spring physics
            </Link>
            <Link to="/particles-fps" className={linkButtonClass('ghost')}>
              Particle FPS control
            </Link>
            <Link to="/benchmark" className={linkButtonClass('ghost')}>
              Benchmark
            </Link>
            <Link to="/gpu-delivery-demo" className={linkButtonClass('ghost')}>
              GPU Delivery (new)
            </Link>
            <Link to="/gpu-only-interpolation" className={linkButtonClass('ghost')}>
              GPU-only interpolation
            </Link>
            <Link to="/engine-config" className={linkButtonClass('ghost')}>
              Engine Configuration
            </Link>
            <Link to={'/animation-controller-demo' as any} className={linkButtonClass('ghost')}>
              Animation controller
            </Link>
            <Link to={'/dev-debug' as any} className={linkButtonClass('ghost')}>
              Dev debug panel
            </Link>
          </div>
        </header>

        <TimelineCard />

        <div className="section-grid">
          <Card>
            <CardHeader>
              <CardTitle>DOM transform demo</CardTitle>
              <CardDescription>
                Animate a DOM element with chained marks and basic controls.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Uses the DOM plugin automatically when targeting an element.
              </div>
              <Link to="/dom" className={linkButtonClass('primary')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>animate() only demo</CardTitle>
              <CardDescription>
                Focused page showing one-shot animate() for DOM and plain objects.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Uses animate() directly instead of the chainable motion() builder.
              </div>
              <Link to={'/animate' as any} className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>DOM 3D transform demo</CardTitle>
              <CardDescription>
                Translate in Z and rotate on X/Y to create a 3D tilt.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Uses <span className="font-mono text-slate-100">rotateX</span>,{' '}
                <span className="font-mono text-slate-100">rotateY</span>,{' '}
                <span className="font-mono text-slate-100">translateZ</span>.
              </div>
              <Link to="/dom-3d" className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Callback/object demo</CardTitle>
              <CardDescription>
                Tween a numeric value with a callback hook for React state updates.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Shows non-DOM usage for counters or data viz.
              </div>
              <Link to="/object" className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>WebGPU stress test</CardTitle>
              <CardDescription>
                Extreme scale: 1K and 5K concurrent DOM animations with GPU batch processing.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Tests batch sampling and GPU compute dispatch pipeline.
              </div>
              <Link to="/webgpu" className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>GPU configuration control</CardTitle>
              <CardDescription>
                Test WebGPU acceleration with configurable modes and easing functions via form
                controls.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Interactive dashboard for GPU compute mode and threshold configuration.
              </div>
              <Link to="/gpu-config" className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom GPU easing</CardTitle>
              <CardDescription>
                Register a cubic-bezier easing for both CPU and GPU paths and apply it to DOM
                motion.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">Shows custom WGSL injection at runtime.</div>
              <Link to="/custom-easing" className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spring physics</CardTitle>
              <CardDescription>
                Spring-based animations with stiffness, damping, and mass parameters using
                semi-implicit Euler integration.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Physics-driven motion inspired by Popmotion.
              </div>
              <Link to="/spring" className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Particles FPS control</CardTitle>
              <CardDescription>
                150 DOM particles animated with Motion; retime animations via FPS slider.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Demonstrates rebuilding timelines on-the-fly with slider-controlled pacing.
              </div>
              <Link to="/particles-fps" className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Animation speed benchmark</CardTitle>
              <CardDescription>
                Stress test DOM writes with layout properties vs transforms.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">Includes overdue (&gt;150ms) tracking.</div>
              <Link to="/benchmark" className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>GPU Result Delivery</CardTitle>
              <CardDescription>
                Multi-channel GPU compute results applied to DOM via GPUResultApplySystem.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Demonstrates GPU readback, queue, and delivery pipeline.
              </div>
              <Link to="/gpu-delivery-demo" className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>GPU-only interpolation</CardTitle>
              <CardDescription>
                Skip the CPU InterpolationSystem completely while GPU compute is healthy.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Demonstrates gpuOnlyInterpolation with automatic CPU fallback on GPU errors.
              </div>
              <Link to="/gpu-only-interpolation" className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Engine Configuration</CardTitle>
              <CardDescription>
                Global engine control for animation speed, FPS limiting, and GPU mode configuration.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Interactive controls for speed multiplier, frame rate, and GPU acceleration.
              </div>
              <Link to="/engine-config" className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Animation controller demo</CardTitle>
              <CardDescription>
                Player-style controls for timelines: play/pause/stop, loop modes, speed, and seek.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Demonstrates frame/time mapping (Comp FPS) and negative playback rate (reverse).
              </div>
              <Link to={'/animation-controller-demo' as any} className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dev error debug panel</CardTitle>
              <CardDescription>
                Inspect MotionError events captured by the global ErrorHandler in development.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <div className="text-sm text-slate-300">
                Shows strict target resolution errors and selector warnings in real time.
              </div>
              <Link to={'/dev-debug' as any} className={linkButtonClass('ghost')}>
                View demo
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TimelineCard() {
  const controlRef = useRef<AnimationControl | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [debugInfo, setDebugInfo] = useState({
    currentTime: 0,
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
  });

  const resetBox = () => {
    const el = document.getElementById(timelineBoxId);
    if (el) {
      el.style.transform = 'translate3d(0px, 0px, 0px) scale(1, 1) rotate(0deg)';
    }
  };

  const start = () => {
    controlRef.current?.stop();

    const control = motion(`#${timelineBoxId}`)
      .mark([{ to: { x: 140, y: 140, rotate: 360, scale: 2 }, at: 600 }])
      .play();

    controlRef.current = control;
    setIsRunning(true);
  };

  const stop = () => {
    controlRef.current?.stop();
    setIsRunning(false);
    resetBox();
    setDebugInfo({
      currentTime: 0,
      x: 0,
      y: 0,
      rotate: 0,
      scale: 1,
    });
  };

  useEffect(() => {
    return () => {
      controlRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    let frameId: number | null = null;

    const loop = () => {
      if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        const el = document.getElementById(timelineBoxId);
        const control = controlRef.current;

        if (el && control) {
          const currentTime = control.getCurrentTime();
          const computedStyle = window.getComputedStyle(el);
          const transform = computedStyle.transform;

          if (transform && transform !== 'none') {
            const matrix = new DOMMatrix(transform);
            const x = matrix.e;
            const y = matrix.f;
            const scale = Math.hypot(matrix.a, matrix.b);
            const rotate = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;

            setDebugInfo({
              currentTime,
              x,
              y,
              rotate,
              scale,
            });
          }
        }
      }

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isRunning]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inline timeline demo</CardTitle>
        <CardDescription>
          Two marks form a forward and backward pass; repeating once makes it feel like yoyo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative h-36 flex-1 rounded-lg border border-slate-800 bg-slate-900/60">
            <div
              id={timelineBoxId}
              className="absolute left-6 top-6 h-16 w-16 rounded-lg bg-sky-500 shadow-lg shadow-sky-800/50"
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <Button onClick={start} disabled={isRunning}>
                {isRunning ? 'Running…' : 'Start'}
              </Button>
              <Button variant="ghost" onClick={stop}>
                Reset
              </Button>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Debug timeline state
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>
                  <span className="text-slate-400">currentTime</span>{' '}
                  <span className="font-mono">
                    {debugInfo.currentTime.toFixed(1)}
                    ms
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">x</span>{' '}
                  <span className="font-mono">
                    {debugInfo.x.toFixed(1)}
                    px
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">y</span>{' '}
                  <span className="font-mono">
                    {debugInfo.y.toFixed(1)}
                    px
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">rotate</span>{' '}
                  <span className="font-mono">{debugInfo.rotate.toFixed(1)}°</span>
                </div>
                <div>
                  <span className="text-slate-400">scale</span>{' '}
                  <span className="font-mono">{debugInfo.scale.toFixed(3)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="text-sm text-slate-300">
        Uses <span className="font-mono text-slate-100">mark()</span> to accumulate keyframes and a
        forward/backward pair with <span className="font-mono text-slate-100">repeat = 1</span> to
        loop once.
      </CardFooter>
    </Card>
  );
}
