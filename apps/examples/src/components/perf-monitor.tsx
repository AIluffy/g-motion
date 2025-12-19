import { useEffect, useRef, useState } from 'react';
import { getGPUMetrics, getSystemTimings } from '@g-motion/animation';
import { getGPUChannelMappingRegistry } from '@g-motion/core';
import { useSetAtom } from 'jotai';
import { activeEntityCountAtom, engineMetricsAtom } from '@/state/engineState';
import './perf-monitor.css';

type PerfSnapshot = {
  fps: number;
  frameMs: number;
  lastMs: number;
  memoryMB: number;
  gpuAvailable: boolean;
  batch: { entityCount: number; timestamp: number } | null;
  // GPU compute metrics
  gpuComputeMs?: number;
  gpuComputeLastMs?: number;
  gpuBatchCount?: number;
  gpuArchetypes?: Map<
    string,
    {
      avgComputeMs: number;
      minComputeMs: number;
      maxComputeMs: number;
      dispatchCount: number;
      entityCount: number;
    }
  >;
  // GPU→DOM sync metrics
  gpuSyncPerformed?: boolean;
  gpuSyncCount?: number;
  gpuSyncAvgMs?: number;
  gpuSyncDataSizeBytes?: number;
  systems?: Array<{ name: string; avgMs: number; lastMs: number }>;
  gpuTrackedProps?: string[];
};

type PanelConfig = {
  id: string;
  label: string;
  unit?: string;
  fg: string;
  bg: string;
  maxValue: number;
};

type CanvasPanelProps = PanelConfig & {
  value: number;
};

function CanvasPanel({ label, unit, fg, bg, maxValue, value }: CanvasPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minRef = useRef<number>(Infinity);
  const maxRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!Number.isFinite(value)) return;
    const width = canvas.width;
    const height = canvas.height;
    const headerHeight = 16;
    const graphHeight = height - headerHeight;

    const v = Math.max(0, value);
    if (!Number.isFinite(minRef.current) || minRef.current === Infinity) {
      minRef.current = v;
      maxRef.current = v;
    } else {
      minRef.current = Math.min(minRef.current, v);
      maxRef.current = Math.max(maxRef.current, v);
    }

    const min = minRef.current;
    const max = maxRef.current;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, headerHeight);

    ctx.fillStyle = fg;
    ctx.font = 'bold 9px Menlo, Monaco, monospace';
    ctx.textBaseline = 'top';
    const valueText = `${Math.round(v)} ${label}${unit ? ' ' + unit : ''}`;
    const rangeText = `(${Math.round(min)}-${Math.round(max)})`;
    ctx.fillText(valueText, 2, 2);
    const valueWidth = ctx.measureText(valueText).width;
    ctx.fillText(rangeText, valueWidth + 6, 2);

    ctx.drawImage(
      canvas,
      1,
      headerHeight,
      width - 1,
      graphHeight,
      0,
      headerHeight,
      width - 1,
      graphHeight,
    );

    ctx.fillStyle = bg;
    ctx.fillRect(width - 1, headerHeight, 1, graphHeight);

    const observedMax = max > 0 ? max : v || 1;
    const safeMax =
      maxValue > 0 ? Math.min(maxValue, Math.max(observedMax, maxValue * 0.25)) : observedMax;
    const norm = Math.max(0, Math.min(1, v / (safeMax || 1)));
    const barHeight = Math.round(graphHeight * norm);

    ctx.fillStyle = fg;
    ctx.fillRect(width - 1, headerHeight + graphHeight - barHeight, 1, barHeight);
  }, [value, label, unit, fg, bg, maxValue]);

  return <canvas ref={canvasRef} width={80} height={48} className="perf-panel-canvas" />;
}

/**
 * Real-time performance monitor overlay, similar to stats.js.
 * Displays FPS, frame time, and memory usage in the top-right corner.
 * Lightweight and always-visible component.
 */
