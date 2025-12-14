# Particles FPS Demo - Quick Start Guide

## Features Overview

The enhanced particles-fps demo provides interactive controls for testing Motion's particle animation system at scale.

## Main Features

### 1. FPS Control (10-240 fps)
Dynamically adjust the animation speed. Higher FPS values create shorter timeline durations:
- **Baseline**: 60 fps = 1800ms per animation leg
- **Formula**: `duration = 1800ms × (60 / targetFps)`
- **Example**: At 120 fps, each leg is 900ms; at 30 fps, each leg is 3600ms

### 2. Particle Count Management (0-500 particles)
Add or remove particles dynamically:
- **Slider**: Drag to adjust count in real-time
- **+50 Button**: Add 50 particles (disabled at 500 max)
- **-50 Button**: Remove 50 particles (disabled at 0 min)
- **Current**: Displays active particle count

**Note**: Animations continue playing while adding/removing particles

### 3. GPU Configuration
Toggle WebGPU acceleration for large-scale scenarios:
- **Status Indicator**:
  - ✓ GPU available (GPU detected on this browser)
  - ✗ GPU not available (CPU-only mode)
- **Toggle Switch**: Enable/disable GPU acceleration
  - Disabled when GPU unavailable
  - Enabled by default when available

### 4. Animation Controls
- **Play**: Start animations from beginning
- **Restart**: Stop current animations and restart
- **Stop**: Stop all animations and reset particles

## Animation Pattern

Each particle animates through 3 keyframes:

```
Start (t=0ms)           → Mid (t=duration)      → End (t=2×duration)
x:0, y:0, scale:0       → x:ox/2, y:oy/2,      → x:ox, y:oy, scale:0
                           scale:1
```

Where:
- `ox` = randomized X offset (-160 to 160px)
- `oy` = randomized Y offset (-90 to 90px)
- `duration` = calculated from current FPS setting
- Each particle starts with random delay (0-1000ms)

## Usage Scenarios

### Test 1: Performance at Different Scales
1. Start with 50 particles at 60 fps
2. Gradually increase to 200, 300, 500 particles
3. Monitor rendering performance
4. Toggle GPU on/off to compare

### Test 2: FPS Impact on Animation Speed
1. Set 100 particles
2. Play animation at 30 fps (slower)
3. Shift slider to 120 fps (faster)
4. Observe how animations retiming happens in real-time

### Test 3: Dynamic Particle Addition
1. Play animation with 50 particles
2. While playing, increase to 150 particles
3. Observe new particles being added mid-animation

### Test 4: GPU vs CPU
1. Set 300 particles
2. Enable GPU, play animation, measure performance
3. Disable GPU, restart, compare timing and smoothness

## Technical Notes

### Particle Lifecycle
1. **Creation**: DOM div element created and appended to container
2. **Animation**: Motion timeline created with 3 keyframes
3. **Cleanup**: When particle count reduces, animations are stopped and elements removed

### Styling
- **Position**: Absolute, centered at container center (50%, 50%)
- **Size**: 0.75rem × 0.75rem (12px × 12px)
- **Color**: Purple (#a369ff) with plus-lighter blend mode for glow
- **Performance**: Uses `will-change: transform` for optimization

### GPU Integration
- GPU acceleration is optional and automatic
- Falls back to CPU when unavailable
- Toggle allows comparing performance characteristics
- Batch processing handles 300+ particles efficiently

## Browser Support

| Browser | WebGPU | CPU Fallback |
|---------|--------|-------------|
| Chrome 120+ | ✓ | ✓ |
| Edge 120+ | ✓ | ✓ |
| Safari 18+ | ✓ | ✓ |
| Firefox | In Dev | ✓ |

## Performance Tips

1. **Start Small**: Begin with 50-100 particles to understand behavior
2. **Increase Gradually**: Add 50 particles at a time while observing smoothness
3. **Use GPU**: Enable GPU for 200+ particles to maintain 60 fps
4. **Monitor CPU**: At high particle counts, system CPU usage increases significantly
5. **FPS Adjustment**: Lower FPS for smoother rendering on slower devices

## Troubleshooting

### Animations Not Visible
- Ensure particles are at least 50-100 count
- Check that Play button is activated
- Verify GPU/CPU setting matches your system capability

### Low Frame Rate
- Reduce particle count to 50-100
- Enable GPU if available
- Close other browser tabs to free resources
- Disable browser extensions that affect rendering

### GPU Toggle Disabled
- Your browser doesn't support WebGPU
- This is normal; CPU-only mode works fine
- Firefox may require enabling WebGPU in about:config

## Future Enhancements

- Real-time FPS counter
- GPU vs CPU timing comparison display
- Pre-set animation patterns (spiral, wave, burst)
- Particle color customization
- Export performance metrics

## API Integration

The demo uses Motion's public API:

```typescript
import { motion } from '@g-motion/animation';

// Create particle animation
motion(particleElement)
  .mark({ to: { x: 0, y: 0, scale: 0 }, time: 0 })
  .mark({ to: { x: offsetX/2, y: offsetY/2, scale: 1 }, time: duration })
  .mark({ to: { x: offsetX, y: offsetY, scale: 0 }, time: duration*2 })
  .animate({ repeat: Infinity, delay: randomDelay });
```

Features demonstrated:
- ✅ DOM element targeting
- ✅ Multi-keyframe timelines
- ✅ FPS-aware duration scaling
- ✅ Per-element random delays
- ✅ Infinite animation loops
- ✅ Animation control (play/stop)
