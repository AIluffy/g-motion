import { resolveDomElements } from '@g-motion/utils';
import { TargetType } from './mark';

export type VisualTargetKind = 'dom' | 'object' | 'primitive';

export interface VisualTarget {
  kind: VisualTargetKind;
  get(prop: string): number | string | undefined;
  set(prop: string, value: number | string): void;
  getInitial(prop: string): number | string | undefined;
  canUseGPU(prop: string): boolean;
  getGpuProperties(): string[];
  getNativeTarget(): unknown;
}

const gpuCapableProps = new Set([
  'x',
  'y',
  'z',
  'translateX',
  'translateY',
  'translateZ',
  'scale',
  'scaleX',
  'scaleY',
  'scaleZ',
  'rotate',
  'rotateX',
  'rotateY',
  'rotateZ',
  'perspective',
  'opacity',
]);

type VisualTargetGPUConfig = Partial<Record<VisualTargetKind, string[]>>;

const defaultKindGpuProps: Record<VisualTargetKind, Set<string>> = {
  dom: new Set(gpuCapableProps),
  object: new Set(gpuCapableProps),
  primitive: new Set(),
};

let kindGpuProps: Record<VisualTargetKind, Set<string>> = {
  dom: new Set(defaultKindGpuProps.dom),
  object: new Set(defaultKindGpuProps.object),
  primitive: new Set(defaultKindGpuProps.primitive),
};

