import { describe, expect, it } from 'vitest';
import { applyCodemod } from '../codemod-v3';

describe('codemod-v3', () => {
  it('renames easing to ease', () => {
    const input = "motion(el).mark({ to: { x: 100 }, easing: 'easeOutQuad' });";
    const output = applyCodemod(input);
    expect(output).toContain("ease: 'easeOutQuad'");
    expect(output).not.toContain('easing:');
  });

  it('renames time to at', () => {
    const input = 'motion(el).mark({ to: { x: 100 }, time: 500 });';
    const output = applyCodemod(input);
    expect(output).toContain('at: 500');
    expect(output).not.toContain('time:');
  });

  it('handles both fields in one object', () => {
    const input = "mark({ time: 200, easing: 'linear', to: { opacity: 1 } })";
    const output = applyCodemod(input);
    expect(output).toBe("mark({ at: 200, ease: 'linear', to: { opacity: 1 } })");
  });
});
