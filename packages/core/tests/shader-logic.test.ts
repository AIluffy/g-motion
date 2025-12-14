import { describe, it, expect, beforeEach } from 'vitest';
import { INTERPOLATION_SHADER } from '../src/webgpu/shader';
import { ComputeShaderManager, ComputeShaderConfig } from '../src/webgpu/shader-interface';

describe('Compute Shader Logic', () => {
  describe('Shader Code Validation', () => {
    it('should export valid WGSL shader code', () => {
      expect(INTERPOLATION_SHADER).toBeDefined();
      expect(typeof INTERPOLATION_SHADER).toBe('string');
      expect(INTERPOLATION_SHADER.length).toBeGreaterThan(0);
    });

    it('should contain required struct definitions', () => {
      expect(INTERPOLATION_SHADER).toContain('struct Keyframe');
      expect(INTERPOLATION_SHADER).toContain('struct EntityState');
    });

    it('should contain required storage bindings', () => {
      expect(INTERPOLATION_SHADER).toContain('@binding(0)');
      expect(INTERPOLATION_SHADER).toContain('@binding(1)');
      expect(INTERPOLATION_SHADER).toContain('@binding(2)');
    });

    it('should define easing functions', () => {
      expect(INTERPOLATION_SHADER).toContain('fn easeLinear');
      expect(INTERPOLATION_SHADER).toContain('fn easeInQuad');
      expect(INTERPOLATION_SHADER).toContain('fn easeOutQuad');
      expect(INTERPOLATION_SHADER).toContain('fn easeInOutQuad');
      expect(INTERPOLATION_SHADER).toContain('fn applyEasing');
    });

    it('should have main compute kernel', () => {
      expect(INTERPOLATION_SHADER).toContain('@compute');
      expect(INTERPOLATION_SHADER).toContain('fn main');
      expect(INTERPOLATION_SHADER).toContain('@builtin(global_invocation_id)');
    });

    it('should implement workgroup size', () => {
      expect(INTERPOLATION_SHADER).toContain('@workgroup_size(64)');
    });
  });

  describe('Shader Interpolation Logic', () => {
    it('should clamp progress to [0, 1]', () => {
      // Verify shader uses clamp function
      expect(INTERPOLATION_SHADER).toContain('clamp(progress');
    });

    it('should calculate progress based on time and duration', () => {
      // Verify calculation logic
      expect(INTERPOLATION_SHADER).toContain('elapsedTime');
      expect(INTERPOLATION_SHADER).toContain('adjustedElapsedTime');
      expect(INTERPOLATION_SHADER).toContain('kf.duration');
    });

    it('should apply easing before interpolation', () => {
      // Verify easing is applied
      expect(INTERPOLATION_SHADER).toContain('applyEasing');
      expect(INTERPOLATION_SHADER).toContain('easedProgress');
    });

    it('should perform linear interpolation', () => {
      // Verify linear interpolation formula
      expect(INTERPOLATION_SHADER).toContain('kf.startValue');
      expect(INTERPOLATION_SHADER).toContain('kf.endValue');
      expect(INTERPOLATION_SHADER).toContain('interpolatedValue');
    });
  });

  describe('Shader Status Handling', () => {
    it('should handle running status', () => {
      expect(INTERPOLATION_SHADER).toContain('status != 1.0');
    });

    it('should output zero for non-running entities', () => {
      expect(INTERPOLATION_SHADER).toContain('outputs[index] = 0.0');
    });
  });
});

describe('ComputeShaderManager', () => {
  let mockDevice: any;

  beforeEach(() => {
    mockDevice = {
      createShaderModule: (config: any) => ({
        label: config.label,
      }),
      createBindGroupLayout: (config: any) => ({
        label: config.label,
        entries: config.entries,
      }),
      createPipelineLayout: (config: any) => ({
        label: config.label,
      }),
      createComputePipeline: (config: any) => ({
        label: config.label,
        getBindGroupLayout: () => ({}),
      }),
    };
  });

  describe('Compilation', () => {
    it('should compile shader successfully', async () => {
      const manager = new ComputeShaderManager(mockDevice);
      const config: ComputeShaderConfig = {
        name: 'test-shader',
        code: INTERPOLATION_SHADER,
        entryPoint: 'main',
        bindings: [],
      };

      const shader = await manager.compileShader(config);
      expect(shader).not.toBeNull();
      expect(shader?.metadata.name).toBe('test-shader');
    });

    it('should cache compiled shaders', async () => {
      const manager = new ComputeShaderManager(mockDevice);
      const config: ComputeShaderConfig = {
        name: 'test-shader',
        code: INTERPOLATION_SHADER,
        bindings: [],
      };

      await manager.compileShader(config);
      const cached = manager.getShader('test-shader');
      expect(cached).not.toBeNull();
    });

    it('should return null on compilation error', async () => {
      const failDevice = {
        ...mockDevice,
        createShaderModule: () => {
          throw new Error('Compilation error');
        },
      };

      const manager = new ComputeShaderManager(failDevice);
      const config: ComputeShaderConfig = {
        name: 'bad-shader',
        code: 'invalid wgsl',
        bindings: [],
      };

      const shader = await manager.compileShader(config);
      expect(shader).toBeNull();
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', async () => {
      const manager = new ComputeShaderManager(mockDevice);
      const config: ComputeShaderConfig = {
        name: 'test-shader',
        code: INTERPOLATION_SHADER,
        bindings: [],
      };

      await manager.compileShader(config);
      manager.clearCache();

      const cached = manager.getShader('test-shader');
      expect(cached).toBeNull();
    });

    it('should retrieve compilation metrics', async () => {
      const manager = new ComputeShaderManager(mockDevice);
      const config: ComputeShaderConfig = {
        name: 'test-shader',
        code: INTERPOLATION_SHADER,
        bindings: [],
      };

      await manager.compileShader(config);
      const time = manager.getCompilationTime('test-shader');
      expect(time).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Metadata', () => {
    it('should track shader metadata', async () => {
      const manager = new ComputeShaderManager(mockDevice);
      const config: ComputeShaderConfig = {
        name: 'test-shader',
        code: INTERPOLATION_SHADER,
        entryPoint: 'main',
        bindings: [{ binding: 0, visibility: 4, buffer: { type: 'storage' } }],
      };

      const shader = await manager.compileShader(config);
      expect(shader?.metadata).toBeDefined();
      expect(shader?.metadata.name).toBe('test-shader');
      expect(shader?.metadata.entryPoint).toBe('main');
      expect(shader?.metadata.bindingCount).toBe(1);
    });
  });
});
