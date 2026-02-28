import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SchedulerLoop } from '../src/scheduler-loop';

describe('SchedulerLoop', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    globalThis.requestAnimationFrame = vi.fn(() => 1) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn() as unknown as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
  });

  it('does not start when services missing', () => {
    const processFrame = vi.fn();
    const loop = new SchedulerLoop({
      hasServices: () => false,
      getFrameDurationMs: () => undefined,
      processFrame,
      shouldContinue: () => true,
    });

    loop.start();
    expect(loop.isRunning()).toBe(false);
    expect(processFrame).not.toHaveBeenCalled();
  });

  it('runs one frame and stops when shouldContinue is false', () => {
    const processFrame = vi.fn();
    const loop = new SchedulerLoop({
      hasServices: () => true,
      getFrameDurationMs: () => undefined,
      processFrame,
      shouldContinue: () => false,
    });

    loop.start();

    expect(processFrame).toHaveBeenCalledTimes(1);
    expect(loop.isRunning()).toBe(false);
  });

  it('wakeForGPUResults starts when idle and services exist', () => {
    const processFrame = vi.fn();
    const loop = new SchedulerLoop({
      hasServices: () => true,
      getFrameDurationMs: () => undefined,
      processFrame,
      shouldContinue: () => false,
    });

    expect(loop.isRunning()).toBe(false);
    loop.wakeForGPUResults(5);
    expect(processFrame).toHaveBeenCalledTimes(1);
    expect(loop.isRunning()).toBe(false);
  });
});
