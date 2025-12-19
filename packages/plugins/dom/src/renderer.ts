import { SystemDef, SystemContext, RendererDef } from '@g-motion/core';
import { createDebugger } from '@g-motion/utils';

const debug = createDebugger('DOMRenderer');

// GPU acceleration configuration
export interface DOMRendererConfig {
  /**
   * Force GPU compositing by always using translate3d even for 2D transforms
   * @default true
   */
  forceGPUAcceleration?: boolean;

  /**
   * Add will-change hint to elements for better GPU layer management
   * @default true
   */
  enableWillChange?: boolean;

  /**
   * Use hardware-accelerated transforms (translateZ(0) fallback)
   * @default true
   */
  useHardwareAcceleration?: boolean;
}

const defaultConfig: Required<DOMRendererConfig> = {
  forceGPUAcceleration: true,
  enableWillChange: true,
  useHardwareAcceleration: true,
};

// RAF-based batch update queue
let rafScheduled = false;
let rafId: number | null = null;
const pendingBatchCallbacks: Array<() => void> = [];

// Cache for DOM element lookups to avoid repeated querySelector calls
const _elementCache = new WeakMap<object, HTMLElement>();
const selectorCache = new Map<string, HTMLElement | null>();
const selectorCacheTime = new Map<string, number>();
const selectorTTL = 500;
const prevTransformByEl = new WeakMap<HTMLElement, string>();
const prevStyleByEl = new WeakMap<HTMLElement, Record<string, string>>();
const initializedElements = new WeakSet<HTMLElement>();

// Auto-clear selector cache on DOM mutations to avoid stale references
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  const observer = new MutationObserver(() => {
    const now = Date.now();
    for (const [sel, ts] of selectorCacheTime) {
      if (now - ts > selectorTTL) {
        selectorCache.delete(sel);
        selectorCacheTime.delete(sel);
      }
    }
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
      const cached = selectorCache.get(target) ?? null;
      const ts = selectorCacheTime.get(target) ?? 0;
      const expired = Date.now() - ts > selectorTTL;
      if (cached) {
        const isConnected = (cached as any).isConnected;
        if (!expired) {
          if (typeof isConnected === 'boolean') {
            if (isConnected) return cached;
          } else if (document.contains(cached)) {
            return cached;
          }
        }
      } else {
        return null;
      }
    }

    // Query and cache
    const el = document.querySelector(target) as HTMLElement | null;
    // Debug: element resolution
    selectorCache.set(target, el);
    selectorCacheTime.set(target, Date.now());
    return el;
  }

  return null;
}

/**
 * Optimized transform string builder with GPU-Direct rendering support
 * Pre-computes transform commands based on provided properties
 *
 * @param forceGPU - Force GPU compositing by always using 3D transforms
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
  forceGPU = true,
): string {
  const needs3d =
    forceGPU ||
    (tz ?? 0) !== 0 ||
    (rx ?? 0) !== 0 ||
    (ry ?? 0) !== 0 ||
    (rz ?? 0) !== 0 ||
    (perspective ?? 0) !== 0 ||
    (sz ?? 1) !== 1;

  let out = '';

  if (needs3d && (perspective ?? 0) !== 0) {
    out += `perspective(${perspective ?? 0}px)`;
  }

  // Always use translate3d when forceGPU is enabled to trigger GPU compositing layer
  if (needs3d) {
    // When forceGPU is enabled, always add translate3d even if values are 0
    if (forceGPU || (tx ?? 0) !== 0 || (ty ?? 0) !== 0 || (tz ?? 0) !== 0) {
      if (out) out += ' ';
      out += `translate3d(${tx ?? 0}px,${ty ?? 0}px,${tz ?? 0}px)`;
    }
  } else if ((tx ?? 0) !== 0 || (ty ?? 0) !== 0) {
    if (out) out += ' ';
    out += `translate(${tx ?? 0}px,${ty ?? 0}px)`;
  }

  if (needs3d) {
    if ((rx ?? 0) !== 0) {
      if (out) out += ' ';
      out += `rotateX(${rx ?? 0}deg)`;
    }
    if ((ry ?? 0) !== 0) {
      if (out) out += ' ';
      out += `rotateY(${ry ?? 0}deg)`;
    }

    const zRot = rz ?? rotate;
    if ((zRot ?? 0) !== 0) {
      if (out) out += ' ';
      out += `rotateZ(${zRot ?? 0}deg)`;
    }
  } else if ((rotate ?? 0) !== 0) {
    if (out) out += ' ';
    out += `rotate(${rotate ?? 0}deg)`;
  }

  if (needs3d) {
    const scaleZ = sz ?? 1;
    if ((sx ?? 1) !== 1 || (sy ?? 1) !== 1 || (scaleZ ?? 1) !== 1) {
      if (out) out += ' ';
      out += `scale3d(${sx ?? 1},${sy ?? 1},${scaleZ ?? 1})`;
    }
  } else if ((sx ?? 1) !== 1 || (sy ?? 1) !== 1) {
    if (out) out += ' ';
    out += `scale(${sx ?? 1},${sy ?? 1})`;
  }

  return out;
}

/**
 * Initialize element for GPU-accelerated rendering
 * Adds will-change hints and hardware acceleration triggers
 */
