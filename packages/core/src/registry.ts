import { ComponentDef } from './plugin';

export class ComponentRegistry {
  private components = new Map<string, ComponentDef>();
  private nextId = 0;
  private componentIds = new Map<string, number>();

  register(name: string, definition: ComponentDef): number {
    if (this.components.has(name)) {
      return this.componentIds.get(name)!;
    }
    const id = this.nextId++;
    this.components.set(name, definition);
    this.componentIds.set(name, id);
    return id;
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
