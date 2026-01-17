# Plugin System Migration Guide

This document outlines the migration from the legacy plugin system to the new self-contained plugin architecture.

## Changes Summary

### Before (Legacy)
```typescript
// plugins/spring/src/index.ts
export const SpringPlugin: MotionPlugin = {
  name: 'SpringPlugin',
  setup(app) {
    app.registerComponent('Spring', SpringComponent);
    app.registerSystem(SpringSystem);
  },
};
```

### After (New Pattern)
```typescript
// plugins/spring/src/index.ts
export const springPlugin: MotionPlugin = {
  name: 'spring',  // Simplified name
  setup(app) {
    app.registerComponent('Spring', { schema: SpringComponentSchema });
    app.registerSystem({ name: 'SpringSystem', order: 19, update: SpringSystem.update });
  },
};
```

## Migration Steps

### 1. Update Plugin Names

| Plugin | Old Name | New Name |
|--------|----------|----------|
| Spring | `SpringPlugin` | `springPlugin` |
| Inertia | `InertiaPlugin` | `inertiaPlugin` |

### 2. Export Schema Separately

```typescript
// Before
export const SpringComponent: ComponentDef = {
  schema: { stiffness: 'float32', ... }
};

// After
export const SpringComponentSchema = {
  stiffness: 'float32',
  ...
};

export const SpringComponent: ComponentDef = {
  schema: SpringComponentSchema,
};
```

### 3. Update Component Registration

```typescript
// Before
app.registerComponent('Spring', SpringComponent);

// After
app.registerComponent('Spring', {
  schema: SpringComponentSchema,
});
```

### 4. Inline System Definitions

```typescript
// Before
app.registerSystem(SpringSystem);

// After
app.registerSystem({
  name: 'SpringSystem',
  order: 19,
  update: SpringSystem.update,
});
```

## File Changes Required

### plugins/spring/src/
- [x] `component.ts` - Export `SpringComponentSchema`
- [x] `index.ts` - Rename to `springPlugin`, use new pattern
- [ ] `plugin.ts` - Create new manifest file (optional)
- [x] `shaders/spring.wgsl` - Add GPU shader

### plugins/inertia/src/
- [x] `component.ts` - Export `InertiaComponentSchema`
- [x] `index.ts` - Rename to `inertiaPlugin`, use new pattern

### packages/animation/src/api/
- [ ] `physics.ts` - Move `analyzeSpringTracks` to spring plugin
- [ ] `physics.ts` - Move `analyzeInertiaTracks` to inertia plugin
- [ ] `physics.ts` - Move `buildInertiaComponent` to inertia plugin
- [ ] `keyframes.ts` - Update imports

## GPU Shader Integration (Future)

The new plugin manifest supports GPU shaders:

```typescript
export const springPlugin: MotionPlugin = {
  name: 'spring',
  manifest: {
    shaders: {
      spring: {
        code: `...wgsl code...`,
        entryPoint: 'updateSprings',
        bindings: [
          { name: 'springs', type: 'storage', access: 'read_write' },
          { name: 'params', type: 'uniform' },
        ],
      },
    },
  },
};
```

## Backward Compatibility

The legacy `setup(app)` pattern is still supported:

```typescript
export const springPlugin: MotionPlugin = {
  name: 'spring',
  setup(app) {
    // This still works!
    app.registerComponent('Spring', { schema: SpringComponentSchema });
    app.registerSystem({ name: 'SpringSystem', order: 19, update: SpringSystem.update });
  },
};
```

## Usage

### Before
```typescript
import { SpringPlugin } from '@g-motion/plugin-spring';
SpringPlugin.setup(app);
```

### After
```typescript
import { springPlugin } from '@g-motion/plugin-spring';
springPlugin.setup(app);

// Or use the new manifest pattern
import { springPlugin } from '@g-motion/plugin-spring';
if (springPlugin.manifest) {
  // Register components, systems, shaders from manifest
}
```

## Testing

Update tests to use new plugin names:

```typescript
// Before
import { SpringPlugin } from '@g-motion/plugin-spring';
SpringPlugin.setup(app);

// After
import { springPlugin } from '@g-motion/plugin-spring';
springPlugin.setup(app);
```
