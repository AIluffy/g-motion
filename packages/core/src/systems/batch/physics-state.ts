/**
 * Physics State Management
 *
 * Manages physics state version tracking and layout signatures per archetype.
 */

const physicsStateVersionByArchetype = new Map<string, number>();
const physicsLayoutSigByArchetype = new Map<string, number>();

export function getPhysicsStateVersionByArchetype(): Map<string, number> {
  return physicsStateVersionByArchetype;
}

export function setPhysicsStateVersionByArchetype(archetypeId: string, version: number): void {
  physicsStateVersionByArchetype.set(archetypeId, version);
}

export function getPhysicsLayoutSigByArchetype(): Map<string, number> {
  return physicsLayoutSigByArchetype;
}

export function setPhysicsLayoutSigByArchetype(archetypeId: string, sig: number): void {
  physicsLayoutSigByArchetype.set(archetypeId, sig);
}
