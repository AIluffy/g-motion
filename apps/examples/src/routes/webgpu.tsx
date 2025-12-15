import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, type AnimationControl } from '@g-motion/animation';
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

export const Route = createFileRoute('/webgpu')({
  component: WebgpuPage,
});

function WebgpuPage() {
  const controlsRef = useRef<AnimationControl[]>([]);
  const [count, setCount] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const boxes = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const positions = useMemo(
    () =>
      boxes.map(() => ({
        x: Math.random(),
        y: Math.random(),
      })),
    [boxes],
  );

  const startScenario = (targetCount: number) => {
    stopAll();
    setCount(targetCount);
    setRunKey((k) => k + 1);
  };

  const stopAll = () => {
    controlsRef.current.forEach((c) => c.stop());
    controlsRef.current = [];
    setIsRunning(false);
  };

  useEffect(() => {
    if (count === 0) return;

    // Start animations on next frame to ensure DOM exists
    const id = requestAnimationFrame(() => {
      const field = document.getElementById('webgpu-field');
      const width = field?.clientWidth ?? 900;
      const height = field?.clientHeight ?? 600;

      controlsRef.current = [];
      setIsRunning(true);

      const durationFor = () => 600 + Math.random() * 400;

      for (let i = 0; i < count; i++) {
        const dx = (Math.random() - 0.5) * width * 0.7;
        const dy = (Math.random() - 0.5) * height * 0.7;
        const spin = (Math.random() - 0.5) * 80;
        const d1 = durationFor();
        const d2 = durationFor();

        const control = motion(`#wg-box-${i}`)
          .mark([{ to: { x: dx, y: dy, rotate: spin }, at: d1 }])
          .mark([{ to: { x: -dx * 0.2, y: -dy * 0.2, rotate: 0 }, at: d1 + d2 }])
          .animate({ repeat: 1 });

        controlsRef.current.push(control);
      }

      // End running state after animations finish (repeat=1 => ~2x duration)
      const worst = (1200 + 1000) * 2;
      setTimeout(() => setIsRunning(false), worst);
    });

    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  const gpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const metricsArr = (globalThis as any).__motionGPUMetrics;
  const lastMetrics =
    Array.isArray(metricsArr) && metricsArr.length > 0 ? metricsArr[metricsArr.length - 1] : null;

  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">WebGPU</p>
            <h1 className="text-3xl font-semibold text-slate-50">GPU batch stress tests</h1>
            <p className="text-slate-300">
              Fire 1K or 5K entities and observe batch sampling + GPU dispatch.
            </p>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Controls</CardTitle>
            <CardDescription>
              Creates DOM entities, triggers motion timelines, and lets batch systems collect them.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button onClick={() => startScenario(1000)} disabled={isRunning}>
              Start 1K entities
            </Button>
            <Button onClick={() => startScenario(5000)} disabled={isRunning}>
              Start 5K entities
            </Button>
            <Button variant="ghost" onClick={stopAll}>
              Stop
            </Button>
            <div className="text-sm text-slate-300">
              GPU: {gpuAvailable ? 'available (navigator.gpu)' : 'not detected'}
            </div>
          </CardContent>
          <CardFooter className="text-sm text-slate-300">
            Entities: {count} · Running: {isRunning ? 'yes' : 'no'} · Last batch:{' '}
            {lastMetrics
              ? `${lastMetrics.entityCount} @ ${Math.round(lastMetrics.timestamp)}`
              : 'n/a'}
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Playfield</CardTitle>
            <CardDescription>
              Boxes are absolutely positioned; motion drives transforms. GPU batching runs in
              parallel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              id="webgpu-field"
              className="relative h-[520px] w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70"
            >
              {boxes.map((i, idx) => {
                const pos = positions[idx];
                return (
                  <div
                    key={i}
                    id={`wg-box-${i}`}
                    className="absolute h-3 w-3 rounded-full bg-sky-400/90 shadow-sm shadow-sky-800/60"
                    style={{
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