export function setVisualTargetGPUConfig(config: VisualTargetGPUConfig): void {
  const next: Record<VisualTargetKind, Set<string>> = {
    dom: new Set(defaultKindGpuProps.dom),
    object: new Set(defaultKindGpuProps.object),
    primitive: new Set(defaultKindGpuProps.primitive),
  };
  const kinds: VisualTargetKind[] = ['dom', 'object', 'primitive'];
  for (const kind of kinds) {
    const override = config[kind];
    if (!override) continue;
    const base = next[kind];
    base.clear();
    for (const prop of override) {
      if (gpuCapableProps.has(prop)) {
        base.add(prop);
      }
    }
  }
  kindGpuProps = next;
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function resolveDomElement(source: any, root?: Document | Element | null): HTMLElement | null {
  if (typeof HTMLElement !== 'undefined' && source instanceof HTMLElement) {
    return source;
  }
  if (typeof source === 'string') {
    if (typeof document === 'undefined') return null;
    const scope = root ?? document;
    if (typeof (scope as any).querySelectorAll === 'function') {
      try {
        const elements = resolveDomElements(source, scope as Document | Element);
        const first = elements && elements.length > 0 ? elements[0] : null;
        return first as HTMLElement | null;
      } catch {}
    }
    if (typeof (scope as any).querySelector === 'function') {
      return (scope as Document | Element).querySelector(source) as HTMLElement | null;
    }
  }
  return null;
}

class BaseVisualTarget implements VisualTarget {
  kind: VisualTargetKind;
  protected initialValues = new Map<string, number | string>();

  constructor(kind: VisualTargetKind) {
    this.kind = kind;
  }

  get(_prop: string): number | string | undefined {
    return undefined;
  }

  set(_prop: string, _value: number | string): void {}

  getInitial(prop: string): number | string | undefined {
    return this.initialValues.get(prop);
  }

  canUseGPU(prop: string): boolean {
    const props = kindGpuProps[this.kind] ?? gpuCapableProps;
    return props.has(prop);
  }

  getGpuProperties(): string[] {
    return Array.from(gpuCapableProps);
  }

  getNativeTarget(): unknown {
    return undefined;
  }
}

class ObjectVisualTarget extends BaseVisualTarget {
  private target: any;

  constructor(target: any) {
    super('object');
    this.target = target;
  }

  get(prop: string): number | string | undefined {
    if (!this.target || typeof this.target !== 'object') return undefined;
    return this.target[prop];
  }

  set(prop: string, value: number | string): void {
    if (!this.target || typeof this.target !== 'object') return;
    this.target[prop] = value;
  }

  getInitial(prop: string): number | string | undefined {
    const cached = this.initialValues.get(prop);
    if (cached !== undefined) return cached;
    if (!this.target || typeof this.target !== 'object') return undefined;
    const raw = this.target[prop];
    if (raw === undefined || raw === null) {
      this.initialValues.set(prop, 0);
      return 0;
    }
    const num = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
    if (!Number.isFinite(num)) {
      this.initialValues.set(prop, 0);
      return 0;
    }
    this.initialValues.set(prop, num);
    return num;
  }

  getNativeTarget(): unknown {
    return this.target;
  }

  canUseGPU(prop: string): boolean {
    const initial = this.getInitial(prop);
    return typeof initial === 'number' && Number.isFinite(initial);
  }
}

class PrimitiveVisualTarget extends BaseVisualTarget {
  private value: number | string;

  constructor(value: number | string) {
    super('primitive');
    this.value = value;
    this.initialValues.set('__primitive', value);
  }

  get(prop: string): number | string | undefined {
    if (prop === '__primitive') return this.value;
    return undefined;
  }

  set(prop: string, value: number | string): void {
    if (prop === '__primitive') {
      this.value = value;
    }
  }

  getNativeTarget(): unknown {
    return this.value;
  }

  canUseGPU(prop: string): boolean {
    if (prop !== '__primitive') return false;
    const initial = this.getInitial('__primitive');
    return typeof initial === 'number' && Number.isFinite(initial);
  }
}

class DomVisualTarget extends BaseVisualTarget {
  private source: any;
  private element: HTMLElement | null | undefined;

  constructor(source: any) {
    super('dom');
    this.source = source;
  }

  private resolveElement(): HTMLElement | null {
    if (this.element !== undefined) return this.element;
    const el = resolveDomElement(this.source);
    this.element = el;
    return el;
  }

  get(prop: string): number | string | undefined {
    if (prop === '__native') return this.resolveElement() ?? this.source;
    const el = this.resolveElement();
    if (!el) return undefined;
    const style =
      typeof window !== 'undefined' && window.getComputedStyle
        ? window.getComputedStyle(el)
        : undefined;
    if (!style) return undefined;
    const value = (style as any)[prop] as string | undefined;
    return value;
  }

  set(prop: string, value: number | string): void {
    const el = this.resolveElement();
    if (!el) return;
    const v = String(value);
    (el.style as any)[prop] = v;
  }

  getInitial(prop: string): number | string | undefined {
    const cached = this.initialValues.get(prop);
    if (cached !== undefined) return cached;
    const el = this.resolveElement();
    if (!el) return undefined;
    const style =
      typeof window !== 'undefined' && window.getComputedStyle
        ? window.getComputedStyle(el)
        : undefined;
    if (!style) return undefined;
    let raw: string | null = null;
    if (prop === 'x' || prop === 'y' || prop === 'z') {
      raw = null;
    } else if (prop === 'opacity') {
      raw = style.opacity;
    } else {
      raw = (style as any)[prop] ?? null;
    }
    if (raw == null || raw === '' || raw === 'none') {
      const fallback =
        prop === 'scale' || prop === 'scaleX' || prop === 'scaleY' || prop === 'scaleZ' ? 1 : 0;
      this.initialValues.set(prop, fallback);
      return fallback;
    }
    const num = parseFloat(raw);
    if (!Number.isFinite(num)) {
      const fallback =
        prop === 'scale' || prop === 'scaleX' || prop === 'scaleY' || prop === 'scaleZ' ? 1 : 0;
      this.initialValues.set(prop, fallback);
      return fallback;
    }
    this.initialValues.set(prop, num);
    return num;
  }

  getNativeTarget(): unknown {
    const el = this.resolveElement();
    return el ?? this.source;
  }
}

const objectStore = new WeakMap<object, VisualTarget>();
const primitiveStore = new Map<number | string, VisualTarget>();

export function getOrCreateVisualTarget(target: any, type: TargetType): VisualTarget {
  if (type === TargetType.Primitive) {
    const key = typeof target === 'number' || typeof target === 'string' ? target : String(target);
    const existing = primitiveStore.get(key as number | string);
    if (existing) return existing;
    const created = new PrimitiveVisualTarget(key);
    primitiveStore.set(key, created);
    return created;
  }
  if (isObjectLike(target)) {
    const existing = objectStore.get(target as object);
    if (existing) return existing;
    const created =
      type === TargetType.DOM ? new DomVisualTarget(target) : new ObjectVisualTarget(target);
    objectStore.set(target as object, created);
    return created;
  }
  const fallback =
    type === TargetType.DOM ? new DomVisualTarget(target) : new ObjectVisualTarget(target);
  return fallback;
}

export function isVisualTargetCached(target: any, type: TargetType): boolean {
  if (type === TargetType.Primitive) {
    const key = typeof target === 'number' || typeof target === 'string' ? target : String(target);
    return primitiveStore.has(key as number | string);
  }
  if (isObjectLike(target)) {
    return objectStore.has(target as object);
  }
  return false;
}

export function isVisualTarget(value: unknown): value is VisualTarget {
  if (!value || typeof value !== 'object') return false;
  const v = value as any;
  return (
    typeof v.get === 'function' &&
    typeof v.set === 'function' &&
    typeof v.getNativeTarget === 'function'
  );
}
