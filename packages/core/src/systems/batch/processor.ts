import { BatchCoordinator } from './batch-coordinator';
import type { GPUBatchConfig } from './types';

export class ComputeBatchProcessor extends BatchCoordinator {
  constructor(config: GPUBatchConfig = {}) {
    super(config);
  }
}
