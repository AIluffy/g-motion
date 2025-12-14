export class EntityManager {
  private nextId = 0;
  private activeEntities = new Set<number>();

  setOffset(offset: number): void {
    this.nextId = offset;
  }

  create(): number {
    const id = this.nextId++;
    this.activeEntities.add(id);
    return id;
  }

  destroy(id: number): void {
    this.activeEntities.delete(id);
  }

  exists(id: number): boolean {
    return this.activeEntities.has(id);
  }
}
