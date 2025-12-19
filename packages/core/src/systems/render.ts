import { SystemDef, SystemContext } from '../index';
import { extractTransformTypedBuffers } from '../utils/archetype-helpers';
import { ErrorCode, ErrorSeverity, MotionError } from '../errors';
import { getRendererName } from '../renderer-code';

import type { RendererBatchContext, RendererDef } from '../plugin';

const missingRendererWarned = new Set<string>();

type RendererGroupScratch = {
  renderer: RendererDef;
  entityIds: number[];
  targets: unknown[];
  indices: number[];
};

const byRendererScratch = new Map<string | number, RendererGroupScratch>();
const rendererGroupPool = new Map<string | number, RendererGroupScratch>();

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

      const byRenderer = byRendererScratch;
      byRenderer.clear();

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
        let group = byRenderer.get(groupKey);
        if (!group) {
          group = rendererGroupPool.get(groupKey);
          if (!group) {
            group = {
              renderer,
              entityIds: [],
              targets: [],
              indices: [],
            };
            rendererGroupPool.set(groupKey, group);
          }
          group.renderer = renderer;
          group.entityIds.length = 0;
          group.targets.length = 0;
          group.indices.length = 0;
          byRenderer.set(groupKey, group);
        }

        group.entityIds.push(archetype.getEntityId(i));
        group.targets.push(render.target);
        group.indices.push(i);
      }

      for (const group of byRenderer.values()) {
        if (group.indices.length === 0) continue;
        const renderer = group.renderer;
        const batch = renderer.updateBatch;
        const fast = renderer.updateWithAccessor;

        if (batch) {
          const ctxBatch: RendererBatchContext = {
            world,
            archetypeId: archetype.id,
            entityIds: group.entityIds,
            targets: group.targets,
            componentBuffers,
            transformTypedBuffers,
          };
          renderer.preFrame?.();
          batch.call(renderer, ctxBatch);
          renderer.postFrame?.();
          for (let j = 0; j < group.indices.length; j++) {
            const index = group.indices[j];
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
          for (let j = 0; j < group.indices.length; j++) {
            currentIndex = group.indices[j];
            fast.call(
              renderer,
              group.entityIds[j],
              group.targets[j],
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
        for (let j = 0; j < group.indices.length; j++) {
          const index = group.indices[j];
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
          renderer.update(group.entityIds[j], group.targets[j], componentsScratch);
          const r = renderBuffer[index] as {
            version?: number;
            renderedVersion?: number;
          };
          r.renderedVersion = r.version ?? 0;
        }
        renderer.postFrame?.();
      }
    }
  },
};
