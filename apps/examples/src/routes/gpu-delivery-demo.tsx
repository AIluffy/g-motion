import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import {
  motion,
  AnimationControl,
  clearGPUMetrics,
  getGPUBatchStatus,
  getGPUMetrics,
} from '@g-motion/animation';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { linkButtonClass } from '@/components/ui/link-styles';

const demoBoxId = 'gpu-delivery-box';

export const Route = createFileRoute('/gpu-delivery-demo')({
  component: GPUDeliveryDemo,
});

type DemoMode = 'packed-half2' | 'multi-channel';

type SyncMetric = {
  batchId: string;
  entityCount: number;
  timestamp: number;
  syncDataSize?: number;
  syncDurationMs?: number;
  gpu: boolean;
};

function DemoBox() {
  const controlRef = useRef<AnimationControl | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [mode, setMode] = useState<DemoMode>('packed-half2');
  const [lastSyncMetric, setLastSyncMetric] = useState<SyncMetric | null>(null);

  const resetStyle = () => {
    const el = document.getElementById(demoBoxId);
    if (!el) return;
    el.style.opacity = '1';
    el.style.transform =
      'translate3d(0px, 0px, 0px) scale(1, 1) rotate(0deg) rotateX(0deg) rotateY(0deg)';
  };

  const start = (nextMode: DemoMode) => {
    controlRef.current?.stop();
    clearGPUMetrics();
    resetStyle();
    setMode(nextMode);

    const builder =
      nextMode === 'packed-half2'
        ? motion(`#${demoBoxId}`).mark([
            {
              to: {
                x: 150,
                y: 80,
                rotate: 45,
                scaleX: 1.3,
                scaleY: 0.8,
                opacity: 0.65,
              },
              at: 1500,
            },
            {
              to: {
                x: 0,
                y: 0,
                rotate: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
              },
              at: 3000,
            },
          ])
        : motion(`#${demoBoxId}`).mark([
            {
              to: {
                x: 150,
                y: 80,
                rotateX: 45,
                rotateY: 45,
              },
              at: 1500,
            },
            {
              to: {
                x: 0,
                y: 0,
                rotateX: 0,
                rotateY: 0,
              },
              at: 3000,
            },
          ]);

    const control = builder.option({ repeat: Infinity }).play();

    controlRef.current = control;
    setIsAnimating(true);
  };

  const stop = () => {
    controlRef.current?.stop();
    setIsAnimating(false);
    resetStyle();
  };

  useEffect(() => {
    return () => {
      controlRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const id = window.setInterval(() => {
      const metrics = getGPUMetrics();
      if (!mounted || !Array.isArray(metrics) || metrics.length === 0) return;
      const sync = metrics.find(
        (m) => typeof m.batchId === 'string' && m.batchId.endsWith('-sync'),
      );
      if (!sync) return;
      setLastSyncMetric({
        batchId: sync.batchId,
        entityCount: sync.entityCount,
        timestamp: sync.timestamp,
        syncDataSize: sync.syncDataSize,
        syncDurationMs: sync.syncDurationMs,
        gpu: sync.gpu,
      });
    }, 200);

    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const status = getGPUBatchStatus();
  const packedExpected =
    lastSyncMetric && mode === 'packed-half2' ? lastSyncMetric.entityCount * 3 * 4 : undefined;
  const unpackedExpected =
    lastSyncMetric && mode === 'packed-half2' ? lastSyncMetric.entityCount * 6 * 4 : undefined;

  return (
    <div className="flex flex-col items-center justify-center gap-6">
      <div className="relative" style={{ perspective: '1000px', width: '250px', height: '200px' }}>
        <div
          id={demoBoxId}
          className="absolute left-12 top-12 w-24 h-24 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg"
          style={{
            transformStyle: 'preserve-3d',
            transform:
              'translate3d(0px, 0px, 0px) scale(1, 1) rotate(0deg) rotateX(0deg) rotateY(0deg)',
          }}
        >
          <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg">
            GPU Sync
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 text-xs text-slate-300">
        <div>
          GPU: {status.webgpuAvailable ? 'available' : 'not detected'} · Initialized:{' '}
          {status.gpuInitialized ? 'yes' : 'no'} · Mode: {mode}
        </div>
        <div>
          Last sync:{' '}
          {lastSyncMetric
            ? `${lastSyncMetric.batchId} · ${lastSyncMetric.syncDataSize ?? 0}B · ${Math.round(
                lastSyncMetric.syncDurationMs ?? 0,
              )}ms`
            : 'n/a'}
        </div>
        {mode === 'packed-half2' ? (
          <div>
            Readback estimate:{' '}
            {typeof packedExpected === 'number' && typeof unpackedExpected === 'number'
              ? `${packedExpected}B packed (3×f32) vs ${unpackedExpected}B raw (6×f32)`
              : 'n/a'}
          </div>
        ) : null}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => start('packed-half2')}
          disabled={isAnimating}
          className={linkButtonClass(isAnimating ? 'ghost' : 'primary')}
        >
          {isAnimating && mode === 'packed-half2' ? 'Running…' : 'Start packed-half2'}
        </button>
        <button
          onClick={() => start('multi-channel')}
          disabled={isAnimating}
          className={linkButtonClass('ghost')}
        >
          Start multi-channel
        </button>
        <button onClick={stop} className={linkButtonClass('ghost')}>
          Stop
        </button>
      </div>
    </div>
  );
}

function GPUDeliveryDemo() {
  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">WebGPU Delivery</p>
            <h1 className="text-2xl font-semibold text-slate-50">GPU Result Delivery Demo</h1>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Multi-Channel GPU → DOM</CardTitle>
            <CardDescription>
              Demonstrates GPU-computed animation results being applied to DOM elements via the
              GPUResultApplySystem delivery pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DemoBox />
          </CardContent>
          <CardFooter className="flex flex-col gap-4 text-sm text-slate-300">
            <div>
              <strong>How it works:</strong>
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>
                Animation is computed on GPU (if batch size qualifies and WebGPU is available).
              </li>
              <li>
                GPU output buffer is read back asynchronously via staging buffer
                <span className="font-mono text-slate-100">mapAsync</span>.
              </li>
              <li>
                Results enqueued via{' '}
                <span className="font-mono text-slate-100">enqueueGPUResults</span>.
              </li>
              <li>
                <span className="font-mono text-slate-100">GPUResultApplySystem</span> drains queue
                before RenderSystem and applies multi-channel values (x, y, rotateX, rotateY) to{' '}
                <span className="font-mono text-slate-100">Render.props</span>.
              </li>
              <li>DOM renderer consumes props and applies CSS transforms in the same frame.</li>
            </ul>
            <div className="mt-2 p-2 bg-slate-900/50 rounded text-xs">
              <strong>Status:</strong> If WebGPU not available or batch below threshold, falls back
              to CPU path (same result, no GPU dispatch).
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
