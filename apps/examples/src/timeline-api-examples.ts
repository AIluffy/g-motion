/**
 * Timeline API Examples - Relative Time and Advanced Stagger
 *
 * This file demonstrates the new ergonomic Timeline API features:
 * - Relative duration and delay
 * - Function-based stagger for custom curves
 * - Backward compatibility with absolute time
 */

import { motion } from '@g-motion/animation';

// ============================================================================
// Example 1: Relative Time (duration + delay)
// ============================================================================

// Old way: Manual absolute time calculation
const oldWay = motion('#box')
  .mark({ to: { x: 100 }, at: 0 })
  .mark({ to: { y: 50 }, at: 500 }) // Must calculate: 0 + 500
  .mark({ to: { opacity: 0 }, at: 800 }) // Must calculate: 500 + 300
  .play();

// New way: Relative duration and delay
const newWay = motion('#box')
  .mark({ to: { x: 100 }, duration: 200 })
  .mark({ to: { y: 50 }, duration: 200 }) // 100ms delay after previous, then 200ms duration
  .mark({ to: { opacity: 0 }, duration: 200 })
  .play();

// ============================================================================
// Example 2: Function-Based Stagger (Custom Curves)
// ============================================================================

const particles = Array.from({ length: 100 }, () => document.createElement('div'));

// Linear stagger (existing behavior)
motion(particles)
  .mark({
    to: { x: 100, y: 100 },
    duration: 800,
    stagger: 50, // 50ms * index
  })
  .play();

// Ease-in stagger curve (new)
motion(particles)
  .mark({
    to: { x: 100, y: 100 },
    duration: 800,
    stagger: (index: number) => {
      // Quadratic ease-in: stagger accelerates
      const t = index / 100;
      return t * t * 1000; // 0-1000ms range
    },
  })
  .play();

// Ease-out stagger curve (new)
motion(particles)
  .mark({
    to: { x: 100, y: 100 },
    duration: 800,
    stagger: (index: number) => {
      // Quadratic ease-out: stagger decelerates
      const t = index / 100;
      return (1 - (1 - t) * (1 - t)) * 1000;
    },
  })
  .play();

// Wave-like stagger (new)
motion(particles)
  .mark({
    to: { x: 100, y: 100 },
    duration: 800,
    stagger: (index: number) => {
      return Math.sin((index / 100) * Math.PI) * 500; // Sin wave 0-500ms
    },
  })
  .play();

// ============================================================================
// Example 3: Backward Compatibility (Absolute Time Still Works)
// ============================================================================

// Explicit absolute time (unchanged)
const absoluteTime = motion('#box')
  .mark({ to: { x: 100 }, at: 0 })
  .mark({ to: { y: 50 }, at: 500 })
  .mark({ to: { opacity: 0 }, at: 800 })
  .play();

// Mixed absolute + relative (absolute wins when both present)
const mixed = motion('#box')
  .mark({ to: { x: 100 }, at: 0 }) // Absolute
  .mark({ to: { y: 50 }, duration: 200 }) // Relative (from t=0 + 200 = 200ms)
  .mark({ to: { opacity: 0 }, at: 800 }) // Absolute again
  .play();

// ============================================================================
// Example 4: Complex Sequence with Relative Time
// ============================================================================

const complexSequence = motion('#hero')
  // Fade in (200ms)
  .mark({ to: { opacity: 1 }, duration: 200 })
  // Slide in after 50ms delay (300ms total)
  .mark({ to: { x: 0, y: 0 }, duration: 300 })
  // Scale up after 100ms delay (400ms total)
  .mark({ to: { scaleX: 1.2, scaleY: 1.2 }, duration: 400 })
  // Settle back after 50ms (200ms)
  .mark({ to: { scaleX: 1, scaleY: 1 }, duration: 200 })
  .option({ repeat: Infinity })
  .play();

// ============================================================================
// Example 5: Data Visualization with Custom Stagger
// ============================================================================

const bars = Array.from({ length: 20 }, () => document.createElement('div'));

// Bars animate in with exponential stagger (emphasize early bars)
motion(bars)
  .mark({
    to: (index: number) => ({ scaleY: (index + 1) / 20 }), // Bar heights
    duration: 600,
    stagger: (index: number) => {
      // Exponential stagger: first bars fast, later bars slower
      return Math.pow(index / 20, 2) * 1000; // 0-1000ms exponential
    },
  })
  .play();

// ============================================================================
// Example 6: Particle Burst with Radial Stagger
// ============================================================================

const burstParticles = Array.from({ length: 50 }, () => ({ x: 0, y: 0 }));

motion(burstParticles)
  .mark({
    to: (index: number) => {
      const angle = (index / 50) * Math.PI * 2;
      return {
        x: Math.cos(angle) * 200,
        y: Math.sin(angle) * 200,
      };
    },
    duration: 1000,
    stagger: (index: number) => {
      // Circular wave: particles at opposite angles stagger differently
      const angle = (index / 50) * Math.PI * 2;
      return Math.sin(angle) * 200 + 200; // 0-400ms
    },
  })
  .play();

export { oldWay, newWay, absoluteTime, mixed, complexSequence };
