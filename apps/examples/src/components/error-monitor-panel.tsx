import { useEffect, useMemo, useState } from 'react';
import {
  ErrorSeverity,
  getErrorMonitor,
  type ErrorMonitorEvent,
  type ErrorAggregate,
  type ErrorScope,
} from '@g-motion/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type SeveritySummary = {
  fatal: number;
  error: number;
  warning: number;
  info: number;
};

type ScopeSummary = {
  gpu: number;
  batch: number;
  system: number;
  animation: number;
  config: number;
  unknown: number;
};

export function ErrorMonitorPanel() {
  const [total, setTotal] = useState(0);
  const [severity, setSeverity] = useState<SeveritySummary>({
    fatal: 0,
    error: 0,
    warning: 0,
    info: 0,
  });
  const [scope, setScope] = useState<ScopeSummary>({
    gpu: 0,
    batch: 0,
    system: 0,
    animation: 0,
    config: 0,
    unknown: 0,
  });
  const [recentCodes, setRecentCodes] = useState<string[]>([]);
  const [events, setEvents] = useState<ErrorMonitorEvent[]>([]);
  const [aggregates, setAggregates] = useState<ErrorAggregate[]>([]);
  const [selectedKey, setSelectedKey] = useState<{
    scope: ErrorScope;
    code: ErrorAggregate['code'];
    severity: ErrorSeverity;
  } | null>(null);
  const [gpuOnly, setGpuOnly] = useState(false);

  useEffect(() => {
    let mounted = true;
    const monitor = getErrorMonitor();

    const tick = () => {
      if (!mounted) return;
      const rawEvents = monitor.getEvents();
      const aggregates = monitor.getAggregates();
      const baseEvents = gpuOnly ? rawEvents.filter((e) => e.scope === 'gpu') : rawEvents;
      const nextTotal = baseEvents.length;

      const sev: SeveritySummary = {
        fatal: 0,
        error: 0,
        warning: 0,
        info: 0,
      };
      const sc: ScopeSummary = {
        gpu: 0,
        batch: 0,
        system: 0,
        animation: 0,
        config: 0,
        unknown: 0,
      };

      for (const e of baseEvents) {
        if (e.severity === ErrorSeverity.FATAL) sev.fatal += 1;
        else if (e.severity === ErrorSeverity.ERROR) sev.error += 1;
        else if (e.severity === ErrorSeverity.WARNING) sev.warning += 1;
        else if (e.severity === ErrorSeverity.INFO) sev.info += 1;

        if (e.scope === 'gpu') sc.gpu += 1;
        else if (e.scope === 'batch') sc.batch += 1;
        else if (e.scope === 'system') sc.system += 1;
        else if (e.scope === 'animation') sc.animation += 1;
        else if (e.scope === 'config') sc.config += 1;
        else sc.unknown += 1;
      }

      const latest = baseEvents.slice(-8).reverse();
      const codes = latest.map((e) => `${e.scope}:${e.code}`);

      setTotal(nextTotal);
      setSeverity(sev);
      setScope(sc);
      setRecentCodes(codes);
      setEvents(rawEvents);
      setAggregates(aggregates);
    };

    const interval = setInterval(tick, 1000);
    tick();

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [gpuOnly]);

  const hasData = total > 0;
  const sortedAggregates = useMemo(() => {
    if (aggregates.length === 0) return [];
    const base = gpuOnly ? aggregates.filter((a) => a.scope === 'gpu') : aggregates;
    return [...base].sort((a, b) => b.count - a.count);
  }, [aggregates, gpuOnly]);
  const selectedAggregate = useMemo(() => {
    if (!selectedKey) return null;
    return (
      aggregates.find(
        (a) =>
          a.scope === selectedKey.scope &&
          a.code === selectedKey.code &&
          a.severity === selectedKey.severity,
      ) ?? null
    );
  }, [aggregates, selectedKey]);
  const selectedEvents = useMemo(() => {
    if (!selectedKey) return [];
    return events
      .filter(
        (e) =>
          e.scope === selectedKey.scope &&
          e.code === selectedKey.code &&
          e.severity === selectedKey.severity,
      )
      .slice(-20)
      .reverse();
  }, [events, selectedKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Error monitor overview</CardTitle>
        <CardDescription>
          Aggregated MotionError events from the global ErrorHandler, grouped by scope and severity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 grid gap-3 rounded-md border border-slate-800 bg-slate-950/60 p-3 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Total events
            </div>
            <div className="text-2xl font-semibold text-slate-50">{total}</div>
            <div className="text-[11px] text-slate-500">
              {hasData ? 'Including all scopes and severities.' : 'No events recorded yet.'}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              By severity
            </div>
            <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-200">
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">
                <span className="text-red-300">Fatal</span>
                <span className="font-mono">{severity.fatal}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">
                <span className="text-red-300">Error</span>
                <span className="font-mono">{severity.error}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">
                <span className="text-amber-200">Warning</span>
                <span className="font-mono">{severity.warning}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">
                <span className="text-sky-200">Info</span>
                <span className="font-mono">{severity.info}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              By scope
            </div>
            <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-200">
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">
                <span>GPU</span>
                <span className="font-mono">{scope.gpu}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">
                <span>Batch</span>
                <span className="font-mono">{scope.batch}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">
                <span>System</span>
                <span className="font-mono">{scope.system}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">
                <span>Animation</span>
                <span className="font-mono">{scope.animation}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">
                <span>Config</span>
                <span className="font-mono">{scope.config}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">
                <span>Unknown</span>
                <span className="font-mono">{scope.unknown}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Recent events
          </div>
          {recentCodes.length === 0 ? (
            <div className="text-[11px] text-slate-500">
              No recent events. Trigger errors from other examples to populate this view.
            </div>
          ) : (
            <ul className="space-y-1 text-[11px] text-slate-200">
              {recentCodes.map((code, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between rounded-md bg-slate-900/70 px-2 py-1"
                >
                  <span className="font-mono text-amber-200">{code}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr,2fr]">
          <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                By code
              </div>
              <button
                type="button"
                onClick={() => setGpuOnly((v) => !v)}
                className={
                  'rounded-md border px-2 py-1 text-[10px] ' +
                  (gpuOnly
                    ? 'border-sky-400 bg-sky-950 text-sky-200'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-900')
                }
              >
                GPU only
              </button>
            </div>
            {sortedAggregates.length === 0 ? (
              <div className="text-[11px] text-slate-500">
                {gpuOnly
                  ? 'No GPU error codes yet. Trigger some GPU-related errors to see groups by code.'
                  : 'No aggregated error codes yet. Trigger some errors to see groups by code.'}
              </div>
            ) : (
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-2 py-1">Code</th>
                      <th className="px-2 py-1">Scope</th>
                      <th className="px-2 py-1">Severity</th>
                      <th className="px-2 py-1 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAggregates.map((a) => {
                      const isSelected =
                        selectedKey &&
                        selectedKey.scope === a.scope &&
                        selectedKey.code === a.code &&
                        selectedKey.severity === a.severity;
                      return (
                        <tr
                          key={`${a.scope}:${a.code}:${a.severity}`}
                          onClick={() =>
                            setSelectedKey({
                              scope: a.scope,
                              code: a.code,
                              severity: a.severity,
                            })
                          }
                          className={
                            'cursor-pointer border-t border-slate-800 transition-colors hover:bg-slate-900/70' +
                            (isSelected ? ' bg-slate-900/80' : '')
                          }
                        >
                          <td className="px-2 py-1 font-mono text-amber-200">{a.code}</td>
                          <td className="px-2 py-1 text-slate-300">{a.scope}</td>
                          <td className="px-2 py-1 text-slate-300">{a.severity}</td>
                          <td className="px-2 py-1 text-right font-mono text-slate-50">
                            {a.count}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Code details
              </div>
              {selectedAggregate && (
                <button
                  type="button"
                  onClick={() => setSelectedKey(null)}
                  className="rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-900"
                >
                  Clear
                </button>
              )}
            </div>
            {!selectedAggregate ? (
              <div className="text-[11px] text-slate-500">
                Select a row in the code table to inspect a particular error code.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid gap-2 text-[11px] text-slate-200 md:grid-cols-2">
                  <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Code</div>
                    <div className="font-mono text-amber-200">{selectedAggregate.code}</div>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">
                      Scope / severity
                    </div>
                    <div className="font-mono text-slate-200">
                      {selectedAggregate.scope} · {selectedAggregate.severity}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">
                      Total events
                    </div>
                    <div className="font-mono text-slate-50">{selectedAggregate.count}</div>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">
                      Time window
                    </div>
                    <div className="text-slate-200">
                      {new Date(selectedAggregate.firstTimestamp).toLocaleTimeString()} –{' '}
                      {new Date(selectedAggregate.lastTimestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
                <div className="max-h-44 overflow-auto rounded-md border border-slate-800 bg-slate-950/60">
                  {selectedEvents.length === 0 ? (
                    <div className="p-3 text-[11px] text-slate-500">
                      No individual events captured for this code yet.
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-800 text-[11px] text-slate-200">
                      {selectedEvents.map((e, index) => (
                        <li key={`${e.timestamp}-${index}`} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-slate-400">
                              {new Date(e.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="rounded-full bg-slate-900 px-2 py-[1px] text-[10px] text-slate-300">
                              {e.severity}
                            </span>
                          </div>
                          <div className="mt-1 text-slate-100">
                            {e.message.replace(/^\[[A-Z_]+\]\s*/, '')}
                          </div>
                          {e.context && (
                            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-slate-400">
                              {JSON.stringify(e.context, null, 2)}
                            </pre>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
