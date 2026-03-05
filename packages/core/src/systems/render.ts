import { createDebugger } from '@g-motion/shared';
import { SystemContext, SystemDef } from '../index';
import { getRendererName } from '../render/renderer-code';
import { extractTransformTypedBuffers } from '../utils/archetype-helpers';
import { getRendererGroupCache } from './renderer-group-cache';

import type { Archetype, ComponentValue } from '../ecs/archetype';
import type { RendererBatchContext } from '../runtime/plugin';

type TransformTypedBuffers = ReturnType<typeof extractTransformTypedBuffers>;
type TransformTypedPayload = { index: number; buffers: TransformTypedBuffers };
type ComponentsScratchValue = ComponentValue | TransformTypedPayload | undefined;

type RenderBufferEntry = {
  rendererId: string;
  rendererCode?: number;
  target: unknown;
  version?: number;
  renderedVersion?: number;
};

const RENDER_SYSTEM_ORDER = 30;
const RENDERED_VERSION_UNSET = -1;
const missingRendererWarned = new Set<string>();
const rendererGroupCache = getRendererGroupCache();
const componentNamesScratch: string[] = [];
const componentBuffersScratch: Array<Array<ComponentValue | undefined>> = [];
const warn = createDebugger('RenderSystem', 'warn');

function hasAnyTransformTypedBuffers(transformTypedBuffers: TransformTypedBuffers): boolean {
  for (const k in transformTypedBuffers) {
    if (transformTypedBuffers[k]) {
      return true;
    }
  }
  return false;
}

function populateComponentScratchBuffers(
  componentBufferMap: Map<string, Array<ComponentValue | undefined>>,
): void {
  let componentCount = 0;
  for (const [name, buffer] of componentBufferMap) {
    componentNamesScratch[componentCount] = name;
    componentBuffersScratch[componentCount] = buffer;
    componentCount++;
  }
  componentNamesScratch.length = componentCount;
  componentBuffersScratch.length = componentCount;
}

function markGroupRenderedVersion(renderBuffer: Array<unknown>, indices: Int32Array): void {
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i]!;
    const r = renderBuffer[index] as { version?: number; renderedVersion?: number };
    r.renderedVersion = r.version ?? 0;
  }
}

function handleGroupUpdateError(groupKey: string | number, archetypeId: string, e: unknown): void {
  warn(`Renderer '${String(groupKey)}' update failed; skipping group.`, {
    systemName: 'RenderSystem',
    rendererId: String(groupKey),
    archetypeId,
    originalError: e instanceof Error ? e.message : String(e),
  });
}

function collectActiveGroups(
  archetype: Archetype,
  app: NonNullable<SystemContext['services']['app']>,
  renderBuffer: Array<unknown>,
  typedRendererCode: Float32Array | Float64Array | Int32Array | undefined,
  activeGroups: Map<string | number, ReturnType<typeof rendererGroupCache.getOrCreate>>,
): void {
  for (let i = 0; i < archetype.entityCount; i++) {
    const render = renderBuffer[i] as RenderBufferEntry;
    const version = render.version ?? 0;
    const renderedVersion = render.renderedVersion ?? RENDERED_VERSION_UNSET;
    if (version === renderedVersion) {
      continue;
    }
    const rendererCode = typedRendererCode ? typedRendererCode[i] : (render.rendererCode ?? 0);
    const rendererName = getRendererName(rendererCode) ?? render.rendererId;
    const renderer = app.getRenderer(rendererName);

    if (!renderer) {
      const warnKey = `${archetype.id}:${rendererName}`;
      if (!missingRendererWarned.has(warnKey)) {
        missingRendererWarned.add(warnKey);
        warn(`Renderer '${rendererName}' not found; skipping updates.`, {
          rendererId: rendererName,
          archetypeId: archetype.id,
        });
      }
      render.renderedVersion = version;
      continue;
    }

    const groupKey = rendererCode > 0 ? rendererCode : rendererName;
    let group = activeGroups.get(groupKey);
    if (!group) {
      const safeCapacity = Math.max(1, Math.floor(archetype.entityCount) || 1);
      group = rendererGroupCache.getOrCreate(archetype.id, String(groupKey), safeCapacity);
      group.renderer = renderer;
      activeGroups.set(groupKey, group);
    }

    rendererGroupCache.addEntity(group, archetype.getEntityId(i), render.target, i);
  }
}

