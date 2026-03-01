import { describe, it, expect } from 'vitest';
import { TimelineTracksMap } from '../../src';
import type { Track } from '../../src/types/animation';

describe('TimelineTracksMap (shared)', () => {
  const createTrack = (_name: string): Track => [
    { time: 0, startTime: 0, startValue: 0, endValue: 100 },
    { time: 1000, startTime: 0, startValue: 0, endValue: 100 },
  ];

  describe('constructor', () => {
    it('initializes empty when no entries provided', () => {
      const tracks = new TimelineTracksMap();
      expect(tracks.flatKeys).toEqual([]);
      expect(tracks.flatValues).toEqual([]);
      expect(tracks.size).toBe(0);
    });

    it('initializes with entries via constructor', () => {
      const entries: Array<[string, Track]> = [
        ['x', createTrack('x')],
        ['y', createTrack('y')],
      ];
      const tracks = new TimelineTracksMap(entries);
      expect(tracks.flatKeys).toEqual(['x', 'y']);
      expect(tracks.flatValues).toHaveLength(2);
      expect(tracks.size).toBe(2);
    });
  });

  describe('set', () => {
    it('adds new key to flatKeys and flatValues', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('x', createTrack('x'));

      expect(tracks.flatKeys).toEqual(['x']);
      expect(tracks.flatValues).toHaveLength(1);
      expect(tracks.size).toBe(1);
    });

    it('appends new key to end of flatKeys', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('a', createTrack('a'));
      tracks.set('b', createTrack('b'));
      tracks.set('c', createTrack('c'));

      expect(tracks.flatKeys).toEqual(['a', 'b', 'c']);
    });

    it('updates flatValues when key exists', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('x', createTrack('x'));
      const newTrack = createTrack('x-updated');
      tracks.set('x', newTrack);

      expect(tracks.flatKeys).toEqual(['x']);
      expect(tracks.flatKeys.length).toBe(1);
      expect(tracks.size).toBe(1);
      expect(tracks.flatValues[0]).toBe(newTrack);
    });
  });

  describe('get / has', () => {
    it('returns value for existing key', () => {
      const tracks = new TimelineTracksMap();
      const track = createTrack('x');
      tracks.set('x', track);

      expect(tracks.get('x')).toBe(track);
    });

    it('returns undefined for non-existing key', () => {
      const tracks = new TimelineTracksMap();
      expect(tracks.get('nonexistent')).toBeUndefined();
    });

    it('returns true for existing key in has()', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('x', createTrack('x'));

      expect(tracks.has('x')).toBe(true);
    });

    it('returns false for non-existing key in has()', () => {
      const tracks = new TimelineTracksMap();
      expect(tracks.has('nonexistent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('deletes existing key and returns true', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('x', createTrack('x'));

      const result = tracks.delete('x');

      expect(result).toBe(true);
      expect(tracks.has('x')).toBe(false);
      expect(tracks.size).toBe(0);
    });

    it('returns false for non-existing key', () => {
      const tracks = new TimelineTracksMap();

      const result = tracks.delete('nonexistent');

      expect(result).toBe(false);
    });

    it('deletes first element (index=0)', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('a', createTrack('a'));
      tracks.set('b', createTrack('b'));
      tracks.set('c', createTrack('c'));

      tracks.delete('a');

      expect(tracks.flatKeys).toContain('b');
      expect(tracks.flatKeys).toContain('c');
      expect(tracks.flatKeys).not.toContain('a');
      expect(tracks.size).toBe(2);
    });

    it('deletes last element (index=length-1)', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('a', createTrack('a'));
      tracks.set('b', createTrack('b'));
      tracks.set('c', createTrack('c'));

      tracks.delete('c');

      expect(tracks.flatKeys).toEqual(['a', 'b']);
      expect(tracks.size).toBe(2);
    });

    it('deletes only element', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('x', createTrack('x'));

      tracks.delete('x');

      expect(tracks.flatKeys).toEqual([]);
      expect(tracks.flatValues).toEqual([]);
      expect(tracks.size).toBe(0);
    });

    it('deleting all elements results in same state as clear()', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('a', createTrack('a'));
      tracks.set('b', createTrack('b'));

      tracks.delete('a');
      tracks.delete('b');

      expect(tracks.flatKeys.length).toBe(0);
      expect(tracks.flatValues.length).toBe(0);
      expect(tracks.size).toBe(0);
    });
  });

  describe('clear', () => {
    it('clears all entries', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('x', createTrack('x'));
      tracks.set('y', createTrack('y'));

      tracks.clear();

      expect(tracks.flatKeys).toEqual([]);
      expect(tracks.flatValues).toEqual([]);
      expect(tracks.size).toBe(0);
    });

    it('allows adding after clear', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('x', createTrack('x'));
      tracks.clear();

      tracks.set('y', createTrack('y'));

      expect(tracks.flatKeys).toEqual(['y']);
      expect(tracks.size).toBe(1);
    });
  });

  describe('Map native methods compatibility', () => {
    it('forEach iterates in flatKeys order', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('a', createTrack('a'));
      tracks.set('b', createTrack('b'));
      tracks.set('c', createTrack('c'));

      const keys: string[] = [];
      tracks.forEach((_, key) => {
        keys.push(key);
      });

      expect(keys).toEqual(['a', 'b', 'c']);
    });

    it('entries() returns in flatKeys order', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('a', createTrack('a'));
      tracks.set('b', createTrack('b'));

      const entries = Array.from(tracks.entries());
      expect(entries[0][0]).toBe('a');
      expect(entries[1][0]).toBe('b');
    });

    it('keys() returns in flatKeys order', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('a', createTrack('a'));
      tracks.set('b', createTrack('b'));

      const keys = Array.from(tracks.keys());
      expect(keys).toEqual(['a', 'b']);
    });

    it('values() returns in flatKeys order', () => {
      const tracks = new TimelineTracksMap();
      const trackA = createTrack('a');
      const trackB = createTrack('b');
      tracks.set('a', trackA);
      tracks.set('b', trackB);

      const values = Array.from(tracks.values());
      expect(values[0]).toBe(trackA);
      expect(values[1]).toBe(trackB);
    });

    it('[Symbol.iterator] iterates in flatKeys order', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('a', createTrack('a'));
      tracks.set('b', createTrack('b'));

      const entries = Array.from(tracks[Symbol.iterator]());
      expect(entries[0][0]).toBe('a');
      expect(entries[1][0]).toBe('b');
    });

    it('for...of iterates in flatKeys order', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('a', createTrack('a'));
      tracks.set('b', createTrack('b'));

      const keys: string[] = [];
      // eslint-disable-next-line no-restricted-syntax
      for (const [key] of tracks) {
        keys.push(key);
      }

      expect(keys).toEqual(['a', 'b']);
    });
  });

  describe('readonly view', () => {
    it('flatKeys returns same array reference after mutation', () => {
      const tracks = new TimelineTracksMap();
      const flatKeysRef = tracks.flatKeys;

      tracks.set('x', createTrack('x'));

      expect(tracks.flatKeys).toBe(flatKeysRef);
    });

    it('flatValues returns same array reference after mutation', () => {
      const tracks = new TimelineTracksMap();
      const flatValuesRef = tracks.flatValues;

      tracks.set('x', createTrack('x'));

      expect(tracks.flatValues).toBe(flatValuesRef);
    });

    it('flatKeys cannot be pushed to (type check)', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('x', createTrack('x'));

      // @ts-expect-error - flatKeys is readonly
      tracks.flatKeys.push('y');
    });
  });

  describe('indexByKey', () => {
    it('maintains correct index after adding elements', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('a', createTrack('a'));
      tracks.set('b', createTrack('b'));

      expect(tracks.get('a')).toBeDefined();
      expect(tracks.get('b')).toBeDefined();
    });

    it('maintains correct index after delete', () => {
      const tracks = new TimelineTracksMap();
      tracks.set('a', createTrack('a'));
      tracks.set('b', createTrack('b'));
      tracks.set('c', createTrack('c'));

      tracks.delete('b');

      expect(tracks.get('a')).toBeDefined();
      expect(tracks.get('c')).toBeDefined();
      expect(tracks.get('b')).toBeUndefined();
    });
  });
});
