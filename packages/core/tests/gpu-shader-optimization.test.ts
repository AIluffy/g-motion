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
  formatOutputValue,
  linearToSRGB,
  sRGBToLinear,
  packNormalizedRGBA,
  unpackNormalizedRGBA,
  unpackHalf2,
} from '../src/webgpu/output-format-shader';

import {
  EASING_TYPE,
  RAW_KEYFRAME_STRIDE,
  PACKED_KEYFRAME_STRIDE,
  packRawKeyframes,
  KEYFRAME_ENTRY_EXPAND_SHADER,
  KEYFRAME_SEARCH_SHADER,
  KEYFRAME_SEARCH_SHADER_OPT,
  KEYFRAME_SEARCH_WINDOW_SHADER,
  STRING_SEARCH_SHADER,
  packChannelMaps,
  hashPropertyName,
  PROPERTY_HASHES,
  easingStringToType,
  generateRawKeyframesForTrack,
  type RawKeyframeGenerationOptions,
  buildChannelMapData,
  preprocessChannelsToRawAndMap,
} from '../src/webgpu/keyframe-preprocess-shader';

import {
  __resolveKeyframeSearchOptimizedFlagForTests,
  __getKeyframeSearchShaderModeForTests,
} from '../src/systems/webgpu/system';
import {
  __resolveWebGPUReadbackModeForTests,
  isKeyframeEntryExpandOnGPUEnabled,
} from '../src/systems/webgpu/system-config';
import { __buildKeyframeSearchIndexForTests } from '../src/systems/webgpu/keyframe/preprocess-pass';

