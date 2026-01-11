import { BatchCoordinator } from './batchCoordinator';
import type { GPUBatchConfig } from './types';

export class ComputeBatchProcessor extends BatchCoordinator {
  constructor(config: GPUBatchConfig = {}) {
    super(config);
  }
}
