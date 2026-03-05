import { panic, EasingRegistry, type EasingEntry } from '@g-motion/shared';

export { EasingRegistry, type EasingEntry };

export const globalEasingRegistry = new EasingRegistry();

export function registerGpuEasing(wgslFn: string): string;
export function registerGpuEasing(name: string, wgslCode: string): EasingEntry;
export function registerGpuEasing(nameOrWgsl: string, wgslCode?: string): string | EasingEntry {
  if (wgslCode !== undefined) {
    return globalEasingRegistry.register(nameOrWgsl, wgslCode);
  }

  const wgslFn = nameOrWgsl;
  const match = wgslFn.match(/fn\s+(\w+)\s*\(/);
  if (!match) {
    panic(
      'Invalid WGSL easing: missing function declaration (expected: fn name(t: f32) -> f32 { ... })',
      { wgslFn },
    );
  }
  const name = match[1];
  globalEasingRegistry.register(name, wgslFn);
  return name;
}

export function getCustomEasingVersion(): number {
  return globalEasingRegistry.version;
}

export function getCustomGpuEasings(): ReadonlyArray<{ name: string; wgslFn: string; id: number }> {
  return globalEasingRegistry.getCustomGpuEasings();
}

export function __resetCustomEasings(): void {
  globalEasingRegistry.reset();
}
