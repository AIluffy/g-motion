import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { motion, engine, AnimationControl } from '@g-motion/animation';
import { getGPUMetricsProvider, WorldProvider } from '@g-motion/core';
import { useAtom } from 'jotai';
import {
  engineSpeedAtom,
  engineFpsAtom,
  engineGpuModeAtom,
  gpuThresholdAtom,
  gpuEasingEnabledAtom,
  metricsSamplingRateAtom,
  workSlicingEnabledAtom,
  workSlicingInterpolationAtom,
  workSlicingBatchAtom,
  engineMetricsAtom,
  activeEntityCountAtom,
} from '@/state/engineState';
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

const boxId = 'engine-config-box';

export const Route = createFileRoute('/engine-config')({
  component: EngineConfigDemo,
});

function EngineConfigDemo() {
  const controlRef = useRef<AnimationControl | null>(null);
  const [speed, setSpeed] = useAtom(engineSpeedAtom);
  const [fps, setFps] = useAtom(engineFpsAtom);
  const [gpuMode, setGpuMode] = useAtom(engineGpuModeAtom);
  const [gpuThreshold, setGpuThreshold] = useAtom(gpuThresholdAtom);
  const [gpuEasingEnabled, setGpuEasingEnabled] = useAtom(gpuEasingEnabledAtom);
  const [metricsSamplingRate, setMetricsSamplingRate] = useAtom(metricsSamplingRateAtom);
  const [workSlicingEnabled, setWorkSlicingEnabled] = useAtom(workSlicingEnabledAtom);
  const [workInterp, setWorkInterp] = useAtom(workSlicingInterpolationAtom);
  const [workBatch, setWorkBatch] = useAtom(workSlicingBatchAtom);
  const [metricsSnapshot, setMetricsSnapshot] = useAtom(engineMetricsAtom);
  const [, setActiveCount] = useAtom(activeEntityCountAtom);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    engine.setSpeed(speed);
    engine.setFps(fps);
    engine.forceGpu(gpuMode);
    engine.setGpuThreshold(gpuThreshold);
    engine.setGpuEasing(gpuEasingEnabled);
    const world = WorldProvider.useWorld();
    (world.config as any).metricsSamplingRate = Math.floor(metricsSamplingRate);
    (world.config as any).workSlicing = {
      ...(world.config as any).workSlicing,
      enabled: workSlicingEnabled,
      interpolationArchetypesPerFrame: workInterp,
      batchSamplingArchetypesPerFrame: workBatch,
    };
  }, [speed, fps, gpuMode]);

  useEffect(() => {
    engine.setGpuThreshold(gpuThreshold);
  }, [gpuThreshold]);

  useEffect(() => {
    engine.setGpuEasing(gpuEasingEnabled);
  }, [gpuEasingEnabled]);

  useEffect(() => {
    const world = WorldProvider.useWorld();
    (world.config as any).metricsSamplingRate = Math.floor(metricsSamplingRate);
  }, [metricsSamplingRate]);

  useEffect(() => {
    const world = WorldProvider.useWorld();
    (world.config as any).workSlicing = {
      ...(world.config as any).workSlicing,
      enabled: workSlicingEnabled,
      interpolationArchetypesPerFrame: workInterp,
      batchSamplingArchetypesPerFrame: workBatch,
    };
  }, [workSlicingEnabled, workInterp, workBatch]);

  useEffect(() => {
    const provider = getGPUMetricsProvider();
    const world = WorldProvider.useWorld();
    const intervalMs = 500;
    const id = setInterval(() => {
      const status = provider.getStatus();
      const timingsObj = provider.getSystemTimings ? provider.getSystemTimings() : {};
      const timingsArr = Object.entries(timingsObj).map(([name, stat]) => ({
        name,
        avgMs: (stat as any).avgMs ?? 0,
        lastMs: (stat as any).lastMs ?? 0,
      }));
      let archeArr: Array<{
        id: string;
        avgMs: number;
        minMs: number;
        maxMs: number;
        dispatchCount: number;
        entityCount: number;
      }> = [];
      try {
        const arche = provider.getArchetypeTimings?.();
        if (arche && typeof arche.forEach === 'function') {
          arche.forEach((val, key) => {
            archeArr.push({
              id: key,
              avgMs: (val as any).avgComputeMs ?? 0,
              minMs: (val as any).minComputeMs ?? 0,
              maxMs: (val as any).maxComputeMs ?? 0,
              dispatchCount: (val as any).dispatchCount ?? 0,
              entityCount: (val as any).entityCount ?? 0,
            });
          });
          archeArr.sort((a, b) => b.avgMs - a.avgMs);
        }
      } catch {}
      const latestMemory = (provider as any).getLatestMemorySnapshot?.() as
        | {
            currentMemoryUsage?: number;
            peakMemoryUsage?: number;
          }
        | undefined;
      const currentMemoryUsageBytes = latestMemory?.currentMemoryUsage ?? 0;
      const peakMemoryUsageBytes = latestMemory?.peakMemoryUsage ?? 0;
      setActiveCount(status.activeEntityCount ?? 0);
      const frameMs = status.frameTimeMs ?? 0;
      const fpsApprox = frameMs > 0 ? Math.round(1000 / frameMs) : (world.config.targetFps ?? 0);
      setMetricsSnapshot({
        fps: fpsApprox,
        frameMs,
        lastMs: frameMs,
        gpuAvailable: !!(status.webgpuAvailable && status.gpuInitialized),
        batchEntityCount: status.activeEntityCount ?? null,
        gpuComputeMs: undefined,
        gpuComputeLastMs: undefined,
        gpuBatchCount: status.queueDepth ?? undefined,
        systemTimings: timingsArr,
        archetypeTimings: archeArr,
        currentMemoryUsageBytes,
        peakMemoryUsageBytes,
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, []);

  const handleAnimate = () => {
    controlRef.current?.stop();

    // Start animation - will respect global speed/fps settings
    const control = motion(`#${boxId}`)
      .mark([{ to: { x: 200, y: 0 }, at: 1000 }])
      .mark([{ to: { x: 200, y: 120 }, at: 2000 }])
      .mark([{ to: { x: 0, y: 120 }, at: 3000 }])
      .mark([{ to: { x: 0, y: 0 }, at: 4000 }])
      .option({ repeat: -1 })
      .play();

    controlRef.current = control;
    setIsRunning(true);
  };

  const handleStop = () => {
    controlRef.current?.stop();
    setIsRunning(false);

    const el = document.getElementById(boxId);
    if (el) {
      el.style.transform = 'translate3d(0px, 0px, 0px)';
    }
  };

  useEffect(() => {
    return () => {
      controlRef.current?.stop();
    };
  }, []);

  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-col gap-3">
          <Link to="/" className={linkButtonClass('ghost')}>
            ← Back to hub
          </Link>
          <h1 className="text-3xl font-semibold text-slate-50">Engine Configuration</h1>
          <p className="max-w-3xl text-slate-300">
            Global engine controls for animation speed, FPS limiting, and GPU mode. Configure these
            settings to affect all animations in the engine.
          </p>
        </header>

        <div className="section-grid">
          <Card>
            <CardHeader>
              <CardTitle>Engine Metrics</CardTitle>
              <CardDescription>Live GPU status and system timings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-slate-300">GPU Enabled</div>
                  <div className="text-slate-50">
                    {String(metricsSnapshot?.gpuAvailable ?? false)}
                  </div>
                  <div className="text-slate-300">Active Entities</div>
                  <div className="text-slate-50">{metricsSnapshot?.batchEntityCount ?? 0}</div>
                  <div className="text-slate-300">Frame Time (ms)</div>
                  <div className="text-slate-50">{metricsSnapshot?.frameMs ?? 0}</div>
                  <div className="text-slate-300">Approx FPS</div>
                  <div className="text-slate-50">{metricsSnapshot?.fps ?? 0}</div>
                </div>
                <div>
                  <div className="mb-2 text-sm text-slate-300">System Timings (avg / last ms)</div>
                  <div className="space-y-1">
                    {(metricsSnapshot?.systemTimings ?? []).slice(0, 8).map((t) => (
                      <div key={t.name} className="flex justify-between text-sm">
                        <span className="text-slate-300">{t.name}</span>
                        <span className="text-slate-50">
                          {t.avgMs.toFixed(3)} / {t.lastMs.toFixed(3)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="text-sm text-slate-400">
              Metrics provider updates per frame; sampling rate controls profiling overhead
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Archetype Timings</CardTitle>
              <CardDescription>GPU compute time per archetype</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {(metricsSnapshot?.archetypeTimings ?? []).slice(0, 10).map((t) => (
                  <div key={t.id} className="grid grid-cols-5 gap-2 text-sm">
                    <div className="truncate text-slate-300" title={t.id}>
                      {t.id}
                    </div>
                    <div className="text-slate-50">avg {t.avgMs.toFixed(3)}ms</div>
                    <div className="text-slate-50">min {t.minMs.toFixed(3)}ms</div>
                    <div className="text-slate-50">max {t.maxMs.toFixed(3)}ms</div>
                    <div className="text-slate-50">
                      {t.entityCount} ents / {t.dispatchCount} disp
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="text-sm text-slate-400">
              Sorted by average compute time
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Animation Demo</CardTitle>
              <CardDescription>
                Watch a box animate in a square path. Change settings to see how speed and FPS
                affect the motion.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative h-56 rounded-lg border border-slate-800 bg-slate-900/60">
                <div
                  id={boxId}
                  className="absolute left-8 top-8 h-16 w-16 rounded-lg bg-sky-500 shadow-lg shadow-sky-800/50"
                />
              </div>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button onClick={handleAnimate} disabled={isRunning}>
                {isRunning ? 'Running…' : 'Start Animation'}
              </Button>
              <Button variant="ghost" onClick={handleStop} disabled={!isRunning}>
                Stop & Reset
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Speed Control</CardTitle>
              <CardDescription>
                Global speed multiplier affects all animations (0.25x to 4x)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">Speed:</label>
                  <span className="text-lg font-semibold text-slate-50">{speed}x</span>
                </div>
                <input
                  type="range"
                  min="0.25"
                  max="4"
                  step="0.25"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-sky-500"
                />
              </div>
            </CardContent>
            <CardFooter className="text-sm text-slate-400">
              Speed multiplier applied to all time calculations in TimeSystem
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>FPS Limiting</CardTitle>
              <CardDescription>Target frame rate for power saving (15-120 FPS)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">Target FPS:</label>
                  <span className="text-lg font-semibold text-slate-50">{fps}</span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="120"
                  step="15"
                  value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value))}
                  className="w-full accent-sky-500"
                />
              </div>
            </CardContent>
            <CardFooter className="text-sm text-slate-400">
              Lower FPS saves battery; higher allows smoother motion on high-refresh displays
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>GPU Threshold & Easing</CardTitle>
              <CardDescription>Control GPU activation threshold and easing mode</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-300">GPU Threshold:</label>
                    <span className="text-lg font-semibold text-slate-50">{gpuThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5000"
                    step="100"
                    value={gpuThreshold}
                    onChange={(e) => setGpuThreshold(parseInt(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">GPU Easing:</label>
                  <input
                    type="checkbox"
                    checked={gpuEasingEnabled}
                    onChange={(e) => setGpuEasingEnabled(e.target.checked)}
                    className="h-5 w-5 accent-sky-500"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="text-sm text-slate-400">
              Auto mode considers threshold与复杂度；GPU easing加速缓动计算
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>GPU Mode</CardTitle>
              <CardDescription>Control GPU acceleration behavior for animations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">Mode:</label>
                  <span className="text-lg font-semibold text-slate-50">{gpuMode}</span>
                </div>
                <select
                  value={gpuMode}
                  onChange={(e) => setGpuMode(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-50"
                >
                  <option value="auto">Auto (threshold-based)</option>
                  <option value="always">Always (force GPU)</option>
                  <option value="never">Never (CPU only)</option>
                </select>
              </div>
            </CardContent>
            <CardFooter className="text-sm text-slate-400">
              Auto mode uses GPU when entity count exceeds threshold (default: 1000)
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Work Slicing</CardTitle>
              <CardDescription>
                Process archetypes across frames to smooth frame time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">Enabled:</label>
                  <input
                    type="checkbox"
                    checked={workSlicingEnabled}
                    onChange={(e) => setWorkSlicingEnabled(e.target.checked)}
                    className="h-5 w-5 accent-sky-500"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-300">
                      Interpolation per frame:
                    </label>
                    <span className="text-lg font-semibold text-slate-50">{workInterp}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="64"
                    step="1"
                    value={workInterp}
                    onChange={(e) => setWorkInterp(parseInt(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-300">
                      Batch sampling per frame:
                    </label>
                    <span className="text-lg font-semibold text-slate-50">{workBatch}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="64"
                    step="1"
                    value={workBatch}
                    onChange={(e) => setWorkBatch(parseInt(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="text-sm text-slate-400">
              Reduce peak frame time in heavy scenes
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metrics Sampling</CardTitle>
              <CardDescription>Control system timing sampling rate</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">
                    Sampling rate (frames):
                  </label>
                  <span className="text-lg font-semibold text-slate-50">{metricsSamplingRate}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="120"
                  step="1"
                  value={metricsSamplingRate}
                  onChange={(e) => setMetricsSamplingRate(parseInt(e.target.value))}
                  className="w-full accent-sky-500"
                />
              </div>
            </CardContent>
            <CardFooter className="text-sm text-slate-400">
              Higher values reduce profiling overhead
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Configuration</CardTitle>
              <CardDescription>Live engine configuration values</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-300">
                {JSON.stringify(engine.getConfig(), null, 2)}
              </pre>
            </CardContent>
            <CardFooter className="text-sm text-slate-400">
              Configuration is stored in World.config and applied by core systems
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Usage</CardTitle>
              <CardDescription>Code examples for engine configuration</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-300">
                {`import { engine } from '@g-motion/animation';

// Set global speed
engine.setSpeed(2); // 2x faster

// Limit FPS
engine.setFps(30); // Cap at 30 FPS

// Force GPU mode
engine.forceGpu('always');

// Batch configure
engine.configure({
  speed: 1.5,
  fps: 60,
  gpuMode: 'auto'
});

// Reset to defaults
engine.reset();`}
              </pre>
            </CardContent>
            <CardFooter className="text-sm text-slate-400">
              All methods are type-safe with runtime validation
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
