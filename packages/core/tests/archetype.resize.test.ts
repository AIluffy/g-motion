import { describe, it, expect } from 'vitest';
import { Archetype } from '../src/archetype';
import type { ComponentDef } from '../src/plugin';

describe('Archetype resize preserves component data', () => {
  it('copies existing entries when resizing', () => {
    const components = new Map<string, ComponentDef>();
    components.set('MyComp', { schema: { value: 'object' } });

    const archetype = new Archetype('test', components);

    // Add a few entities
    archetype.addEntity(1, { MyComp: { value: 10 } });
    archetype.addEntity(2, { MyComp: { value: 20 } });
    archetype.addEntity(3, { MyComp: { value: 30 } });

    const before1 = archetype.getEntityData(1, 'MyComp');
    const before2 = archetype.getEntityData(2, 'MyComp');
    const before3 = archetype.getEntityData(3, 'MyComp');

    // Force resize
    archetype.resize(4096);

    const after1 = archetype.getEntityData(1, 'MyComp');
    const after2 = archetype.getEntityData(2, 'MyComp');
    const after3 = archetype.getEntityData(3, 'MyComp');

    expect(after1).toEqual(before1);
    expect(after2).toEqual(before2);
    expect(after3).toEqual(before3);
    expect(archetype.entityCount).toBe(3);
  });
});
