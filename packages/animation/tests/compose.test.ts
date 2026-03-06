import { describe, expect, it } from 'vitest';

import { compose } from '../src';

describe('compose()', () => {
  it('creates an immutable composition with filtered props and duration', () => {
    const fadeIn = compose({
      target: { opacity: 0 },
      duration: 600,
      opacity: [
        { time: 0, value: 0 },
        { time: 300, value: 1 },
      ],
      debugLabel: 'ignored',
    });

    expect(fadeIn.kind).toBe('composition');
    expect(fadeIn.target).toEqual({ opacity: 0 });
    expect(fadeIn.duration).toBe(300);
    expect(fadeIn.props).toEqual({
      opacity: [
        { time: 0, value: 0 },
        { time: 300, value: 1 },
      ],
    });
    expect(Object.isFrozen(fadeIn)).toBe(true);
    expect(Object.isFrozen(fadeIn.props)).toBe(true);
  });
});
