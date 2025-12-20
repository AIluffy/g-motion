/**
 * GPU Shader Optimization Tests
 *
 * Tests for the new GPU shader modules:
 * - Bezier curve evaluation
 * - Transform matrix computation
 * - Batch culling
 * - Physics simulation
 * - Output format processing
 * - Keyframe preprocessing
 */

import { describe, it, expect } from 'vitest';

// Import shader modules
import { EASING_MODE, KEYFRAME_STRIDE, packKeyframeForGPU } from '../src/webgpu/shader';

import {
  TRANSFORM_2D_STRIDE,
  TRANSFORM_3D_STRIDE,
  MATRIX_3X3_STRIDE,
  MATRIX_4X4_STRIDE,
  packTransform2D,
  packTransform3D,
  unpackMatrix3x3,
  unpackMatrix4x4,
} from '../src/webgpu/transform-shader';

import {
  RENDER_STATE_STRIDE,
  CULL_RESULT_STRIDE,
  packRenderStates,
  unpackCullResults,
  getVisibleEntityIds,
  groupByRenderer,
} from '../src/webgpu/culling-shader';

import {
  SPRING_STATE_STRIDE,
  INERTIA_STATE_STRIDE,
  packSpringStates,
  packInertiaStates,
  packSimParams,
  calculateCriticalDamping,
  SPRING_PRESETS,
} from '../src/webgpu/physics-shader';

import {
  OUTPUT_FORMAT,
  OUTPUT_CHANNEL_STRIDE,
  INTERLEAVED_OUTPUT_STRIDE,
  packOutputChannels,
  unpackInterleavedOutputs,
  packedRGBAToCSS,
  createStandardChannelMapping,
} from '../src/webgpu/output-format-shader';

import {
  EASING_TYPE,
  RAW_KEYFRAME_STRIDE,
  PACKED_KEYFRAME_STRIDE,
  packRawKeyframes,
  packChannelMaps,
  hashPropertyName,
  PROPERTY_HASHES,
  easingStringToType,
} from '../src/webgpu/keyframe-preprocess-shader';

