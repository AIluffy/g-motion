import { expect, test } from 'vitest';
import { DOMPlugin } from '../src/index';

test('DOMPlugin should have correct name and version', () => {
  expect(DOMPlugin.name).toBe('DOMPlugin');
  expect(DOMPlugin.version).toBe('0.0.0');
  expect(DOMPlugin.manifest?.setup).toBeDefined();
});
