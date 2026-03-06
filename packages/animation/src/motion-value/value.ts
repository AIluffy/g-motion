import type { MotionValue } from './types';

type Listener = (latest: number, delta: number) => void;

export class MotionValueImpl implements MotionValue {
  private readonly listeners = new Set<Listener>();

  constructor(private current: number) {}

  get(): number {
    return this.current;
  }

  set(value: number): void {
    if (Object.is(value, this.current)) {
      return;
    }

    const previous = this.current;
    this.current = value;
    const delta = value - previous;

    for (const listener of this.listeners) {
      listener(value, delta);
    }
  }

  update(updater: (value: number) => number): void {
    this.set(updater(this.current));
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export function value(initial: number): MotionValue {
  return new MotionValueImpl(initial);
}
