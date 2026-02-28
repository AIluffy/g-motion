export type BatchStatisticsSnapshot = {
  totalBatches: number;
  totalEntitiesProcessed: number;
  totalResultsCached: number;
  averageBatchSize: number;
  archetypeCount: number;
  dispatchCount: number;
};

export class BatchStatistics {
  private stats: BatchStatisticsSnapshot = BatchStatistics.empty();

  onLegacyBatchCreated(entityCount: number): void {
    this.stats.totalBatches += 1;
    this.stats.totalEntitiesProcessed += entityCount;
    this.stats.averageBatchSize = this.stats.totalEntitiesProcessed / this.stats.totalBatches;
  }

  addResultsCached(count: number): void {
    this.stats.totalResultsCached += count;
  }

  setArchetypeCount(count: number): void {
    this.stats.archetypeCount = count;
  }

  incrementDispatchCount(): void {
    this.stats.dispatchCount += 1;
  }

  getSnapshot(): BatchStatisticsSnapshot {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = BatchStatistics.empty();
  }

  private static empty(): BatchStatisticsSnapshot {
    return {
      totalBatches: 0,
      totalEntitiesProcessed: 0,
      totalResultsCached: 0,
      averageBatchSize: 0,
      archetypeCount: 0,
      dispatchCount: 0,
    };
  }
}
