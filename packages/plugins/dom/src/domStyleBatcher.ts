import { sharedBatchScheduler } from './batchScheduler';

type StyleMap = Map<HTMLElement, Record<string, string>>;
type TransformMap = Map<HTMLElement, string>;

const prevTransformByEl = new WeakMap<HTMLElement, string>();
const prevStyleByEl = new WeakMap<HTMLElement, Record<string, string>>();
const initializedElements = new WeakSet<HTMLElement>();

export type DomGPUConfig = {
  enableWillChange: boolean;
  useHardwareAcceleration: boolean;
};

export function initializeElementForGPU(
  element: HTMLElement,
  config: DomGPUConfig,
  debug?: (...args: any[]) => void,
): void {
  if (initializedElements.has(element)) return;

  if (config.enableWillChange) {
    element.style.willChange = 'transform';
  }

  if (config.useHardwareAcceleration) {
    const currentTransform = element.style.transform;
    if (!currentTransform || currentTransform === 'none') {
      element.style.transform = 'translateZ(0)';
      prevTransformByEl.set(element, 'translateZ(0)');
    }
  }

  initializedElements.add(element);
  if (debug) {
    debug('GPU-initialized element:', element);
  }
}

export class DomStyleBatcher {
  private styleUpdates: StyleMap = new Map();
  private transformUpdates: TransformMap = new Map();
  private styleRecordPool: Array<Record<string, string>> = [];
  private usedStyleRecords: Array<Record<string, string>> = [];
  private hasPendingUpdates = false;

  queueTransform(el: HTMLElement, transformStr: string): void {
    this.transformUpdates.set(el, transformStr);
    this.hasPendingUpdates = true;
  }

  queueStyle(el: HTMLElement, key: string, value: string): void {
    let rec = this.styleUpdates.get(el);
    if (!rec) {
      rec = this.styleRecordPool.pop() ?? {};
      this.styleUpdates.set(el, rec);
      this.usedStyleRecords.push(rec);
    }
    rec[key] = value;
    this.hasPendingUpdates = true;
  }

  preFrame(): void {
    for (let i = 0; i < this.usedStyleRecords.length; i++) {
      const rec = this.usedStyleRecords[i];
      for (const k in rec) {
        delete rec[k];
      }
      this.styleRecordPool.push(rec);
    }
    this.usedStyleRecords.length = 0;
    this.styleUpdates.clear();
    this.transformUpdates.clear();
    this.hasPendingUpdates = false;
  }

  postFrame(): void {
    if (!this.hasPendingUpdates) {
      return;
    }

    this.hasPendingUpdates = false;

    const transformsToApply = new Map(this.transformUpdates);
    const stylesToApply = new Map(this.styleUpdates);

    const applyUpdates = () => {
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

    const isTestEnv =
      (typeof process !== 'undefined' &&
        process.env &&
        (process.env.NODE_ENV === 'test' || (process.env as any).VITEST)) ||
      (typeof globalThis !== 'undefined' && (globalThis as any).vitest);

    if (isTestEnv || typeof requestAnimationFrame === 'undefined') {
      applyUpdates();
    } else {
      sharedBatchScheduler.scheduleCallback(applyUpdates);
    }
  }
}
