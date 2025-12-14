# Plugin Architecture Implementation Summary

**Date**: December 19, 2024
**Status**: ✅ COMPLETED
**Task**: Refactor Motion to separate DOM rendering as optional plugin

## Objectives Achieved

### 1. Core Architecture Separation
- **Core** (`@g-motion/core`): Now only handles primitive animations (numbers/strings) and object tweens
- **DOM Plugin** (`@g-motion/plugin-dom`): Optional plugin that registers DOM rendering capability
- **Animation** (`@g-motion/animation`): Public API layer, dependency-agnostic

### 2. Plugin System Implementation

#### Created Registry-Based Renderer System
- `MotionApp` interface enhanced with:
  - `registerRenderer(name: string, renderer: RendererDef)`: Register custom renderers
  - `getRenderer(name: string): RendererDef | undefined`: Retrieve renderer by name
  - `registerEasing(name: string, fn)`: Register custom easing functions
  - `getEasing(name: string)`: Retrieve easing function

#### Built-in Renderers (in core)
- `callback`: For `onUpdate` callbacks
- `primitive`: For number/string animations
- `object`: For object property tweens

#### Optional Renderers (in plugins)
- `dom`: Registered by DOMPlugin for DOM element animations

### 3. Renderer Dispatch Logic
**Before**: Inline logic in RenderSystem, DOM detection in Builder
**After**: Registry-based dispatch in RenderSystem:
1. Query `app.getRenderer(rendererId)`
2. Fall back to built-in renderers if not found
3. Silent fail if renderer is still not available (design intent: allows graceful degradation)

### 4. Builder Simplification
**Before**: Builder had DOM detection logic and imported DOMRenderSystem
**After**: Builder treats all selector strings the same:
- Creates entity with `rendererId: 'dom'`
- Expects 'dom' renderer to be registered (provided by plugin)
- No DOM-specific knowledge in core

### 5. DOM Plugin Auto-Registration
**Strategy**: DOMPlugin auto-registers on import (browser environments only)
**Implementation**:
```typescript
// packages/plugins/dom/src/index.ts
if (typeof window !== 'undefined' && typeof requestAnimationFrame !== 'undefined') {
  DOMPlugin.setup(app);
}
```

**Usage in Examples**:
```typescript
// apps/examples/src/main.tsx
import '@g-motion/plugin-dom'; // Triggers auto-registration
```

### 6. Component and System Architecture
- **Transform Component**: Moved to DOM plugin, only registered when plugin loads
- **DOM Render System**: Refactored to renderer factory pattern (`createDOMRenderer()`)
- **Backward Compatibility**: Legacy `DOMRenderSystem` export maintained for transition period

## Code Changes Summary

### Packages Modified

#### `@g-motion/core`
- **plugin.ts**: Added `RendererDef` interface, enhanced `MotionApp`
- **app.ts**: Implemented renderer/easing registries as Maps
- **systems/render.ts**: Refactored to registry-based dispatch
- **archetype.ts**: Added `componentNames` getter for renderer access
- **index.ts**: All exports updated to include new interfaces

#### `@g-motion/animation`
- **api/builder.ts**: Removed DOM detection, treats selectors as 'dom' renderer target
- **package.json**: Removed `@g-motion/plugin-dom` dependency (no longer needed)

#### `@g-motion/plugin-dom`
- **src/index.ts**:
  - Enhanced to export `DOMPlugin` for manual registration
  - Added auto-registration on import (browser-only)
- **src/renderer.ts**: Refactored DOM rendering to factory pattern
- **vitest.config.ts**: Added `jsdom` environment for browser API availability
- **tests/index.test.ts**: Updated to test plugin structure

#### `apps/examples`
- **src/main.tsx**: Added DOM plugin import for auto-registration
- **package.json**: Added `@g-motion/plugin-dom` as dependency
- **src/routes/dom.tsx**: Updated documentation comment
- **vite.config.ts**: Simplified (workspace resolution works automatically)

## Test Results

### All Tests Passing ✅
```
@g-motion/core:        63 tests passed
@g-motion/animation:   13 tests passed, 2 skipped (browser-specific)
@g-motion/plugin-dom:  1 test passed
@g-motion/utils:       1 test passed
```

### Build Status ✅
```
@g-motion/core:      54.6 kB (esm)
@g-motion/animation: 11.0 kB (esm)
@g-motion/plugin-dom: 2.5 kB (esm)
examples:            292.19 kB (gzipped: 92.31 kB)
```

## Architectural Benefits

1. **Modularity**: DOM rendering is completely decoupled from core
2. **Extensibility**: New renderers can be added without modifying core
3. **Flexibility**: Users can choose whether to include DOM support
4. **Size**: Core package minimal for primitive-only use cases
5. **Composability**: Plugins auto-register for convenience, manual registration still possible

## Usage Patterns

### Without DOM Plugin (Core Only)
```typescript
import { motion } from '@g-motion/animation';

// Primitive animation
motion(0).mark({ to: 100, duration: 800 }).animate();

// Object animation
const obj = { x: 0 };
motion(obj).mark({ to: { x: 100 } }).animate();
```

### With DOM Plugin (Auto-Registered)
```typescript
import { motion } from '@g-motion/animation';
import '@g-motion/plugin-dom'; // Auto-registers DOM renderer

// DOM animation (works because plugin is registered)
motion('#box')
  .mark({ to: { x: 100, y: 50 } })
  .animate();
```

### Manual Plugin Registration
```typescript
import { motion } from '@g-motion/animation';
import { app } from '@g-motion/core';
import { DOMPlugin } from '@g-motion/plugin-dom';

// Manual setup if needed
DOMPlugin.setup(app);

// Now DOM animations work
motion('#box').mark({ to: { x: 100 } }).animate();
```

## Design Decisions

1. **Auto-Registration in DOM Plugin**: Makes examples and typical usage simple while maintaining explicit plugin pattern
2. **Silent Failure for Missing Renderers**: Allows graceful degradation; animations silently fail to render if renderer not available
3. **Factory Pattern for DOM Renderer**: Enables better testing and configuration if needed in future
4. **Browser Check in Auto-Registration**: Prevents DOM plugin from breaking in server/test environments

## Migration Path for Users

### Existing Code (Auto-Registered)
No changes needed if DOM plugin is imported:
```typescript
import '@g-motion/plugin-dom'; // This triggers auto-registration
```

### Strict Explicit Setup
For applications wanting explicit control:
```typescript
import { app } from '@g-motion/core';
import { DOMPlugin } from '@g-motion/plugin-dom';

// Explicit one-time setup
if (isProduction || isDOMSupported) {
  DOMPlugin.setup(app);
}
```

## Next Steps (Optional)

1. Document plugin API in README
2. Create example plugin (e.g., Canvas renderer)
3. Add TypeScript strict mode to plugin-dom tests
4. Consider lazy-loading plugins based on feature detection

## Files Modified
- 8 source files updated
- 2 test files updated
- 2 configuration files updated
- 1 package.json updated
- Total: 13 files changed
