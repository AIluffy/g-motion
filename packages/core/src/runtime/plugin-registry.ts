import type { MotionPlugin } from './plugin';
import type { World } from './world';
import { WorldProvider } from './world-provider';

export class PluginRegistry {
  private readonly plugins: MotionPlugin[] = [];
  private readonly pluginNames = new Set<string>();

  register(plugin: MotionPlugin): boolean {
    if (this.pluginNames.has(plugin.name)) {
      return false;
    }
    this.plugins.push(plugin);
    this.pluginNames.add(plugin.name);
    return true;
  }

  isRegistered(pluginName: string): boolean {
    return this.pluginNames.has(pluginName);
  }

  getAll(): readonly MotionPlugin[] {
    return this.plugins;
  }

  clear(): void {
    this.plugins.length = 0;
    this.pluginNames.clear();
  }

  cloneFrom(source: PluginRegistry): void {
    for (const plugin of source.getAll()) {
      this.register(plugin);
    }
  }
}

const globalFallbackRegistry = new PluginRegistry();

function resolveRegistry(world?: World): PluginRegistry {
  const target = world ?? WorldProvider.tryUseWorld();
  return target?.pluginRegistry ?? globalFallbackRegistry;
}

export function getGlobalFallbackPluginRegistry(): PluginRegistry {
  return globalFallbackRegistry;
}

export function registerPlugin(plugin: MotionPlugin, world?: World): boolean {
  return resolveRegistry(world).register(plugin);
}

export function getRegisteredPlugins(world?: World): readonly MotionPlugin[] {
  return resolveRegistry(world).getAll();
}

export function clearPluginRegistry(world?: World): void {
  resolveRegistry(world).clear();
}

export function isPluginRegistered(pluginName: string, world?: World): boolean {
  return resolveRegistry(world).isRegistered(pluginName);
}
