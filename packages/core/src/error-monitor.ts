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

/**
 * Key for aggregating errors: scope:code:severity
 */
function getAggregateKey(event: ErrorMonitorEvent): string {
  return `${event.scope}:${event.code}:${event.severity}`;
}

export class ErrorMonitor {
  private readonly bufferSize: number;
  private readonly events: ErrorMonitorEvent[];
  private readonly aggregates: Map<string, ErrorAggregate>;
  private head = 0;
  private count = 0;

  constructor(options?: { maxEvents?: number }) {
    this.bufferSize = Math.max(1, options?.maxEvents ?? 500);
    this.events = new Array(this.bufferSize);
    this.aggregates = new Map();
  }

  record(error: MotionError): void {
    const scope = inferErrorScope(String(error.code));
    const event: ErrorMonitorEvent = {
      timestamp: Date.now(),
      scope,
      code: error.code,
      severity: error.severity,
      message: error.message,
      context: error.context,
    };

    // Circular buffer insert - O(1)
    this.events[this.head] = event;
    this.head = (this.head + 1) % this.bufferSize;
    this.count = Math.min(this.count + 1, this.bufferSize);

    // Incremental aggregate update - O(1)
    const key = getAggregateKey(event);
    const existing = this.aggregates.get(key);
    if (existing) {
      existing.count++;
      existing.lastTimestamp = event.timestamp;
    } else {
      this.aggregates.set(key, {
        scope: event.scope,
        code: event.code,
        severity: event.severity,
        count: 1,
        firstTimestamp: event.timestamp,
        lastTimestamp: event.timestamp,
      });
    }
  }

  getEvents(): ReadonlyArray<ErrorMonitorEvent> {
    if (this.count === 0) {
      return [];
    }

    if (this.count < this.bufferSize) {
      return Array.from(this.events.slice(0, this.count));
    }

    // Buffer is full: return from head to end, then from 0 to head
    return Array.from([...this.events.slice(this.head), ...this.events.slice(0, this.head)]);
  }

  getAggregates(): ReadonlyArray<ErrorAggregate> {
    return Array.from(this.aggregates.values());
  }

  clear(): void {
    // Just reset pointers - circular buffer doesn't need element clearing
    this.head = 0;
    this.count = 0;
    this.aggregates.clear();
  }
}
