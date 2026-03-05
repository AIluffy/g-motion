/**
 * Half-precision (16-bit) floating point buffer implementation
 *
 * Provides 50% memory savings compared to Float32Array with minimal precision loss
 * for typical animation values (positions, rotations, scales, opacity).
 *
 * Format: IEEE 754 half-precision (FP16)
 * - 1 bit sign
 * - 5 bits exponent
 * - 10 bits mantissa
 * - Range: ±65,504
 * - Precision: ~3 decimal digits
 *
 * @example
 * ```ts
 * const buffer = new HalfFloatBuffer(1000);
 * buffer.set(0, 123.456); // Stored as 123.438
 * const value = buffer.get(0); // Retrieved as 123.438
 * ```
 */

import { createDebugger } from '@g-motion/shared';
import { DEFAULT_HALF_FLOAT_COMPONENTS } from '@g-motion/shared/transform';

const debug = createDebugger('HalfFloat');

export class HalfFloatBuffer {
  /**
   * Internal storage as 16-bit unsigned integers
   */
  private buffer: Uint16Array;

  /**
   * Cache for Float32Array conversion to avoid repeated allocations
   */
  private float32Cache: Float32Array | null = null;
  private cacheInvalidated = true;

  constructor(size: number) {
    this.buffer = new Uint16Array(size);
    debug(`Created HalfFloatBuffer with ${size} elements (${size * 2} bytes)`);
  }

  /**
   * Get the length of the buffer
   */
  get length(): number {
    return this.buffer.length;
  }

  /**
   * Get the underlying Uint16Array buffer
   */
  get rawBuffer(): Uint16Array {
    return this.buffer;
  }

  /**
   * Get byte length of the buffer
   */
  get byteLength(): number {
    return this.buffer.byteLength;
  }

  /**
   * Convert a 32-bit float to 16-bit half-float
   *
   * @param value - Float32 value to encode
   * @returns Encoded 16-bit representation
   */
  private floatToHalf(value: number): number {
    // Handle special cases
    if (isNaN(value)) return 0x7e00;
    if (!isFinite(value)) {
      return value > 0 ? 0x7c00 : 0xfc00; // +/-Infinity
    }
    if (value === 0) {
      // Preserve sign of zero
      return 1 / value === -Infinity ? 0x8000 : 0;
    }

    // Create a view to manipulate bits
    const floatView = new Float32Array([value]);
    const intView = new Uint32Array(floatView.buffer);
    const bits = intView[0];

    // Extract components
    const sign = (bits >> 16) & 0x8000;
    let exponent = ((bits >> 23) & 0xff) - 127 + 15;
    let mantissa = bits & 0x7fffff;

    // Handle subnormal numbers
    if (exponent <= 0) {
      if (exponent < -10) {
        // Too small, flush to zero
        return sign;
      }
      // Subnormal number
      mantissa = (mantissa | 0x800000) >> (1 - exponent);
      exponent = 0;
    } else if (exponent >= 31) {
      // Overflow to infinity
      return sign | 0x7c00;
    } else {
      // Normal number
      mantissa >>= 13;
    }

    return sign | (exponent << 10) | mantissa;
  }

  /**
   * Convert a 16-bit half-float to 32-bit float
   *
   * @param half - 16-bit encoded value
   * @returns Decoded Float32 value
   */
  private halfToFloat(half: number): number {
    const sign = (half & 0x8000) >> 15;
    const exponent = (half & 0x7c00) >> 10;
    const mantissa = half & 0x03ff;

    // Handle special cases
    if (exponent === 0) {
      if (mantissa === 0) {
        // Zero (preserve sign)
        return sign === 1 ? -0.0 : 0.0;
      }
      // Subnormal number
      return (sign ? -1 : 1) * Math.pow(2, -14) * (mantissa / 1024);
    }

    if (exponent === 31) {
      // Infinity or NaN
      if (mantissa === 0) {
        return sign === 1 ? -Infinity : Infinity;
      }
      return NaN;
    }

    // Normal number
    return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
  }

  /**
   * Set a value at the specified index
   *
   * @param index - Index to set
   * @param value - Float32 value to store (will be converted to FP16)
   */
  set(index: number, value: number): void {
    if (index < 0 || index >= this.buffer.length) {
      throw new RangeError(`Index ${index} out of bounds [0, ${this.buffer.length})`);
    }
    this.buffer[index] = this.floatToHalf(value);
    this.cacheInvalidated = true;
  }

  /**
   * Get a value at the specified index
   *
   * @param index - Index to retrieve
   * @returns Decoded Float32 value
   */
  get(index: number): number {
    if (index < 0 || index >= this.buffer.length) {
      throw new RangeError(`Index ${index} out of bounds [0, ${this.buffer.length})`);
    }
    return this.halfToFloat(this.buffer[index]);
  }

  /**
   * Set multiple values from a Float32Array
   *
   * @param source - Source Float32Array
   * @param sourceOffset - Offset in source array (default: 0)
   * @param destOffset - Offset in this buffer (default: 0)
   * @param length - Number of elements to copy (default: remaining length)
   */
  setFromFloat32Array(
    source: Float32Array,
    sourceOffset = 0,
    destOffset = 0,
    length?: number,
  ): void {
    const count = length ?? Math.min(source.length - sourceOffset, this.buffer.length - destOffset);

    for (let i = 0; i < count; i++) {
      this.buffer[destOffset + i] = this.floatToHalf(source[sourceOffset + i]);
    }

    this.cacheInvalidated = true;
  }

