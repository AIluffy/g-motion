import { describe, bench } from 'vitest';

/**
 * Micro-benchmarks: Object writes vs TypedArray writes
 */
describe('Transform updates: Object vs TypedArray', () => {
  const ENTITY_COUNT = 5000;
  const FRAMES = 60;

  bench('Object writes (Transform AoS)', () => {
    const transforms = Array.from({ length: ENTITY_COUNT }, () => ({
      x: 0,
      y: 0,
      translateZ: 0,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      perspective: 0,
    }));

    for (let frame = 0; frame < FRAMES; frame++) {
      const t = frame / FRAMES;
      for (let i = 0; i < ENTITY_COUNT; i++) {
        const tf = transforms[i];
        tf.x = i * 0.001 + t;
        tf.y = i * 0.002 + t;
        tf.translateZ = (i % 10) * 0.5;
        tf.rotate = (i % 360) * 0.25;
        tf.scaleX = 1 + Math.sin(t) * 0.1;
        tf.scaleY = 1 + Math.cos(t) * 0.1;
        tf.scaleZ = 1 + Math.sin(t * 0.5) * 0.05;
        tf.perspective = (i % 50) * 2;
      }
    }
  });

  bench('TypedArray writes (Transform SoA)', () => {
    const x = new Float32Array(ENTITY_COUNT);
    const y = new Float32Array(ENTITY_COUNT);
    const translateZ = new Float32Array(ENTITY_COUNT);
    const rotate = new Float32Array(ENTITY_COUNT);
    const scaleX = new Float32Array(ENTITY_COUNT);
    const scaleY = new Float32Array(ENTITY_COUNT);
    const scaleZ = new Float32Array(ENTITY_COUNT);
    const perspective = new Float32Array(ENTITY_COUNT);

    for (let frame = 0; frame < FRAMES; frame++) {
      const t = frame / FRAMES;
      for (let i = 0; i < ENTITY_COUNT; i++) {
        x[i] = i * 0.001 + t;
        y[i] = i * 0.002 + t;
        translateZ[i] = (i % 10) * 0.5;
        rotate[i] = (i % 360) * 0.25;
        scaleX[i] = 1 + Math.sin(t) * 0.1;
        scaleY[i] = 1 + Math.cos(t) * 0.1;
        scaleZ[i] = 1 + Math.sin(t * 0.5) * 0.05;
        perspective[i] = (i % 50) * 2;
      }
    }
  });
});
