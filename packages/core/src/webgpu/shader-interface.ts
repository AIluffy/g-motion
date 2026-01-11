/* eslint-disable @typescript-eslint/no-explicit-any */

import { createDebugger } from '@g-motion/utils';

const errorLog = createDebugger('WebGPU', 'error');

/**
 * Compute Shader Interface and Abstractions
 *
 * Defines the contract for compute shaders and manages compilation,
 * caching, and resource lifecycle.
 */

/**
 * Shader binding configuration
 */
export interface ShaderBinding {
  binding: number;
  visibility: number; // GPUShaderStage flags
  buffer?: {
    type: 'storage' | 'read-only-storage' | 'uniform';
  };
  sampler?: {
    type: 'filtering' | 'non-filtering' | 'comparison';
  };
  texture?: {
    sampleType?: 'float' | 'unfilterable-float' | 'sint' | 'uint';
    viewDimension?: '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d';
  };
}

/**
 * Configuration for creating a compute shader
 */
export interface ComputeShaderConfig {
  name: string;
  code: string;
  entryPoint?: string; // default: 'main'
  bindings: ShaderBinding[];
}

/**
 * Metadata about compiled shader
 */
export interface ComputeShaderMetadata {
  name: string;
  compiledAt: number;
  entryPoint: string;
  bindingCount: number;
  workgroupSize: [number, number, number];
}

/**
 * Represents a compiled and ready-to-use compute shader
 */
export interface IComputeShader {
  readonly metadata: ComputeShaderMetadata;
  readonly bindGroupLayout: any; // GPUBindGroupLayout
  readonly pipelineLayout: any; // GPUPipelineLayout
  readonly pipeline: any; // GPUComputePipeline
}

/**
 * Compute Shader Manager
 * Handles compilation, caching, and lifecycle of compute shaders
 */
export class ComputeShaderManager {
  private device: any;
  private shaderCache = new Map<string, IComputeShader>();
  private compilationTimes = new Map<string, number>();

  constructor(device: any) {
    if (!device) {
      throw new Error('[WebGPU] ComputeShaderManager requires a valid GPU device');
    }
    this.device = device;
  }

  /**
   * Compile and cache a compute shader
   */
  async compileShader(config: ComputeShaderConfig): Promise<IComputeShader | null> {
    const { name, code, entryPoint = 'main', bindings } = config;

    // Check cache first
    if (this.shaderCache.has(name)) {
      return this.shaderCache.get(name)!;
    }

    const startTime = performance.now();

    try {
      // Create shader module
      const shaderModule = this.device.createShaderModule({
        code,
        label: name,
      });

      // Create bind group layout
      const bindGroupLayout = this.device.createBindGroupLayout({
        label: `${name}-bgl`,
        entries: bindings,
      });

      // Create pipeline layout
      const pipelineLayout = this.device.createPipelineLayout({
        label: `${name}-pl`,
        bindGroupLayouts: [bindGroupLayout],
      });

      // Create compute pipeline
      const pipeline = this.device.createComputePipeline({
        label: `${name}-pipeline`,
        layout: pipelineLayout,
        compute: {
          module: shaderModule,
          entryPoint,
        },
      });

      const compilationTime = performance.now() - startTime;
      this.compilationTimes.set(name, compilationTime);

      const shader: IComputeShader = {
        metadata: {
          name,
          compiledAt: Date.now(),
          entryPoint,
          bindingCount: bindings.length,
          workgroupSize: [64, 1, 1], // Default for MVP, extract from shader if needed
        },
        bindGroupLayout,
        pipelineLayout,
        pipeline,
      };

      this.shaderCache.set(name, shader);

      return shader;
    } catch (error) {
      errorLog(`Failed to compile shader '${name}':`, error);
      return null;
    }
  }

  /**
   * Get cached shader
   */
  getShader(name: string): IComputeShader | null {
    return this.shaderCache.get(name) || null;
  }

  /**
   * Get compilation time for a shader
   */
  getCompilationTime(name: string): number {
    return this.compilationTimes.get(name) || -1;
  }

  /**
   * Get all cached shaders
   */
  getAllShaders(): Map<string, IComputeShader> {
    return new Map(this.shaderCache);
  }

  /**
   * Clear shader cache
   */
  clearCache(): void {
    this.shaderCache.clear();
    this.compilationTimes.clear();
  }

  /**
   * Get memory usage statistics
   */
  getStats() {
    return {
      cachedShaders: this.shaderCache.size,
      compilationMetrics: Object.fromEntries(this.compilationTimes),
    };
  }
}
