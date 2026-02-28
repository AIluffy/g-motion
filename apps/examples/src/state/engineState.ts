import { atom } from 'jotai';

export type GpuMode = 'auto' | 'always' | 'never';

export const engineSpeedAtom = atom(1);
export const engineFpsAtom = atom(60);
export const engineGpuModeAtom = atom<GpuMode>('auto');

export const gpuThresholdAtom = atom(1000);
export const gpuEasingEnabledAtom = atom(true);
export const metricsSamplingRateAtom = atom(1);
export const workSlicingEnabledAtom = atom(true);
export const workSlicingInterpolationAtom = atom(8);
export const workSlicingBatchAtom = atom(8);

export type EngineMetricsSnapshot = {
  fps: number;
  frameMs: number;
  lastMs: number;
  gpuAvailable: boolean;
  batchEntityCount: number | null;
  gpuComputeMs?: number;
  gpuComputeLastMs?: number;
  gpuBatchCount?: number;
  systemTimings?: Array<{ name: string; avgMs: number; lastMs: number }>;
  archetypeTimings?: Array<{
    id: string;
    avgMs: number;
    minMs: number;
    maxMs: number;
    dispatchCount: number;
    entityCount: number;
  }>;
  currentMemoryUsageBytes?: number;
  peakMemoryUsageBytes?: number;
};

export const engineMetricsAtom = atom<EngineMetricsSnapshot | null>(null);
export const activeEntityCountAtom = atom(0);
