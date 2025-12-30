import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { getGPUMetrics } from '@g-motion/animation';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import './perf-panel.css';

type PerfItem = {
  label: string;
  value: string | number;
};

type PerfPanelProps = {
  title?: string;
  context?: string;
  items?: PerfItem[];
};

type PerfSnapshot = {
  fps: number;
  frameMs: number;
  lastMs: number;
  gpuAvailable: boolean;
  batch?: { entityCount: number; timestamp: number } | null;
  // GPU→DOM Sync metrics
  gpuSyncPerformed?: boolean;
  gpuSyncDurationMs?: number;
  gpuSyncDataSizeBytes?: number;
  gpuSyncCount?: number;
  // GPU Compute timing metrics
  gpuComputeTimeMs?: number;
  gpuComputeLastMs?: number;
  gpuBatchCount?: number;
};

export function PerfPanel({ title = 'Performance', context, items = [] }: PerfPanelProps) {
  const samplesRef = useRef<number[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({ x: 10, y: 0 }));
  const [snapshot, setSnapshot] = useState<PerfSnapshot>({
    fps: 0,
    frameMs: 0,
    lastMs: 0,
    gpuAvailable: typeof navigator !== 'undefined' && 'gpu' in navigator,
    batch: readBatch(),
    gpuSyncPerformed: false,
    gpuSyncDurationMs: 0,
    gpuSyncDataSizeBytes: 0,
    gpuSyncCount: 0,
    gpuComputeTimeMs: undefined,
    gpuComputeLastMs: undefined,
    gpuBatchCount: undefined,
  });

  useEffect(() => {
    let lastTs: number | undefined;
    let mounted = true;

    const loop = (ts: number) => {
      if (!mounted) return;
      if (lastTs !== undefined) {
        const delta = ts - lastTs;
        const buf = samplesRef.current;
        buf.push(delta);
        if (buf.length > 120) buf.shift();
      }
      lastTs = ts;
      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);

    const interval = setInterval(() => {
      const buf = samplesRef.current;
      if (buf.length === 0) return;
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
      const last = buf[buf.length - 1];

      let gpuSyncPerformed = false;
      let gpuSyncDurationMs = 0;
      let gpuSyncDataSizeBytes = 0;
      let gpuSyncCount = 0;

      // Collect GPU compute timing metrics
      let gpuComputeTimeMs: number | undefined = undefined;
      let gpuComputeLastMs: number | undefined = undefined;
      let gpuBatchCount: number | undefined = undefined;

      const metricsArr = getGPUMetrics();
      if (Array.isArray(metricsArr) && metricsArr.length > 0) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const windowMs = 2000; // look at last 2s of metrics to avoid dropping async GPU timings
        const recentMetrics = metricsArr.filter(
          (m: any) => typeof m?.timestamp === 'number' && now - m.timestamp <= windowMs,
        );

        // Process GPU→DOM sync metrics
        for (const m of recentMetrics) {
          if (m.syncPerformed) {
            gpuSyncCount += 1;
            gpuSyncDurationMs += m.syncDurationMs || 0;
            gpuSyncDataSizeBytes += m.syncDataSize || 0;
          }
        }
        gpuSyncPerformed = recentMetrics.some((m: any) => m.syncPerformed);

        // Process GPU compute timing metrics
        const computeMetrics = recentMetrics.filter(
          (m: any) => m.gpuComputeTimeMs != null && m.gpuComputeTimeMs > 0,
        );
        if (computeMetrics.length > 0) {
          gpuComputeTimeMs =
            computeMetrics.reduce((sum: number, m: any) => sum + m.gpuComputeTimeMs, 0) /
            computeMetrics.length;
          gpuComputeLastMs = computeMetrics[computeMetrics.length - 1].gpuComputeTimeMs;
          gpuBatchCount = computeMetrics.length;
        }
      }

      setSnapshot({
        fps: avg > 0 ? 1000 / avg : 0,
        frameMs: avg,
        lastMs: last,
        gpuAvailable: typeof navigator !== 'undefined' && 'gpu' in navigator,
        batch: readBatch(),
        gpuSyncPerformed,
        gpuSyncDurationMs: gpuSyncCount > 0 ? gpuSyncDurationMs / gpuSyncCount : 0,
        gpuSyncDataSizeBytes,
        gpuSyncCount,
        gpuComputeTimeMs,
        gpuComputeLastMs,
        gpuBatchCount,
      });
    }, 500);

    return () => {
      mounted = false;
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const isNarrow = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
    const margin = isNarrow ? 5 : 8;
    const rect = el.getBoundingClientRect();
    const h = typeof window !== 'undefined' ? window.innerHeight : rect.height + margin * 2;
    const x = margin;
    const y = isNarrow ? 10 : Math.max(margin, Math.round((h - rect.height) / 2));
    setPos((p) => (p.y === 0 ? { x, y } : p));
  }, []);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const margin = 8;
    const clamp = () => {
      const rect = el.getBoundingClientRect();
      const w = window.innerWidth;
      const h = window.innerHeight;
      const maxX = Math.max(margin, w - rect.width - margin);
      const maxY = Math.max(margin, h - rect.height - margin);
      setPos((p) => ({
        x: Math.min(Math.max(margin, p.x), maxX),
        y: Math.min(Math.max(margin, p.y), maxY),
      }));
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => {
      window.removeEventListener('resize', clamp);
    };
  }, [isCollapsed]);

  const safeItems = useMemo(() => items, [items]);

  const onHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button')) return;
    const el = panelRef.current;
    if (!el) return;

    draggingRef.current = true;
    setIsDragging(true);
    const rect = el.getBoundingClientRect();
    dragOffsetRef.current = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
    };

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
  };

  const onHeaderPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const el = panelRef.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    const { dx, dy } = dragOffsetRef.current;
    const nextX = e.clientX - dx;
    const nextY = e.clientY - dy;
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
    setPos({
      x: Math.min(Math.max(margin, nextX), maxX),
      y: Math.min(Math.max(margin, nextY), maxY),
    });
  };

  const onHeaderPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div
      ref={panelRef}
      className="perf-panel-fixed"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
    >
      <Card className="perf-panel-card">
        <CardHeader>
          <div
            className={`perf-panel-header${isDragging ? ' dragging' : ''}`}
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
            onPointerCancel={onHeaderPointerUp}
          >
            <CardTitle>{title}</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed((v) => !v)}
            >
              {isCollapsed ? '展开' : '收起'}
            </Button>
          </div>
        </CardHeader>
        {isCollapsed ? null : (
          <CardContent className="space-y-2 text-sm text-slate-300">
            {context ? <div className="text-xs text-slate-400">{context}</div> : null}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
              <Stat label="FPS" value={formatNumber(snapshot.fps)} />
              <Stat label="Frame (avg ms)" value={formatMs(snapshot.frameMs)} />
              <Stat label="Frame (last ms)" value={formatMs(snapshot.lastMs)} />
              <Stat label="GPU" value={snapshot.gpuAvailable ? 'available' : 'not detected'} />
              <Stat
                label="Last batch"
                value={
                  snapshot.batch
                    ? `${snapshot.batch.entityCount} @ ${Math.round(snapshot.batch.timestamp)}ms`
                    : 'n/a'
                }
              />
            </div>
            {snapshot.gpuAvailable &&
              snapshot.gpuComputeTimeMs != null &&
              snapshot.gpuComputeTimeMs > 0 && (
                <div className="border-t border-slate-700 pt-2 mt-2">
                  <div className="text-xs font-semibold text-slate-400 mb-1">
                    GPU Compute Timing
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <Stat label="Avg compute time" value={formatMs(snapshot.gpuComputeTimeMs)} />
                    <Stat
                      label="Last compute time"
                      value={formatMs(snapshot.gpuComputeLastMs ?? 0)}
                    />
                    {snapshot.gpuBatchCount != null && snapshot.gpuBatchCount > 0 && (
                      <Stat label="Batch count" value={snapshot.gpuBatchCount} />
                    )}
                  </div>
                </div>
              )}
            {snapshot.gpuAvailable && (
              <div className="border-t border-slate-700 pt-2 mt-2">
                <div className="text-xs font-semibold text-slate-400 mb-1">GPU→DOM Sync</div>
                <div className="grid grid-cols-1 gap-2">
                  <Stat label="Syncing" value={snapshot.gpuSyncPerformed ? '✓ Yes' : 'No'} />
                  <Stat label="Sync count" value={snapshot.gpuSyncCount ?? 0} />
                  <Stat label="Avg sync time" value={formatMs(snapshot.gpuSyncDurationMs ?? 0)} />
                  <Stat label="Data size" value={formatBytes(snapshot.gpuSyncDataSizeBytes ?? 0)} />
                </div>
              </div>
            )}
            {safeItems.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {safeItems.map((item) => (
                  <Stat key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            ) : null}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-mono text-slate-50">{value}</div>
    </div>
  );
}

function formatNumber(value: number) {
  if (!isFinite(value)) return '0.0';
  return value.toFixed(1);
}

function formatMs(value: number) {
  if (!isFinite(value)) return '0.0 ms';
  return `${value.toFixed(1)} ms`;
}

function formatBytes(value: number) {
  if (!isFinite(value)) return '0 B';
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function readBatch(): { entityCount: number; timestamp: number } | null {
  const metricsArr = getGPUMetrics();
  if (Array.isArray(metricsArr) && metricsArr.length > 0) {
    const last = metricsArr[0];
    if (typeof last?.entityCount === 'number' && typeof last?.timestamp === 'number') {
      return { entityCount: last.entityCount, timestamp: last.timestamp };
    }
  }
  return null;
}
