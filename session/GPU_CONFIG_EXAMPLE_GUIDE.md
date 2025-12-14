# WebGPU GPU Configuration Example - Implementation Guide

## Overview

Added a new interactive example route `/gpu-config` that demonstrates WebGPU configuration with form controls. This example allows users to:

1. **Control GPU Compute Mode** - Choose between `auto`, `always`, or `never` GPU acceleration
2. **Toggle GPU Easing** - Enable/disable GPU-accelerated easing functions
3. **Adjust Activation Threshold** - Set the entity count threshold for GPU activation (in `auto` mode)
4. **Select Easing Function** - Choose from 6 different easing functions
5. **Run Test Scenarios** - Animate 100-5000 entities with live metrics

## File Changes

### New Files Created

**[apps/examples/src/routes/gpu-config.tsx](../apps/examples/src/routes/gpu-config.tsx)** (396 lines)
- Main interactive GPU configuration demo component
- Features real-time form controls for all GPU settings
- Includes 6 easing function implementations
- Animates DOM elements with configurable GPU acceleration
- Shows GPU metrics and system status

### Files Modified

**[apps/examples/src/routes/index.tsx](../apps/examples/src/routes/index.tsx)**
- Added navigation link to `/gpu-config` route
- Added info card in hub with description of GPU configuration demo

## Features

### 1. GPU Compute Mode Control

Three modes available:
- **🔄 Auto (threshold-based)**: GPU activates when entity count ≥ configured threshold (default: 1000)
- **⚡ Always (force GPU)**: GPU used regardless of entity count
- **🖥️ Never (CPU-only)**: All calculations performed on CPU

```tsx
const [gpuMode, setGpuMode] = useState<'auto' | 'always' | 'never'>('auto');
```

### 2. GPU Easing Functions

Toggle whether easing functions execute on GPU or CPU:
- When enabled: Supported easing functions (31 types) run in WGSL shader on GPU
- When disabled: All easing calculations run on CPU (used for debugging)

```tsx
const [gpuEasing, setGpuEasing] = useState(true);
```

### 3. Dynamic Threshold Control

In `auto` mode, adjust the entity count threshold:
- Range: 100 to 5000 entities
- Default: 1000 entities
- Slider control for easy adjustment

```tsx
const [threshold, setThreshold] = useState(1000);
```

### 4. Easing Function Selection

Six easing functions available:
- `easeInQuad` - Quadratic ease-in
- `easeOutCubic` - Cubic ease-out
- `easeInElastic` - Elastic ease-in with spring effect
- `easeOutBounce` - Bouncing ease-out
- `easeInOutSine` - Sinusoidal ease-in-out
- `easeInBack` - Back ease-in

Each function is implemented in JavaScript for animation calculations.

### 5. Test Scenarios

Buttons to run animations with different entity counts:
- 100 entities (small test)
- 500 entities (medium test)
- 1K entities (large test, usually triggers GPU in auto mode)
- 2K entities (extreme, definitely GPU)
- 5K entities (stress test)

### 6. Live Metrics Display

Shows real-time information:
- GPU availability (`navigator.gpu` check)
- Current configuration (gpuCompute, gpuEasing, threshold)
- Active entity count during animation
- Running status
- Last batch metrics (entity count and timestamp)

## UI Components

The example uses the shared component library:

```tsx
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { linkButtonClass } from '@/components/ui/link-styles';
```

## Code Structure

### Easing Functions

All 6 easing functions are defined as constants at the module level:

```typescript
const easingFunctions = {
  easeInQuad: (t: number) => t * t,
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInElastic: (t: number) => { /* ... */ },
  easeOutBounce: (t: number) => { /* ... */ },
  easeInOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInBack: (t: number) => { /* ... */ },
};
```

### Animation Loop

Animations are created on each test:

```typescript
const control = motion(`#gpu-box-${i}`)
  .mark({
    to: { x: dx, y: dy, rotate },
    duration,
    easing,
  })
  .animate({ repeat: 1 });