describe('GPU Shader Optimization', () => {
  describe('P2-2: Keyframe Search Index', () => {
    it('should export keyframe search window shader code', () => {
      expect(KEYFRAME_SEARCH_WINDOW_SHADER).toBeDefined();
      expect(typeof KEYFRAME_SEARCH_WINDOW_SHADER).toBe('string');
      expect(KEYFRAME_SEARCH_WINDOW_SHADER.length).toBeGreaterThan(0);
    });

    it('should build block start offsets and times', () => {
      const totalKeyframes = 25;
      const rawKeyframeData = new Float32Array(totalKeyframes * RAW_KEYFRAME_STRIDE);
      for (let i = 0; i < totalKeyframes; i++) {
        rawKeyframeData[i * RAW_KEYFRAME_STRIDE + 0] = i * 10;
      }

      const mapData = new Uint32Array([1, 0, 0, 16, 2, 1, 16, 9]);

      const { blockStartOffsets, blockStartTimes } = __buildKeyframeSearchIndexForTests({
        rawKeyframeData,
        mapData,
      });

      expect(blockStartOffsets.length).toBe(2);
      expect(blockStartOffsets[0]).toBe(0);
      expect(blockStartOffsets[1]).toBe(2);

      expect(blockStartTimes.length).toBe(4);
      expect(blockStartTimes[0]).toBe(0);
      expect(blockStartTimes[1]).toBe(80);
      expect(blockStartTimes[2]).toBe(160);
      expect(blockStartTimes[3]).toBe(240);
    });
  });

  describe('P1-2: WebGPU Readback Mode', () => {
    it('should default to full readback', () => {
      expect(__resolveWebGPUReadbackModeForTests(undefined)).toBe('full');
      expect(__resolveWebGPUReadbackModeForTests({})).toBe('full');
    });

    it('should support visible readback mode', () => {
      expect(__resolveWebGPUReadbackModeForTests({ webgpuReadbackMode: 'visible' })).toBe(
        'visible',
      );
    });

    it('should fall back to full on unknown value', () => {
      expect(__resolveWebGPUReadbackModeForTests({ webgpuReadbackMode: 'nope' } as any)).toBe(
        'full',
      );
    });
  });

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
      expect(OUTPUT_FORMAT.PACKED_HALF2).toBe(8);
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
      const u32 = new Uint32Array(data);
      const f32 = new Float32Array(data);

      expect(u32.length).toBe(channels.length * OUTPUT_CHANNEL_STRIDE);
      expect(u32[0]).toBe(0);
      expect(u32[1]).toBe(OUTPUT_FORMAT.FLOAT);
      expect(f32[2]).toBe(0);
      expect(f32[3]).toBe(1);

      const secondOffset = OUTPUT_CHANNEL_STRIDE;
      expect(u32[secondOffset + 0]).toBe(1);
      expect(u32[secondOffset + 1]).toBe(OUTPUT_FORMAT.ANGLE_DEG);
      expect(f32[secondOffset + 2]).toBe(0);
      expect(f32[secondOffset + 3]).toBe(360);
    });

    it('should convert packed RGBA to CSS', () => {
      // Red: 255, Green: 128, Blue: 64, Alpha: 255
      const packed = (255 << 24) | (128 << 16) | (64 << 8) | 255;
      const css = packedRGBAToCSS(packed);

      expect(css).toBe('rgba(255, 128, 64, 1.000)');
    });

    it('should unpack half2 correctly for common values', () => {
      const one = 0x3c00; // f16(1.0)
      const two = 0x4000; // f16(2.0)
      const packed = (two << 16) | one;
      const [a, b] = unpackHalf2(packed);
      expect(a).toBeCloseTo(1, 3);
      expect(b).toBeCloseTo(2, 3);
    });

    it('should create standard channel mapping', () => {
      const mapping = createStandardChannelMapping();

      expect(mapping.length).toBe(6);

      expect(mapping[0].sourceIndex).toBe(0);
      expect(mapping[0].formatType).toBe(OUTPUT_FORMAT.FLOAT);

      expect(mapping[1].sourceIndex).toBe(1);
      expect(mapping[1].formatType).toBe(OUTPUT_FORMAT.FLOAT);

      expect(mapping[2].sourceIndex).toBe(2);
      expect(mapping[2].formatType).toBe(OUTPUT_FORMAT.ANGLE_DEG);

      expect(mapping[3].sourceIndex).toBe(3);
      expect(mapping[3].formatType).toBe(OUTPUT_FORMAT.FLOAT);
      expect(mapping[3].minValue).toBe(0);
      expect(mapping[3].maxValue).toBe(10);

      expect(mapping[4].sourceIndex).toBe(4);
      expect(mapping[4].formatType).toBe(OUTPUT_FORMAT.FLOAT);
      expect(mapping[4].minValue).toBe(0);
      expect(mapping[4].maxValue).toBe(10);

      expect(mapping[5].sourceIndex).toBe(5);
      expect(mapping[5].formatType).toBe(OUTPUT_FORMAT.COLOR_NORM);
      expect(mapping[5].minValue).toBe(0);
      expect(mapping[5].maxValue).toBe(1);
    });

    it('should convert linear and sRGB approximately inversely', () => {
      const linear = 0.5;
      const srgb = linearToSRGB(linear);
      const back = sRGBToLinear(srgb);
      expect(back).toBeCloseTo(linear, 3);
    });

    it('should normalize percent output to 0-1 range', () => {
      const v0 = formatOutputValue(OUTPUT_FORMAT.PERCENT, 0, 0, 100);
      const v50 = formatOutputValue(OUTPUT_FORMAT.PERCENT, 50, 0, 100);
      const v100 = formatOutputValue(OUTPUT_FORMAT.PERCENT, 100, 0, 100);
      expect(v0).toBeCloseTo(0);
      expect(v50).toBeCloseTo(0.5);
      expect(v100).toBeCloseTo(1);
    });

    it('should normalize angle degrees into [0, 360)', () => {
      const a1 = formatOutputValue(OUTPUT_FORMAT.ANGLE_DEG, 450);
      const a2 = formatOutputValue(OUTPUT_FORMAT.ANGLE_DEG, -30);
      expect(a1).toBeCloseTo(90);
      expect(a2).toBeCloseTo(330);
    });

    it('should normalize angle radians into [0, 2π)', () => {
      const twoPi = Math.PI * 2;
      const a1 = formatOutputValue(OUTPUT_FORMAT.ANGLE_RAD, twoPi + Math.PI / 2);
      const a2 = formatOutputValue(OUTPUT_FORMAT.ANGLE_RAD, -Math.PI / 2);
      expect(a1).toBeCloseTo(Math.PI / 2);
      expect(a2).toBeCloseTo(twoPi - Math.PI / 2);
    });

    it('should clamp float output when min and max are provided', () => {
      const v1 = formatOutputValue(OUTPUT_FORMAT.FLOAT, -10, 0, 5);
      const v2 = formatOutputValue(OUTPUT_FORMAT.FLOAT, 2, 0, 5);
      const v3 = formatOutputValue(OUTPUT_FORMAT.FLOAT, 10, 0, 5);
      expect(v1).toBe(0);
      expect(v2).toBe(2);
      expect(v3).toBe(5);
    });

    it('should pack and unpack normalized RGBA correctly', () => {
      const packed = packNormalizedRGBA(1, 0.5, 0, 1);
      const { r, g, b, a } = unpackNormalizedRGBA(packed);
      expect(r).toBeCloseTo(1, 3);
      expect(g).toBeCloseTo(0.5, 2);
      expect(b).toBeCloseTo(0, 3);
      expect(a).toBeCloseTo(1, 3);
    });
  });

  describe('Phase 3.1: Keyframe Preprocessing', () => {
    it('should have correct easing type constants', () => {
      expect(EASING_TYPE.LINEAR).toBe(0);
      expect(EASING_TYPE.BEZIER).toBe(100);
      expect(EASING_TYPE.HOLD).toBe(101);
    });

    it('should have correct stride constants (raw=8 floats, packed=5 u32 words)', () => {
      expect(RAW_KEYFRAME_STRIDE).toBe(8);
      expect(PACKED_KEYFRAME_STRIDE).toBe(5);
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

    it('should generate raw keyframes for track with subdivision', () => {
      const track = [
        {
          startTime: 0,
          time: 1000,
          startValue: 0,
          endValue: 100,
          easing: 'linear',
        },
      ];
      const options: RawKeyframeGenerationOptions = {
        timeInterval: 200,
        maxSubdivisionsPerSegment: 4,
      };
      const evaluate = (kf: any, t: number) => {
        const p = (t - kf.startTime) / (kf.time - kf.startTime);
        return kf.startValue + (kf.endValue - kf.startValue) * p;
      };
      const raws = generateRawKeyframesForTrack(track, options, evaluate);
      expect(raws.length).toBe(4);
      expect(raws[0].startTime).toBeCloseTo(0);
      expect(raws[0].endTime).toBeCloseTo(250);
      expect(raws[0].startValue).toBeCloseTo(0);
      expect(raws[0].endValue).toBeCloseTo(25);
      expect(raws[3].startTime).toBeCloseTo(750);
      expect(raws[3].endTime).toBeCloseTo(1000);
      expect(raws[3].startValue).toBeCloseTo(75);
      expect(raws[3].endValue).toBeCloseTo(100);
      for (const r of raws) {
        expect(r.easingType).toBe(EASING_TYPE.LINEAR);
      }
    });

    it('should build channel map data with sequential offsets', () => {
      const channels = [
        { property: 'x', keyframeCount: 3 },
        { property: 'opacity', keyframeCount: 2 },
      ];
      const maps = buildChannelMapData(channels, 0);
      expect(maps.length).toBe(2);
      expect(maps[0].propertyHash).toBe(PROPERTY_HASHES.x);
      expect(maps[0].channelIndex).toBe(0);
      expect(maps[0].entityOffset).toBe(0);
      expect(maps[0].keyframeCount).toBe(3);
      expect(maps[1].propertyHash).toBe(PROPERTY_HASHES.opacity);
      expect(maps[1].channelIndex).toBe(1);
      expect(maps[1].entityOffset).toBe(3);
      expect(maps[1].keyframeCount).toBe(2);
    });

    it('should preprocess channels to raw keyframes and channel maps', () => {
      const channels = [
        {
          property: 'x',
          track: [
            {
              startTime: 0,
              time: 1000,
              startValue: 0,
              endValue: 100,
              easing: 'linear',
            },
          ],
        },
        {
          property: 'opacity',
          track: [
            {
              startTime: 0,
              time: 500,
              startValue: 0,
              endValue: 1,
              easing: 'linear',
            },
          ],
        },
      ];
      const options: RawKeyframeGenerationOptions = {
        timeInterval: 500,
        maxSubdivisionsPerSegment: 4,
      };
      const evaluate = (kf: any, t: number) => {
        const p = (t - kf.startTime) / (kf.time - kf.startTime);
        return kf.startValue + (kf.endValue - kf.startValue) * p;
      };
      const { rawKeyframes, channelMaps } = preprocessChannelsToRawAndMap(
        channels,
        options,
        evaluate,
      );
      expect(rawKeyframes.length).toBe(4);
      expect(channelMaps.length).toBe(2);
      expect(channelMaps[0].propertyHash).toBe(PROPERTY_HASHES.x);
      expect(channelMaps[0].entityOffset).toBe(0);
      expect(channelMaps[0].keyframeCount).toBe(2);
      expect(channelMaps[1].propertyHash).toBe(PROPERTY_HASHES.opacity);
      expect(channelMaps[1].entityOffset).toBe(2);
      expect(channelMaps[1].keyframeCount).toBe(2);
    });
  });

  describe('Phase 3.2: Keyframe Search Shader', () => {
    it('should export binary search shader with correct entry point', () => {
      expect(typeof KEYFRAME_SEARCH_SHADER).toBe('string');
      expect(KEYFRAME_SEARCH_SHADER.length).toBeGreaterThan(0);
      expect(KEYFRAME_SEARCH_SHADER).toContain('fn binarySearchKeyframe');
      expect(KEYFRAME_SEARCH_SHADER).toContain('fn linearSearchKeyframe');
      expect(KEYFRAME_SEARCH_SHADER).toContain('fn adaptiveSearchKeyframe');
      expect(KEYFRAME_SEARCH_SHADER).toContain('fn findActiveKeyframes');
      expect(KEYFRAME_SEARCH_SHADER).toContain('@compute @workgroup_size(64)');
    });

    it('should handle empty keyframe sequences in shader code', () => {
      expect(KEYFRAME_SEARCH_SHADER).toContain('if (count == 0u)');
      expect(KEYFRAME_SEARCH_SHADER).toContain('return result;');
    });

    it('should compute progress based on start and duration from packed data', () => {
      expect(KEYFRAME_SEARCH_SHADER).toContain('let times = getStartAndEndTime(startOffset + i);');
      expect(KEYFRAME_SEARCH_SHADER).toContain('let start = times.x;');
      expect(KEYFRAME_SEARCH_SHADER).toContain('let endTime = times.y;');
      expect(KEYFRAME_SEARCH_SHADER).toContain('if (duration > 0.0)');
      expect(KEYFRAME_SEARCH_SHADER).toContain('result.progress = (time - start) / duration;');
    });

    it('should clamp outside time range to nearest keyframe', () => {
      expect(KEYFRAME_SEARCH_SHADER).toContain('if (left > 0u && left < count)');
      expect(KEYFRAME_SEARCH_SHADER).toContain('result.progress = 1.0;');
      expect(KEYFRAME_SEARCH_SHADER).toContain('else if (left == 0u && count > 0u)');
      expect(KEYFRAME_SEARCH_SHADER).toContain('result.progress = 0.0;');
    });

    it('should include adaptive threshold and workgroup cache', () => {
      expect(KEYFRAME_SEARCH_SHADER).toContain('const ADAPTIVE_SEARCH_THRESHOLD');
      expect(KEYFRAME_SEARCH_SHADER).toContain('var<workgroup> cachedOffsets');
      expect(KEYFRAME_SEARCH_SHADER).toContain('var<workgroup> cachedCounts');
    });
  });

  describe('P2-1: Keyframe Entry Expansion Shader', () => {
    it('should export entry expansion shader with correct entry point', () => {
      expect(typeof KEYFRAME_ENTRY_EXPAND_SHADER).toBe('string');
      expect(KEYFRAME_ENTRY_EXPAND_SHADER.length).toBeGreaterThan(0);
      expect(KEYFRAME_ENTRY_EXPAND_SHADER).toContain('fn expandEntries');
      expect(KEYFRAME_ENTRY_EXPAND_SHADER).toContain('@compute @workgroup_size(64)');
    });

    it('should compute adjusted time from currentTime and playbackRate', () => {
      expect(KEYFRAME_ENTRY_EXPAND_SHADER).toContain('let timelineTime =');
      expect(KEYFRAME_ENTRY_EXPAND_SHADER).toContain('states[stateBase + 1u]');
    });

    it('should expose experimental flag for enabling GPU entry expansion', () => {
      expect(isKeyframeEntryExpandOnGPUEnabled(undefined)).toBe(true);
      expect(isKeyframeEntryExpandOnGPUEnabled({})).toBe(true);
      expect(isKeyframeEntryExpandOnGPUEnabled({ keyframeEntryExpandOnGPU: true })).toBe(true);
      expect(isKeyframeEntryExpandOnGPUEnabled({ keyframeEntryExpandOnGPU: false })).toBe(false);
    });
  });

  describe('Phase 3.3: Keyframe Search Shader Mode Switch', () => {
    it('should resolve optimized flag from config when present', () => {
      expect(__resolveKeyframeSearchOptimizedFlagForTests({ keyframeSearchOptimized: true })).toBe(
        true,
      );
      expect(__resolveKeyframeSearchOptimizedFlagForTests({ keyframeSearchOptimized: false })).toBe(
        false,
      );
    });

    it('should resolve optimized flag from environment override when config missing', () => {
      expect(__resolveKeyframeSearchOptimizedFlagForTests({}, '0')).toBe(false);
      expect(__resolveKeyframeSearchOptimizedFlagForTests({}, 'false')).toBe(false);
      expect(__resolveKeyframeSearchOptimizedFlagForTests({}, 'off')).toBe(false);
      expect(__resolveKeyframeSearchOptimizedFlagForTests({}, '1')).toBe(true);
      expect(__resolveKeyframeSearchOptimizedFlagForTests({}, 'true')).toBe(true);
      expect(__resolveKeyframeSearchOptimizedFlagForTests({}, 'on')).toBe(true);
      expect(__resolveKeyframeSearchOptimizedFlagForTests({}, null)).toBe(true);
    });

    it('should export optimized shader variant with shared layout and entry point', () => {
      expect(typeof KEYFRAME_SEARCH_SHADER_OPT).toBe('string');
      expect(KEYFRAME_SEARCH_SHADER_OPT.length).toBeGreaterThan(0);
      expect(KEYFRAME_SEARCH_SHADER_OPT).toContain('struct PackedKeyframe');
      expect(KEYFRAME_SEARCH_SHADER_OPT).toContain('fn linearSearchKeyframeOptimized');
      expect(KEYFRAME_SEARCH_SHADER_OPT).toContain('fn binarySearchKeyframeOptimized');
      expect(KEYFRAME_SEARCH_SHADER_OPT).toContain('fn adaptiveSearchKeyframeOptimized');
      expect(KEYFRAME_SEARCH_SHADER_OPT).toContain('@compute @workgroup_size(64)');
    });

    it('should expose shader mode for runtime inspection', () => {
      const mode = __getKeyframeSearchShaderModeForTests();
      expect(mode === null || typeof mode === 'boolean').toBe(true);
    });
  });

  describe('String Search Shader', () => {
    it('should export string search shader with correct entry point', () => {
      expect(typeof STRING_SEARCH_SHADER).toBe('string');
      expect(STRING_SEARCH_SHADER.length).toBeGreaterThan(0);
      expect(STRING_SEARCH_SHADER).toContain('struct StringSearchResult');
      expect(STRING_SEARCH_SHADER).toContain('fn findSubstring');
      expect(STRING_SEARCH_SHADER).toContain('@compute @workgroup_size(64)');
    });
  });
});