describe('GPU Shader Optimization', () => {
  describe('Phase 1.1: Bezier Curve Support', () => {
    it('should have correct KEYFRAME_STRIDE (10 floats)', () => {
      expect(KEYFRAME_STRIDE).toBe(10);
    });

    it('should have correct EASING_MODE constants', () => {
      expect(EASING_MODE.STANDARD).toBe(0);
      expect(EASING_MODE.BEZIER).toBe(1);
      expect(EASING_MODE.HOLD).toBe(2);
    });

    it('should pack keyframe with bezier data correctly', () => {
      const data = packKeyframeForGPU(
        0, // startTime
        1000, // duration
        0, // startValue
        100, // endValue
        0, // easingId (linear)
        { cx1: 0.25, cy1: 0.1, cx2: 0.25, cy2: 1 },
        EASING_MODE.BEZIER,
      );

      expect(data.length).toBe(KEYFRAME_STRIDE);
      expect(data[0]).toBe(0); // startTime
      expect(data[1]).toBe(1000); // duration
      expect(data[2]).toBe(0); // startValue
      expect(data[3]).toBe(100); // endValue
      expect(data[4]).toBe(0); // easingId
      expect(data[5]).toBeCloseTo(0.25); // cx1
      expect(data[6]).toBeCloseTo(0.1); // cy1
      expect(data[7]).toBeCloseTo(0.25); // cx2
      expect(data[8]).toBeCloseTo(1); // cy2
      expect(data[9]).toBe(EASING_MODE.BEZIER);
    });

    it('should use default bezier values when not specified', () => {
      const data = packKeyframeForGPU(0, 1000, 0, 100, 0);

      expect(data[5]).toBe(0); // cx1 default
      expect(data[6]).toBe(0); // cy1 default
      expect(data[7]).toBe(1); // cx2 default
      expect(data[8]).toBe(1); // cy2 default
      expect(data[9]).toBe(EASING_MODE.STANDARD);
    });
  });

  describe('Phase 1.2: Transform Matrix', () => {
    it('should have correct stride constants', () => {
      expect(TRANSFORM_2D_STRIDE).toBe(8);
      expect(TRANSFORM_3D_STRIDE).toBe(12);
      expect(MATRIX_3X3_STRIDE).toBe(12);
      expect(MATRIX_4X4_STRIDE).toBe(16);
    });

    it('should pack 2D transforms correctly', () => {
      const transforms = [
        { x: 100, y: 200, scaleX: 1.5, scaleY: 2, rotation: Math.PI / 4 },
        { x: 50, y: 75, scaleX: 1, scaleY: 1, rotation: 0, originX: 0.5, originY: 0.5 },
      ];

      const data = packTransform2D(transforms);

      expect(data.length).toBe(transforms.length * TRANSFORM_2D_STRIDE);
      expect(data[0]).toBe(100); // x
      expect(data[1]).toBe(200); // y
      expect(data[2]).toBe(1.5); // scaleX
      expect(data[3]).toBe(2); // scaleY
      expect(data[4]).toBeCloseTo(Math.PI / 4); // rotation
    });

    it('should pack 3D transforms correctly', () => {
      const transforms = [
        {
          x: 100,
          y: 200,
          z: 300,
          scaleX: 1,
          scaleY: 1,
          scaleZ: 1,
          rotateX: 0,
          rotateY: Math.PI / 2,
          rotateZ: 0,
        },
      ];

      const data = packTransform3D(transforms);

      expect(data.length).toBe(transforms.length * TRANSFORM_3D_STRIDE);
      expect(data[0]).toBe(100); // x
      expect(data[1]).toBe(200); // y
      expect(data[2]).toBe(300); // z
    });

    it('should unpack 3x3 matrix correctly', () => {
      const data = new Float32Array([
        1,
        0,
        10,
        0, // row 0 + padding
        0,
        1,
        20,
        0, // row 1 + padding
        0,
        0,
        1,
        0, // row 2 + padding
      ]);

      const matrix = unpackMatrix3x3(data, 0);

      expect(matrix).toEqual([1, 0, 10, 0, 1, 20, 0, 0, 1]);
    });

    it('should unpack 4x4 matrix correctly', () => {
      const data = new Float32Array(16);
      // Identity matrix
      data[0] = 1;
      data[5] = 1;
      data[10] = 1;
      data[15] = 1;

      const matrix = unpackMatrix4x4(data, 0);

      expect(matrix[0]).toBe(1);
      expect(matrix[5]).toBe(1);
      expect(matrix[10]).toBe(1);
      expect(matrix[15]).toBe(1);
    });
  });

  describe('Phase 1.3: Batch Culling', () => {
    it('should have correct stride constants', () => {
      expect(RENDER_STATE_STRIDE).toBe(8);
      expect(CULL_RESULT_STRIDE).toBe(4);
    });

    it('should pack render states correctly', () => {
      const states = [
        { entityId: 1, version: 5, renderedVersion: 4, status: 1, rendererCode: 100 },
        { entityId: 2, version: 3, renderedVersion: 3, status: 1, rendererCode: 100 },
      ];

      const data = packRenderStates(states);

      expect(data.length).toBe(states.length * RENDER_STATE_STRIDE);
      expect(data[0]).toBe(1); // entityId
      expect(data[1]).toBe(5); // version
      expect(data[2]).toBe(4); // renderedVersion
      expect(data[3]).toBe(1); // status
      expect(data[4]).toBe(100); // rendererCode
    });

    it('should unpack cull results correctly', () => {
      const data = new Uint32Array([
        1,
        1,
        100,
        0, // entity 1: visible
        2,
        0,
        100,
        0xffffffff, // entity 2: not visible
      ]);

      const results = unpackCullResults(data, 2);

      expect(results.length).toBe(2);
      expect(results[0].entityId).toBe(1);
      expect(results[0].visible).toBe(true);
      expect(results[1].entityId).toBe(2);
      expect(results[1].visible).toBe(false);
    });

    it('should get visible entity IDs', () => {
      const results = [
        { entityId: 1, visible: true, rendererCode: 100, outputIndex: 0 },
        { entityId: 2, visible: false, rendererCode: 100, outputIndex: 0xffffffff },
        { entityId: 3, visible: true, rendererCode: 100, outputIndex: 1 },
      ];

      const visibleIds = getVisibleEntityIds(results);

      expect(visibleIds).toEqual([1, 3]);
    });

    it('should group by renderer', () => {
      const results = [
        { entityId: 1, visible: true, rendererCode: 100, outputIndex: 0 },
        { entityId: 2, visible: true, rendererCode: 200, outputIndex: 1 },
        { entityId: 3, visible: true, rendererCode: 100, outputIndex: 2 },
        { entityId: 4, visible: false, rendererCode: 100, outputIndex: 0xffffffff },
      ];

      const groups = groupByRenderer(results);

      expect(groups.size).toBe(2);
      expect(groups.get(100)?.length).toBe(2);
      expect(groups.get(200)?.length).toBe(1);
    });
  });

  describe('Phase 2.1: Physics Simulation', () => {
    it('should have correct stride constants', () => {
      expect(SPRING_STATE_STRIDE).toBe(8);
      expect(INERTIA_STATE_STRIDE).toBe(8);
    });

    it('should pack spring states correctly', () => {
      const springs = [
        { position: 0, velocity: 10, target: 100, stiffness: 170, damping: 26, mass: 1 },
      ];

      const data = packSpringStates(springs);

      expect(data.length).toBe(springs.length * SPRING_STATE_STRIDE);
      expect(data[0]).toBe(0); // position
      expect(data[1]).toBe(10); // velocity
      expect(data[2]).toBe(100); // target
      expect(data[3]).toBe(170); // stiffness
      expect(data[4]).toBe(26); // damping
      expect(data[5]).toBe(1); // mass
    });

    it('should pack inertia states correctly', () => {
      const inertias = [
        { position: 50, velocity: 100, friction: 0.1, bounciness: 0.8, minBound: 0, maxBound: 200 },
      ];

      const data = packInertiaStates(inertias);

      expect(data.length).toBe(inertias.length * INERTIA_STATE_STRIDE);
      expect(data[0]).toBe(50); // position
      expect(data[1]).toBe(100); // velocity
      expect(data[2]).toBeCloseTo(0.1); // friction
      expect(data[3]).toBeCloseTo(0.8); // bounciness
    });

    it('should pack simulation params correctly', () => {
      const params = packSimParams({ deltaTime: 0.016, maxVelocity: 5000, settleThreshold: 0.01 });

      expect(params.length).toBe(4);
      expect(params[0]).toBeCloseTo(0.016);
      expect(params[1]).toBe(5000);
      expect(params[2]).toBeCloseTo(0.01);
    });

    it('should calculate critical damping correctly', () => {
      const damping = calculateCriticalDamping(170, 1);
      // Critical damping = 2 * sqrt(k * m) = 2 * sqrt(170) ≈ 26.08
      expect(damping).toBeCloseTo(26.08, 1);
    });

    it('should have spring presets', () => {
      expect(SPRING_PRESETS.default.stiffness).toBe(170);
      expect(SPRING_PRESETS.default.damping).toBe(26);
      expect(SPRING_PRESETS.wobbly.damping).toBe(12);
      expect(SPRING_PRESETS.stiff.stiffness).toBe(210);
    });
  });

  describe('Phase 2.2: Output Format', () => {
    it('should have correct format constants', () => {
      expect(OUTPUT_FORMAT.FLOAT).toBe(0);
      expect(OUTPUT_FORMAT.COLOR_RGBA).toBe(1);
      expect(OUTPUT_FORMAT.ANGLE_DEG).toBe(3);
    });

    it('should have correct stride constants', () => {
      expect(OUTPUT_CHANNEL_STRIDE).toBe(4);
      expect(INTERLEAVED_OUTPUT_STRIDE).toBe(8);
    });

    it('should pack output channels correctly', () => {
      const channels = [
        { sourceIndex: 0, formatType: OUTPUT_FORMAT.FLOAT },
        { sourceIndex: 1, formatType: OUTPUT_FORMAT.ANGLE_DEG, minValue: 0, maxValue: 360 },
      ];

      const data = packOutputChannels(channels);

      expect(data.length).toBe(channels.length * OUTPUT_CHANNEL_STRIDE);
      expect(data[0]).toBe(0); // sourceIndex
      expect(data[1]).toBe(OUTPUT_FORMAT.FLOAT); // formatType
    });

    it('should convert packed RGBA to CSS', () => {
      // Red: 255, Green: 128, Blue: 64, Alpha: 255
      const packed = (255 << 24) | (128 << 16) | (64 << 8) | 255;
      const css = packedRGBAToCSS(packed);

      expect(css).toBe('rgba(255, 128, 64, 1.000)');
    });

    it('should create standard channel mapping', () => {
      const mapping = createStandardChannelMapping();

      expect(mapping.length).toBe(6);
      expect(mapping[0].sourceIndex).toBe(0);
      expect(mapping[1].sourceIndex).toBe(1);
      expect(mapping[2].formatType).toBe(OUTPUT_FORMAT.ANGLE_DEG);
    });
  });

  describe('Phase 3.1: Keyframe Preprocessing', () => {
    it('should have correct easing type constants', () => {
      expect(EASING_TYPE.LINEAR).toBe(0);
      expect(EASING_TYPE.BEZIER).toBe(100);
      expect(EASING_TYPE.HOLD).toBe(101);
    });

    it('should have correct stride constants', () => {
      expect(RAW_KEYFRAME_STRIDE).toBe(8);
      expect(PACKED_KEYFRAME_STRIDE).toBe(10);
    });

    it('should pack raw keyframes correctly', () => {
      const keyframes = [
        {
          startTime: 0,
          endTime: 1000,
          startValue: 0,
          endValue: 100,
          easingType: EASING_TYPE.LINEAR,
        },
      ];

      const data = packRawKeyframes(keyframes);

      expect(data.length).toBe(keyframes.length * RAW_KEYFRAME_STRIDE);
      expect(data[0]).toBe(0); // startTime
      expect(data[1]).toBe(1000); // endTime
      expect(data[2]).toBe(0); // startValue
      expect(data[3]).toBe(100); // endValue
    });

    it('should hash property names consistently', () => {
      const hash1 = hashPropertyName('x');
      const hash2 = hashPropertyName('x');
      const hash3 = hashPropertyName('y');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });

    it('should have pre-computed property hashes', () => {
      expect(PROPERTY_HASHES.x).toBe(hashPropertyName('x'));
      expect(PROPERTY_HASHES.y).toBe(hashPropertyName('y'));
      expect(PROPERTY_HASHES.rotation).toBe(hashPropertyName('rotation'));
    });

    it('should convert easing strings to types', () => {
      expect(easingStringToType('linear')).toBe(EASING_TYPE.LINEAR);
      expect(easingStringToType('easeInQuad')).toBe(EASING_TYPE.EASE_IN_QUAD);
      expect(easingStringToType(undefined)).toBe(EASING_TYPE.LINEAR);
      expect(easingStringToType('unknown')).toBe(EASING_TYPE.LINEAR);
    });

    it('should pack channel maps correctly', () => {
      const maps = [
        { propertyHash: PROPERTY_HASHES.x, channelIndex: 0, entityOffset: 0, keyframeCount: 2 },
        { propertyHash: PROPERTY_HASHES.y, channelIndex: 1, entityOffset: 2, keyframeCount: 3 },
      ];

      const data = packChannelMaps(maps);

      expect(data.length).toBe(maps.length * 4);
      expect(data[0]).toBe(PROPERTY_HASHES.x);
      expect(data[1]).toBe(0); // channelIndex
      expect(data[2]).toBe(0); // entityOffset
      expect(data[3]).toBe(2); // keyframeCount
    });
  });
});
