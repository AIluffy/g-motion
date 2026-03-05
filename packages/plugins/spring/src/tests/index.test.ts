import { beforeEach, describe, expect, it } from 'vitest';
import { clearPluginRegistry, getRegisteredPlugins, registerPlugin } from '@g-motion/core';
import { springPlugin } from '../index';

describe('spring plugin source entry', () => {
  beforeEach(() => {
    clearPluginRegistry();
  });

  it('keeps registry empty until registerPlugin is called', () => {
    expect(springPlugin.name).toBe('spring');
    expect(getRegisteredPlugins()).toEqual([]);

    registerPlugin(springPlugin);
    expect(getRegisteredPlugins().map((plugin) => plugin.name)).toEqual(['spring']);
  });
});
