import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeConfig } from '../src/plugin';
import {
  isWebGPUIODebugEnabled,
  resolveKeyframeSearchOptimizedFlag,
  resolveWebGPUReadbackMode,
} from '../src/systems/webgpu/system-config';

describe('MotionAppConfig normalization', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('prefers nested config over deprecated fields', () => {
    const normalized = normalizeConfig({
      keyframe: { searchOptimized: false },
      keyframeSearchOptimized: true,
    });
    expect(normalized.keyframe?.searchOptimized).toBe(false);
    expect(resolveKeyframeSearchOptimizedFlag(normalized)).toBe(false);
  });

  it('maps deprecated fields into nested config', () => {
    const normalized = normalizeConfig({ webgpuReadbackMode: 'visible' });
    expect(normalized.webgpu?.readbackMode).toBe('visible');
    expect(resolveWebGPUReadbackMode(normalized)).toBe('visible');
  });

  it('warns when deprecated fields are used', () => {
    normalizeConfig({ debugWebGPUIO: true, webgpuCulling: { enabled: true } });
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('debugWebGPUIO'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('webgpuCulling'));
  });

  it('exposes debug flags through nested config', () => {
    const normalized = normalizeConfig({ debugWebGPUIO: true });
    expect(isWebGPUIODebugEnabled(normalized)).toBe(true);
  });
});
