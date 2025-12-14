# GPU Configuration Example - Quick Start

## What Was Added

A new interactive web form example at `/gpu-config` that lets you test WebGPU animation configuration with these controls:

### 🎛️ Configuration Controls

| Control | Options | Default | Effect |
|---------|---------|---------|--------|
| **GPU Mode** | 🔄 Auto / ⚡ Always / 🖥️ Never | Auto | When to use GPU acceleration |
| **GPU Easing** | ✓ Enabled / ✗ Disabled | Enabled | Run easing on GPU vs CPU |
| **Threshold** | 100-5000 (auto mode only) | 1000 | Entity count to trigger GPU |
| **Easing Function** | 6 options | easeInQuad | Animation curve for boxes |

### ▶️ Test Buttons

Run animations with these entity counts:
- **100** - Small (CPU in auto mode)
- **500** - Medium (CPU in auto mode)
- **1000** - Large (GPU in auto mode)
- **2000** - Extreme (GPU forced)
- **5000** - Stress test (GPU heavy)

### 📊 Real-Time Metrics

- ✓ GPU availability
- Active entity count
- Animation status (running/idle)
- Last batch metrics
- Current configuration display

## How to Access

### From Home Page
1. Build/run the project: `pnpm build` && dev server running
2. Open http://localhost:42069 (or your dev server URL)
3. Click "GPU configuration" link at top or in cards section

### Direct URL
- http://localhost:42069/gpu-config

## Example Workflows

### Test 1: Auto Mode Threshold
```
1. Set GPU Mode: Auto
2. Set Threshold: 500
3. Click "500 entities" button
   → Should activate GPU (500 ≥ 500)
4. Click "100 entities" button
   → Should use CPU (100 < 500)
```

### Test 2: Force GPU Behavior
```
1. Set GPU Mode: Always
2. Click "100 entities" button
   → GPU used (forced, even though small count)
3. Observe faster animation than CPU-only mode
```

### Test 3: CPU-Only Testing
```
1. Set GPU Mode: Never
2. Click "5000 entities" button
   → All interpolation on CPU
3. Note: May be slower than GPU mode on high counts
```

### Test 4: Easing Function Comparison
```
1. Select easing: easeInQuad
2. Run 1K entities test
3. Change easing: easeInElastic
4. Run 1K entities test
5. Compare animation curves
```

## Configuration Options Explained

### GPU Compute Modes

#### 🔄 Auto (Default)
- **When**: GPU activates when entity count ≥ threshold
- **Best for**: Production apps wanting automatic scaling
- **Threshold range**: 100-5000 (adjustable slider)

```
// If configured like this:
threshold = 1000
Then:
  100 entities → CPU (below threshold)
  500 entities → CPU (below threshold)
  1000 entities → GPU (at threshold)
  2000 entities → GPU (above threshold)
```

#### ⚡ Always
- **When**: GPU used regardless of entity count
- **Best for**: Testing GPU path or GPU-only applications
- **Trade-off**: GPU overhead even for small counts

```
// Even 1 entity uses GPU:
motion(element).mark({ to: 100 }).animate();
// → Dispatches to GPU (overhead not worth it for 1 entity)
```

#### 🖥️ Never
- **When**: CPU always used
- **Best for**: Testing CPU path or debugging
- **Use case**: Mobile devices without WebGPU support

### GPU Easing

#### ✓ Enabled (Default)
- Supported easing functions (31 types) run in WGSL shader on GPU
- Eliminates JavaScript callback overhead
- Unsupported custom functions fall back to CPU

Supported easing functions:
- Linear, Quad, Cubic, Quart, Quint (power)
- Sine, Expo, Circ (trigonometric)
- Back, Elastic, Bounce (advanced)
- All with in/out/inout variants

#### ✗ Disabled
- All easing calculations run on CPU (JavaScript)
- Useful for debugging easing behavior
- Every animation spends cycles in JS even with GPU acceleration

### Threshold

Only visible in `Auto` mode:
- **Purpose**: Controls when GPU acceleration kicks in
- **Default**: 1000 entities
- **Why matter**: GPU has startup overhead, not worth it for tiny animations
- **Rule of thumb**: Lower = GPU sooner, Higher = More CPU usage

```
// Example with threshold = 500:

100 entities:
  ├─ Count < 500? Yes
  └─ Use CPU

500 entities:
  ├─ Count ≥ 500? Yes
  └─ Use GPU

1000 entities:
  ├─ Count ≥ 500? Yes
  └─ Use GPU (definitely worth the overhead)
```

## Visual Feedback

