import type { AnimationStateSnapshot, AnimationStateStore } from '../facade/types';

export interface AnimationStateStoreInternal {
  readonly api: AnimationStateStore;
  publish(snapshot: AnimationStateSnapshot): void;
}

export function createAnimationStateStore(
  initialSnapshot: AnimationStateSnapshot,
): AnimationStateStoreInternal {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();

  return {
    api: {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    publish(nextSnapshot) {
      snapshot = nextSnapshot;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
