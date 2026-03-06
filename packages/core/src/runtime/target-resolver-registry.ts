import type { TargetResolveContext, TargetResolveResult, TargetResolver } from '@g-motion/protocol';
import type { World } from './world';
import { WorldProvider } from './world-provider';

export class TargetResolverRegistry {
  private resolvers: TargetResolver[] = [];

  register(resolver: TargetResolver): void {
    this.resolvers.push(resolver);
  }

  resolve(input: unknown, ctx: TargetResolveContext): TargetResolveResult | null {
    if (this.resolvers.length === 0) {
      return null;
    }

    for (const resolver of this.resolvers) {
      const resolved = resolver(input, ctx);
      if (resolved && resolved.length > 0) {
        return resolved;
      }
    }
    return null;
  }

  clear(): void {
    this.resolvers = [];
  }

  copyFrom(source: TargetResolverRegistry): void {
    this.resolvers = [...source.resolvers];
  }
}

const globalFallbackRegistry = new TargetResolverRegistry();

function resolveRegistry(world?: World): TargetResolverRegistry {
  const target = world ?? WorldProvider.tryUseWorld();
  return target?.targetResolverRegistry ?? globalFallbackRegistry;
}

export function getGlobalFallbackTargetResolverRegistry(): TargetResolverRegistry {
  return globalFallbackRegistry;
}

export function registerTargetResolver(resolver: TargetResolver, world?: World): void {
  resolveRegistry(world).register(resolver);
}

export function registerTargetResolverWithScope(
  _scopeName: string,
  resolver: TargetResolver,
  world?: World,
): void {
  resolveRegistry(world).register(resolver);
}

export function resolveWithRegisteredTargetResolvers(
  input: unknown,
  ctx: TargetResolveContext,
  world?: World,
): TargetResolveResult | null {
  return resolveRegistry(world).resolve(input, ctx);
}
