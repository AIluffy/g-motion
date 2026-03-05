import type { TargetResolveContext, TargetResolveResult, TargetResolver } from '@g-motion/protocol';

const targetResolvers: TargetResolver[] = [];

export function registerTargetResolver(resolver: TargetResolver): void {
  targetResolvers.push(resolver);
}

export function registerTargetResolverWithScope(
  _scopeName: string,
  resolver: TargetResolver,
): void {
  targetResolvers.push(resolver);
}

export function resolveWithRegisteredTargetResolvers(
  input: unknown,
  ctx: TargetResolveContext,
): TargetResolveResult | null {
  if (targetResolvers.length === 0) {
    return null;
  }

  for (const resolver of targetResolvers) {
    const resolved = resolver(input, ctx);
    if (resolved && resolved.length > 0) {
      return resolved;
    }
  }
  return null;
}
