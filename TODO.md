Major Problems
1. TrackBuilder - The Definition of Pointless Indirection (packages/animation/src/api/track.ts)
Problem: This class adds zero value while creating mental overhead.
// CURRENT: What the hell is this?
export class TrackBuilder {
  constructor(private builder: MotionBuilder, private prop: string) {}

  mark(opts: MarkOptions) {
    return this.builder.mark({ ...opts, property: this.prop });
  }

  // 8 more forwarding methods...
}
What it does: Pre-binds a property name and calls parent methods. This is a 100-line class for builder.mark({ property: 'x', ...opts }).
Why it exists: Someone thought "fluent API" meant "nested objects for everything."
Deletion: Delete TrackBuilder entirely. Replace with:
// What TrackBuilder ACTUALLY does - 1 line
const track = (prop: string) => (opts: MarkOptions) =>
  builder.mark({ ...opts, property: prop });
builder.mark({ to: 100 }); // Still works. Always worked.
---
2. AnimationControl Delegation Hell (packages/animation/src/api/control/*.ts)
Problem: 4 separate classes for basic play/pause operations.
AnimationControl
  ├── PlaybackController (180 lines for play/pause/stop)
  ├── FrameNavigator (110 lines for seek operations)
  ├── BatchCoordinator (70 lines for array management)
  └── AnimationCoordinator (WeakMap gymnastics)
What it does: control.play() → PlaybackController → internal state.
Why it exists: Someone read "Single Responsibility Principle" and missed the "don't be an idiot" chapter.
Reality: play(), pause(), stop(), seek(), reverse() are all single operations. They belong directly on AnimationControl as methods, not spread across 4 files with 400+ lines of indirection.
Fix: Consolidate to 50 lines max in AnimationControl. Delete the 4 controller files.
---
3. Target Resolution Over-Engineering (packages/animation/src/api/mark.ts - 550 lines)
Problem: 550 lines for "figure out what the user meant by their target."
mark.ts contains:
├── TargetResolver registry system (multiple namespaces)
├── TargetResolveContext
├── TargetResolutionOptions
├── SelectorResolutionPolicy
├── Error handlers × 3
├── Selector cache management
└── DOM environment detection
What it does: Resolves CSS selectors, DOM elements, arrays, NodeLists into actual targets.
Complexity justification: "What if users have weird target types?"
Reality:
- 95% of calls use element, '#id', or array.
- The 300+ lines of error handling and policy configuration are never configured differently.
- This is a simple problem solved with complex infrastructure.
Fix: Delete the policy system, namespace registry, and 80% of error handling. Write a 50-line function that handles the common cases directly.
---
4. VisualTarget Class Hierarchy (packages/animation/src/api/visualTarget.ts - 326 lines)
Problem: 4 classes for "get/set properties on different target types."
BaseVisualTarget (abstract parent - 30 lines of NOOPS)
├── ObjectVisualTarget (35 lines)
├── PrimitiveVisualTarget (20 lines)
└── DomVisualTarget (120 lines of getComputedStyle gymnastics)
What it does: Abstract interface for DOM/object/primitive property access.
Why it exists: "We might need to add more target types later."
Reality: There are exactly 3 target types. They will never change. The class hierarchy adds indirection without solving any real problem.
Fix: Delete the class hierarchy. Create simple functions:
function getProperty(target: any, prop: string): number | undefined {
  if (target == null) return undefined;
  if (typeof target === 'number') return target;
  if (typeof target === 'object') return Number(target[prop]) || 0;
  return undefined;
}
---
5. BatchSamplingSystem Monolith (packages/core/src/systems/batch/sampling.ts - 1075 lines)
Problem: Single system doing 4 distinct jobs:
1. Keyframe sampling and preprocessing
2. Physics state preparation
3. Channel mapping configuration
4. Batch coordination
Why it exists: Someone put everything "batch-related" in one file.
Impact:
- Cannot understand one concern without reading all 1075 lines
- No clear boundaries for testing
- Changes to one area risk breaking others
Fix: Split into focused systems:
- KeyframeSamplingSystem (300 lines)
- PhysicsStateSystem (250 lines)
- BatchCoordinatorSystem (200 lines)
---
6. Channel Mapping Registry (packages/core/src/webgpu/channel-mapping.ts - 453 lines)
Problem: 453 lines for "map property names to GPU channel indices."
GPUChannelMappingRegistry
├── registerBatchChannels() with 100+ lines of validation
├── setDefaultChannels()
├── getChannels()
├── getStats()
└── 6 factory functions for different channel types
What it does: Registry pattern with extensive validation for a simple Map.
Why it exists: "We need to validate GPU channel configurations."
Reality: The validation throws errors if you configure wrong. That's it. The registry just stores tables. This is 100+ lines of infrastructure for a Map<string, Table>.
Fix: Simplify to basic Map. Keep minimal validation inline with usage.
---
7. Legacy CPU Rendering System (packages/core/src/systems/render.ts - 365 lines)
Problem: Deprecated system kept for "backward compatibility."
Why it exists: GPU path wasn't ready, now it is.
Impact: Maintenance burden, confusion for new developers ("do I use render.ts or webgpu?"), test coverage for dead code.
Fix: DELETE. If users need CPU fallback, add it back when someone asks. Dead code is worse than missing features.
---
8. Duplicate Culling Logic (packages/core/src/systems/webgpu/viewport/)
Problem: Two files doing the same thing:
- culling-sync-pass.ts (298 lines)
- culling-async-pass.ts (321 lines)
Why it exists: Different optimization strategies added at different times.
Impact: Duplicate logic, duplicate tests, confusion about which to use.
Fix: Consolidate into single viewport-culling.ts with sync/async modes as configuration.
---
Suggested Rewrite (TrackBuilder Deletion)
File: packages/animation/src/api/track.ts (delete entire file)
Replace: Update MotionBuilder.mark() to accept optional property:
// Before (track.ts):
track('x').mark({ to: 100 });
// After (builder.ts):
builder.mark({ to: 100, property: 'x' });
// OR
builder.mark({ to: 100 }); // uses default property
Deleted: 100 lines of forwarding methods. Added: 2 lines of parameter handling.
Impact: Zero behavioral change. 100 lines of garbage removed.
---
Final Advice
> Complexity is a cost, not a benefit. Every abstraction must justify its existence by solving a real problem. If you're adding a class just because "patterns," stop. If you're splitting a file because it "seems large," stop. If you're building infrastructure for "future needs," stop. Build what you need today, simply. Complexity accumulates silently and kills projects slowly. Fight it relentlessly.
