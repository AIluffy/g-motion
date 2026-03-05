import { beforeEach, describe, expect, it } from 'vitest';
import { clearPluginRegistry, getRegisteredPlugins, registerPlugin } from '@g-motion/core';
import { springPlugin } from '../src';

describe('spring plugin registration', () => {
  beforeEach(() => {
    clearPluginRegistry();
  });

  it('does not auto-register on import', () => {
    expect(springPlugin.name).toBe('spring');
    expect(getRegisteredPlugins()).toEqual([]);
  });

  it('registers only when explicitly requested', () => {
    expect(registerPlugin(springPlugin)).toBe(true);
    expect(getRegisteredPlugins().map((plugin) => plugin.name)).toEqual(['spring']);
  });
});
