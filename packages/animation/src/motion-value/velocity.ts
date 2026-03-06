import type { MotionValue } from './types';
import { value } from './value';

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function velocity(source: MotionValue): MotionValue {
  const derived = value(0);
  let previousValue = source.get();
  let previousTime = now();

  source.onChange((latest) => {
    const currentTime = now();
    const dtMs = currentTime - previousTime;

    if (dtMs > 0) {
      derived.set(((latest - previousValue) / dtMs) * 1000);
    }

    previousValue = latest;
    previousTime = currentTime;
  });

  return derived;
}
