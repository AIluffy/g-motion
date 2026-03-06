import { ComponentDef, ComponentType } from '../runtime/plugin';

export class ComponentRegistry {
  private components = new Map<string, ComponentDef>();
  private nextId = 0;
  private componentIds = new Map<string, number>();

  register(name: string, definition: ComponentDef): number {
    if (this.components.has(name)) {
      const existing = this.components.get(name)!;
      if (this.isSchemaSame(existing.schema, definition.schema)) {
        return this.componentIds.get(name)!;
      }

      throw new Error(
        `[g-motion] Component "${name}" is already registered with a different schema.\n` +
          `Existing: ${JSON.stringify(existing.schema)}\n` +
          `Incoming: ${JSON.stringify(definition.schema)}\n` +
          `If this is intentional, call unregister("${name}") first.`,
      );
    }

    const id = this.nextId++;
    this.components.set(name, definition);
    this.componentIds.set(name, id);
    return id;
  }

  private isSchemaSame(
    a: Record<string, ComponentType>,
    b: Record<string, ComponentType>,
  ): boolean {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k, i) => k === keysB[i] && a[k] === b[k]);
  }

  get(name: string): ComponentDef | undefined {
    return this.components.get(name);
  }

  getId(name: string): number | undefined {
    return this.componentIds.get(name);
  }

  has(name: string): boolean {
    return this.components.has(name);
  }
}
