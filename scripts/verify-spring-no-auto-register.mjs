import assert from 'node:assert/strict';
import { clearPluginRegistry, getRegisteredPlugins } from '@g-motion/core';
import { springPlugin } from '@g-motion/plugin-spring';

clearPluginRegistry();
assert.equal(springPlugin.name, 'spring');
assert.deepEqual(getRegisteredPlugins(), []);

console.log('spring plugin import does not auto-register');
