import { describe, it, expect } from 'vitest';
import { Registry, RegistryWithDefaults } from '../../src';

interface TestEntry {
  id: number;
  name: string;
  value?: number;
}

describe('Registry (shared)', () => {
  describe('basic operations', () => {
    it('register returns auto-incrementing ID', () => {
      const registry = new Registry<TestEntry>();
      const id1 = registry.register('a', { name: 'A' });
      const id2 = registry.register('b', { name: 'B' });

      expect(id1).toBe(0);
      expect(id2).toBe(1);
    });

    it('get returns entry with id', () => {
      const registry = new Registry<TestEntry>();
      registry.register('a', { name: 'A', value: 100 });

      const entry = registry.get('a');

      expect(entry).toBeDefined();
      expect(entry?.id).toBe(0);
      expect(entry?.name).toBe('A');
      expect(entry?.value).toBe(100);
    });

    it('get returns undefined for non-existing key', () => {
      const registry = new Registry<TestEntry>();

      const entry = registry.get('nonexistent');

      expect(entry).toBeUndefined();
    });

    it('has returns true for existing key', () => {
      const registry = new Registry<TestEntry>();
      registry.register('a', { name: 'A' });

      expect(registry.has('a')).toBe(true);
    });

    it('has returns false for non-existing key', () => {
      const registry = new Registry<TestEntry>();

      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('returns all entries with key field', () => {
      const registry = new Registry<TestEntry>();
      registry.register('a', { name: 'A' });
      registry.register('b', { name: 'B' });

      const all = registry.getAll();

      expect(all).toHaveLength(2);
      expect(all[0]?.key).toBe('a');
      expect(all[1]?.key).toBe('b');
    });

    it('returns empty array when empty', () => {
      const registry = new Registry<TestEntry>();

      const all = registry.getAll();

      expect(all).toEqual([]);
    });
  });

  describe('version tracking', () => {
    it('version increments on each registration', () => {
      const registry = new Registry<TestEntry>();
      expect(registry.getVersion()).toBe(0);

      registry.register('a', { name: 'A' });
      expect(registry.getVersion()).toBe(1);

      registry.register('b', { name: 'B' });
      expect(registry.getVersion()).toBe(2);
    });

    it('version increments when overwriting key', () => {
      const registry = new Registry<TestEntry>();
      registry.register('a', { name: 'A' });
      expect(registry.getVersion()).toBe(1);

      registry.register('a', { name: 'A-updated' });
      expect(registry.getVersion()).toBe(2);
    });
  });

  describe('clear', () => {
    it('clears all entries', () => {
      const registry = new Registry<TestEntry>();
      registry.register('a', { name: 'A' });
      registry.register('b', { name: 'B' });

      registry.clear();

      expect(registry.getAll()).toEqual([]);
      expect(registry.get('a')).toBeUndefined();
    });

    it('resets version to 0', () => {
      const registry = new Registry<TestEntry>();
      registry.register('a', { name: 'A' });
      registry.clear();

      expect(registry.getVersion()).toBe(0);
    });

    it('resets nextId to startId', () => {
      const registry = new Registry<TestEntry>();
      registry.register('a', { name: 'A' });

      registry.clear();

      expect(registry.peekNextId()).toBe(0);
    });
  });

  describe('custom startId', () => {
    it('starts ID from custom startId', () => {
      const registry = new Registry<TestEntry>({ startId: 100 });
      const id = registry.register('a', { name: 'A' });

      expect(id).toBe(100);
    });
  });

  describe('custom initialVersion', () => {
    it('starts with custom initialVersion', () => {
      const registry = new Registry<TestEntry>({ initialVersion: 10 });

      expect(registry.getVersion()).toBe(10);
    });
  });
});

describe('RegistryWithDefaults (shared)', () => {
  const defaults = {
    linear: 0,
    easeIn: 1,
    easeOut: 2,
  };

  describe('lookup', () => {
    it('returns default ID for default key', () => {
      const registry = new RegistryWithDefaults<TestEntry>({ defaults });

      const id = registry.lookup('linear');

      expect(id).toBe(0);
    });

    it('returns custom ID for registered key', () => {
      const registry = new RegistryWithDefaults<TestEntry>({ defaults });
      registry.register('custom', { name: 'Custom' });

      const id = registry.lookup('custom');

      expect(id).toBe(0);
    });

    it('returns undefined for non-existing key', () => {
      const registry = new RegistryWithDefaults<TestEntry>({ defaults });

      const id = registry.lookup('nonexistent');

      expect(id).toBeUndefined();
    });

    it('defaults take priority over custom', () => {
      const registry = new RegistryWithDefaults<TestEntry>({
        defaults: { foo: 100 },
      });
      registry.register('foo', { name: 'Custom Foo' });

      const id = registry.lookup('foo');

      expect(id).toBe(100);
    });
  });

  describe('getDefaults', () => {
    it('returns immutable defaults object', () => {
      const registry = new RegistryWithDefaults<TestEntry>({ defaults });

      const result = registry.getDefaults();

      expect(result).toBe(defaults);
    });
  });
});
