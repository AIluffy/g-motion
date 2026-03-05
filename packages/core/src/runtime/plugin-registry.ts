import type { MotionPlugin } from '@g-motion/protocol';

const pluginRegistry: MotionPlugin[] = [];
const pluginNames = new Set<string>();

export function registerPlugin(plugin: MotionPlugin): boolean {
  if (pluginNames.has(plugin.name)) {
    return false;
  }
  pluginRegistry.push(plugin);
  pluginNames.add(plugin.name);
  return true;
}

export function getRegisteredPlugins(): readonly MotionPlugin[] {
  return pluginRegistry;
}

export function clearPluginRegistry(): void {
  pluginRegistry.length = 0;
  pluginNames.clear();
}

export function isPluginRegistered(pluginName: string): boolean {
  return pluginNames.has(pluginName);
}
