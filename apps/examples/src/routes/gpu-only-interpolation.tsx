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
        When GPU is active and gpuOnlyInterpolation is enabled, this motion is updated purely from
        the GPU pipeline.
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
  const [gpuOnlyEnabled, setGpuOnlyEnabled] = useState<boolean>(() => {
    const current = (world.config as any).gpuOnlyInterpolation;
    return current !== false;
  });
  const [gpuAvailable, setGpuAvailable] = useState(false);
  const [gpuActive, setGpuActive] = useState(false);
  const [cpuFallback, setCpuFallback] = useState(false);

  useEffect(() => {
    const previous = (world.config as any).gpuOnlyInterpolation;
    const provider = getGPUMetricsProvider();
    const intervalMs = 500;
    const id = window.setInterval(() => {
      const status = provider.getStatus();
      const available = !!(status.webgpuAvailable && status.gpuInitialized);
      const active = !!(status.enabled && status.gpuInitialized && !status.cpuFallbackActive);
      const fallback = !!status.cpuFallbackActive;
      setGpuAvailable(available);
      setGpuActive(active);
      setCpuFallback(fallback);
    }, intervalMs);

    return () => {
      (world.config as any).gpuOnlyInterpolation = previous;
      window.clearInterval(id);
    };
  }, [world]);

  useEffect(() => {
    (world.config as any).gpuOnlyInterpolation = gpuOnlyEnabled;
  }, [world, gpuOnlyEnabled]);

  const config = engine.getConfig();
  let interpolationStatusLabel: React.ReactNode;
  if (!gpuOnlyEnabled) {
    interpolationStatusLabel = (
      <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-300">
        GPU-only disabled (InterpolationSystem running)
      </span>
    );
  } else if (gpuActive && !cpuFallback) {
    interpolationStatusLabel = (
      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
        InterpolationSystem skipped (GPU-only)
      </span>
    );
  } else if (cpuFallback) {
    interpolationStatusLabel = (
      <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
        CPU fallback active (InterpolationSystem running)
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
              Demonstrates skipping the CPU InterpolationSystem entirely when GPU compute is
              available and healthy.
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
              Enables gpuOnlyInterpolation on the shared World config so that, while GPU is active,
              interpolation is computed only on GPU.
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                gpuOnlyInterpolation
              </span>
              <button
                type="button"
                onClick={() => setGpuOnlyEnabled((prev) => !prev)}
                className={linkButtonClass(gpuOnlyEnabled ? 'primary' : 'ghost')}
              >
                {gpuOnlyEnabled ? 'Enabled' : 'Disabled'}
              </button>
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
              <div className="flex flex-col gap-1">
                <span className="text-slate-400">CPU fallback</span>
                <span className="font-mono text-slate-100">{String(cpuFallback)}</span>
              </div>
            </div>
            <div className="mt-2 rounded-md bg-slate-950/70 p-3 text-xs text-slate-300">
              <div className="mb-1 font-semibold text-slate-100">Configuration snapshot</div>
              <pre className="max-h-48 overflow-auto text-[11px] leading-snug">
                {JSON.stringify(config, null, 2)}
              </pre>
            </div>
            <ul className="mt-2 list-disc list-inside space-y-1 text-xs">
              <li>
                When <span className="font-mono text-slate-100">gpuOnlyInterpolation</span> is true
                and GPU is active, the InterpolationSystem returns early and only GPU results are
                applied.
              </li>
              <li>
                If WebGPU is unavailable or a GPU error triggers fallback,{' '}
                <span className="font-mono text-slate-100">cpuFallbackActive</span> becomes true and
                the InterpolationSystem resumes CPU interpolation automatically.
              </li>
              <li>
                This demo updates the shared engine config on mount and restores the previous value
                on unmount so other routes remain unchanged.
              </li>
            </ul>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