function processGroupBatch(
  groupKey: string | number,
  renderer: NonNullable<ReturnType<NonNullable<SystemContext['services']['app']>['getRenderer']>>,
  world: NonNullable<SystemContext['services']['world']>,
  archetypeId: string,
  componentBufferMap: Map<string, Array<ComponentValue | undefined>>,
  transformTypedBuffers: TransformTypedBuffers,
  renderBuffer: Array<unknown>,
  activeData: ReturnType<typeof rendererGroupCache.getActiveData>,
): void {
  try {
    const rendererTransformTypedBuffers: RendererBatchContext['transformTypedBuffers'] = {};
    for (const [key, value] of Object.entries(transformTypedBuffers)) {
      rendererTransformTypedBuffers[key] = value instanceof Int32Array ? undefined : value;
    }
    const ctxBatch: RendererBatchContext = {
      world,
      archetypeId,
      entityIds: Array.from(activeData.entityIds),
      targets: activeData.targets,
      componentBuffers: componentBufferMap,
      transformTypedBuffers: rendererTransformTypedBuffers,
    };
    renderer.preFrame?.();
    renderer.updateBatch!.call(renderer, ctxBatch);
    renderer.postFrame?.();
    markGroupRenderedVersion(renderBuffer, activeData.indices);
  } catch (e) {
    handleGroupUpdateError(groupKey, archetypeId, e);
    markGroupRenderedVersion(renderBuffer, activeData.indices);
  }
}

function processGroupFast(
  groupKey: string | number,
  renderer: NonNullable<ReturnType<NonNullable<SystemContext['services']['app']>['getRenderer']>>,
  componentBufferMap: Map<string, Array<ComponentValue | undefined>>,
  hasAnyTransformTyped: boolean,
  transformTypedBuffers: TransformTypedBuffers,
  renderBuffer: Array<unknown>,
  activeData: ReturnType<typeof rendererGroupCache.getActiveData>,
  archetypeId: string,
): void {
  try {
    let currentIndex = -1;
    const getComponent = (name: string) => {
      const buffer = componentBufferMap.get(name);
      return buffer ? buffer[currentIndex] : undefined;
    };
    const getTransformTyped = hasAnyTransformTyped
      ? () => ({ index: currentIndex, buffers: transformTypedBuffers })
      : () => undefined;

    renderer.preFrame?.();
    for (let j = 0; j < activeData.indices.length; j++) {
      currentIndex = activeData.indices[j]!;
      renderer.updateWithAccessor!.call(
        renderer,
        activeData.entityIds[j]!,
        activeData.targets[j]!,
        getComponent,
        getTransformTyped,
      );
      const r = renderBuffer[currentIndex] as { version?: number; renderedVersion?: number };
      r.renderedVersion = r.version ?? 0;
    }
    renderer.postFrame?.();
  } catch (e) {
    handleGroupUpdateError(groupKey, archetypeId, e);
    markGroupRenderedVersion(renderBuffer, activeData.indices);
  }
}

