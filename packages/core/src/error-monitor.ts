import type { ErrorCode, ErrorSeverity } from './errors.js';
import { MotionError } from './errors.js';

export type ErrorScope = 'gpu' | 'batch' | 'system' | 'animation' | 'config' | 'unknown';

export type ErrorMonitorEvent = {
  timestamp: number;
  scope: ErrorScope;
  code: ErrorCode;
  severity: ErrorSeverity;
  message: string;
  context?: Record<string, unknown>;
};

export type ErrorAggregate = {
  scope: ErrorScope;
  code: ErrorCode;
  severity: ErrorSeverity;
  count: number;
  firstTimestamp: number;
  lastTimestamp: number;
};

function inferErrorScope(code: string): ErrorScope {
  if (code.startsWith('GPU_')) return 'gpu';
  if (code.startsWith('BATCH_')) return 'batch';
  if (code.startsWith('SYSTEM_') || code.startsWith('RENDERER_') || code === 'READBACK_FAILED') {
    return 'system';
  }

  if (code.startsWith('INVALID_')) {
    if (
      code === 'INVALID_MARK_OPTIONS' ||
      code === 'INVALID_DURATION' ||
      code === 'INVALID_EASING' ||
      code === 'INVALID_BEZIER_POINTS'
    ) {
      return 'animation';
    }
    return 'config';
  }

  if (
    code === 'TARGETS_EMPTY' ||
    code === 'TARGET_NULL' ||
    code === 'DOM_ENV_MISSING' ||
    code === 'INVALID_SELECTOR'
  ) {
    return 'animation';
  }

  return 'unknown';
}

export class ErrorMonitor {
  private readonly maxEvents: number;
  private readonly events: ErrorMonitorEvent[];

  constructor(options?: { maxEvents?: number }) {
    this.maxEvents = Math.max(0, options?.maxEvents ?? 500);
    this.events = [];
  }

  record(error: MotionError): void {
    if (this.maxEvents === 0) return;

    const scope = inferErrorScope(String(error.code));
    this.events.push({
      timestamp: Date.now(),
      scope,
      code: error.code,
      severity: error.severity,
      message: error.message,
      context: error.context,
    });

    const overflow = this.events.length - this.maxEvents;
    if (overflow > 0) {
      this.events.splice(0, overflow);
    }
  }

  getEvents(): ReadonlyArray<ErrorMonitorEvent> {
    return this.events;
  }

  getAggregates(): ErrorAggregate[] {
    const out = new Map<string, ErrorAggregate>();
    for (const e of this.events) {
      const key = `${e.scope}:${e.code}:${e.severity}`;
      const existing = out.get(key);
      if (existing) {
        existing.count += 1;
        existing.lastTimestamp = e.timestamp;
      } else {
        out.set(key, {
          scope: e.scope,
          code: e.code,
          severity: e.severity,
          count: 1,
          firstTimestamp: e.timestamp,
          lastTimestamp: e.timestamp,
        });
      }
    }
    return Array.from(out.values());
  }

  clear(): void {
    this.events.length = 0;
  }
}
