import { SystemDef } from '../index';
import { WorldProvider } from '../worldProvider';
import { app } from '../app';
import { extractTransformTypedBuffers } from '../utils/archetype-helpers';
import { getErrorHandler } from '../context';
import { ErrorCode, ErrorSeverity, MotionError } from '../errors';

const missingRendererWarned = new Set<string>();

/**
 * Renderer interface with optional lifecycle hooks
 */
interface Renderer {
  update(entityId: number, target: unknown, components: Record<string, unknown>): void;
  preFrame?(): void;
  postFrame?(): void;
}

/**
 * Entity render data
 */
interface EntityRenderData {
  entityId: number;
  target: unknown;
  components: Record<string, unknown>;
  renderer: Renderer;
}

export const RenderSystem: SystemDef = {
  name: 'RenderSystem',
  order: 30,
  update() {
    const world = WorldProvider.useWorld();

    // Group entities by renderer for batch optimization
    const rendererGroups = new Map<string, EntityRenderData[]>();

    // First pass: collect entities by renderer
    for (const archetype of world.getArchetypes()) {
      const renderBuffer = archetype.getBuffer('Render');
      if (!renderBuffer) continue;

      // Cache buffer references to avoid repeated Map lookups per entity
      const componentBuffers = new Map<string, Array<unknown>>();
      for (const name of archetype.componentNames) {
        const buffer = archetype.getBuffer(name);
        if (buffer) {
          componentBuffers.set(name, buffer);
        }
      }

      // Cache typed Transform buffers once per archetype (optional)
      const transformTypedBuffers = extractTransformTypedBuffers(archetype);

      for (let i = 0; i < archetype.entityCount; i++) {
        const render = renderBuffer[i] as { rendererId: string; target: unknown };
        const rendererId = render.rendererId;

        // Get renderer from app registry (includes built-in and plugin renderers)
        const renderer = app.getRenderer(rendererId) as Renderer | undefined;

        if (!renderer) {
          // Warn once per missing renderer id via ErrorHandler, then skip
          if (!missingRendererWarned.has(rendererId)) {
            missingRendererWarned.add(rendererId);
            const error = new MotionError(
              `Renderer '${rendererId}' not found; skipping updates.`,
              ErrorCode.RENDERER_NOT_FOUND,
              ErrorSeverity.WARNING,
              { rendererId, archetypeId: archetype.id },
            );
            getErrorHandler().handle(error);
          }
          continue;
        }

        // Collect all components for this entity's archetype (use cached buffers)
        const components: Record<string, unknown> = {};
        for (const [name, buffer] of componentBuffers) {
          components[name] = buffer[i];
        }

        // Provide typed Transform buffers to renderer when available (optional, backward-compatible)
        const hasAnyTyped = Object.values(transformTypedBuffers).some(Boolean);
        if (hasAnyTyped) {
          components.TransformTyped = {
            index: i,
            buffers: transformTypedBuffers,
          };
        }

        // Group by renderer
        if (!rendererGroups.has(rendererId)) {
          rendererGroups.set(rendererId, []);
        }
        rendererGroups.get(rendererId)!.push({
          entityId: archetype.getEntityId(i),
          target: render.target,
          components,
          renderer,
        });
      }
    }

    // Second pass: process by renderer with lifecycle hooks
    for (const [, entities] of rendererGroups) {
      if (entities.length === 0) continue;

      const renderer = entities[0].renderer;

      // Call preFrame hook if available
      if (renderer.preFrame) {
        renderer.preFrame();
      }

      // Process all entities for this renderer
      for (const { entityId, target, components } of entities) {
        renderer.update(entityId, target, components);
      }

      // Call postFrame hook if available
      if (renderer.postFrame) {
        renderer.postFrame();
      }
    }
  },
};