function initializeElementForGPU(element: HTMLElement, config: Required<DOMRendererConfig>): void {
  if (initializedElements.has(element)) return;

  if (config.enableWillChange) {
    // Hint to browser that transform will change frequently
    element.style.willChange = 'transform';
  }

  if (config.useHardwareAcceleration) {
    // Force creation of GPU compositing layer with translateZ(0) if no transform exists
    const currentTransform = element.style.transform;
    if (!currentTransform || currentTransform === 'none') {
      element.style.transform = 'translateZ(0)';
      prevTransformByEl.set(element, 'translateZ(0)');
    }
  }

  initializedElements.add(element);
  debug('GPU-initialized element:', element);
}

const excludedStyleKeys: Record<string, true> = {
  __primitive: true,
  x: true,
  y: true,
  z: true,
  translateX: true,
  translateY: true,
  translateZ: true,
  rotate: true,
  rotateX: true,
  rotateY: true,
  rotateZ: true,
  scaleX: true,
  scaleY: true,
  scaleZ: true,
  scale: true,
  perspective: true,
};

export function createDOMRenderer(config: DOMRendererConfig = {}): RendererDef {
  const finalConfig: Required<DOMRendererConfig> = {
    ...defaultConfig,
    ...config,
  };

  debug('created with config:', finalConfig);

  // Batch accumulation for style updates
  const styleUpdates = new Map<HTMLElement, Record<string, string>>();
  const transformUpdates = new Map<HTMLElement, string>();
  const styleRecordPool: Array<Record<string, string>> = [];
  const usedStyleRecords: Array<Record<string, string>> = [];

  // Track if updates are pending for RAF optimization
  let hasPendingUpdates = false;

  const apply = (
    _target: any,
    getComponent: (name: string) => any,
    getTransformTyped?: () =>
      | {
          index: number;
          buffers: Record<string, Float32Array | Float64Array | Int32Array | undefined>;
        }
      | undefined,
  ) => {
    const el = resolveCachedElement(_target);
    if (!el) return;

    // Initialize element for GPU acceleration on first use
    initializeElementForGPU(el, finalConfig);

    const renderComp = getComponent('Render') as { props?: Record<string, any> } | undefined;
    const props = renderComp?.props || {};
    const transform = (getComponent('Transform') as any) || props;

    const tt = getTransformTyped?.();
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
        finalConfig.forceGPUAcceleration,
      );

      if (transformStr) {
        transformUpdates.set(el, transformStr);
      } else {
        transformUpdates.set(el, '');
      }
    }

    for (const key in props) {
      if (excludedStyleKeys[key]) continue;
      let rec = styleUpdates.get(el);
      if (!rec) {
        rec = styleRecordPool.pop() ?? {};
        styleUpdates.set(el, rec);
        usedStyleRecords.push(rec);
      }
      rec[key] = String(props[key]);
    }

    // Mark that we have pending updates
    hasPendingUpdates = true;
  };

  return {
    preFrame() {
      for (let i = 0; i < usedStyleRecords.length; i++) {
        const rec = usedStyleRecords[i];
        for (const k in rec) {
          delete rec[k];
        }
        styleRecordPool.push(rec);
      }
      usedStyleRecords.length = 0;
      styleUpdates.clear();
      transformUpdates.clear();
      hasPendingUpdates = false;
    },
    update(_entity: number, target: any, components: any) {
      const getComponent = (name: string) => components[name];
      const getTransformTyped = () => components.TransformTyped;
      apply(target, getComponent, getTransformTyped);
    },
    updateBatch(ctx) {
      const world = (ctx as any).world;
      let archetype: any = undefined;
      if (world && typeof world.getArchetypes === 'function') {
        for (const a of world.getArchetypes() as any) {
          if (a && a.id === (ctx as any).archetypeId) {
            archetype = a;
            break;
          }
        }
      }
      const indices =
        archetype && typeof archetype.getInternalEntityIndices === 'function'
          ? (archetype as any).getInternalEntityIndices()
          : undefined;
      let currentIndex = -1;
      const getComponent = (name: string) => {
        const buffer = ctx.componentBuffers.get(name);
        return buffer ? buffer[currentIndex] : undefined;
      };
      const getTransformTyped = () => ({
        index: currentIndex,
        buffers: ctx.transformTypedBuffers as Record<
          string,
          Float32Array | Float64Array | Int32Array | undefined
        >,
      });
      for (let j = 0; j < ctx.entityIds.length; j++) {
        const id = ctx.entityIds[j];
        currentIndex = indices ? (indices.get(id) ?? -1) : -1;
        apply(ctx.targets[j], getComponent, getTransformTyped);
      }
    },
    updateWithAccessor(
      _entity: number,
      target: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getComponent: (name: string) => any,
      getTransformTyped?: () => {
        index: number;
        buffers: Record<string, Float32Array | Float64Array | Int32Array | undefined>;
      },
    ) {
      apply(target, getComponent, getTransformTyped);
    },

    // Post-frame hook: batch apply all style updates via RAF
    postFrame() {
      if (!hasPendingUpdates) {
        return;
      }

      hasPendingUpdates = false;

      // Capture current state for the RAF callback
      const transformsToApply = new Map(transformUpdates);
      const stylesToApply = new Map(styleUpdates);

      // Schedule RAF batch update
      const applyUpdates = () => {
        // Read phase: check all previous values (minimize layout thrashing)
        const transformChanged = new Map<HTMLElement, boolean>();
        const styleChanged = new Map<HTMLElement, boolean>();

        for (const [el, transformStr] of transformsToApply) {
          const prev = prevTransformByEl.get(el);
          transformChanged.set(el, prev !== transformStr);
        }

        for (const [el, styles] of stylesToApply) {
          const prev = prevStyleByEl.get(el);
          let changed = false;
          if (!prev) {
            changed = true;
          } else {
            for (const key in styles) {
              if (prev[key] !== styles[key]) {
                changed = true;
                break;
              }
            }
          }
          styleChanged.set(el, changed);
        }

        // Write phase: apply all changes at once (batched DOM writes)
        for (const [el, transformStr] of transformsToApply) {
          if (transformChanged.get(el)) {
            el.style.transform = transformStr;
            prevTransformByEl.set(el, transformStr);
          }
        }

        for (const [el, styles] of stylesToApply) {
          if (styleChanged.get(el)) {
            for (const key in styles) {
              (el.style as any)[key] = styles[key];
            }
            const snapshot: Record<string, string> = prevStyleByEl.get(el) ?? {};
            for (const key in styles) {
              snapshot[key] = styles[key];
            }
            prevStyleByEl.set(el, snapshot);
          }
        }
      };

      // Check if we should use RAF or synchronous updates
      // In test environments, use synchronous updates for immediate assertions
      // Vitest sets process.env.VITEST and NODE_ENV
      const isTestEnv =
        (typeof process !== 'undefined' &&
          process.env &&
          (process.env.NODE_ENV === 'test' || process.env.VITEST)) ||
        (typeof globalThis !== 'undefined' && (globalThis as any).vitest);

      if (isTestEnv || typeof requestAnimationFrame === 'undefined') {
        // Synchronous execution for tests or non-browser environments
        applyUpdates();
      } else {
        // Use shared RAF scheduler to batch multiple renderer instances
        pendingBatchCallbacks.push(applyUpdates);

        if (!rafScheduled) {
          rafScheduled = true;
          rafId = requestAnimationFrame(() => {
            rafScheduled = false;
            rafId = null;

            // Execute all pending batch callbacks in one RAF
            const callbacks = pendingBatchCallbacks.slice();
            pendingBatchCallbacks.length = 0;

            for (const callback of callbacks) {
              callback();
            }
          });
        }
      }
    },
  };
}

// Legacy system export for backward compatibility (deprecated)
export const DOMRenderSystem: SystemDef = {
  name: 'DOMRenderSystem',
  order: 35,
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    if (!world) return;
    const renderer = createDOMRenderer();

    for (const archetype of world.getArchetypes()) {
      const renderBuffer = archetype.getBuffer('Render');
      if (!renderBuffer) continue;

      for (let i = 0; i < archetype.entityCount; i++) {
        const render = renderBuffer[i] as {
          rendererId: string;
          target: unknown;
        };
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