  /**
   * Convert entire buffer to Float32Array
   * Uses cached result if buffer hasn't been modified
   *
   * @returns Float32Array with decoded values
   */
  toFloat32Array(): Float32Array {
    if (!this.cacheInvalidated && this.float32Cache) {
      return this.float32Cache;
    }

    const result = new Float32Array(this.buffer.length);
    for (let i = 0; i < this.buffer.length; i++) {
      result[i] = this.halfToFloat(this.buffer[i]);
    }

    this.float32Cache = result;
    this.cacheInvalidated = false;

    return result;
  }

  /**
   * Fill the buffer with a single value
   *
   * @param value - Value to fill with
   * @param start - Start index (default: 0)
   * @param end - End index (default: length)
   */
  fill(value: number, start = 0, end?: number): this {
    const halfValue = this.floatToHalf(value);
    this.buffer.fill(halfValue, start, end);
    this.cacheInvalidated = true;
    return this;
  }

  /**
   * Copy data from another HalfFloatBuffer
   *
   * @param source - Source buffer
   * @param targetOffset - Offset in this buffer (default: 0)
   * @param sourceStart - Start index in source (default: 0)
   * @param sourceEnd - End index in source (default: source.length)
   */
  copyFrom(source: HalfFloatBuffer, targetOffset = 0, sourceStart = 0, sourceEnd?: number): void {
    const end = sourceEnd ?? source.length;

    this.buffer.set(source.buffer.subarray(sourceStart, end), targetOffset);

    this.cacheInvalidated = true;
  }

  /**
   * Create a subarray view
   *
   * @param begin - Start index
   * @param end - End index
   * @returns New HalfFloatBuffer sharing the same underlying memory
   */
  subarray(begin?: number, end?: number): HalfFloatBuffer {
    const newBuffer = Object.create(HalfFloatBuffer.prototype);
    newBuffer.buffer = this.buffer.subarray(begin, end);
    newBuffer.float32Cache = null;
    newBuffer.cacheInvalidated = true;
    return newBuffer;
  }

  /**
   * Calculate precision loss for a given value
   * Useful for debugging and validation
   *
   * @param value - Original Float32 value
   * @returns Object with encoded value and precision loss
   */
  static getPrecisionLoss(value: number): {
    original: number;
    encoded: number;
    loss: number;
    lossPercent: number;
  } {
    const buffer = new HalfFloatBuffer(1);
    buffer.set(0, value);
    const encoded = buffer.get(0);
    const loss = Math.abs(value - encoded);
    const lossPercent = value !== 0 ? (loss / Math.abs(value)) * 100 : 0;

    return {
      original: value,
      encoded,
      loss,
      lossPercent,
    };
  }

  /**
   * Check if a value is suitable for half-float storage
   * Returns false if precision loss would be significant
   *
   * @param value - Value to check
   * @param maxLossPercent - Maximum acceptable loss percentage (default: 0.1%)
   * @returns true if value is suitable for half-float
   */
  static isSuitableForHalfFloat(value: number, maxLossPercent = 0.1): boolean {
    if (!isFinite(value)) return false;
    if (Math.abs(value) > 65504) return false; // Out of range

    const { lossPercent } = HalfFloatBuffer.getPrecisionLoss(value);
    return lossPercent <= maxLossPercent;
  }
}

/**
 * Factory function to create HalfFloatBuffer from Float32Array
 *
 * @param source - Source Float32Array
 * @returns New HalfFloatBuffer with encoded values
 */
export function createHalfFloatBufferFrom(source: Float32Array): HalfFloatBuffer {
  const buffer = new HalfFloatBuffer(source.length);
  buffer.setFromFloat32Array(source);
  return buffer;
}

/**
 * Configuration for component buffer types
 */
export interface BufferTypeConfig {
  /**
   * Component names that should use half-float encoding
   * @default ['x', 'y', 'z', 'translateX', 'translateY', 'translateZ', 'rotateX', 'rotateY', 'rotateZ', 'rotate', 'scaleX', 'scaleY', 'scaleZ', 'scale', 'opacity']
   */
  halfFloatComponents?: string[];

  /**
   * Enable half-float optimization globally
   * @default false (will be enabled in Phase 3)
   */
  useHalfFloat?: boolean;
}

export { DEFAULT_HALF_FLOAT_COMPONENTS };

/**
 * Check if a component should use half-float encoding
 *
 * @param componentName - Name of the component
 * @param config - Buffer type configuration
 * @returns true if component should use half-float
 */
export function shouldUseHalfFloat(componentName: string, config: BufferTypeConfig = {}): boolean {
  if (!config.useHalfFloat) return false;

  const components = config.halfFloatComponents ?? DEFAULT_HALF_FLOAT_COMPONENTS;
  return components.includes(componentName as (typeof DEFAULT_HALF_FLOAT_COMPONENTS)[number]);
}
