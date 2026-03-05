import { beforeEach, describe, expect, it } from 'vitest';
import { clearPluginRegistry, getRegisteredPlugins, registerPlugin } from '@g-motion/core';
import { inertiaPlugin } from '../src';

describe('inertia plugin registration', () => {
  beforeEach(() => {
    clearPluginRegistry();
  });

  it('does not auto-register on import', () => {
    expect(inertiaPlugin.name).toBe('inertia');
    expect(getRegisteredPlugins()).toEqual([]);
  });

  it('registers only when explicitly requested', () => {
    expect(registerPlugin(inertiaPlugin)).toBe(true);
    expect(getRegisteredPlugins().map((plugin) => plugin.name)).toEqual(['inertia']);
  });
});
