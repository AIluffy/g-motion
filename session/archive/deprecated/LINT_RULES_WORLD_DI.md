# Lint Rules and Code Quality Standards

## World Dependency Injection Pattern

### Rule: Prefer WorldProvider over World.get()

**Status**: Manual enforcement (code review)
**Priority**: Medium
**Category**: Architecture/Maintainability

### Pattern to Avoid

```typescript
// ❌ Avoid: Direct singleton access
import { World } from '@g-motion/core';

export const MySystem: SystemDef = {
  update() {
    const world = World.get(); // Hard-coupled to singleton
    // ...
  }
};
```

### Preferred Patterns

**Option 1: Use WorldProvider (Systems)**
```typescript
// ✅ Preferred: Provider-based access
import { WorldProvider } from '@g-motion/core';

export const MySystem: SystemDef = {
  update() {
    const world = WorldProvider.useWorld(); // DI-friendly
    // ...
  }
};
```

**Option 2: Constructor Injection (Services)**
```typescript
// ✅ Preferred: Explicit injection
export class MyService {
  constructor(private world: World) {}

  doSomething() {
    const entities = this.world.getArchetypes();
    // ...
  }
}
```

**Option 3: Function Parameter (Utilities)**
```typescript
// ✅ Preferred: Pass as parameter
export function processEntities(world: World) {
  // ...
}
```

### Exceptions

- **Tests**: May use `World.get()` for backward compatibility verification
- **Temporary migration code**: Legacy shims during transition period
- **Emergency fallbacks**: When provider is genuinely unavailable

### Rationale

1. **Testability**: Multiple worlds can coexist for isolated tests
2. **Flexibility**: Animations can target specific world instances
3. **Clarity**: Explicit dependencies are easier to reason about
4. **Future-proof**: Enables scenarios like multi-tenant animations

### Migration Checklist

- [x] Core systems migrated to `WorldProvider.useWorld()`
- [x] Plugin systems (Spring, Inertia) migrated
- [x] Animation API accepts optional `world` parameter
- [x] AnimationControl uses injected world
- [x] Tests verify multi-world isolation
- [ ] Add regex-based lint rule when tooling supports it

### Enforcement

Until automated linting is available:
- Code review: Flag new `World.get()` usage
- PR template: Remind contributors to use `WorldProvider`
- Documentation: Link to this guide in CONTRIBUTING.md

---

## Related Patterns

### AppContext vs WorldProvider

- **AppContext**: Singleton for cross-cutting services (BatchProcessor, GPU state)
- **WorldProvider**: Scoped world management for ECS operations
- Use both when a system needs both global config and entity operations

### Lazy Resolution Pattern

When importing across packages causes circular dependencies:
```typescript
function resolveWorldProvider(): any | undefined {
  try {
    return require('@g-motion/core/src/worldProvider').WorldProvider;
  } catch {
    return undefined;
  }
}

const world = resolveWorldProvider()?.useWorld?.() ?? World.get();
```

This pattern is used in animation/control to avoid build-time coupling.
