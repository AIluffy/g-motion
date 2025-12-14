# Monorepo Setup Guide

This document explains the monorepo structure and configuration.

## Configuration Files

### pnpm-workspace.yaml

Defines which directories are part of the workspace:

```yaml
packages:
  - "packages/*" # Shared libraries
  - "apps/*" # Applications
```

### turbo.json

Configures task execution and caching:

- Defines task dependencies
- Sets up output caching
- Specifies global dependencies

### .npmrc

pnpm-specific configuration:

- `shamefully-hoist=false` - Strict peer dependency resolution
- `strict-peer-dependencies=true` - Fail on missing peer dependencies
- `auto-install-peers=true` - Auto-install peer dependencies

### tsconfig.json

Root TypeScript configuration with path aliases:

- Base compiler options
- Path mapping for `@/*`
- Extended by all packages

## Package Structure

### Library Packages (packages/\*)

- Built with **Rslib** for dual ESM/CJS output
- Compiled to `dist/`
- Use TypeScript with full type definitions
- Export multiple modules via `exports` field
- Can be published to npm
- See [RSLIB.md](./RSLIB.md) for bundling details

### Applications (apps/\*)

- Use libraries from `packages/`
- Vite or other bundlers
- Not published to npm

## Dependency Management

### Workspace Protocol

Use `workspace:*` to reference local packages:

```json
{
  "dependencies": {
    "@g-motion/core": "workspace:*"
  }
}
```

### Peer Dependencies

Install shared tools as root devDependencies:

- typescript
- eslint
- prettier
- @typescript-eslint/\*

### Overrides

Configure version constraints in root package.json:

```json
{
  "pnpm": {
    "overrides": {
      "typescript": "^5.3.0"
    }
  }
}
```

## Task Execution

### Using Turbo

```bash
# Run build across workspace
pnpm build

# Run with filtering
pnpm build:packages
pnpm build:apps

# Run specific package
pnpm -F @g-motion/core build
```

### Task Dependencies

Tasks are executed respecting dependencies:

- `build` depends on all dependency builds
- `lint` runs independently
- `test` runs independently

## Publishing

### Package Configuration

Each library package needs:

- `main` - CommonJS entry point
- `types` - TypeScript definitions
- `exports` - Modern ESM exports
- `files` - What to publish

### Release Process

The release workflow:

1. Builds all packages
2. Publishes to npm (requires NPM_TOKEN)
3. Updates version tags

## Best Practices

1. **Keep it DRY**: Share dependencies via workspace protocol
2. **Use filters**: Run commands on specific packages
3. **Leverage caching**: Turbo caches builds automatically
4. **Type safety**: Enable strict TypeScript checking
5. **Code quality**: ESLint + Prettier on every commit
6. **Documentation**: Keep README files up-to-date

## Common Tasks

### Add dependency to package

```bash
pnpm add -D typescript -w packages/core
```

### Update all dependencies

```bash
pnpm update --recursive
```

### List workspace packages

```bash
pnpm ls -r --depth 0
```

### Remove packages

```bash
pnpm clean
rm -rf node_modules
pnpm install
```
