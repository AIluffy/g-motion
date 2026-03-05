/**
 * GPU Batch Processing Status Query API
 *
 * Provides public methods to query the status and metrics of GPU batch processing.
 */

export interface GPUBatchStatus {
  enabled: boolean;
  webgpuAvailable: boolean;
  gpuInitialized: boolean;
  frameTimeMs?: number;
  outputFormatPoolStats?: unknown;
}

export type GPUBatchMetrics = object;

export type SystemTimingStat = object;

export type SystemTimings = Record<string, SystemTimingStat>;

type GPUMetricsProviderLike = {
  getStatus(): GPUBatchStatus;
  getMetrics(): GPUBatchMetrics[];
  clear(): void;
  getSystemTimings?(): SystemTimings;
};

type WebGPUStatusModule = {
  getGPUMetricsProvider: () => GPUMetricsProviderLike;
};

const defaultStatus: GPUBatchStatus = {
  enabled: false,
  webgpuAvailable: false,
  gpuInitialized: false,
  frameTimeMs: 0,
};

const fallbackMetricsProvider: GPUMetricsProviderLike = {
  getStatus: () => ({ ...defaultStatus }),
  getMetrics: () => [],
  clear: () => {},
  getSystemTimings: () => ({}),
};

let webgpuStatusModule: WebGPUStatusModule | null = null;
let webgpuStatusModuleLoadPromise: Promise<WebGPUStatusModule | null> | null = null;

async function getWebGPUStatusModule(): Promise<WebGPUStatusModule | null> {
  if (webgpuStatusModule) return webgpuStatusModule;
  if (webgpuStatusModuleLoadPromise) return webgpuStatusModuleLoadPromise;

  webgpuStatusModuleLoadPromise = import('@g-motion/webgpu')
    .then((mod) => {
      webgpuStatusModule = mod;
      return mod;
    })
    .catch(() => null)
    .finally(() => {
      webgpuStatusModuleLoadPromise = null;
    });

  return webgpuStatusModuleLoadPromise;
}

function getGPUMetricsProviderSafe(): GPUMetricsProviderLike {
  const provider = webgpuStatusModule?.getGPUMetricsProvider();
  if (provider) return provider;

  void getWebGPUStatusModule();
  return fallbackMetricsProvider;
}

/**
 * Check if WebGPU is available in the current browser.
 * @returns true if navigator.gpu is available
 */
export function isGPUAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'gpu' in navigator;
}

/**
 * Get the current GPU batch processing status.
 * @returns GPU batch status information
 */
export function getGPUBatchStatus(): GPUBatchStatus {
  const provider = getGPUMetricsProviderSafe();
  const status = provider.getStatus();
  const webgpuAvailable = status.webgpuAvailable || isGPUAvailable();

  return { ...status, webgpuAvailable };
}

/**
 * Get all recorded GPU batch metrics.
 * @returns Array of GPU batch metrics, newest first
 */
export function getGPUMetrics(): GPUBatchMetrics[] {
  return getGPUMetricsProviderSafe().getMetrics();
}

/**
 * Get the most recent GPU batch metric.
 * @returns Latest GPU batch metric, or null if none available
 */
export function getLatestGPUMetric(): GPUBatchMetrics | null {
  const metrics = getGPUMetrics();
  return metrics.length > 0 ? (metrics[0] ?? null) : null;
}

/**
 * Clear all recorded GPU batch metrics.
 * Useful for benchmarking to avoid old data.
 */
export function clearGPUMetrics(): void {
  getGPUMetricsProviderSafe().clear();
}

export function getSystemTimings(): SystemTimings {
  const provider = getGPUMetricsProviderSafe();
  return provider.getSystemTimings?.() ?? {};
}
