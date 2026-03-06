import type { MotionValue, SpringConfig } from './types';
import { registerFrameLoop } from './frame-loop';
import { value } from './value';

const DEFAULT_STIFFNESS = 100;
const DEFAULT_DAMPING = 10;
const DEFAULT_MASS = 1;
const REST_DELTA = 0.01;
const REST_SPEED = 0.01;

export function spring(source: MotionValue, config: SpringConfig = {}): MotionValue {
  const follower = value(source.get());
  const stiffness = config.stiffness ?? DEFAULT_STIFFNESS;
  const damping = config.damping ?? DEFAULT_DAMPING;
  const mass = config.mass ?? DEFAULT_MASS;

  let target = source.get();
  let velocityValue = 0;
  let stopLoop: (() => void) | undefined;

  const startLoop = () => {
    if (stopLoop) {
      return;
    }

    stopLoop = registerFrameLoop({
      update(dtMs) {
        const dtSeconds = dtMs / 1000;
        const current = follower.get();
        const displacement = target - current;
        const springForce = displacement * stiffness;
        const dampingForce = -velocityValue * damping;
        const acceleration = (springForce + dampingForce) / mass;

        velocityValue += acceleration * dtSeconds;
        const next = current + velocityValue * dtSeconds;

        if (Math.abs(target - next) < REST_DELTA && Math.abs(velocityValue) < REST_SPEED) {
          follower.set(target);
          velocityValue = 0;
          stopLoop = undefined;
          return false;
        }

        follower.set(next);
        return true;
      },
    });
  };

  source.onChange((latest) => {
    target = latest;
    startLoop();
  });

  return follower;
}
