import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, type AnimationControl, clearGPUMetrics, getGPUMetrics } from '@g-motion/animation';
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

type Scenario = 'basic' | 'packed-half2';

function WebgpuPage() {
  const controlsRef = useRef<AnimationControl[]>([]);
  const [count, setCount] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('basic');
  const [viewportCulling, setViewportCulling] = useState(() => {
    return !!(globalThis as any).__MOTION_WEBGPU_VIEWPORT_CULLING__;
  });
  const [worldSize, setWorldSize] = useState<number>(4000);

  const boxes = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const positions = useMemo(
    () =>
      boxes.map(() => ({
        x: Math.random(),
        y: Math.random(),
      })),
    [boxes],
  );

  useEffect(() => {
    (globalThis as any).__MOTION_WEBGPU_VIEWPORT_CULLING__ = viewportCulling;
  }, [viewportCulling]);

  const startScenario = (targetCount: number, nextScenario: Scenario) => {
    stopAll();
    clearGPUMetrics();
    setCount(targetCount);
    setScenario(nextScenario);
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
        const scaleX = 0.85 + Math.random() * 0.4;
        const scaleY = 0.85 + Math.random() * 0.4;
        const opacity = 0.55 + Math.random() * 0.45;
        const d1 = durationFor();
        const d2 = durationFor();

        const builder = motion(`#wg-box-${i}`);
        const control =
          scenario === 'packed-half2'
            ? builder
                .mark([
                  {
                    to: { x: dx, y: dy, rotate: spin, scaleX, scaleY, opacity },
                    at: d1,
                  },
                ])
                .mark([
                  {
                    to: { x: -dx * 0.2, y: -dy * 0.2, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 },
                    at: d1 + d2,
                  },
                ])
                .option({ repeat: 1 })
                .play()
            : builder
                .mark([{ to: { x: dx, y: dy, rotate: spin }, at: d1 }])
                .mark([{ to: { x: -dx * 0.2, y: -dy * 0.2, rotate: 0 }, at: d1 + d2 }])
                .option({ repeat: 1 })
                .play();

        controlsRef.current.push(control);
      }

      // End running state after animations finish (repeat=1 => ~2x duration)
      const worst = (1200 + 1000) * 2;
      setTimeout(() => setIsRunning(false), worst);
    });

    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, scenario]);

  const gpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const [lastMetrics, setLastMetrics] = useState<{
    entityCount: number;
    timestamp: number;
    syncDataSize?: number;
    batchId?: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    const id = window.setInterval(() => {
      const metrics = getGPUMetrics();
      if (!mounted || !Array.isArray(metrics) || metrics.length === 0) return;
      const last =
        metrics.find((m) => typeof m.batchId === 'string' && m.batchId.endsWith('-sync')) ??
        metrics[0];
      setLastMetrics({
        entityCount: last.entityCount,
        timestamp: last.timestamp,
        syncDataSize: last.syncDataSize,
        batchId: last.batchId,
      });
    }, 500);

    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

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
            <Button onClick={() => startScenario(1000, 'basic')} disabled={isRunning}>
              Start 1K entities (basic)
            </Button>
            <Button onClick={() => startScenario(5000, 'basic')} disabled={isRunning}>
              Start 5K entities (basic)
            </Button>
            <Button onClick={() => startScenario(1000, 'packed-half2')} disabled={isRunning}>
              Start 1K entities (packed-half2)
            </Button>
            <Button onClick={() => startScenario(5000, 'packed-half2')} disabled={isRunning}>
              Start 5K entities (packed-half2)
            </Button>
            <Button variant="ghost" onClick={stopAll}>
              Stop
            </Button>
            <div className="text-sm text-slate-300">
              GPU: {gpuAvailable ? 'available (navigator.gpu)' : 'not detected'}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 accent-sky-500"
                checked={viewportCulling}
                onChange={(e) => setViewportCulling(e.target.checked)}
              />
              Viewport culling
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              World size
              <select
                value={worldSize}
                onChange={(e) => setWorldSize(Number(e.target.value))}
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
              >
                <option value={1200}>1200</option>
                <option value={2000}>2000</option>
                <option value={4000}>4000</option>
                <option value={8000}>8000</option>
              </select>
            </label>
          </CardContent>
          <CardFooter className="text-sm text-slate-300">
            Entities: {count} · Running: {isRunning ? 'yes' : 'no'} · Last batch:{' '}
            {lastMetrics
              ? `${lastMetrics.entityCount} @ ${Math.round(lastMetrics.timestamp)}${
                  lastMetrics.syncDataSize != null ? ` · ${lastMetrics.syncDataSize}B` : ''
                }`
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
              className="relative h-[520px] w-full overflow-auto rounded-lg border border-slate-800 bg-slate-900/70"
            >
              <div
                className="relative"
                style={{
                  width: `${worldSize}px`,
                  height: `${worldSize}px`,
                }}
              >
                {boxes.map((i, idx) => {
                  const pos = positions[idx];
                  return (
                    <div
                      key={i}
                      id={`wg-box-${i}`}
                      className="absolute h-3 w-3 rounded-full bg-sky-400/90 shadow-sm shadow-sky-800/60"
                      style={{
                        left: `${pos.x * worldSize}px`,
                        top: `${pos.y * worldSize}px`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
