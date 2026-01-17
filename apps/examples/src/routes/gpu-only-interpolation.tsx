import { Link, createFileRoute } from '@tanstack/react-router';
import React, { useEffect, useRef, useState } from 'react';
import { motion, type AnimationControl, engine } from '@g-motion/animation';
import { WorldProvider, getGPUMetricsProvider } from '@g-motion/core';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { linkButtonClass } from '@/components/ui/link-styles';

const boxId = 'gpu-only-interpolation-box';

export const Route = createFileRoute('/gpu-only-interpolation' as any)({
  component: GPUOnlyInterpolationPage,
});

function DemoBox() {
  const controlRef = useRef<AnimationControl | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const start = () => {
    controlRef.current?.stop();

    const control = motion(`#${boxId}`)
      .mark([
        { to: { x: 160, y: 40, rotate: 30 }, at: 800 },
        { to: { x: 160, y: 140, rotate: 60 }, at: 1600 },
        { to: { x: 0, y: 140, rotate: 330 }, at: 2400 },
        { to: { x: 0, y: 0, rotate: 360 }, at: 3200 },
      ])
      .option({ repeat: Infinity })
      .play();

    controlRef.current = control;
    setIsRunning(true);
  };

  const stop = () => {
    controlRef.current?.stop();
    setIsRunning(false);
    const el = document.getElementById(boxId);
    if (el) {
      el.style.transform = 'translate3d(0px, 0px, 0px) rotate(0deg)';
    }
  };

  useEffect(() => {
    return () => {
      controlRef.current?.stop();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-6">
      <div className="relative h-56 w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900/60">
        <div
          id={boxId}
          className="absolute left-6 top-6 h-16 w-16 rounded-lg bg-gradient-to-br from-emerald-500 to-sky-500 shadow-lg shadow-emerald-900/50"
        />
      </div>
      <p className="text-sm text-slate-300">
        When GPU is active, this motion is updated from the GPU interpolation pipeline.
      </p>
      <div className="flex gap-3">
        <button
          onClick={start}
          disabled={isRunning}
          className={linkButtonClass(isRunning ? 'ghost' : 'primary')}
        >
          {isRunning ? 'Running…' : 'Start'}
        </button>
        <button onClick={stop} className={linkButtonClass('ghost')}>
          Stop
        </button>
      </div>
    </div>
  );
}

function GPUOnlyInterpolationPage() {
  const world = WorldProvider.useWorld();
  const [gpuAvailable, setGpuAvailable] = useState(false);
  const [gpuActive, setGpuActive] = useState(false);

  useEffect(() => {
    const provider = getGPUMetricsProvider();
    const intervalMs = 500;
    const id = window.setInterval(() => {
      const status = provider.getStatus();
      const available = !!(status.webgpuAvailable && status.gpuInitialized);
      const active = !!(status.enabled && status.gpuInitialized);
      setGpuAvailable(available);
      setGpuActive(active);
    }, intervalMs);

    return () => {
      window.clearInterval(id);
    };
  }, [world]);

  const config = engine.getConfig();
  let interpolationStatusLabel: React.ReactNode;
  if (gpuActive) {
    interpolationStatusLabel = (
      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
        GPU interpolation active
      </span>
    );
  } else {
    interpolationStatusLabel = (
      <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-300">
        Waiting for GPU status
      </span>
    );
  }

  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">WebGPU</p>
            <h1 className="text-2xl font-semibold text-slate-50">
              GPU-Only Interpolation Mode Demo
            </h1>
            <p className="text-sm text-slate-300">
              Demonstrates running interpolation via WebGPU compute.
            </p>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>GPU-Only Interpolation</CardTitle>
            <CardDescription>
              Shows whether the WebGPU interpolation pipeline is initialized and active.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DemoBox />
          </CardContent>
          <CardFooter className="flex flex-col gap-4 text-sm text-slate-300">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Live status
              </span>
              {interpolationStatusLabel}
            </div>
            <div className="grid gap-2 text-xs md:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="text-slate-400">GPU available</span>
                <span className="font-mono text-slate-100">{String(gpuAvailable)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-slate-400">GPU active</span>
                <span className="font-mono text-slate-100">{String(gpuActive)}</span>
              </div>
            </div>
            <div className="mt-2 rounded-md bg-slate-950/70 p-3 text-xs text-slate-300">
              <div className="mb-1 font-semibold text-slate-100">Configuration snapshot</div>
              <pre className="max-h-48 overflow-auto text-[11px] leading-snug">
                {JSON.stringify(config, null, 2)}
              </pre>
            </div>
            <ul className="mt-2 list-disc list-inside space-y-1 text-xs">
              <li>WebGPU status is derived from the core GPU metrics provider.</li>
              <li>This page does not toggle engine behavior; it only reports status.</li>
            </ul>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
