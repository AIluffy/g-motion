import { EasingRegistry, type EasingEntry } from './easing-registry';

export { EasingRegistry, type EasingEntry };

const defaultEasingRegistry = new EasingRegistry();

export function getEasingId(name?: string): number {
  return defaultEasingRegistry.getId(name ?? '');
}