### Configuration Status Box
Shows your current settings in monospace font:
```
GPU Available: ✓ navigator.gpu
Current Config:
  gpuCompute: auto
  gpuEasing: true
  threshold: 1000
  selectedEasing: easeInQuad
```

### Metrics During Animation
While running:
- Entity count updates
- Running status changes to "yes"
- Last batch metrics shown on completion

### Animation Visualization
- Small colored dots on dark background
- Each dot = one animated element
- Dots move according to selected easing function
- Position and rotation randomized

## Performance Observations

### What to Notice

**With 100 entities, Auto mode:**
- GPU not activated (below 1000 threshold)
- CPU path used
- Smooth but all work in JavaScript

**With 1000+ entities, Auto mode:**
- GPU activates (at/above threshold)
- Notice GPU acceleration badge in metrics
- Smoother interpolation for large counts
- Lower CPU usage for animation calculations

**With Always mode:**
- GPU used even for small counts
- Small overhead visible on 100-entity test
- Advantage only shows at scale (1000+)

**With Never mode:**
- CPU handles everything
- Performance degrades with scale
- Useful for performance comparison

## Easing Functions

Six easing functions to choose from:

1. **easeInQuad** (default) - `t²` - Slow start, fast end
2. **easeOutCubic** - `1-(1-t)³` - Fast start, slow end
3. **easeInElastic** - Spring effect with overshoot
4. **easeOutBounce** - Bouncing deceleration
5. **easeInOutSine** - Smooth sine curve
6. **easeInBack** - Slight backward motion before forward

Try each with different entity counts to see the curves in action.

## Development Notes

### Code Location
- [apps/examples/src/routes/gpu-config.tsx](../apps/examples/src/routes/gpu-config.tsx)

### Key Components
- Configuration form (GPU mode buttons, threshold slider, easing selector)
- Test control panel (entity count buttons, stop button)
- Playfield (DOM element container)
- Status display (metrics and config info)

### Build
```bash
# Build all packages including example
pnpm build

# Or just the example app
pnpm --filter examples build

# Dev server
cd apps/examples && pnpm dev
```

## Testing Tips

1. **Test threshold behavior**:
   - Set threshold to 200
   - Run 100 entities (CPU)
   - Run 500 entities (GPU)

2. **Compare modes**:
   - Run same test in Auto, Always, Never
   - Watch metrics and performance

3. **Easing curves**:
   - Run same entity count with different easings
   - Visual curve differences are clear

4. **GPU detection**:
   - Check "GPU Available" line
   - Different browsers/devices show different values

## API Information

### In Production Code

To use GPU configuration in a real app:

```typescript
import { World } from '@g-motion/core';
import { motion } from '@g-motion/animation';

// Configure BEFORE creating animations
World.get({
  gpuCompute: 'auto',        // 'auto' | 'always' | 'never'
  gpuEasing: true,           // boolean
  webgpuThreshold: 1000,     // number (100-5000+)
});

// Now animations use configured settings
motion('#box1').mark({ to: { x: 100 } }).animate();
motion('#box2').mark({ to: { y: 200 } }).animate();
// ... etc
```

### Default Configuration
```typescript
{
  gpuCompute: 'auto',      // Default behavior
  gpuEasing: true,         // Easing on GPU by default
  webgpuThreshold: 1000,   // 1000 entity threshold
}
```

## Next Steps

After exploring this example:
1. Read [GPU_CONFIG_IMPLEMENTATION.md](./GPU_CONFIG_IMPLEMENTATION.md) for technical details
2. Check [GPU_CONFIG_QUICK_REFERENCE.md](./GPU_CONFIG_QUICK_REFERENCE.md) for API details
3. Implement in your own projects using the configuration options
4. Monitor GPU metrics using the `__motionGPUMetrics` global (shown in example)

## Troubleshooting

**Q: GPU shows unavailable**
- A: Check if browser supports WebGPU (Chrome 113+)
- Or try different browser/update

**Q: Animations look the same in all modes**
- A: That's expected! Implementation is transparent
- Only metrics/backend changes, visual result is identical
- Use different entity counts to see performance difference

**Q: Why use GPU if result is the same?**
- A: Performance and scale
- CPU can handle 100-1000 animations fine
- GPU excels at 1000+ concurrent animations
- Frees CPU for other work (user input, logic, etc.)

**Q: Threshold slider doesn't work**
- A: Only visible in "Auto" mode
- Switch to Auto mode first
- Then adjust threshold slider

**Q: Want to test custom easing?**
- A: This demo uses built-in easings only
- For custom easing, use motion API directly in your code
- Or extend the example to add input field for custom function
