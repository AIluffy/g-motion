import { SystemDef, RendererDef, WorldProvider } from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';

const debug = createDebugger('DOMRenderer');

// Cache for DOM element lookups to avoid repeated querySelector calls
const _elementCache = new WeakMap<object, HTMLElement>();
const selectorCache = new Map<string, HTMLElement | null>();

// Auto-clear selector cache on DOM mutations to avoid stale references
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  const observer = new MutationObserver(() => {
    selectorCache.clear();
  });
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: false,
  });
}

/**
 * Helper to resolve and cache DOM elements
 * @param target Element reference or selector string
 * @returns Resolved HTMLElement or null
 */
function resolveCachedElement(target: any): HTMLElement | null {
  // If it's already an HTMLElement, use it directly
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    return target;
  }

  // If it's a selector string, check cache first
  if (typeof target === 'string') {
    if (typeof document === 'undefined') return null;

    // Check selector cache
    if (selectorCache.has(target)) {
      return selectorCache.get(target) ?? null;
    }

    // Query and cache
    const el = document.querySelector(target) as HTMLElement | null;
    // Debug: element resolution
    debug('resolveCachedElement selector', target, '->', el);
    selectorCache.set(target, el);
    return el;
  }

  return null;
}

/**
 * Optimized transform string builder
 * Pre-computes transform commands based on provided properties
 */
function buildTransformString(
  tx?: number,
  ty?: number,
  tz?: number,
  perspective?: number,
  rx?: number,
  ry?: number,
  rz?: number,
  rotate?: number,
  sx?: number,
  sy?: number,
  sz?: number,
): string {
  const parts: string[] = [];

  const needs3d =
    (tz ?? 0) !== 0 ||
    (rx ?? 0) !== 0 ||
    (ry ?? 0) !== 0 ||
    (rz ?? 0) !== 0 ||
    (perspective ?? 0) !== 0 ||
    (sz ?? 1) !== 1;

  // Perspective (3D)
  if (needs3d && (perspective ?? 0) !== 0) {
    parts.push(`perspective(${perspective ?? 0}px)`);
  }

  // Only add translate if needed
  if (needs3d) {
    if ((tx ?? 0) !== 0 || (ty ?? 0) !== 0 || (tz ?? 0) !== 0) {
      parts.push(`translate3d(${tx ?? 0}px,${ty ?? 0}px,${tz ?? 0}px)`);
    }
  } else if ((tx ?? 0) !== 0 || (ty ?? 0) !== 0) {
    parts.push(`translate(${tx ?? 0}px,${ty ?? 0}px)`);
  }

  // Only add rotate if needed
  if (needs3d) {
    if ((rx ?? 0) !== 0) {
      parts.push(`rotateX(${rx ?? 0}deg)`);
    }
    if ((ry ?? 0) !== 0) {
      parts.push(`rotateY(${ry ?? 0}deg)`);
    }

    const zRot = rz ?? rotate;
    if ((zRot ?? 0) !== 0) {
      parts.push(`rotateZ(${zRot ?? 0}deg)`);
    }
  } else if ((rotate ?? 0) !== 0) {
    parts.push(`rotate(${rotate ?? 0}deg)`);
  }

  // Only add scale if needed
  if (needs3d) {
    const scaleZ = sz ?? 1;
    if ((sx ?? 1) !== 1 || (sy ?? 1) !== 1 || (scaleZ ?? 1) !== 1) {
      parts.push(`scale3d(${sx ?? 1},${sy ?? 1},${scaleZ ?? 1})`);
    }
  } else if ((sx ?? 1) !== 1 || (sy ?? 1) !== 1) {
    parts.push(`scale(${sx ?? 1},${sy ?? 1})`);
  }

  return parts.join(' ');
}

