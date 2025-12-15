import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { motion, engine, AnimationControl } from '@g-motion/animation';
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
  const [speed, setSpeed] = useState(1);
  const [fps, setFps] = useState(60);
  const [gpuMode, setGpuMode] = useState<'auto' | 'always' | 'never'>('auto');
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    // Apply engine configuration
    engine.setSpeed(speed);
    engine.setFps(fps);
    engine.forceGpu(gpuMode);
  }, [speed, fps, gpuMode]);

  const handleAnimate = () => {
    controlRef.current?.stop();

    // Start animation - will respect global speed/fps settings
    const control = motion(`#${boxId}`)
      .mark([{ to: { x: 200, y: 0 }, at: 1000 }])
      .mark([{ to: { x: 200, y: 120 }, at: 2000 }])
      .mark([{ to: { x: 0, y: 120 }, at: 3000 }])
      .mark([{ to: { x: 0, y: 0 }, at: 4000 }])
      .animate({ repeat: -1 });

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
