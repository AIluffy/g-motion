import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, type AnimationControl, getGPUMetrics } from '@g-motion/animation';
import { useAtom } from 'jotai';
import { engineGpuModeAtom, gpuEasingEnabledAtom } from '@/state/engineState';
import { useGpuThresholdRecommendation } from '@/state/useGpuThresholdRecommendation';
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

export const Route = createFileRoute('/gpu-config')({
  component: GPUConfigPage,
});

// Easing names for GPU-based animations
const easingNames = [
  'easeInQuad',
  'easeOutCubic',
  'easeInElastic',
  'easeOutBounce',
  'easeInOutSine',
  'easeInBack',
] as const;

function GPUConfigPage() {
  const controlsRef = useRef<AnimationControl[]>([]);
  const [count, setCount] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // GPU Configuration states (shared via jotai)
  const [gpuMode, setGpuMode] = useAtom(engineGpuModeAtom);
  const [gpuEasing, setGpuEasing] = useAtom(gpuEasingEnabledAtom);
  const { threshold, setThreshold, recommended, isLoading, isError, applyRecommendation } =
    useGpuThresholdRecommendation();
  const [selectedEasing, setSelectedEasing] = useState<string>('easeInQuad');

  // Note: In a real application, you would configure the World before initializing the engine:
  // const world = World.create({
  //   gpuCompute: gpuMode,
  //   gpuEasing: gpuEasing,
  //   webgpuThreshold: threshold,
  // });
  // For this demo, we show the configuration UI but the actual engine is already initialized
  // with default settings.

  // For demo purposes, selectedEasing holds the easing name directly
  // In a real app with per-entity easing, you'd store this on each entity

  const boxes = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const positions = useMemo(
    () =>
      boxes.map(() => ({
        x: Math.random(),
        y: Math.random(),
      })),
    [boxes],
  );

  const startAnimation = (targetCount: number) => {
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

    const id = requestAnimationFrame(() => {
      const field = document.getElementById('gpu-config-field');
      const width = field?.clientWidth ?? 900;
      const height = field?.clientHeight ?? 600;

      controlsRef.current = [];
      setIsRunning(true);

      controlsRef.current = [];
      setIsRunning(true);

      for (let i = 0; i < count; i++) {
        const dx = (Math.random() - 0.5) * width * 0.6;
        const dy = (Math.random() - 0.5) * height * 0.6;
        const rotate = (Math.random() - 0.5) * 360;
        const duration = 800 + Math.random() * 600;

        const control = motion(`#gpu-box-${i}`)
          .mark([
            {
              to: { x: dx, y: dy, rotate },
              at: duration,
              ease: selectedEasing,
            },
          ])
          .option({ repeat: 1 })
          .play();

        controlsRef.current.push(control);
      }

      const maxDuration = 1400 * 2; // repeat=1 doubles the time
      setTimeout(() => setIsRunning(false), maxDuration);
    });

    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, selectedEasing]);

  const gpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const [lastMetrics, setLastMetrics] = useState<{ entityCount: number; timestamp: number } | null>(
    null,
  );

  useEffect(() => {
    let mounted = true;
    const id = window.setInterval(() => {
      const metrics = getGPUMetrics();
      if (!mounted || !Array.isArray(metrics) || metrics.length === 0) return;
      const last = metrics[0];
      setLastMetrics({ entityCount: last.entityCount, timestamp: last.timestamp });
    }, 500);

    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">GPU Configuration</p>
            <h1 className="text-3xl font-semibold text-slate-50">
              WebGPU compute mode & easing control
            </h1>
            <p className="text-slate-300">
              Configure GPU acceleration behavior and test with different easing functions.
            </p>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back
          </Link>
        </div>

        {/* Configuration Panel */}
        <Card>
          <CardHeader>
            <CardTitle>GPU Configuration</CardTitle>
            <CardDescription>
              Control how GPU acceleration is used for animation computation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* GPU Compute Mode */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-200">GPU Compute Mode</label>
              <div className="flex flex-wrap gap-2">
                {(['auto', 'always', 'never'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setGpuMode(mode)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                      gpuMode === mode
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {mode === 'auto' && '🔄 Auto (threshold-based)'}
                    {mode === 'always' && '⚡ Always (force GPU)'}
                    {mode === 'never' && '🖥️ Never (CPU-only)'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">
                {gpuMode === 'auto' && `Auto mode: GPU kicks in when entity count ≥ ${threshold}`}
                {gpuMode === 'always' && 'Always mode: GPU used regardless of entity count'}
                {gpuMode === 'never' && 'Never mode: All calculations on CPU'}
              </p>
            </div>

            {/* GPU Easing Toggle */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <input
                  type="checkbox"
                  checked={gpuEasing}
                  onChange={(e) => setGpuEasing(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-slate-600 bg-slate-700 text-sky-500 accent-sky-500"
                />
                GPU-Accelerated Easing Functions
              </label>
              <p className="text-xs text-slate-400">
                {gpuEasing
                  ? '✓ Supported easing functions run on GPU; unsupported ones fallback to CPU'
                  : '✗ All easing calculations run on CPU (even on GPU compute path)'}
              </p>
            </div>

            {/* Threshold Recommendation */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-200">GPU Threshold</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  className="w-32 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-50"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value) || 0)}
                />
                <Button
                  type="button"
                  onClick={applyRecommendation}
                  disabled={isLoading || isError || recommended == null}
                  className="text-xs"
                >
                  Use recommended
                </Button>
                <span className="text-xs text-slate-400">
                  {isLoading && 'Loading recommendation…'}
                  {isError && 'Failed to load recommendation'}
                  {!isLoading && !isError && recommended != null
                    ? `Suggested: ${recommended}`
                    : null}
                </span>
              </div>
            </div>

            {/* Threshold Control (only for auto mode) */}
            {gpuMode === 'auto' && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-200">
                  GPU Activation Threshold: {threshold}
                </label>
                <input
                  type="range"
                  min="100"
                  max="5000"
                  step="100"
                  value={threshold}
                  onChange={(e) => setThreshold(parseInt(e.target.value))}
                  className="h-2 w-full cursor-pointer rounded-lg bg-slate-700 accent-sky-500"
                />
                <p className="text-xs text-slate-400">
                  GPU will activate when this many entities are animating
                </p>
              </div>
            )}

            {/* Easing Function Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-200">Easing Function</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {easingNames.map((name) => (
                  <button
                    key={name}
                    onClick={() => setSelectedEasing(name)}
                    className={`px-3 py-2 rounded-md text-xs font-medium transition ${
                      selectedEasing === name
                        ? 'bg-purple-500 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {name.replace('ease', '')}
                  </button>
                ))}
              </div>
            </div>

            {/* Status Info */}
            <div className="rounded-md bg-slate-800/50 p-3 text-xs text-slate-300">
              <div className="font-mono">
                <div>GPU Available: {gpuAvailable ? '✓ navigator.gpu' : '✗ not detected'}</div>
                <div>Current Config:</div>
                <div className="ml-2 space-y-1 text-slate-400">
                  <div>gpuCompute: {gpuMode}</div>
                  <div>gpuEasing: {gpuEasing ? 'true' : 'false'}</div>
                  <div>threshold: {threshold}</div>
                  <div>selectedEasing: {selectedEasing}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Controls Card */}
        <Card>
          <CardHeader>
            <CardTitle>Test Scenarios</CardTitle>
            <CardDescription>
              Run animations with the configured GPU settings above.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => startAnimation(100)}
              disabled={isRunning}
              className="bg-blue-600 hover:bg-blue-700"
            >
              100 entities
            </Button>
            <Button
              onClick={() => startAnimation(500)}
              disabled={isRunning}
              className="bg-blue-600 hover:bg-blue-700"
            >
              500 entities
            </Button>
            <Button
              onClick={() => startAnimation(1000)}
              disabled={isRunning}
              className="bg-blue-600 hover:bg-blue-700"
            >
              1K entities
            </Button>
            <Button
              onClick={() => startAnimation(2000)}
              disabled={isRunning}
              className="bg-amber-600 hover:bg-amber-700"
            >
              2K entities
            </Button>
            <Button
              onClick={() => startAnimation(5000)}
              disabled={isRunning}
              className="bg-red-600 hover:bg-red-700"
            >
              5K entities
            </Button>
            <Button variant="ghost" onClick={stopAll}>
              Stop
            </Button>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 text-sm text-slate-300 md:flex-row md:items-center md:justify-between">
            <div>
              Entities: <span className="font-mono font-bold text-slate-100">{count}</span> ·
              Running:{' '}
              <span className="font-mono font-bold text-slate-100">{isRunning ? 'yes' : 'no'}</span>
            </div>
            <div>
              Last batch:{' '}
              <span className="font-mono font-bold text-slate-100">
                {lastMetrics
                  ? `${lastMetrics.entityCount} @ ${Math.round(lastMetrics.timestamp)}ms`
                  : 'n/a'}
              </span>
            </div>
          </CardFooter>
        </Card>

        {/* Playfield */}
        <Card>
          <CardHeader>
            <CardTitle>Animation Playfield</CardTitle>
            <CardDescription>
              All boxes animate using the selected easing function and GPU configuration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              id="gpu-config-field"
              className="relative h-[500px] w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900/80"
            >
              {boxes.map((i, idx) => {
                const pos = positions[idx];
                return (
                  <div
                    key={i}
                    id={`gpu-box-${i}`}
                    className="absolute h-2 w-2 rounded-full bg-cyan-400/80 shadow-md shadow-cyan-800/40"
                    style={{
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      boxShadow: '0 0 8px rgba(34, 211, 238, 0.5)',
                    }}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="border-slate-800 bg-slate-900/40">
          <CardHeader>
            <CardTitle className="text-base">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div>
              <span className="font-semibold text-slate-100">GPU Compute Mode</span>: Controls when
              GPU acceleration activates.
              <ul className="ml-4 mt-1 space-y-1 text-xs">
                <li>
                  • <span className="font-mono text-cyan-300">auto</span>: GPU activates when entity
                  count reaches threshold
                </li>
                <li>
                  • <span className="font-mono text-cyan-300">always</span>: GPU always used, even
                  for small counts
                </li>
                <li>
                  • <span className="font-mono text-cyan-300">never</span>: GPU never used; all
                  computation on CPU
                </li>
              </ul>
            </div>
            <div>
              <span className="font-semibold text-slate-100">GPU-Accelerated Easing</span>:
              Supported easing functions (31 types) run directly in WGSL shader on GPU. Unsupported
              custom functions automatically fallback to CPU.
            </div>
            <div>
              <span className="font-semibold text-slate-100">Threshold</span>: In auto mode, GPU
              kicks in when active entity count ≥ configured threshold. Helps reduce overhead for
              small animations.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