export function createDOMRenderer(): RendererDef {
  debug('created');

  // Batch accumulation for style updates
  const styleUpdates = new Map<HTMLElement, Record<string, string>>();
  const transformUpdates = new Map<HTMLElement, string>();

  return {
    // Pre-frame hook: clear batch accumulators
    preFrame() {
      styleUpdates.clear();
      transformUpdates.clear();
    },

    update(_entity: number, target: any, components: any) {
      // Use cached element resolution
      const el = resolveCachedElement(target);

      if (!el) {
        return;
      }

      const props = components.Render?.props || {};
      const transform = components.Transform || props; // fallback to props when Transform missing

      // Optional typed Transform buffers (SoA) provided by RenderSystem
      const tt:
        | {
            index: number;
            buffers: Record<string, Float32Array | Float64Array | Int32Array | undefined>;
          }
        | undefined = components.TransformTyped;

      // Build optimized transform string
      if (transform || tt) {
        const idx = tt?.index ?? -1;
        const b = tt?.buffers;

        const tx = b?.x
          ? b.x[idx]
          : b?.translateX
            ? b.translateX[idx]
            : (transform?.x ?? transform?.translateX ?? undefined);
        const ty = b?.y
          ? b.y[idx]
          : b?.translateY
            ? b.translateY[idx]
            : (transform?.y ?? transform?.translateY ?? undefined);
        const tz = b?.z
          ? b.z[idx]
          : b?.translateZ
            ? b.translateZ[idx]
            : (transform?.z ?? transform?.translateZ ?? undefined);
        const perspective = b?.perspective
          ? b.perspective[idx]
          : (transform?.perspective ?? undefined);
        const rx = b?.rotateX ? b.rotateX[idx] : (transform?.rotateX ?? undefined);
        const ry = b?.rotateY ? b.rotateY[idx] : (transform?.rotateY ?? undefined);
        const rz = b?.rotateZ ? b.rotateZ[idx] : (transform?.rotateZ ?? undefined);
        const rotate = b?.rotate ? b.rotate[idx] : (transform?.rotate ?? undefined);
        const sx = b?.scaleX
          ? b.scaleX[idx]
          : b?.scale
            ? b.scale[idx]
            : (transform?.scaleX ?? transform?.scale ?? undefined);
        const sy = b?.scaleY
          ? b.scaleY[idx]
          : b?.scale
            ? b.scale[idx]
            : (transform?.scaleY ?? transform?.scale ?? undefined);
        const sz = b?.scaleZ
          ? b.scaleZ[idx]
          : b?.scale
            ? b.scale[idx]
            : (transform?.scaleZ ?? transform?.scale ?? undefined);

        const transformStr = buildTransformString(
          tx,
          ty,
          tz,
          perspective,
          rx,
          ry,
          rz,
          rotate,
          sx,
          sy,
          sz,
        );

        // Accumulate transform update
        if (transformStr) {
          transformUpdates.set(el, transformStr);
        } else {
          transformUpdates.set(el, '');
        }
      }

      // Accumulate other style props (non-transform CSS properties)
      for (const key in props) {
        if (
          key !== '__primitive' &&
          ![
            'x',
            'y',
            'z',
            'translateX',
            'translateY',
            'translateZ',
            'rotate',
            'rotateX',
            'rotateY',
            'rotateZ',
            'scaleX',
            'scaleY',
            'scaleZ',
            'scale',
            'perspective',
          ].includes(key)
        ) {
          if (!styleUpdates.has(el)) {
            styleUpdates.set(el, {});
          }
          styleUpdates.get(el)![key] = String(props[key]);
        }
      }
    },

    // Post-frame hook: batch apply all style updates
    postFrame() {
      // Apply transforms (batch write to avoid layout thrashing)
      for (const [el, transformStr] of transformUpdates) {
        el.style.transform = transformStr;
      }

      // Apply other styles (batch write)
      for (const [el, styles] of styleUpdates) {
        for (const key in styles) {
          (el.style as any)[key] = styles[key];
        }
      }
    },
  };
}

// Legacy system export for backward compatibility (deprecated)
export const DOMRenderSystem: SystemDef = {
  name: 'DOMRenderSystem',
  order: 35,
  update() {
    const world = WorldProvider.useWorld();
    const renderer = createDOMRenderer();

    for (const archetype of world.getArchetypes()) {
      const renderBuffer = archetype.getBuffer('Render');
      if (!renderBuffer) continue;

      for (let i = 0; i < archetype.entityCount; i++) {
        const render = renderBuffer[i] as { rendererId: string; target: unknown };
        if (render.rendererId !== 'dom') continue;

        // Collect components
        const components: Record<string, any> = {};
        for (const name of archetype.componentNames) {
          const buffer = archetype.getBuffer(name);
          if (buffer) {
            components[name] = buffer[i];
          }
        }

        renderer.update(archetype.getEntityId(i), render.target, components);
      }
    }
  },
};
