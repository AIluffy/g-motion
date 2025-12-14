/**
 * VelocityTracker - Automatically tracks velocity of properties
 * Inspired by GSAP InertiaPlugin's track() method
 */

interface VelocityData {
  values: number[];
  timestamps: number[];
  velocity: number;
  rafId?: number;
}

export class VelocityTracker {
  private static trackedProps = new Map<any, Map<string, VelocityData>>();
  private static readonly SAMPLE_DURATION = 500; // Keep samples for last 500ms
  private static readonly MIN_SAMPLES = 2; // Minimum samples to calculate velocity

  /**
   * Start tracking velocity of properties
   * @param target - Target object or element
   * @param props - Property name(s) to track (comma-separated or array)
   * @example
   * VelocityTracker.track(element, 'x,y');
   * VelocityTracker.track(obj, ['x', 'y', 'rotation']);
   */
  static track(target: any, props: string | string[]): void {
    if (!target) {
      console.warn('VelocityTracker.track(): target is null or undefined');
      return;
    }

    const propArray = Array.isArray(props) ? props : props.split(',').map((p) => p.trim());

    if (!this.trackedProps.has(target)) {
      this.trackedProps.set(target, new Map());
    }

    const targetData = this.trackedProps.get(target)!;

    propArray.forEach((prop) => {
      if (!targetData.has(prop)) {
        const data: VelocityData = {
          values: [],
          timestamps: [],
          velocity: 0,
        };

        targetData.set(prop, data);
        this.startTracking(target, prop, data);
      }
    });
  }

  /**
   * Get current velocity of a tracked property
   * @param target - Target object or element
   * @param prop - Property name
   * @returns Velocity in units per second
   */
  static getVelocity(target: any, prop: string): number {
    return this.trackedProps.get(target)?.get(prop)?.velocity ?? 0;
  }

  /**
   * Check if a property is being tracked
   * @param target - Target object or element
   * @param prop - Property name
   */
  static isTracking(target: any, prop?: string): boolean {
    const targetData = this.trackedProps.get(target);
    if (!targetData) return false;
    if (!prop) return targetData.size > 0;
    return targetData.has(prop);
  }

  /**
   * Stop tracking velocity
   * @param target - Target object or element
   * @param props - Property name(s) to stop tracking (if omitted, stops all)
   */
  static untrack(target: any, props?: string | string[]): void {
    if (!props) {
      // Untrack all properties for this target
      const targetData = this.trackedProps.get(target);
      if (targetData) {
        targetData.forEach((data) => {
          if (data.rafId) {
            cancelAnimationFrame(data.rafId);
          }
        });
        this.trackedProps.delete(target);
      }
      return;
    }

    const propArray = Array.isArray(props) ? props : props.split(',').map((p) => p.trim());
    const targetData = this.trackedProps.get(target);

    if (targetData) {
      propArray.forEach((prop) => {
        const data = targetData.get(prop);
        if (data?.rafId) {
          cancelAnimationFrame(data.rafId);
        }
        targetData.delete(prop);
      });

      // Clean up target if no more tracked properties
      if (targetData.size === 0) {
        this.trackedProps.delete(target);
      }
    }
  }

  /**
   * Get all velocities for a target
   * @param target - Target object or element
   * @returns Object with property names and their velocities
   */
  static getVelocities(target: any): Record<string, number> {
    const result: Record<string, number> = {};
    const targetData = this.trackedProps.get(target);

    if (targetData) {
      targetData.forEach((data, prop) => {
        result[prop] = data.velocity;
      });
    }

    return result;
  }

  private static startTracking(target: any, prop: string, data: VelocityData): void {
    const track = () => {
      // Check if still being tracked
      if (!this.trackedProps.get(target)?.has(prop)) {
        return; // Stop tracking
      }

      const now = performance.now();
      let value: number;

      // Get current value (support different property types)
      try {
        if (target instanceof Element) {
          // For DOM elements, try to get computed transform values
          const style = getComputedStyle(target);
          if (prop === 'x' || prop === 'y') {
            const transform = style.transform;
            if (transform && transform !== 'none') {
              const matrix = transform.match(/matrix.*\((.+)\)/)?.[1].split(', ');
              if (matrix) {
                value = parseFloat(matrix[prop === 'x' ? 4 : 5]);
              } else {
                value = 0;
              }
            } else {
              value = 0;
            }
          } else if (prop === 'rotation' || prop === 'rotate') {
            const transform = style.transform;
            if (transform && transform !== 'none') {
              const values = transform.match(/matrix.*\((.+)\)/)?.[1].split(', ');
              if (values) {
                const a = parseFloat(values[0]);
                const b = parseFloat(values[1]);
                value = Math.atan2(b, a) * (180 / Math.PI);
              } else {
                value = 0;
              }
            } else {
              value = 0;
            }
          } else {
            value = parseFloat((target as any)[prop]) || 0;
          }
        } else {
          // For regular objects
          value = parseFloat(target[prop]) || 0;
        }
      } catch {
        value = 0;
      }

      data.values.push(value);
      data.timestamps.push(now);

      // Keep only recent samples (within SAMPLE_DURATION)
      while (data.timestamps.length > 0 && now - data.timestamps[0] > this.SAMPLE_DURATION) {
        data.values.shift();
        data.timestamps.shift();
      }

      // Calculate velocity using linear regression for better accuracy
      if (data.values.length >= this.MIN_SAMPLES) {
        const n = data.values.length;
        const firstTime = data.timestamps[0];
        const lastTime = data.timestamps[n - 1];
        const dt = lastTime - firstTime;

        if (dt > 0) {
          const firstValue = data.values[0];
          const lastValue = data.values[n - 1];
          const dv = lastValue - firstValue;

          // Simple velocity: change in value / change in time
          data.velocity = (dv / dt) * 1000; // Convert to units per second
        }
      }

      // Continue tracking
      data.rafId = requestAnimationFrame(track);
    };

    // Start the tracking loop
    data.rafId = requestAnimationFrame(track);
  }

  /**
   * Clear all tracked properties (useful for cleanup)
   */
  static clear(): void {
    this.trackedProps.forEach((targetData) => {
      targetData.forEach((data) => {
        if (data.rafId) {
          cancelAnimationFrame(data.rafId);
        }
      });
    });
    this.trackedProps.clear();
  }
}