export function PerfMonitor() {
  const samplesRef = useRef<number[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const setEngineMetrics = useSetAtom(engineMetricsAtom);
  const setActiveEntityCount = useSetAtom(activeEntityCountAtom);
  const [snapshot, setSnapshot] = useState<PerfSnapshot>({
    fps: 0,
    frameMs: 0,
    lastMs: 0,
    memoryMB: 0,
    gpuAvailable: typeof navigator !== 'undefined' && 'gpu' in navigator,
    batch: null,
    gpuComputeMs: undefined,
    gpuComputeLastMs: undefined,
    gpuBatchCount: undefined,
    gpuArchetypes: undefined,
    gpuSyncPerformed: false,
    gpuSyncCount: 0,
    gpuSyncAvgMs: 0,
    gpuSyncDataSizeBytes: 0,
    gpuTrackedProps: [],
  });

  useEffect(() => {
    let lastTs: number | undefined;
    let mounted = true;

    // RAF loop to collect frame deltas
    const loop = (ts: number) => {
      if (!mounted) return;
      if (lastTs !== undefined) {
        const delta = ts - lastTs;
        const buf = samplesRef.current;
        buf.push(delta);
        // Keep rolling buffer at 60 samples (1 second at 60fps)
        if (buf.length > 60) buf.shift();
      }
      lastTs = ts;
      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);

    // Sample interval: update metrics every 250ms for real-time feel
    const interval = setInterval(() => {
      const buf = samplesRef.current;

      let fps = 0;
      let frameAvgMs = 0;
      let frameLastMs = 0;

      if (buf.length > 0) {
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        frameAvgMs = avg;
        frameLastMs = buf[buf.length - 1];
        fps = avg > 0 ? 1000 / avg : 0;
      }

      // Get memory usage if available
      let memoryMB = 0;
      const perfMem = (performance as any).memory;
      if (perfMem && typeof perfMem.usedJSHeapSize === 'number') {
        memoryMB = perfMem.usedJSHeapSize / (1024 * 1024);
      }

      const gpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
      const batch = readBatch();

      let gpuComputeMs: number | undefined = undefined;
      let gpuComputeLastMs: number | undefined = undefined;
      let gpuBatchCount: number | undefined = undefined;
      let gpuArchetypes: Map<string, any> | undefined = undefined;

      // GPU→DOM sync metrics
      let gpuSyncPerformed = false;
      let gpuSyncCount = 0;
      let gpuSyncDurationTotal = 0;
      let gpuSyncDataSizeBytes = 0;
      let systems: Array<{ name: string; avgMs: number; lastMs: number }> | undefined = undefined;
      let gpuTrackedProps: string[] | undefined = undefined;

      const metricsArr = getGPUMetrics();
      if (Array.isArray(metricsArr) && metricsArr.length > 0) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const windowMs = 2000;

        // Optimize: only check last N metrics instead of filtering entire array
        const startIdx = Math.max(0, metricsArr.length - 50); // Last 50 metrics max
        let computeSum = 0;
        let computeCount = 0;
        let lastComputeMetric: any = null;
        const archetypeMap = new Map<string, any>();

        for (let i = startIdx; i < metricsArr.length; i++) {
          const m = metricsArr[i];
          if (typeof m?.timestamp !== 'number' || now - m.timestamp > windowMs) {
            continue;
          }

          // Collect GPU compute metrics
          if (m.gpuComputeTimeMs != null && m.gpuComputeTimeMs > 0) {
            computeSum += m.gpuComputeTimeMs;
            computeCount++;
            lastComputeMetric = m;

            // Build archetype timings incrementally
            const archetypeId = m.batchId?.replace('-timing', '') || 'unknown';
            const existing = archetypeMap.get(archetypeId);
            if (!existing) {
              archetypeMap.set(archetypeId, {
                avgComputeMs: m.gpuComputeTimeMs,
                minComputeMs: m.gpuComputeTimeMs,
                maxComputeMs: m.gpuComputeTimeMs,
                dispatchCount: 1,
                entityCount: m.entityCount,
              });
            } else {
              const newCount = existing.dispatchCount + 1;
              const newAvg =
                (existing.avgComputeMs * existing.dispatchCount + m.gpuComputeTimeMs) / newCount;
              archetypeMap.set(archetypeId, {
                avgComputeMs: newAvg,
                minComputeMs: Math.min(existing.minComputeMs, m.gpuComputeTimeMs),
                maxComputeMs: Math.max(existing.maxComputeMs, m.gpuComputeTimeMs),
                dispatchCount: newCount,
                entityCount: m.entityCount,
              });
            }
          }

          // Collect sync metrics
          if (m.syncPerformed) {
            gpuSyncPerformed = true;
            gpuSyncCount += 1;
            gpuSyncDurationTotal += m.syncDurationMs || 0;
            gpuSyncDataSizeBytes += m.syncDataSize || 0;
          }
        }

        if (computeCount > 0) {
          gpuComputeMs = computeSum / computeCount;
          gpuComputeLastMs = lastComputeMetric?.gpuComputeTimeMs;
          gpuBatchCount = computeCount;
          gpuArchetypes = archetypeMap.size > 0 ? archetypeMap : undefined;
        }
      }

      const timingMap = getSystemTimings();
      const entries = Object.entries(timingMap);
      if (entries.length > 0) {
        systems = entries
          .map(([name, stat]) => ({ name, avgMs: stat.avgMs, lastMs: stat.lastMs }))
          .sort((a, b) => b.avgMs - a.avgMs)
          .slice(0, 8);
      }

      try {
        const registry = getGPUChannelMappingRegistry() as any;
        if (registry && typeof registry.getAllTables === 'function') {
          const tables = registry.getAllTables() as any[];
          if (Array.isArray(tables) && tables.length > 0) {
            const propSet = new Set<string>();
            for (const t of tables) {
              const ch = t.channels as any[] | undefined;
              if (!Array.isArray(ch)) continue;
              for (const c of ch) {
                if (c && typeof c.property === 'string') {
                  propSet.add(c.property);
                }
              }
            }
            if (propSet.size > 0) {
              gpuTrackedProps = Array.from(propSet).sort();
            }
          }
        }
      } catch {}

      setSnapshot({
        fps: fps,
        frameMs: frameAvgMs,
        lastMs: frameLastMs,
        memoryMB: memoryMB,
        gpuAvailable,
        batch,
        gpuComputeMs,
        gpuComputeLastMs,
        gpuBatchCount,
        gpuArchetypes,
        gpuSyncPerformed,
        gpuSyncCount,
        gpuSyncAvgMs: gpuSyncCount > 0 ? gpuSyncDurationTotal / gpuSyncCount : 0,
        gpuSyncDataSizeBytes,
        systems,
        gpuTrackedProps,
      });

      setEngineMetrics({
        fps,
        frameMs: frameAvgMs,
        lastMs: frameLastMs,
        gpuAvailable,
        batchEntityCount: batch ? batch.entityCount : null,
        gpuComputeMs,
        gpuComputeLastMs,
        gpuBatchCount,
        systemTimings: systems,
      });
      setActiveEntityCount(batch ? batch.entityCount : 0);
    }, 250);

    return () => {
      mounted = false;
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      clearInterval(interval);
    };
  }, []);
  const panels: Array<{ config: PanelConfig; value: number }> = [
    {
      config: {
        id: 'fps',
        label: 'FPS',
        unit: '',
        fg: '#00ffff',
        bg: '#002133',
        maxValue: 120,
      },
      value: snapshot.fps,
    },
    {
      config: {
        id: 'ms',
        label: 'MS',
        unit: 'ms',
        fg: '#00ff00',
        bg: '#003300',
        maxValue: 50,
      },
      value: snapshot.frameMs,
    },
    {
      config: {
        id: 'mb',
        label: 'MB',
        unit: 'MB',
        fg: '#ff0088',
        bg: '#330022',
        maxValue: 512,
      },
      value: snapshot.memoryMB,
    },
    {
      config: {
        id: 'gpu',
        label: 'GPU',
        unit: 'µs',
        fg: '#ffff00',
        bg: '#333000',
        maxValue: 500,
      },
      value: (snapshot.gpuComputeMs ?? 0) * 1000,
    },
    {
      config: {
        id: 'sync',
        label: 'SYNC',
        unit: 'ms',
        fg: '#ffffff',
        bg: '#333333',
        maxValue: 10,
      },
      value: snapshot.gpuSyncAvgMs ?? 0,
    },
  ];

  return (
    <div className="perf-monitor">
      <div className="perf-monitor-content">
        <div className="perf-panel-row">
          {panels.map(({ config, value }) => (
            <CanvasPanel
              key={config.id}
              id={config.id}
              label={config.label}
              unit={config.unit}
              fg={config.fg}
              bg={config.bg}
              maxValue={config.maxValue}
              value={value}
            />
          ))}
        </div>
        <div className="perf-debug">
          <div className="perf-stat">
            <div className="perf-label">GPU</div>
            <div className="perf-value">{snapshot.gpuAvailable ? 'on' : 'off'}</div>
          </div>
          <div className="perf-stat">
            <div className="perf-label">Batch</div>
            <div className="perf-value">
              {snapshot.batch
                ? `${snapshot.batch.entityCount}@${Math.round(snapshot.batch.timestamp)}ms`
                : 'N/A'}
            </div>
          </div>
          <div className="perf-stat">
            <div className="perf-label">GPU avg</div>
            <div className="perf-value">
              {snapshot.gpuComputeMs != null && snapshot.gpuComputeMs > 0
                ? `${snapshot.gpuComputeMs.toFixed(2)}ms`
                : 'N/A'}
            </div>
          </div>
          {snapshot.gpuTrackedProps && snapshot.gpuTrackedProps.length > 0 && (
            <div className="perf-stat">
              <div className="perf-label">GPU props</div>
              <div
                className="perf-value"
                style={{
                  maxWidth: '220px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {snapshot.gpuTrackedProps.join(', ')}
              </div>
            </div>
          )}
          <div className="perf-stat">
            <div className="perf-label">GPU last</div>
            <div className="perf-value">
              {snapshot.gpuComputeLastMs != null && snapshot.gpuComputeLastMs > 0
                ? formatMs(snapshot.gpuComputeLastMs)
                : 'N/A'}
            </div>
          </div>
          <div className="perf-stat">
            <div className="perf-label">Batches</div>
            <div className="perf-value">
              {snapshot.gpuBatchCount != null && snapshot.gpuBatchCount > 0
                ? snapshot.gpuBatchCount
                : 'N/A'}
            </div>
          </div>
          <details className="perf-details" open>
            <summary style={{ cursor: 'pointer', fontSize: '10px', marginTop: '4px' }}>
              Archetype Details (
              {snapshot.gpuArchetypes && snapshot.gpuArchetypes.size > 0
                ? snapshot.gpuArchetypes.size
                : 0}
              )
            </summary>
            <div
              style={{
                fontSize: '9px',
                marginTop: '2px',
                paddingLeft: '8px',
                height: '100px',
                overflowY: 'auto',
                flexShrink: 0,
              }}
            >
              {snapshot.gpuArchetypes && snapshot.gpuArchetypes.size > 0 ? (
                Array.from(snapshot.gpuArchetypes.entries()).map(([archetypeId, timing]) => (
                  <div key={archetypeId} style={{ marginBottom: '2px' }}>
                    <div style={{ fontWeight: 'bold' }}>{archetypeId}:</div>
                    <div style={{ paddingLeft: '8px' }}>
                      Avg: {timing.avgComputeMs.toFixed(3)}ms | Min:{' '}
                      {timing.minComputeMs.toFixed(3)}ms | Max: {timing.maxComputeMs.toFixed(3)}ms
                      <br />
                      Entities: {timing.entityCount} | Dispatches: {timing.dispatchCount}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontStyle: 'italic' }}>
                  No archetype data available
                </div>
              )}
            </div>
          </details>
          <div className="perf-stat">
            <div className="perf-label">Sync</div>
            <div className="perf-value">
              {snapshot.gpuAvailable ? (snapshot.gpuSyncPerformed ? '✓' : '—') : 'N/A'}
            </div>
          </div>
          <div className="perf-stat">
            <div className="perf-label">Sync avg</div>
            <div className="perf-value">
              {snapshot.gpuAvailable && snapshot.gpuSyncAvgMs != null && snapshot.gpuSyncAvgMs > 0
                ? formatMs(snapshot.gpuSyncAvgMs)
                : 'N/A'}
            </div>
          </div>
          <div className="perf-stat">
            <div className="perf-label">Sync data</div>
            <div className="perf-value">
              {snapshot.gpuAvailable &&
              snapshot.gpuSyncDataSizeBytes != null &&
              snapshot.gpuSyncDataSizeBytes > 0
                ? formatBytes(snapshot.gpuSyncDataSizeBytes)
                : 'N/A'}
            </div>
          </div>
          {snapshot.systems && snapshot.systems.length > 0 ? (
            <details className="perf-details" open>
              <summary style={{ cursor: 'pointer', fontSize: '10px', marginTop: '4px' }}>
                Systems ({snapshot.systems.length})
              </summary>
              <div
                style={{
                  fontSize: '9px',
                  marginTop: '2px',
                  paddingLeft: '8px',
                  height: '110px',
                  overflowY: 'auto',
                  flexShrink: 0,
                }}
              >
                {snapshot.systems.map((s) => (
                  <div key={s.name} style={{ marginBottom: '2px' }}>
                    {s.name}: avg {s.avgMs.toFixed(2)}ms | last {s.lastMs.toFixed(2)}ms
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
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

function formatMs(value: number): string {
  if (!Number.isFinite(value)) return '0.0ms';
  return `${value.toFixed(1)}ms`;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '0 B';
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
