type Updatable = {
  update(dtMs: number): boolean;
};

const FRAME_MS = 16;
const active = new Set<Updatable>();
let rafId: number | undefined;
let lastTime = 0;

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function cancelFrame(id: number): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(id);
    return;
  }
  clearTimeout(id);
}

function requestFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  return window.setTimeout(() => {
    callback(now());
  }, FRAME_MS);
}

function pump(timestamp: number): void {
  const dtMs = lastTime === 0 ? FRAME_MS : Math.max(1, timestamp - lastTime);
  lastTime = timestamp;

  for (const updater of Array.from(active)) {
    const keepRunning = updater.update(dtMs);
    if (!keepRunning) {
      active.delete(updater);
    }
  }

  if (active.size === 0) {
    rafId = undefined;
    lastTime = 0;
    return;
  }

  rafId = requestFrame(pump);
}

export function registerFrameLoop(updater: Updatable): () => void {
  active.add(updater);

  if (rafId === undefined) {
    lastTime = 0;
    rafId = requestFrame(pump);
  }

  return () => {
    active.delete(updater);
    if (active.size === 0 && rafId !== undefined) {
      cancelFrame(rafId);
      rafId = undefined;
      lastTime = 0;
    }
  };
}
