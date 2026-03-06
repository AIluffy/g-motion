import { afterEach, describe, expect, it } from 'vitest';
import { World } from '../src/runtime/world';
import {
  clearPluginRegistry,
  isPluginRegistered,
  registerPlugin,
} from '../src/runtime/plugin-registry';
import { WorldProvider } from '../src/runtime/world-provider';
import type { MotionPlugin } from '../src/runtime/plugin';

const springPlugin: MotionPlugin = {
  name: 'spring',
  version: '0.0.0-test',
  manifest: {},
};

afterEach(() => {
  WorldProvider.reset();
  clearPluginRegistry();
});

describe('World-scoped plugin registry isolation', () => {
  it('keeps plugin registration isolated between world instances', () => {
    const worldA = new World();
    const worldB = new World();

    registerPlugin(springPlugin, worldA);

    expect(isPluginRegistered('spring', worldA)).toBe(true);
    expect(isPluginRegistered('spring', worldB)).toBe(false);
  });

  it('copies global fallback plugins into newly created world', () => {
    registerPlugin(springPlugin);

    const world = new World();

    expect(isPluginRegistered('spring', world)).toBe(true);
  });
});
