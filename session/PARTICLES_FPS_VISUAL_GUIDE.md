# Particles FPS Demo - Feature Overview

## 🎨 Visual Layout

```
┌─────────────────────────────────────────────────────────────┐
│                    PARTICLES DEMO PAGE                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Title: FPS-controlled particle drift with GPU              │
│  Description: Dynamically add/remove particles...            │
│                                      [Back to hub] button    │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                    CONTROLS CARD                              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  FPS Control (60 fps)                                        │
│  [==============O=====================] | [Reset]            │
│  Higher FPS → shorter timelines                             │
│                                                               │
│  Particle Count (50 / 500)                                   │
│  [======O=============================] | [-50] [+50]       │
│                                                               │
│  GPU Settings                                                │
│  ☑ GPU Enabled    ✓ GPU available                           │
│                                                               │
│  [Play] [Stop]                                               │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                  PARTICLE FIELD CARD                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │    ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦              │   │
│  │  ✦ ✦ ✦   ✦ ✦ ✦   ✦ ✦ ✦   ✦ ✦ ✦   ✦ ✦ ✦          │   │
│  │    ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦              │   │
│  │                                                       │   │
│  │  (Animated purple particles with glow effect)        │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  Dynamically sized particle system with FPS-controlled       │
│  animation and optional GPU acceleration.                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 🎛️ Interactive Controls

### Control 1: FPS Adjuster
```
┌─ FPS Control ─────────────────────────────────────────┐
│                                                        │
│  Range: 10 fps (slowest) ──────→ 240 fps (fastest)   │
│  Default: 60 fps                                      │
│  Reset: Returns to 60 fps                            │
│  Impact: Duration = 1800ms × (60 / target_fps)      │
│                                                        │
│  Examples:                                            │
│  • 30 fps  → 3600ms per leg (2x slower)             │
│  • 60 fps  → 1800ms per leg (baseline)              │
│  • 120 fps → 900ms per leg (2x faster)              │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Control 2: Particle Count
```
┌─ Particle Count ──────────────────────────────────────┐
│                                                        │
│  Range: 0 ─────────────────────→ 500 particles      │
│  Default: 50 particles                               │
│  Quick Buttons: +50 / -50                           │
│                                                        │
│  Features:                                            │
│  • Add particles in real-time                        │
│  • Remove particles (stops animations first)        │
│  • Live count display                                │
│  • Works while animations playing                    │
│                                                        │
│  Recommended: Start at 50, increase in 50s          │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Control 3: GPU Configuration
```
┌─ GPU Settings ────────────────────────────────────────┐
│                                                        │
│  Availability Detection:                              │
│  ✓ GPU available   (WebGPU supported)               │
│  ✗ GPU not available (CPU-only mode)                │
│                                                        │
│  Toggle:                                              │
│  ☑ GPU Enabled     (accelerated computation)         │
│  ☐ GPU Disabled    (CPU fallback)                    │
│                                                        │
│  Browser Support:                                     │
│  Chrome/Edge 120+: Full support                      │
│  Safari 18+: Full support                            │
│  Firefox: In development                             │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Control 4: Playback
```
┌─ Playback Controls ───────────────────────────────────┐
│                                                        │
│  [Play]     → Start animations from beginning        │
│  [Restart]  → Stop and restart (appears when playing)│
│  [Stop]     → Stop all animations                    │
│                                                        │
│  State Machine:                                       │
│  Stopped ─→ Play ─→ Running                         │
│             ↑        │                                │
│             └── Restart (if running)                 │
│                                                        │
│  Stop: Running ─→ Stopped                           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

## 🔄 Animation Lifecycle

Each particle follows this animation cycle:

```
Timeline Duration = 1800ms × (60 / target_fps)

Start Time: random(0ms, 1000ms)

Keyframe 0 (time: 0ms)
├─ Position: (0, 0)      [center]
├─ Scale: 0              [invisible]
└─ Opacity: Implicit 1

Keyframe 1 (time: duration)
├─ Position: (offsetX/2, offsetY/2)  [halfway out]
├─ Scale: 1              [full size]
└─ Opacity: Implicit 1

Keyframe 2 (time: 2×duration)
├─ Position: (offsetX, offsetY)  [full distance]
├─ Scale: 0              [invisible again]
└─ Opacity: Implicit 1

