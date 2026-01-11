export class EntityIdLeasePool {
  private nextEntityIdsLeaseId = 1;
  private entityIdsLeases = new Map<number, Int32Array>();
  private entityIdsInFlight = new Set<number>();
  private entityIdsPool: Int32Array[] = [];

  acquire(minLength: number): { leaseId: number; buffer: Int32Array } {
    const len = Math.max(1, Math.floor(minLength));
    let pickedIndex = -1;
    let buffer: Int32Array | undefined;
    for (let i = 0; i < this.entityIdsPool.length; i++) {
      const candidate = this.entityIdsPool[i];
      if (candidate.length >= len) {
        pickedIndex = i;
        buffer = candidate;
        break;
      }
    }
    if (!buffer) {
      let cap = 16;
      while (cap < len) cap *= 2;
      buffer = new Int32Array(cap);
    } else {
      this.entityIdsPool.splice(pickedIndex, 1);
    }

    const leaseId = this.nextEntityIdsLeaseId++;
    this.entityIdsLeases.set(leaseId, buffer);
    return { leaseId, buffer };
  }

  markInFlight(leaseId: number): void {
    if (!this.entityIdsLeases.has(leaseId)) return;
    this.entityIdsInFlight.add(leaseId);
  }

  release(leaseId: number): void {
    const buffer = this.entityIdsLeases.get(leaseId);
    if (!buffer) return;
    this.entityIdsInFlight.delete(leaseId);
    this.entityIdsLeases.delete(leaseId);
    this.entityIdsPool.push(buffer);
  }

  isInFlight(leaseId: number): boolean {
    return this.entityIdsInFlight.has(leaseId);
  }
}
