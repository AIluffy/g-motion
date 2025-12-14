export interface CustomGpuEasing {
  name: string;
  wgslFn: string; // Full WGSL function definition (fn name(t: f32) -> f32)
  id: number;
}

// Custom easing IDs start after built-in 0-30
const CUSTOM_BASE_ID = 31;
const customEasings: CustomGpuEasing[] = [];
let version = 0;

/**
 * Register a custom WGSL easing function for GPU path.
 * The provided WGSL must declare a function whose name matches the easing name.
 * Returns the assigned easing ID (starting at 31).
 */
export function registerCustomGpuEasing(name: string, wgslFn: string): number {
  const existing = customEasings.findIndex((e) => e.name === name);
  if (existing >= 0) {
    customEasings[existing] = { name, wgslFn, id: customEasings[existing].id };
    version++;
    return customEasings[existing].id;
  }

  const id = CUSTOM_BASE_ID + customEasings.length;
  customEasings.push({ name, wgslFn, id });
  version++;
  return id;
}

export function getCustomGpuEasings(): CustomGpuEasing[] {
  return [...customEasings];
}

export function getCustomEasingVersion(): number {
  return version;
}
