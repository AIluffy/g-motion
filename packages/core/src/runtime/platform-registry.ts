import type { PlatformCapabilities, PlatformProvider } from '@g-motion/protocol';

const noopCapabilities: PlatformCapabilities = {
  hasDocument: () => false,
  hasWindow: () => false,
};

let platformProvider: PlatformProvider | null = null;

export function registerPlatformProvider(provider: PlatformProvider | null): void {
  platformProvider = provider;
}

export function getPlatformCapabilities(): PlatformCapabilities {
  return platformProvider?.getCapabilities() ?? noopCapabilities;
}
