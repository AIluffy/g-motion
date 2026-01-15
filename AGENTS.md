<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Agent Guidelines for Motion

This file provides guidelines for AI agents working on the Motion animation engine codebase.

## Essential Commands

### Running Commands
```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build
pnpm build:packages
pnpm build:apps

# Build a specific package
pnpm --filter @g-motion/core run build
pnpm --filter @g-motion/plugin-dom run build

# Run tests
pnpm test                                    # all packages
pnpm test:watch                              # watch mode
pnpm --filter @g-motion/core test            # core package only
pnpm --filter @g-motion/core test --run tests/timeline.test.ts  # single test file

# Run benchmarks
pnpm bench
pnpm --filter @g-motion/core run bench

# Lint check
pnpm lint
pnpm lint:fix                                # auto-fix issues

# Format code
pnpm format                                  # check formatting
pnpm format:fix                              # apply formatting

# Type check
pnpm type-check
```

## Code Style Guidelines

### TypeScript
- Keep `strict: true` enabled; never use `any` unless absolutely necessary
- NoImplicitAny, strictNullChecks, noUnusedLocals, noUnusedParameters enabled
- Use centralized types from `@g-motion/core/types`—avoid duplicate definitions
- Export types in `packages/core/src/types.ts` for shared use

### Imports
- Use workspace protocol for internal packages: `"@g-motion/core": "workspace:*"`
- Group imports: external → internal → aliased
- Avoid default exports; use named exports for better IDE support

### Formatting (oxlint + oxfmt)
- 2-space indentation
- Single quotes for strings
- Semicolons required
- prefer-const and prefer-arrow-callback enforced
- no-var and no-console (warned)

### File Organization (Hard Requirements)
- **Component files**: ≤50 lines; split data vs logic if larger
- **System files**: Each system needs its own folder with:
  - `index.ts` (≤150 lines)
  - `pipeline.ts` (≤80 lines)
  - `*.compute.wgsl` shaders (≤80 lines)
- **Any file >400 lines must be split** before PR
- Scheduler only orders systems (≤150 lines); no business logic inside
- Shader logic separate from JS: one shader per file; no inline WGSL

### Naming Conventions
- **Components**: PascalCase (e.g., `MotionState`, `Timeline`)
- **Systems**: camelCase with `System` suffix (e.g., `RenderSystem`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `ARCHETYPE_DEFAULTS`)
- **Private/internal**: prefix with `_` (e.g., `_internalState`)

### Performance
- **Zero per-frame allocations** in core systems (Archetype, scheduler, batch/webgpu)
- Use `BatchBufferCache` for buffer reuse
- Access shared resources via `AppContext` singleton (not globalThis)
- Keep component buffers contiguous (SoA layout)

### Error Handling
- Use the centralized `ErrorHandler` from `@g-motion/core/error-handler`
- Follow error code patterns: `[ERROR_CODE] Message { context }`
- Never log secrets or keys

### Testing
- Add Vitest coverage for any behavior change
- Performance changes require benchmark tests in `packages/*/benchmarks/`
- Place tests in `tests/` folder with `.test.ts` extension

### Git & Documentation
- Update examples in `apps/examples` when public API changes
- Add optimization docs to `session/` for major features
- Store all summary documents in the `session/` folder
- Read relevant spec in `specs/001-motion-engine` before major work

## Project Structure

### Key Packages
- `@g-motion/core`: ECS runtime, WebGPU systems, core components
- `@g-motion/animation`: Public `motion()` API, interpolation
- `@g-motion/utils`: Shared utilities
- `@g-motion/plugin-dom`: DOM rendering
- `@g-motion/plugin-spring`: Spring physics
- `@g-motion/plugin-inertia`: Inertia/decay physics

### Core Patterns
- **Plugin authoring**: Register components + systems via `MotionApp.registerSystem()`
- **ECS**: Entity = numeric ID, Components = data schemas, Systems = pure functions
- **Renderer types**: DOM, Canvas, WebGL, WebGPU—isolated per target
- **Archetype**: O(1) entity lookup via reverse index map; SoA layout for cache locality
- **WebGPU**: Automatic CPU fallback; threshold-based activation (default 5000+ entities)

## References

### Documentation
- [CONTRIBUTING.md](../CONTRIBUTING.md): Detailed contributing guidelines
- [ARCHITECTURE.md](../ARCHITECTURE.md): System architecture and design principles
- [PRODUCT.md](../PRODUCT.md): Vision, goals, and API overview
- [README.md](../README.md): Quick start and package overview

### Specs & Guides
- [specs/001-motion-engine](../specs/001-motion-engine): Design specifications
- [session/README.md](../session/README.md): Optimization documentation entry point
- [session/QUICK_REFERENCE.md](../session/QUICK_REFERENCE.md): Performance summary

### Key File Locations
- Core types: `packages/core/src/types.ts`
- AppContext: `packages/core/src/context.ts`
- Archetype: `packages/core/src/archetype.ts`
- ErrorHandler: `packages/core/src/error-handler.ts`
- Timeline component: `packages/core/src/components/timeline.ts`
- BatchBufferCache: `packages/core/src/systems/batch/buffer-cache.ts`