Repeat: Infinite
```

## 📊 State Management

```
Component State:
├─ fps: number (10-240)
│  └─ Affects: Duration calculation
│
├─ particleCount: number (0-500)
│  └─ Affects: DOM element count, animation count
│
├─ isPlaying: boolean
│  └─ Affects: Play/Stop button states
│
├─ isReady: boolean
│  └─ Affects: Enable/disable all buttons
│
├─ gpuEnabled: boolean
│  └─ Affects: GPU acceleration setting
│
└─ gpuAvailable: boolean
   └─ Affects: GPU toggle disable state
```

## 🎭 User Interactions

### Add Particles (Scenario)
```
1. User opens demo
2. Sees 50 particles
3. Clicks [+50] button
4. Sees 100 particles (new ones appear immediately)
5. Clicks Play
6. All 100 particles animate
7. Clicks [+50] again while playing
8. 150 particles now animating (new ones blend in)
```

### Test GPU (Scenario)
```
1. User checks "GPU Enabled" toggle
   └─ See: "✓ GPU available"
2. Sets particle count to 300
3. Clicks Play
4. Monitors performance with GPU acceleration
5. Unchecks GPU toggle
6. Clicks Restart
7. Compares CPU vs GPU performance
```

### Scale Animations (Scenario)
```
1. Set 100 particles
2. Set FPS to 60 (baseline)
3. Play - observe animation speed
4. Drag FPS slider to 120
   └─ Timelines rebuild automatically
   └─ Animations run 2x faster
5. Drag FPS slider to 30
   └─ Animations run 2x slower
```

## 📈 Performance Characteristics

```
Particle Count │ CPU (60fps) │ GPU (60fps) │ Recommended
───────────────┼─────────────┼─────────────┼────────────
50             │ ✓ Smooth    │ ✓ Smooth    │ Perfect
100            │ ✓ Smooth    │ ✓ Smooth    │ Good
200            │ ~ Decent    │ ✓ Smooth    │ Use GPU
300            │ ⚠ Laggy     │ ✓ Smooth    │ GPU needed
500            │ ✗ Very slow │ ~ Decent    │ Reduce count
```

## 🎨 Styling

### Particle Appearance
```css
.particle {
  position: absolute;
  width: 0.75rem (12px);
  height: 0.75rem (12px);
  background-color: #a369ff (purple);
  mix-blend-mode: plus-lighter (glow effect);
  will-change: transform (performance hint);
}

.container {
  position: relative;
  overflow: hidden;
  background: gradient (dark theme);
  height: 420px;
}
```

### Particle Movement
Motion applies CSS transforms:
```css
/* Controlled by Motion ECS system */
transform: translate(xpx, ypx) scale(scaleX, scaleY) rotate(rotatedeg);
```

## 🔌 Technical Stack

```
Framework:      React 19 + TypeScript 5.x
Routing:        TanStack Router
Animation:      @g-motion/animation
ECS Engine:     @g-motion/core
DOM Plugin:     @g-motion/plugin-dom
GPU (optional): WebGPU (native browser API)
UI Components:  Custom card/button system
Styling:        Tailwind CSS
Build:          Vite 7.x
```

## 📚 Key Features Summary

| Feature | Status | Details |
|---------|--------|---------|
| Dynamic Particles | ✅ | Add/remove 0-500 particles |
| FPS Control | ✅ | 10-240 fps, real-time retiming |
| GPU Detection | ✅ | Auto-detect navigator.gpu |
| GPU Toggle | ✅ | Enable/disable acceleration |
| Play/Stop | ✅ | Full animation control |
| Animations | ✅ | 3-keyframe timeline per particle |
| Glow Effect | ✅ | plus-lighter blend mode |
| Responsive | ✅ | Works on mobile and desktop |

## 🚀 Getting Started

1. **Open Demo**: Navigate to `/particles-fps` route
2. **Start Simple**: Keep default 50 particles, play animation
3. **Increase Count**: Add particles with +50 button
4. **Adjust Speed**: Change FPS slider
5. **Check GPU**: See if "GPU available" appears
6. **Experiment**: Try GPU on/off with 300+ particles

## 🎯 Conclusion

The particles-fps demo now offers a comprehensive, interactive playground for testing Motion's animation engine with dynamic particle management and optional GPU acceleration. Perfect for performance testing and demonstrating real-world animation scenarios.
