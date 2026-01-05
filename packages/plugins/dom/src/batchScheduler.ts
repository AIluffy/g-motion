/**
 * RAF 批量调度器，用于将多个 DOM 更新回调合并到同一帧中执行。
 *
 * 设计目标：
 * - 维持与原有全局 pendingBatchCallbacks/rafScheduled 行为完全一致
 * - 对外仅暴露简单的 schedule/cancel/flush 接口，方便复用和测试
 */
export type BatchCallback = () => void;

export class BatchScheduler {
  private rafScheduled = false;
  private rafId: number | null = null;
  private readonly callbacks: BatchCallback[] = [];

  scheduleCallback(callback: BatchCallback): void {
    this.callbacks.push(callback);

    if (!this.rafScheduled) {
      this.rafScheduled = true;
      this.rafId = requestAnimationFrame(() => {
        this.rafScheduled = false;
        this.rafId = null;
        this.flushCallbacks();
      });
    }
  }

  cancelScheduled(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.rafScheduled = false;
    this.callbacks.length = 0;
  }

  flushCallbacks(): void {
    if (!this.callbacks.length) return;
    const toRun = this.callbacks.slice();
    this.callbacks.length = 0;
    for (const cb of toRun) {
      cb();
    }
  }
}

export const sharedBatchScheduler = new BatchScheduler();
