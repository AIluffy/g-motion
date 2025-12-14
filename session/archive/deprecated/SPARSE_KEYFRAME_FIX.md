# Sparse Keyframe Interpolation Fix

## Problem Description

When creating animations with sparse keyframes (where some properties are omitted in intermediate marks), the interpolation was incorrect. Properties that were omitted in middle keyframes would "jump" instead of smoothly interpolating across the full timeline.

### Example Scenario

```ts
motion(particle)
  .mark([
    { to: { x: 0, y: 0, scale: 0 }, time: 0 },
    { to: { scale: 1 }, time: 1000 },      // x and y omitted
    { to: { x: 100, y: 100, scale: 0 }, time: 2000 },
  ])
  .animate();
```

**Expected behavior** (like CSS animations):
- x and y should smoothly interpolate from 0 to 100 over the full 2000ms
- scale should animate: 0→1 (0-1000ms), then 1→0 (1000-2000ms)

**Actual behavior** (before fix):
- x and y would jump instantly from 0 to 100 at t=2000ms
- No smooth interpolation occurred

## Root Cause

In `MotionBuilder.mark()`, when creating keyframes, each keyframe's `startTime` was set to `this.currentTime` (the global mark time). For properties that were omitted in intermediate marks, this caused issues:

```ts
// For x track after processing all marks:
[
  { startTime: 0,    time: 0,    startValue: 0, endValue: 0 },
  { startTime: 2000, time: 2000, startValue: 0, endValue: 100 }  // ❌ startTime === time!
]
```

Since `startTime === time`, the `findActiveKeyframe` function would see this as an instant change, not an interpolation.

## Solution

Changed the `startTime` calculation to use the **previous keyframe's `time`** in the same track, not the global `currentTime`:

```ts
// Before (incorrect):
const kf: Keyframe = {
  startTime: this.currentTime,  // ❌ Global mark time
  time: timeAbs,
  // ...
};

// After (correct):
const prevTime = track.length > 0 ? track[track.length - 1].time : 0;
const kf: Keyframe = {
  startTime: prevTime,  // ✅ Previous keyframe's time in this track
  time: timeAbs,
  // ...
};
```

Now the x track correctly becomes:
```ts
[
  { startTime: 0, time: 0,    startValue: 0, endValue: 0 },
  { startTime: 0, time: 2000, startValue: 0, endValue: 100 }  // ✅ Interpolates from 0 to 2000
]
```

## Implementation

Modified three locations in `packages/animation/src/api/builder.ts`:

1. **Primitive number targets** (lines ~156):
   ```ts
   const prevTime = track.length > 0 ? track[track.length - 1].time : 0;
   ```

2. **DOM elements** (lines ~182):
   ```ts
   let prevTime = 0;
   if (track.length > 0) {
     startVal = track[track.length - 1].endValue;
     prevTime = track[track.length - 1].time;
   }
   ```

3. **Plain objects** (lines ~209):
   ```ts
   let prevTime = 0;
   if (track.length > 0) {
     startVal = track[track.length - 1].endValue;
     prevTime = track[track.length - 1].time;
   }
   ```

## Testing

Added comprehensive test suite in `tests/sparse-keyframes.test.ts`:

1. **Object animation with sparse keyframes**: Verifies x, y interpolate smoothly while scale has three keyframes
2. **DOM element animation**: Ensures DOM plugin handles sparse keyframes correctly
3. **Primitive animation**: Basic consistency test

All tests pass (11 test files, 36 tests total).

## Impact

This fix ensures that Motion's timeline behavior matches CSS animation semantics:
- Properties omitted in intermediate keyframes smoothly interpolate across the full timeline
- Each property has its own independent timeline
- No "jumps" or instant changes when properties reappear in later keyframes

## Examples Affected

The `particles-fps.tsx` example was the original bug reporter. With commented-out x/y in the middle keyframe:

```ts
.mark([
  { to: { x: 0, y: 0, scale: 0 }, time: 0 },
  { to: { scale: 1 }, time: duration },        // x, y commented out
  { to: { x: offsetX, y: offsetY, scale: 0 }, time: duration * 2 },
])
```

Now particles correctly drift from (0,0) to (offsetX, offsetY) over the full animation while scale pulses in the middle.

## Related Documentation

- [PRODUCT.md](../PRODUCT.md) - Core functionality section
- [ARCHITECTURE.md](../ARCHITECTURE.md) - Timeline system description
- Builder API: `packages/animation/src/api/builder.ts`
- Timeline component: `packages/core/src/components/timeline.ts`

---

**Fix Date**: 2025-01-XX
**Affected Files**: builder.ts (3 locations)
**Test Coverage**: 3 new tests, all existing tests pass
**Breaking Change**: No - this is a bug fix that makes behavior match expected CSS semantics
