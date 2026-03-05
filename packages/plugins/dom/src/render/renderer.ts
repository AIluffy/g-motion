import type { RendererDef } from '@g-motion/protocol';
import { TRANSFORM_TYPED_KEYS, createDebugger, resolveDomElements } from '@g-motion/shared';
import { DomStyleBatcher, initializeElementForGPU } from './style-batcher';
import {
  buildTransformString,
  excludedStyleKeys,
  resolveTransformValues,
  TransformTyped,
} from './transform';

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

  /**
   * Cache DOM elements per object target (e.g. VisualTarget) in renderer.
   * @default false
   */
  enableObjectTargetCache?: boolean;
}

const defaultConfig: Required<DOMRendererConfig> = {
  forceGPUAcceleration: true,
  enableWillChange: true,
  useHardwareAcceleration: true,
  enableObjectTargetCache: false,
};

const transformTypedKeys = TRANSFORM_TYPED_KEYS;

// Cache for DOM element lookups to avoid repeated querySelector calls
const _elementCache = new WeakMap<object, HTMLElement>();
const selectorCache = new Map<string, HTMLElement | null>();
const selectorCacheTime = new Map<string, number>();
const selectorTTL = 500;

function cleanupExpiredSelectorCache(now: number): void {
  for (const [sel, ts] of selectorCacheTime) {
    if (now - ts > selectorTTL) {
      selectorCache.delete(sel);
      selectorCacheTime.delete(sel);
    }
  }
}

function setupSelectorCacheMutationObserver(): void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  const observer = new MutationObserver(() => {
    const now = Date.now();
    cleanupExpiredSelectorCache(now);
  });
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: false,
  });
}

setupSelectorCacheMutationObserver();

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
    let el: HTMLElement | null = null;
    if (typeof document.querySelectorAll === 'function') {
      try {
        const elements = resolveDomElements(target, document);
        const first = elements && elements.length > 0 ? elements[0] : null;
        el = first as HTMLElement | null;
      } catch {
        el = document.querySelector(target) as HTMLElement | null;
      }
    } else {
      el = document.querySelector(target) as HTMLElement | null;
    }
    // Debug: element resolution
    selectorCache.set(target, el);
    selectorCacheTime.set(target, Date.now());
    return el;
  }

  return null;
}

export function createDOMRenderer(config: DOMRendererConfig = {}): RendererDef {
  const finalConfig: Required<DOMRendererConfig> = {
    ...defaultConfig,
    ...config,
  };

  debug('created with config:', finalConfig);

  const styleBatcher = new DomStyleBatcher();

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
    const hasNativeTarget =
      _target &&
      typeof _target === 'object' &&
      typeof (_target as any).getNativeTarget === 'function';

    const cacheKey =
      finalConfig.enableObjectTargetCache && hasNativeTarget ? (_target as object) : undefined;

    let el: HTMLElement | null = null;
    if (cacheKey) {
      const cached = _elementCache.get(cacheKey);
      if (cached) {
        el = cached;
      }
    }

    const rawTarget = hasNativeTarget ? (_target as any).getNativeTarget() : _target;

    if (!el) {
      el = resolveCachedElement(rawTarget);
      if (el && cacheKey) {
        _elementCache.set(cacheKey, el);
      }
    }

    if (!el) return;

    // Initialize element for GPU acceleration on first use
    initializeElementForGPU(el, finalConfig, debug);

    const renderComp = getComponent('Render') as { props?: Record<string, any> } | undefined;
    const props = renderComp?.props || {};
    const transform = (getComponent('Transform') as any) || props;

    const tt = getTransformTyped?.();

    const rawTransform = props?.transform;
    if (typeof rawTransform === 'string') {
      styleBatcher.queueTransform(el, rawTransform);
    } else if (transform || tt) {
      const { tx, ty, tz, perspective, rx, ry, rz, rotate, sx, sy, sz } = resolveTransformValues(
        transform,
        tt as TransformTyped | undefined,
      );

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
        styleBatcher.queueTransform(el, transformStr);
      } else {
        styleBatcher.queueTransform(el, '');
      }
    }

    for (const key in props) {
      if (excludedStyleKeys[key]) continue;
      styleBatcher.queueStyle(el, key, String(props[key]));
    }
  };

  return {
    preFrame() {
      styleBatcher.preFrame();
    },
    update(_entity: number, target: any, components: any) {
      const getComponent = (name: string) => components[name];
      const getTransformTyped = () => components.TransformTyped;
      apply(target, getComponent, getTransformTyped);
    },
    updateBatch(ctx) {
      const world = ctx.world;
      let archetype = undefined;
      if (world) {
        for (const a of world.getArchetypes()) {
          if (a && a.id === ctx.archetypeId) {
            archetype = a;
            break;
          }
        }
      }
      const indices = archetype?.getInternalEntityIndices?.();
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
      styleBatcher.postFrame();
    },
  };
}
