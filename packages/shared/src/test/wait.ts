/**
 * Test utilities
 */

/**
 * Returns a Promise that resolves after the specified milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
