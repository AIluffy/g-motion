import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState, Fragment } from 'react';
import { motion } from '@g-motion/animation';
import { type MotionError, ErrorCode, ErrorSeverity, getErrorHandler } from '@g-motion/core';
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
import { ErrorMonitorPanel } from '@/components/error-monitor-panel';

type CapturedError = {
  id: number;
  code: ErrorCode;
  severity: ErrorSeverity;
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
  time: string;
  timestamp: number;
};

type ThrownError = {
  message: string;
  stack?: string;
};

type SeverityFilter =
  | 'all'
  | ErrorSeverity.FATAL
  | ErrorSeverity.ERROR
  | ErrorSeverity.WARNING
  | ErrorSeverity.INFO;

type TimeRangeFilter = 'all' | '1m' | '5m' | '15m';

type ErrorChartPoint = {
  x: number;
  y: number;
};

type ErrorRateChartProps = {
  points: ErrorChartPoint[];
};

function ErrorRateChart({ points }: ErrorRateChartProps) {
  if (points.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-slate-500">
        No data for current filters.
      </div>
    );
  }
  const width = 260;
  const height = 80;
  const maxY = points.reduce((max, p) => (p.y > max ? p.y : max), 0) || 1;
  const normalized = points.map((p) => ({
    x: p.x * width,
    y: height - (p.y / maxY) * (height - 8) - 4,
  }));
  const path = normalized.map((p) => `${p.x},${p.y}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full text-sky-400">
      <polyline fill="none" stroke="currentColor" strokeWidth={1.5} points={path} />
    </svg>
  );
}
export const Route = createFileRoute('/dev-debug')({
  component: DevDebugPage,
});

function DevDebugPage() {
  const [errors, setErrors] = useState<CapturedError[]>([]);
  const [lastThrown, setLastThrown] = useState<ThrownError | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<Record<ErrorCode, boolean>>({
    INVALID_CONFIG: true,
    INVALID_PARAMETER: true,
    INVALID_GPU_MODE: true,
    COMPONENT_NOT_REGISTERED: true,
    DUPLICATE_REGISTRATION: true,
    INVALID_COMPONENT_NAME: true,
    INVALID_MARK_OPTIONS: true,
    INVALID_DURATION: true,
    INVALID_EASING: true,
    INVALID_BEZIER_POINTS: true,
    GPU_INIT_FAILED: true,
    GPU_ADAPTER_UNAVAILABLE: true,
    GPU_DEVICE_UNAVAILABLE: true,
    GPU_PIPELINE_FAILED: true,
    GPU_BUFFER_WRITE_FAILED: true,
    BATCH_EMPTY: true,
    BATCH_NOT_FOUND: true,
    BATCH_VALIDATION_FAILED: true,
    SYSTEM_UPDATE_FAILED: true,
    RENDERER_NOT_FOUND: true,
    READBACK_FAILED: true,
    TARGETS_EMPTY: true,
    TARGET_NULL: true,
    DOM_ENV_MISSING: true,
    INVALID_SELECTOR: true,
  });
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('all');

  useEffect(() => {
    const handler = getErrorHandler();
    let nextId = 1;
    const listener = (error: MotionError) => {
      const entry: CapturedError = {
        id: nextId++,
        code: error.code,
        severity: error.severity,
        message: error.message,
        context: error.context,
        stack: error.stack,
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now(),
      };
      setErrors((prev) => [entry, ...prev].slice(0, 50));
    };
    handler.addListener(listener);
    return () => {
      handler.removeListener(listener);
    };
  }, []);

  const filteredErrors = useMemo(() => {
    const now = Date.now();
    return errors.filter((err) => {
      if (!selectedCodes[err.code]) {
        return false;
      }
      if (timeRange !== 'all') {
        const diff = now - err.timestamp;
        if (timeRange === '1m' && diff > 60_000) {
          return false;
        }
        if (timeRange === '5m' && diff > 5 * 60_000) {
          return false;
        }
        if (timeRange === '15m' && diff > 15 * 60_000) {
          return false;
        }
      }
      if (severityFilter !== 'all' && err.severity !== severityFilter) {
        return false;
      }
      if (!searchText) {
        return true;
      }
      const text = searchText.toLowerCase();
      if (err.message.toLowerCase().includes(text)) {
        return true;
      }
      if (err.code.toLowerCase().includes(text)) {
        return true;
      }
      if (err.context && JSON.stringify(err.context).toLowerCase().includes(text)) {
        return true;
      }
      return false;
    });
  }, [errors, selectedCodes, severityFilter, searchText, timeRange]);

  const stats = useMemo(() => {
    const total = filteredErrors.length;
    const bySeverity: Record<ErrorSeverity, number> = {
      [ErrorSeverity.FATAL]: 0,
      [ErrorSeverity.ERROR]: 0,
      [ErrorSeverity.WARNING]: 0,
      [ErrorSeverity.INFO]: 0,
    };
    let gpuCount = 0;
    let earliest: string | null = null;
    let latest: string | null = null;
    if (total === 0) {
      return { total, bySeverity, gpuCount, earliest, latest };
    }
    const sortedByTime = [...filteredErrors].sort((a, b) => a.timestamp - b.timestamp);
    earliest = sortedByTime[0].time;
    latest = sortedByTime[sortedByTime.length - 1].time;
    for (const e of filteredErrors) {
      bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
      if (e.code.startsWith('GPU_')) {
        gpuCount += 1;
      }
    }
    return { total, bySeverity, gpuCount, earliest, latest };
  }, [filteredErrors]);

  const chartPoints = useMemo<ErrorChartPoint[]>(() => {
    if (filteredErrors.length === 0) {
      return [];
    }
    const sorted = [...filteredErrors].sort((a, b) => a.timestamp - b.timestamp);
    const start = sorted[0].timestamp;
    const end = sorted[sorted.length - 1].timestamp;
    const span = Math.max(end - start, 1000);
    const bucketCount = Math.min(24, Math.max(6, sorted.length));
    const bucketSize = span / bucketCount;
    const buckets = new Array<number>(bucketCount).fill(0);
    for (const err of sorted) {
      const index = Math.min(bucketCount - 1, Math.floor((err.timestamp - start) / bucketSize));
      buckets[index] += 1;
    }
    if (bucketCount === 1) {
      return [
        {
          x: 0,
          y: buckets[0],
        },
      ];
    }
    return buckets.map((value, index) => ({
      x: index / (bucketCount - 1),
      y: value,
    }));
  }, [filteredErrors]);

  const toggleCode = (code: ErrorCode) => {
    setSelectedCodes((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  const setAllCodes = (value: boolean) => {
    setSelectedCodes((prev) => {
      const next: Record<ErrorCode, boolean> = { ...prev };
      const keys = Object.keys(next) as ErrorCode[];
      for (const k of keys) {
        next[k] = value;
      }
      return next;
    });
  };

  const setGpuOnlyCodes = () => {
    setSelectedCodes((prev) => {
      const next: Record<ErrorCode, boolean> = { ...prev };
      const gpuCodes: ErrorCode[] = [
        ErrorCode.GPU_INIT_FAILED,
        ErrorCode.GPU_ADAPTER_UNAVAILABLE,
        ErrorCode.GPU_DEVICE_UNAVAILABLE,
        ErrorCode.GPU_PIPELINE_FAILED,
        ErrorCode.GPU_BUFFER_WRITE_FAILED,
      ];
      const keys = Object.keys(next) as ErrorCode[];
      for (const k of keys) {
        next[k] = gpuCodes.includes(k);
      }
      return next;
    });
  };

  const triggerMissingTarget = () => {
    setLastThrown(null);
    try {
      motion('#__does_not_exist__')
        .mark([{ to: { x: 100 }, at: 300 }])
        .play();
    } catch (e) {
      const err = e as Error;
      setLastThrown({
        message: err.message,
        stack: err.stack,
      });
    }
  };

  const triggerInvalidSelector = () => {
    setLastThrown(null);
    try {
      motion('div[')
        .mark([{ to: { x: 50 }, at: 200 }])
        .play();
    } catch (e) {
      const err = e as Error;
      setLastThrown({
        message: err.message,
        stack: err.stack,
      });
    }
  };

  const triggerGPUInitFailed = () => {
    const handler = getErrorHandler();
    handler.create(
      'Simulated GPU device initialization failure for debug panel',
      ErrorCode.GPU_INIT_FAILED,
      ErrorSeverity.ERROR,
      {
        stage: 'device',
        source: 'dev-debug-panel',
        hint: 'Check WebGPU adapter/device availability',
      },
    );
  };

  const triggerGPUBufferWriteFailed = () => {
    const handler = getErrorHandler();
    handler.create(
      'Simulated GPU buffer write failure for debug panel',
      ErrorCode.GPU_BUFFER_WRITE_FAILED,
      ErrorSeverity.ERROR,
      {
        stage: 'buffer-write',
        source: 'dev-debug-panel',
        hint: 'Check storage buffer sizes and mapping',
      },
    );
  };

  const triggerGPUFallbackChain = () => {
    const handler = getErrorHandler();
    handler.create(
      'Simulated GPU init failure triggering fallback to CPU path',
      ErrorCode.GPU_INIT_FAILED,
      ErrorSeverity.ERROR,
      {
        stage: 'init',
        source: 'dev-debug-panel',
        willFallback: true,
      },
    );
    handler.create(
      'Simulated system update on CPU path after GPU fallback',
      ErrorCode.SYSTEM_UPDATE_FAILED,
      ErrorSeverity.WARNING,
      {
        stage: 'system-update',
        path: 'cpu-after-fallback',
        source: 'dev-debug-panel',
      },
    );
  };

  const clearErrors = () => {
    setErrors([]);
    setLastThrown(null);
  };

  const hasAnyCodeDisabled = useMemo(
    () => Object.values(selectedCodes).some((v) => !v),
    [selectedCodes],
  );

  const hasAnyCodeEnabled = useMemo(
    () => Object.values(selectedCodes).some((v) => v),
    [selectedCodes],
  );

  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Dev debug</p>
            <h1 className="text-2xl font-semibold text-slate-50">
              Motion error stream in development mode
            </h1>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Error listener panel</CardTitle>
            <CardDescription>
              Subscribes to the global Motion ErrorHandler and shows recent MotionError events.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={triggerMissingTarget}>
                Trigger TARGETS_EMPTY (missing target)
              </Button>
              <Button size="sm" variant="ghost" onClick={triggerInvalidSelector}>
                Trigger INVALID_SELECTOR (invalid CSS selector)
              </Button>
              <Button size="sm" variant="ghost" onClick={triggerGPUInitFailed}>
                Trigger GPU_INIT_FAILED
              </Button>
              <Button size="sm" variant="ghost" onClick={triggerGPUBufferWriteFailed}>
                Trigger GPU_BUFFER_WRITE_FAILED
              </Button>
              <Button size="sm" variant="ghost" onClick={triggerGPUFallbackChain}>
                Simulate GPU fallback chain
              </Button>
              <Button size="sm" variant="ghost" onClick={clearErrors}>
                Clear
              </Button>
            </div>

            <div className="mb-4 grid gap-3 rounded-md border border-slate-800 bg-slate-950/60 p-3 md:grid-cols-[2fr,1.2fr]">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Severity
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant={severityFilter === 'all' ? 'primary' : 'ghost'}
                      onClick={() => setSeverityFilter('all')}
                    >
                      All
                    </Button>
                    <Button
                      size="sm"
                      variant={severityFilter === ErrorSeverity.FATAL ? 'primary' : 'ghost'}
                      onClick={() => setSeverityFilter(ErrorSeverity.FATAL)}
                    >
                      Fatal
                    </Button>
                    <Button
                      size="sm"
                      variant={severityFilter === ErrorSeverity.ERROR ? 'primary' : 'ghost'}
                      onClick={() => setSeverityFilter(ErrorSeverity.ERROR)}
                    >
                      Error
                    </Button>
                    <Button
                      size="sm"
                      variant={severityFilter === ErrorSeverity.WARNING ? 'primary' : 'ghost'}
                      onClick={() => setSeverityFilter(ErrorSeverity.WARNING)}
                    >
                      Warning
                    </Button>
                    <Button
                      size="sm"
                      variant={severityFilter === ErrorSeverity.INFO ? 'primary' : 'ghost'}
                      onClick={() => setSeverityFilter(ErrorSeverity.INFO)}
                    >
                      Info
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Search
                  </span>
                  <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Filter by code, message or context…"
                    className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Time range
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant={timeRange === 'all' ? 'primary' : 'ghost'}
                      onClick={() => setTimeRange('all')}
                    >
                      All
                    </Button>
                    <Button
                      size="sm"
                      variant={timeRange === '1m' ? 'primary' : 'ghost'}
                      onClick={() => setTimeRange('1m')}
                    >
                      1 min
                    </Button>
                    <Button
                      size="sm"
                      variant={timeRange === '5m' ? 'primary' : 'ghost'}
                      onClick={() => setTimeRange('5m')}
                    >
                      5 min
                    </Button>
                    <Button
                      size="sm"
                      variant={timeRange === '15m' ? 'primary' : 'ghost'}
                      onClick={() => setTimeRange('15m')}
                    >
                      15 min
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Error codes
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={hasAnyCodeDisabled ? 'primary' : 'ghost'}
                      onClick={() => setAllCodes(true)}
                    >
                      All
                    </Button>
                    <Button
                      size="sm"
                      variant={hasAnyCodeEnabled ? 'ghost' : 'primary'}
                      onClick={() => setAllCodes(false)}
                    >
                      None
                    </Button>
                    <Button size="sm" variant="ghost" onClick={setGpuOnlyCodes}>
                      GPU only
                    </Button>
                  </div>
                </div>
                <div className="grid max-h-32 grid-cols-2 gap-1 overflow-auto text-xs text-slate-300">
                  {(Object.keys(selectedCodes) as ErrorCode[]).map((code) => (
                    <label key={code} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="h-3 w-3 rounded border-slate-600 bg-slate-900 text-sky-500"
                        checked={selectedCodes[code]}
                        onChange={() => toggleCode(code)}
                      />
                      <span className="font-mono">{code}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-4 grid gap-3 rounded-md border border-slate-800 bg-slate-950/60 p-3 md:grid-cols-[1.2fr,2fr]">
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Stats
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-200">
                  <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">
                      Visible
                    </div>
                    <div className="text-lg font-semibold text-slate-50">{stats.total}</div>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">GPU</div>
                    <div className="text-lg font-semibold text-slate-50">{stats.gpuCount}</div>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Errors</div>
                    <div className="text-sm text-red-300">
                      {stats.bySeverity[ErrorSeverity.FATAL] +
                        stats.bySeverity[ErrorSeverity.ERROR]}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">
                      Warn/Info
                    </div>
                    <div className="text-sm text-amber-200">
                      {stats.bySeverity[ErrorSeverity.WARNING] +
                        stats.bySeverity[ErrorSeverity.INFO]}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500">
                  {stats.total === 0 ? (
                    <span>No errors for current filters.</span>
                  ) : (
                    <span>
                      From {stats.earliest ?? '-'} to {stats.latest ?? '-'}.
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Error rate
                  </span>
                  <span className="text-[10px] text-slate-500">Buckets over current time span</span>
                </div>
                <ErrorRateChart points={chartPoints} />
              </div>
            </div>

            <div className="max-h-80 overflow-auto rounded-md border border-slate-800 bg-slate-950/60">
              {filteredErrors.length === 0 ? (
                <div className="p-4 text-sm text-slate-400">
                  No Motion errors captured with current filters. Use the buttons above to trigger
                  some errors in strict dev mode.
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Severity</th>
                      <th className="px-3 py-2">Message</th>
                      <th className="px-3 py-2">Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ErrorSeverity.FATAL,
                      ErrorSeverity.ERROR,
                      ErrorSeverity.WARNING,
                      ErrorSeverity.INFO,
                    ].map((sev) => {
                      const group = filteredErrors.filter((err) => err.severity === sev);
                      if (group.length === 0) return null;
                      return (
                        <Fragment key={sev}>
                          <tr className="bg-slate-900/70">
                            <td
                              colSpan={5}
                              className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400"
                            >
                              {sev}
                            </td>
                          </tr>
                          {group.map((err) => (
                            <tr key={err.id} className="border-t border-slate-800">
                              <td className="px-3 py-2 align-top text-slate-300">{err.time}</td>
                              <td className="px-3 py-2 align-top font-mono text-xs text-amber-300">
                                {err.code}
                              </td>
                              <td className="px-3 py-2 align-top text-slate-300">{err.severity}</td>
                              <td className="px-3 py-2 align-top text-slate-200">
                                {err.message.replace(/^\[[A-Z_]+\]\s*/, '')}
                              </td>
                              <td className="px-3 py-2 align-top text-xs text-slate-400">
                                {err.context ? (
                                  <pre className="whitespace-pre-wrap break-all">
                                    {JSON.stringify(err.context, null, 2)}
                                  </pre>
                                ) : (
                                  <span className="text-slate-500">None</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
          {lastThrown && (
            <CardFooter className="flex flex-col gap-2 text-xs text-red-300">
              <div className="font-semibold">Last thrown error</div>
              <div className="whitespace-pre-wrap break-all">{lastThrown.message}</div>
              {lastThrown.stack && (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-red-400/90">
                  {lastThrown.stack}
                </pre>
              )}
            </CardFooter>
          )}
        </Card>
        <ErrorMonitorPanel />
      </div>
    </div>
  );
}
