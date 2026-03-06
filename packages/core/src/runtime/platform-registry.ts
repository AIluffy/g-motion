import type { PlatformCapabilities, PlatformProvider } from '@g-motion/protocol';
import type { World } from './world';
import { WorldProvider } from './world-provider';

const noopCapabilities: PlatformCapabilities = {
  hasDocument: () => false,
  hasWindow: () => false,
};

export class PlatformRegistry {
  private provider: PlatformProvider | null = null;

  registerProvider(provider: PlatformProvider | null): void {
    this.provider = provider;
  }

  getCapabilities(): PlatformCapabilities {
    return this.provider?.getCapabilities() ?? noopCapabilities;
  }

  copyFrom(source: PlatformRegistry): void {
    this.provider = source.provider;
  }
}

const globalFallbackRegistry = new PlatformRegistry();

function resolveRegistry(world?: World): PlatformRegistry {
  const target = world ?? WorldProvider.tryUseWorld();
  return target?.platformRegistry ?? globalFallbackRegistry;
}

export function getGlobalFallbackPlatformRegistry(): PlatformRegistry {
  return globalFallbackRegistry;
}

export function registerPlatformProvider(provider: PlatformProvider | null, world?: World): void {
  resolveRegistry(world).registerProvider(provider);
}

export function getPlatformCapabilities(world?: World): PlatformCapabilities {
  return resolveRegistry(world).getCapabilities();
}
