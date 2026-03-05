export interface PlatformCapabilities {
  hasDocument(): boolean;
  hasWindow(): boolean;
  createElement?(tag: string): unknown;
}

export interface PlatformProvider {
  getCapabilities(): PlatformCapabilities;
}
