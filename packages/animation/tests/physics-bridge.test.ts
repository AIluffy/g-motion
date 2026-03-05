import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearPluginRegistry, registerPlugin, type MotionPlugin } from '@g-motion/core';
import { assertPhysicsPluginInstalled } from '../src/runtime/physics-bridge';

const springPlugin: MotionPlugin = {
  name: 'spring',
  version: 'test',
  manifest: {},
};

describe('physics plugin bridge', () => {
  beforeEach(() => {
    clearPluginRegistry();
  });

  afterEach(() => {
    clearPluginRegistry();
  });

  it('throws a clear error when spring plugin is not registered', () => {
    expect(() => assertPhysicsPluginInstalled('spring', 'spring')).toThrow(
      /@g-motion\/plugin-spring/,
    );
  });

  it('passes when spring plugin is registered', () => {
    registerPlugin(springPlugin);
    expect(() => assertPhysicsPluginInstalled('spring', 'spring')).not.toThrow();
  });
});
