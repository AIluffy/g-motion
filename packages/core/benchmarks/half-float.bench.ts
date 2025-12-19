import { bench, describe } from 'vitest';
import { HalfFloatBuffer, createHalfFloatBufferFrom } from '../src/data/half-float';

describe('HalfFloatBuffer Performance', () => {
  const sizes = [100, 1000, 10000];

  sizes.forEach((size) => {
    describe(`Size: ${size}`, () => {
      bench(`Float32Array - fill ${size} elements`, () => {
        const buffer = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          buffer[i] = Math.random() * 1000;
        }
      });

      bench(`HalfFloatBuffer - fill ${size} elements`, () => {
        const buffer = new HalfFloatBuffer(size);
        for (let i = 0; i < size; i++) {
          buffer.set(i, Math.random() * 1000);
        }
      });

      bench(`Float32Array - read ${size} elements`, () => {
        const buffer = new Float32Array(size);
        for (let i = 0; i < size; i++) {
          buffer[i] = i;
        }

        return () => {
          let sum = 0;
          for (let i = 0; i < size; i++) {
            sum += buffer[i];
          }
          return sum;
        };
      });

      bench(`HalfFloatBuffer - read ${size} elements`, () => {
        const buffer = new HalfFloatBuffer(size);
        for (let i = 0; i < size; i++) {
          buffer.set(i, i);
        }

        return () => {
          let sum = 0;
          for (let i = 0; i < size; i++) {
            sum += buffer.get(i);
          }
          return sum;
        };
      });

      bench(`Float32Array - memory allocation ${size}`, () => {
        const buffer = new Float32Array(size);
        return buffer.byteLength;
      });

      bench(`HalfFloatBuffer - memory allocation ${size}`, () => {
        const buffer = new HalfFloatBuffer(size);
        return buffer.byteLength;
      });
    });
  });

  describe('Bulk Operations', () => {
    const size = 1000;

    bench('Float32Array - copy', () => {
      const source = new Float32Array(size);
      const dest = new Float32Array(size);

      for (let i = 0; i < size; i++) {
        source[i] = i;
      }

      return () => {
        dest.set(source);
      };
    });

    bench('HalfFloatBuffer - copy', () => {
      const source = new HalfFloatBuffer(size);
      const dest = new HalfFloatBuffer(size);

      for (let i = 0; i < size; i++) {
        source.set(i, i);
      }

      return () => {
        dest.copyFrom(source);
      };
    });

    bench('Float32Array - create from array', () => {
      const data = Array.from({ length: size }, (_, i) => i);

      return () => {
        return new Float32Array(data);
      };
    });

    bench('HalfFloatBuffer - create from Float32Array', () => {
      const data = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        data[i] = i;
      }

      return () => {
        return createHalfFloatBufferFrom(data);
      };
    });

    bench('HalfFloatBuffer - toFloat32Array (first call)', () => {
      return () => {
        const buffer = new HalfFloatBuffer(size);
        for (let i = 0; i < size; i++) {
          buffer.set(i, i);
        }
        return buffer.toFloat32Array();
      };
    });

    bench('HalfFloatBuffer - toFloat32Array (cached)', () => {
      const buffer = new HalfFloatBuffer(size);
      for (let i = 0; i < size; i++) {
        buffer.set(i, i);
      }
      buffer.toFloat32Array(); // Prime cache

      return () => {
        return buffer.toFloat32Array();
      };
    });
  });

  describe('Animation Workload Simulation', () => {
    const entityCount = 5000;
    const properties = [
      'x',
      'y',
      'z',
      'rotateX',
      'rotateY',
      'rotateZ',
      'scaleX',
      'scaleY',
      'scaleZ',
    ];

    bench('Float32Array - update all entities (per-frame)', () => {
      const buffers = Object.fromEntries(
        properties.map((prop) => [prop, new Float32Array(entityCount)]),
      );

      return () => {
        // Simulate per-frame update
        for (const prop in buffers) {
          const buffer = buffers[prop];
          for (let i = 0; i < entityCount; i++) {
            buffer[i] = Math.sin(i * 0.01) * 100;
          }
        }
      };
    });

    bench('HalfFloatBuffer - update all entities (per-frame)', () => {
      const buffers = Object.fromEntries(
        properties.map((prop) => [prop, new HalfFloatBuffer(entityCount)]),
      );

      return () => {
        // Simulate per-frame update
        for (const prop in buffers) {
          const buffer = buffers[prop];
          for (let i = 0; i < entityCount; i++) {
            buffer.set(i, Math.sin(i * 0.01) * 100);
          }
        }
      };
    });

    bench('Float32Array - memory footprint (5000 entities, 9 properties)', () => {
      const buffers = properties.map(() => new Float32Array(entityCount));
      const totalBytes = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
      return totalBytes;
    });

    bench('HalfFloatBuffer - memory footprint (5000 entities, 9 properties)', () => {
      const buffers = properties.map(() => new HalfFloatBuffer(entityCount));
      const totalBytes = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
      return totalBytes;
    });
  });

  describe('GPU Upload Simulation', () => {
    const size = 10000;

    bench('Float32Array - prepare for GPU upload', () => {
      const buffer = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        buffer[i] = Math.random() * 1000;
      }

      return () => {
        // Simulate GPU buffer creation
        const byteLength = buffer.byteLength;
        return byteLength;
      };
    });

    bench('HalfFloatBuffer - prepare for GPU upload', () => {
      const buffer = new HalfFloatBuffer(size);
      for (let i = 0; i < size; i++) {
        buffer.set(i, Math.random() * 1000);
      }

      return () => {
        // Simulate GPU buffer creation (direct Uint16Array upload)
        const byteLength = buffer.rawBuffer.byteLength;
        return byteLength;
      };
    });

    bench('Float32Array - batch conversion for GPU', () => {
      const buffers = Array.from({ length: 10 }, () => {
        const buf = new Float32Array(1000);
        for (let i = 0; i < 1000; i++) {
          buf[i] = i;
        }
        return buf;
      });

      return () => {
        const totalBytes = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
        return totalBytes;
      };
    });

    bench('HalfFloatBuffer - batch conversion for GPU', () => {
      const buffers = Array.from({ length: 10 }, () => {
        const buf = new HalfFloatBuffer(1000);
        for (let i = 0; i < 1000; i++) {
          buf.set(i, i);
        }
        return buf;
      });

      return () => {
        const totalBytes = buffers.reduce((sum, buf) => sum + buf.rawBuffer.byteLength, 0);
        return totalBytes;
      };
    });
  });

  describe('Precision Trade-offs', () => {
    const size = 1000;

    bench('Float32Array - typical animation values', () => {
      const buffer = new Float32Array(size);

      return () => {
        for (let i = 0; i < size; i++) {
          buffer[i] = Math.sin(i * 0.1) * 500 + 1000; // Screen coordinates
        }
      };
    });

    bench('HalfFloatBuffer - typical animation values', () => {
      const buffer = new HalfFloatBuffer(size);

      return () => {
        for (let i = 0; i < size; i++) {
          buffer.set(i, Math.sin(i * 0.1) * 500 + 1000); // Screen coordinates
        }
      };
    });

    bench('HalfFloatBuffer - precision check overhead', () => {
      const values = Array.from({ length: 100 }, (_, i) => i * 10);

      return () => {
        return values.map((v) => HalfFloatBuffer.isSuitableForHalfFloat(v));
      };
    });
  });
});

describe('Memory Savings Analysis', () => {
  bench('Calculate memory savings - 10k entities scenario', () => {
    const entityCount = 10000;
    const properties = [
      'x',
      'y',
      'z',
      'rotateX',
      'rotateY',
      'rotateZ',
      'scaleX',
      'scaleY',
      'scaleZ',
    ];

    return () => {
      const float32Memory = entityCount * properties.length * 4; // 4 bytes per float32
      const halfFloatMemory = entityCount * properties.length * 2; // 2 bytes per half-float
      const savings = float32Memory - halfFloatMemory;
      const savingsPercent = (savings / float32Memory) * 100;

      return {
        float32Memory,
        halfFloatMemory,
        savings,
        savingsPercent,
      };
    };
  });
});