function processGroupDefault(
  groupKey: string | number,
  renderer: NonNullable<ReturnType<NonNullable<SystemContext['services']['app']>['getRenderer']>>,
  hasAnyTransformTyped: boolean,
  transformTypedBuffers: TransformTypedBuffers,
  renderBuffer: Array<unknown>,
  activeData: ReturnType<typeof rendererGroupCache.getActiveData>,
  componentsScratch: Record<string, ComponentsScratchValue>,
  archetypeId: string,
): void {
  try {
    renderer.preFrame?.();
    for (let j = 0; j < activeData.indices.length; j++) {
      const index = activeData.indices[j]!;
      for (let k = 0; k < componentNamesScratch.length; k++) {
        componentsScratch[componentNamesScratch[k]!] = componentBuffersScratch[k]![index];
      }
      if (hasAnyTransformTyped) {
        componentsScratch.TransformTyped = {
          index,
          buffers: transformTypedBuffers,
        };
      } else {
        delete componentsScratch.TransformTyped;
      }
      renderer.update(activeData.entityIds[j]!, activeData.targets[j]!, componentsScratch);
      const r = renderBuffer[index] as { version?: number; renderedVersion?: number };
      r.renderedVersion = r.version ?? 0;
    }
    renderer.postFrame?.();
  } catch (e) {
    handleGroupUpdateError(groupKey, archetypeId, e);
    markGroupRenderedVersion(renderBuffer, activeData.indices);
  }
}

function processActiveGroups(
  world: NonNullable<SystemContext['services']['world']>,
  archetype: Archetype,
  componentBufferMap: Map<string, Array<ComponentValue | undefined>>,
  transformTypedBuffers: TransformTypedBuffers,
  hasAnyTransformTyped: boolean,
  renderBuffer: Array<unknown>,
  activeGroups: Map<string | number, ReturnType<typeof rendererGroupCache.getOrCreate>>,
  componentsScratch: Record<string, ComponentsScratchValue>,
): void {
  for (const [groupKey, group] of activeGroups) {
    if (group.count === 0) continue;
    const renderer = group.renderer;
    if (!renderer) continue;

    const activeData = rendererGroupCache.getActiveData(group);

    if (renderer.updateBatch) {
      processGroupBatch(
        groupKey,
        renderer,
        world,
        archetype.id,
        componentBufferMap,
        transformTypedBuffers,
        renderBuffer,
        activeData,
      );
      continue;
    }

    if (renderer.updateWithAccessor) {
      processGroupFast(
        groupKey,
        renderer,
        componentBufferMap,
        hasAnyTransformTyped,
        transformTypedBuffers,
        renderBuffer,
        activeData,
        archetype.id,
      );
      continue;
    }

    processGroupDefault(
      groupKey,
      renderer,
      hasAnyTransformTyped,
      transformTypedBuffers,
      renderBuffer,
      activeData,
      componentsScratch,
      archetype.id,
    );
  }
}

function updateArchetype(
  world: NonNullable<SystemContext['services']['world']>,
  app: NonNullable<SystemContext['services']['app']>,
  archetype: Archetype,
): void {
  const renderBuffer = archetype.getBuffer('Render');
  if (!renderBuffer) return;

  const componentBufferMap = archetype.getInternalBuffers();
  populateComponentScratchBuffers(componentBufferMap);
  const componentsScratch: Record<string, ComponentsScratchValue> = {};

  const transformTypedBuffers = extractTransformTypedBuffers(archetype);
  const hasAnyTransformTyped = hasAnyTransformTypedBuffers(transformTypedBuffers);

  const activeGroups = new Map<
    string | number,
    ReturnType<typeof rendererGroupCache.getOrCreate>
  >();
  const typedRendererCode = archetype.getTypedBuffer('Render', 'rendererCode');

  collectActiveGroups(archetype, app, renderBuffer, typedRendererCode, activeGroups);

  processActiveGroups(
    world,
    archetype,
    componentBufferMap,
    transformTypedBuffers,
    hasAnyTransformTyped,
    renderBuffer,
    activeGroups,
    componentsScratch,
  );
}

export const RenderSystem: SystemDef = {
  name: 'RenderSystem',
  order: RENDER_SYSTEM_ORDER,
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    const app = ctx?.services.app;
    if (!world || !app) {
      return;
    }

    for (const archetype of world.getArchetypes()) {
      updateArchetype(world, app, archetype);
    }

    rendererGroupCache.nextFrame();
  },
};
