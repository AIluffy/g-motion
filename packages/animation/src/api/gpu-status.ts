import {
  GPUBatchMetric,
  GPUBatchStatus as CoreGPUBatchStatus,
  SystemTimingStat,
  getGPUMetricsProvider,
} from '@g-motion/core';

/**
 * GPU Batch Processing Status Query API
 *
 * Provides public methods to query the status and metrics of GPU batch processing.
 */

export type GPUBatchStatus = CoreGPUBatchStatus;
export type GPUBatchMetrics = GPUBatchMetric;

export type SystemTimings = Record<string, SystemTimingStat>;

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
  const provider = getGPUMetricsProvider();
  const status = provider.getStatus();
  const webgpuAvailable = status.webgpuAvailable || isGPUAvailable();

  return { ...status, webgpuAvailable };
}

/**
 * Get all recorded GPU batch metrics.
 * @returns Array of GPU batch metrics, newest first
 */
export function getGPUMetrics(): GPUBatchMetrics[] {
  return getGPUMetricsProvider().getMetrics();
}

/**
 * Get the most recent GPU batch metric.
 * @returns Latest GPU batch metric, or null if none available
 */
export function getLatestGPUMetric(): GPUBatchMetrics | null {
  const metrics = getGPUMetrics();
  return metrics.length > 0 ? metrics[0] : null;
}

/**
 * Clear all recorded GPU batch metrics.
 * Useful for benchmarking to avoid old data.
 */
export function clearGPUMetrics(): void {
  getGPUMetricsProvider().clear();
}

export function getSystemTimings(): SystemTimings {
  const provider = getGPUMetricsProvider() as any;
  return (provider.getSystemTimings?.() as SystemTimings | undefined) ?? {};
}
