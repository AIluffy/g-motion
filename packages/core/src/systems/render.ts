import { SystemDef, SystemContext } from '../index';
import { extractTransformTypedBuffers } from '../utils/archetype-helpers';
import { ErrorCode, ErrorSeverity, MotionError } from '../errors';
import { getRendererName } from '../renderer-code';
import { getRendererGroupCache } from './renderer-group-cache'; // P2-2: Renderer group cache

import type { RendererBatchContext } from '../plugin';

const missingRendererWarned = new Set<string>();
const rendererGroupCache = getRendererGroupCache(); // P2-2: Persistent cache

export const RenderSystem: SystemDef = {
  name: 'RenderSystem',
  order: 30,
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    const app = ctx?.services.app;
    const errorHandler = ctx?.services.errorHandler;
    if (!world || !app || !errorHandler) {
      return;
    }

    for (const archetype of world.getArchetypes()) {
      const renderBuffer = archetype.getBuffer('Render');
      if (!renderBuffer) continue;

      const componentBuffers = archetype.getInternalBuffers() as unknown as Map<
        string,
        Array<unknown>
      >;
      const componentNamesScratch: string[] = [];
      const componentBuffersScratch: Array<Array<unknown>> = [];
      for (const [name, buffer] of componentBuffers) {
        componentNamesScratch.push(name);
        componentBuffersScratch.push(buffer);
      }
      const componentsScratch: Record<string, unknown> = {};

      // Cache typed Transform buffers once per archetype (optional)
      const transformTypedBuffers = extractTransformTypedBuffers(archetype) as Record<
        string,
        unknown
      >;

      let hasAnyTransformTyped = false;
      for (const k in transformTypedBuffers) {
        if ((transformTypedBuffers as Record<string, unknown>)[k]) {
          hasAnyTransformTyped = true;
          break;
        }
      }

      // P2-2: Use persistent renderer group cache
      const activeGroups = new Map<
        string | number,
        ReturnType<typeof rendererGroupCache.getOrCreate>
      >();
      const typedRendererCode = archetype.getTypedBuffer('Render', 'rendererCode');

      for (let i = 0; i < archetype.entityCount; i++) {
        const render = renderBuffer[i] as {
          rendererId: string;
          rendererCode?: number;
          target: unknown;
          version?: number;
          renderedVersion?: number;
        };
        const version = render.version ?? 0;
        const renderedVersion = render.renderedVersion ?? -1;
        if (version === renderedVersion) {
          continue;
        }
        const rendererCode = typedRendererCode ? typedRendererCode[i] : (render.rendererCode ?? 0);
        const rendererName = getRendererName(rendererCode) ?? render.rendererId;
        const renderer = app.getRenderer(rendererName);

        if (!renderer) {
          if (!missingRendererWarned.has(rendererName)) {
            missingRendererWarned.add(rendererName);
            const error = new MotionError(
              `Renderer '${rendererName}' not found; skipping updates.`,
              ErrorCode.RENDERER_NOT_FOUND,
              ErrorSeverity.WARNING,
              { rendererId: rendererName, archetypeId: archetype.id },
            );
            errorHandler.handle(error);
          }
          continue;
        }

        const groupKey = rendererCode > 0 ? rendererCode : rendererName;
        let group = activeGroups.get(groupKey);
        if (!group) {
          // Get or create cached group with estimated capacity
          // Ensure capacity is valid (positive integer)
          const safeCapacity = Math.max(1, Math.floor(archetype.entityCount) || 1);
          group = rendererGroupCache.getOrCreate(archetype.id, String(groupKey), safeCapacity);
          group.renderer = renderer;
          activeGroups.set(groupKey, group);
        }

        rendererGroupCache.addEntity(group, archetype.getEntityId(i), render.target, i);
      }

      // P2-2: Process cached groups
      for (const group of activeGroups.values()) {
        if (group.count === 0) continue;
        const renderer = group.renderer;
        if (!renderer) continue;

        const batch = renderer.updateBatch;
        const fast = renderer.updateWithAccessor;
        const activeData = rendererGroupCache.getActiveData(group);

        if (batch) {
          const ctxBatch: RendererBatchContext = {
            world,
            archetypeId: archetype.id,
            entityIds: Array.from(activeData.entityIds),
            targets: activeData.targets,
            componentBuffers,
            transformTypedBuffers,
          };
          renderer.preFrame?.();
          batch.call(renderer, ctxBatch);
          renderer.postFrame?.();
          for (let j = 0; j < group.count; j++) {
            const index = activeData.indices[j];
            const r = renderBuffer[index] as {
              version?: number;
              renderedVersion?: number;
            };
            r.renderedVersion = r.version ?? 0;
          }
          continue;
        }

        if (fast) {
          let currentIndex = -1;
          const getComponent = (name: string) => {
            const buffer = componentBuffers.get(name);
            return buffer ? buffer[currentIndex] : undefined;
          };
          const getTransformTyped = hasAnyTransformTyped
            ? () => ({ index: currentIndex, buffers: transformTypedBuffers })
            : () => undefined;

          renderer.preFrame?.();
          for (let j = 0; j < group.count; j++) {
            currentIndex = activeData.indices[j];
            fast.call(
              renderer,
              activeData.entityIds[j],
              activeData.targets[j],
              getComponent,
              getTransformTyped,
            );
            const r = renderBuffer[currentIndex] as {
              version?: number;
              renderedVersion?: number;
            };
            r.renderedVersion = r.version ?? 0;
          }
          renderer.postFrame?.();
          continue;
        }

        renderer.preFrame?.();
        for (let j = 0; j < group.count; j++) {
          const index = activeData.indices[j];
          for (let k = 0; k < componentNamesScratch.length; k++) {
            componentsScratch[componentNamesScratch[k]] = componentBuffersScratch[k][index];
          }
          if (hasAnyTransformTyped) {
            componentsScratch.TransformTyped = {
              index,
              buffers: transformTypedBuffers,
            };
          } else {
            delete componentsScratch.TransformTyped;
          }
          renderer.update(activeData.entityIds[j], activeData.targets[j], componentsScratch);
          const r = renderBuffer[index] as {
            version?: number;
            renderedVersion?: number;
          };
          r.renderedVersion = r.version ?? 0;
        }
        renderer.postFrame?.();
      }
    }

    // P2-2: Advance frame counter for cache cleanup
    rendererGroupCache.nextFrame();
  },
};
