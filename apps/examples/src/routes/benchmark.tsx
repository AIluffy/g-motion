import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

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
import { Slider } from '@/components/ui/slider';

export const Route = createFileRoute('/benchmark')({
  component: BenchmarkRoute,
});

type PropertyMode = 'layout' | 'transform';

type Dot = {
  el: HTMLDivElement;
  baseSize: number;
  x0: number;
  y0: number;
  s0: number;
  x1: number;
  y1: number;
  s1: number;
  startTime: number;
  delay: number;
  duration: number;
  finished: boolean;
};

function BenchmarkRoute() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dotsRef = useRef<Dot[]>([]);
  const runningRef = useRef(false);

  const [propertyMode, setPropertyMode] = useState<PropertyMode>('transform');
  const [dotCount, setDotCount] = useState(500);
  const [isRunning, setIsRunning] = useState(false);
  const [fps, setFps] = useState<number>(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueAvgMs, setOverdueAvgMs] = useState(0);

  const clampedDotCount = useMemo(() => Math.max(10, Math.min(dotCount, 6000)), [dotCount]);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      dotsRef.current = [];
      const container = containerRef.current;
      if (container) {
        container.replaceChildren();
      }
    };
  }, []);

  const stop = () => {
    runningRef.current = false;
    setIsRunning(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    dotsRef.current = [];
    const container = containerRef.current;
    if (container) {
      container.replaceChildren();
    }
  };

  const start = () => {
    stop();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    const dots: Dot[] = [];
    const now = performance.now();

    for (let i = 0; i < clampedDotCount; i += 1) {
      const el = document.createElement('div');
      el.className = 'absolute rounded-full bg-slate-50/90 will-change-transform';
      const baseSize = 6;
      el.style.width = `${baseSize}px`;
      el.style.height = `${baseSize}px`;
      container.appendChild(el);

      const x0 = rand(0, width);
      const y0 = rand(0, height);
      const s0 = rand(0.4, 2.2);
      const x1 = rand(0, width);
      const y1 = rand(0, height);
      const s1 = rand(0.4, 2.2);
      const duration = 750;
      const delay = rand(0, 600);

      dots.push({
        el,
        baseSize,
        x0,
        y0,
        s0,
        x1,
        y1,
        s1,
        startTime: now,
        delay,
        duration,
        finished: false,
      });
    }

    dotsRef.current = dots;
    setOverdueCount(0);
    setOverdueAvgMs(0);
    setFps(0);

    runningRef.current = true;
    setIsRunning(true);

    let lastFpsAt = now;
    let frames = 0;

    let overdueTotal = 0;
    let overdueHits = 0;

    const tick = () => {
      if (!runningRef.current) return;
      const t = performance.now();
      frames += 1;

      if (t - lastFpsAt >= 500) {
        const dt = Math.max(1, t - lastFpsAt);
        setFps(Math.round((frames * 1000) / dt));
        frames = 0;
        lastFpsAt = t;
      }

      const containerRect = container.getBoundingClientRect();
      const w = Math.max(1, containerRect.width);
      const h = Math.max(1, containerRect.height);

      for (const dot of dotsRef.current) {
        const local = (t - dot.startTime - dot.delay) / dot.duration;
        if (local < 0) continue;

        if (local >= 1) {
          if (!dot.finished) {
            dot.finished = true;
            const expectedEnd = dot.startTime + dot.delay + dot.duration;
            const over = t - expectedEnd;
            if (over > 150) {
              overdueHits += 1;
              overdueTotal += over;
              setOverdueCount(overdueHits);
              setOverdueAvgMs(Math.round(overdueTotal / overdueHits));
            }
          }

          dot.x0 = dot.x1;
          dot.y0 = dot.y1;
          dot.s0 = dot.s1;
          dot.x1 = rand(0, w);
          dot.y1 = rand(0, h);
          dot.s1 = rand(0.4, 2.2);
          dot.startTime = t;
          dot.delay = rand(0, 600);
          dot.finished = false;
          continue;
        }

        const eased = easeInOutQuad(local);
        const x = lerp(dot.x0, dot.x1, eased);
        const y = lerp(dot.y0, dot.y1, eased);
        const s = lerp(dot.s0, dot.s1, eased);

        if (propertyMode === 'layout') {
          const size = dot.baseSize * s;
          dot.el.style.width = `${size}px`;
          dot.el.style.height = `${size}px`;
          dot.el.style.left = `${x}px`;
          dot.el.style.top = `${y}px`;
        } else {
          dot.el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <div className="page-shell">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Benchmark</p>
            <h1 className="text-3xl font-semibold text-slate-50">
              JavaScript Animation Speed Test
            </h1>
            <p className="max-w-3xl text-slate-300">
              Animates many dots by updating either layout properties (left/top/width/height) or
              transforms (translate/scale). The goal is to keep the test fair by using the same
              setup and only changing which properties are written.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className={linkButtonClass('ghost')}>
              Back
            </Link>
            <Button
              variant="primary"
              onClick={() => {
                if (isRunning) {
                  stop();
                } else {
                  start();
                }
              }}
            >
              {isRunning ? 'Stop' : 'Start'}
            </Button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Controls</CardTitle>
              <CardDescription>
                Increase the dot count to find the point where updates become choppy.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm text-slate-200">
                  <span>Dots</span>
                  <span className="font-mono">{clampedDotCount}</span>
                </div>
                <Slider
                  value={[clampedDotCount]}
                  onValueChange={(v) => {
                    if (!isRunning) setDotCount(v[0]);
                  }}
                  min={10}
                  max={6000}
                  step={10}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm text-slate-200">
                  <span>Property Mode</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={propertyMode === 'transform' ? 'primary' : 'ghost'}
                    onClick={() => setPropertyMode('transform')}
                    disabled={isRunning}
                  >
                    Transform
                  </Button>
                  <Button
                    variant={propertyMode === 'layout' ? 'primary' : 'ghost'}
                    onClick={() => setPropertyMode('layout')}
                    disabled={isRunning}
                  >
                    Layout
                  </Button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col items-start gap-2 text-sm text-slate-300">
              <div className="flex w-full items-center justify-between">
                <span>FPS</span>
                <span className="font-mono text-slate-100">{fps}</span>
              </div>
              <div className="flex w-full items-center justify-between">
                <span>Overdue (&gt;150ms)</span>
                <span className="font-mono text-slate-100">{overdueCount}</span>
              </div>
              <div className="flex w-full items-center justify-between">
                <span>Avg overdue</span>
                <span className="font-mono text-slate-100">
                  {overdueCount ? `${overdueAvgMs}ms` : '-'}
                </span>
              </div>
            </CardFooter>
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Test Area</CardTitle>
                <CardDescription>
                  Watch for banding (rings of clumped-together dots) which can indicate timing
                  drift. Animations that finish more than 150ms late count as overdue.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  ref={containerRef}
                  className="relative h-[520px] w-full overflow-hidden rounded-xl bg-slate-950/40 shadow-inner"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
                <CardDescription>
                  Some browsers may fire requestAnimationFrame in ways that do not reflect actual
                  screen updates. Focus on what you see (smoothness and drift), not just the
                  reported FPS.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-slate-300">
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    Layout mode writes{' '}
                    <span className="font-mono text-slate-100">left/top/width/height</span> every
                    frame.
                  </li>
                  <li>
                    Transform mode writes{' '}
                    <span className="font-mono text-slate-100">translate/scale</span> via{' '}
                    <span className="font-mono text-slate-100">transform</span>.
                  </li>
                  <li>
                    Overdue animations are those that complete more than{' '}
                    <span className="font-mono text-slate-100">150ms</span> after the scheduled end.
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutQuad(t: number): number {
  if (t < 0.5) return 2 * t * t;
  return 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