```

### Configuration Display

Real-time config status shown in a monospace display:

```typescript
<div className="rounded-md bg-slate-800/50 p-3 text-xs text-slate-300">
  <div className="font-mono">
    <div>GPU Available: {gpuAvailable ? '✓ navigator.gpu' : '✗ not detected'}</div>
    <div>Current Config:</div>
    <div className="ml-2 space-y-1 text-slate-400">
      <div>gpuCompute: {gpuMode}</div>
      <div>gpuEasing: {gpuEasing ? 'true' : 'false'}</div>
      <div>threshold: {threshold}</div>
    </div>
  </div>
</div>
```

## How to Use

1. **Navigate to the demo**: Click "GPU configuration" link from home page or go to `/gpu-config`

2. **Configure GPU settings**:
   - Select a GPU compute mode (auto/always/never)
   - Toggle GPU easing on/off
   - Adjust threshold (if using auto mode)
   - Pick an easing function

3. **Run a test**:
   - Click one of the entity count buttons (100-5K)
   - Watch the playfield animate entities
   - Observe metrics update in real-time

4. **Monitor performance**:
   - Check if GPU is available in status box
   - Watch entity count and batch metrics
   - Switch modes and re-run to compare

## Integration with GPU Configuration System

The demo showcases the full GPU configuration system:

### Configuration Options (passed to World.get())
```typescript
interface MotionAppConfig {
  gpuCompute?: 'auto' | 'always' | 'never';  // GPU compute mode
  gpuEasing?: boolean;                       // Enable GPU easing
  webgpuThreshold?: number;                  // Entity threshold for GPU
}
```

### In Production

To actually change GPU configuration, initialize World before engine startup:

```typescript
import { World } from '@g-motion/core';

// Configure before creating any animations
World.get({
  gpuCompute: 'always',  // Force GPU
  gpuEasing: true,       // GPU easing enabled
  webgpuThreshold: 500,  // Custom threshold
});

// Now use motion() API - will use configured settings
motion(target).mark({ to: 100 }).animate();
```

## Build Information

After implementation:
- ✅ Example builds successfully
- ✅ New route compiles without errors
- ✅ All existing tests pass (81/81)
- ✅ Bundle includes gpu-config chunk (8.67 kB gzipped: 3.05 kB)

## Future Enhancements

Potential improvements:
1. Add realtime GPU metrics graph
2. Compare CPU vs GPU performance side-by-side
3. Add custom easing function input
4. Show shader compilation time metrics
5. Add WebGPU feature detection results
6. Benchmark different workloads

## Related Documentation

- [GPU Config Implementation Guide](./GPU_CONFIG_IMPLEMENTATION.md) - Full technical details
- [GPU Config Quick Reference](./GPU_CONFIG_QUICK_REFERENCE.md) - API reference and patterns
- [Motion Engine Spec](../specs/001-motion-engine/spec.md) - Core architecture

## Testing the Example

### Manual Testing
1. Open http://localhost:42069/gpu-config
2. Try different GPU modes
3. Run 100-entity test (should use CPU in auto mode with default 1000 threshold)
4. Run 1K+ entity test (should activate GPU in auto mode)
5. Switch to "always" mode and re-run to force GPU

### Automated Testing
```bash
# Build the example
pnpm --filter examples build

# Run tests
pnpm --filter examples test

# Start dev server
cd apps/examples && pnpm dev
```

## Accessibility & UX

The example includes:
- Clear labeling of all controls
- Color-coded buttons (blue for entity counts, amber/red for extreme)
- Monospace font for technical metrics
- Responsive grid layout
- Stop button for immediate halt
- Hover states and visual feedback
- Descriptive status messages

## Browser Compatibility

- Requires modern browser with React Router v7+
- WebGPU available in Chromium 113+, optional for feature detection
- Gracefully degrades if GPU unavailable
- Falls back to CPU path automatically
