# Inertia Snap-To Feature Implementation

## Summary

Successfully implemented GSAP InertiaPlugin-inspired snap-to functionality for the Motion animation engine's inertia plugin. The feature enables precise control over animation end points through exact values, snap point arrays, or custom snap functions.

## Completed Work

### 1. Type Definitions Updated ✅

**Files Modified:**
- `packages/core/src/components/timeline.ts`
- `packages/plugins/inertia/src/component.ts`

**Changes:**
- Added `end` parameter to `InertiaOptions` interface with three supported types:
  - `number`: Snap to exact value
  - `number[]`: Snap to closest value in array
  - `(naturalEnd: number) => number`: Custom snap function
- Updated `InertiaComponent` schema to include `end` field as object type
- Added `resistance` and `duration` parameters (GSAP-inspired) for future enhancements

### 2. VelocityTracker Implementation ✅

**File Created:**
- `packages/plugins/inertia/src/velocity-tracker.ts`

**Features:**
- Automatic velocity tracking using `requestAnimationFrame`
- Tracks both DOM elements (with transform matrix parsing) and regular objects
- 500ms sliding window for velocity calculation
- Methods: `track()`, `getVelocity()`, `isTracking()`, `untrack()`, `getVelocities()`, `clear()`
- Exported from plugin index for future velocity: 'auto' support

### 3. Snap-To Logic in InertiaSystem ✅

**File Modified:**
- `packages/plugins/inertia/src/inertia-system.ts`

**Implementation:**
- Calculate natural end position using physics: `currentValue + velocity * (timeConstant / 1000)`
- Process `end` parameter:
  - **Number**: Use as exact snap target
  - **Array**: Find closest value using `reduce()`
  - **Function**: Call with natural end to get custom snap target
- Use snap target as effective boundary based on velocity direction
- Fallback to original `to` parameter if no snap target provided
- Added `end` parameter to component destructuring

### 4. Builder API Updates ✅

**File Modified:**
- `packages/animation/src/api/builder.ts`

**Changes:**
- Pass `end` parameter from `inertiaConfig` to `InertiaComponent`
- Fixed type handling for `velocity: 'auto'` (skip if not a number)
- Removed debug logging after verification

### 5. Comprehensive Testing ✅

**File Modified:**
- `packages/plugins/inertia/tests/inertia.test.ts`

**New Tests:**
- "snaps to exact end value when end is a number"
- "snaps to closest value in array"
- "uses custom snap function"

**Result:** All 15 tests passing ✅

### 6. Advanced Examples Created ✅

**File Modified:**
- `apps/examples/src/routes/inertia.tsx`

**New Demos:**
1. **Snap to Exact Value**
   - Shows marker at end position (200px)
   - Demonstrates precise landing

2. **Snap to Grid (Array)**
   - Visual grid markers at 50px intervals: [0, 50, 100, 150, 200, 250]
   - Snaps to closest grid point
   - Perfect for carousel/tab implementations

3. **Custom Snap Function**
   - Rounds to 75px increments
   - Visual markers at 75, 150, 225
   - Demonstrates custom snap logic

## API Usage Examples

### 1. Snap to Exact Value
```typescript
motion('#element')
  .mark({
    inertia: {
      velocity: 800,
      end: 500, // Will end exactly at 500px
    },
  })
  .animate();
```

### 2. Snap to Array (Grid/Carousel)
```typescript
motion('#element')
  .mark({
    inertia: {
      velocity: 1000,
      end: [0, 100, 200, 300, 400], // Snaps to closest value
    },
  })
  .animate();
```

### 3. Custom Snap Function
```typescript
motion('#element')
  .mark({
    inertia: {
      velocity: 750,
      end: (naturalEnd) => Math.round(naturalEnd / 50) * 50, // Round to 50px increments
    },
  })
  .animate();
```

### 4. With Boundaries
```typescript
motion('#element')
  .mark({
    inertia: {
      velocity: 1200,
      min: 0,
      max: 400,
      end: [0, 100, 200, 300, 400], // Snap points respect boundaries
    },
  })
  .animate();
```

## Technical Details

### Snap Calculation Algorithm

1. **Calculate Natural End:**
   ```typescript
   const naturalEnd = currentValue + velocity * (timeConstant / 1000);
   ```

2. **Process End Parameter:**
   - If `number`: `snapTarget = end`
   - If `array`: `snapTarget = end.reduce((closest, val) => closest by distance)`
   - If `function`: `snapTarget = end(naturalEnd)`

3. **Set as Boundary:**
   - Positive velocity: `snapTarget` becomes `effectiveMax`
   - Negative velocity: `snapTarget` becomes `effectiveMin`

4. **Physics Integration:**
   - Decay phase continues until boundary hit
   - Spring bounce phase activates at snap target
   - Animation completes when settled at snap point

### Performance Considerations

- Snap calculation happens once at initialization
- No per-frame overhead for snap logic
- Array reduction is O(n) where n = snap points (typically small)
- Custom function called once with natural end value

## Build Status

✅ All packages built successfully:
- `@g-motion/core` - Type definitions updated
- `@g-motion/animation` - Builder API updated
- `@g-motion/plugin-inertia` - Snap-to logic implemented
- `examples` - Interactive demos created

✅ All tests passing (15/15)

## Next Steps (Future Enhancements)

1. **Velocity Auto-Tracking:**
   - Implement `velocity: 'auto'` using VelocityTracker
   - Automatically track property changes and calculate velocity

2. **Resistance Parameter:**
   - More intuitive than `timeConstant`
   - Convert resistance to timeConstant internally

3. **Duration Control:**
   - Support `duration: number` or `{ min: number; max: number }`
   - Override decay timing with explicit duration

4. **Additional Examples:**
   - Wheel spinner (snap to angles)
   - Horizontal carousel with snap
   - Drag-to-snap interactions (with velocity tracking)

## Documentation

The implementation follows GSAP InertiaPlugin patterns while maintaining Motion's ECS architecture and plugin system. Snap-to functionality is fully integrated with existing features:
- Compatible with boundary bounce
- Works with implicit boundaries from `to` parameter
- Respects min/max constraints
- Maintains exponential decay physics

## Files Changed

### Core Package
- `packages/core/src/components/timeline.ts` - Type definitions

### Inertia Plugin Package
- `packages/plugins/inertia/src/component.ts` - Schema and types
- `packages/plugins/inertia/src/inertia-system.ts` - Snap logic implementation
- `packages/plugins/inertia/src/velocity-tracker.ts` - NEW: Velocity tracking utility
- `packages/plugins/inertia/src/index.ts` - Export VelocityTracker
- `packages/plugins/inertia/tests/inertia.test.ts` - Snap-to tests

### Animation Package
- `packages/animation/src/api/builder.ts` - Pass end parameter

### Examples
- `apps/examples/src/routes/inertia.tsx` - Interactive snap-to demos

## Conclusion

The snap-to feature is production-ready and fully tested. It provides a powerful, flexible way to control inertia animation end points, matching GSAP InertiaPlugin capabilities while maintaining Motion's plugin architecture and performance characteristics.

**Implementation Date:** 2025
**Test Coverage:** 15/15 tests passing
**Build Status:** All packages building successfully
