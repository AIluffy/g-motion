export type Bounds = { centerX: number; centerY: number; centerZ: number; radius: number };

const boundsCache = new WeakMap<object, { bounds: Bounds; ts: number }>();

export function resolveViewportBounds(target: any, now: number): Bounds | null {
  if (!target || typeof target !== 'object') return null;

  const cached = boundsCache.get(target);
  if (cached && now - cached.ts < 100) return cached.bounds;

  const anyTarget: any = target as any;
  const native =
    anyTarget && typeof anyTarget.getNativeTarget === 'function'
      ? anyTarget.getNativeTarget()
      : anyTarget;
  const el =
    typeof HTMLElement !== 'undefined' && native instanceof HTMLElement
      ? (native as HTMLElement)
      : null;
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;

  let rect: any = null;
  try {
    rect = el.getBoundingClientRect();
  } catch {
    rect = null;
  }
  if (!rect) return null;

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const r = Math.sqrt(rect.width * rect.width + rect.height * rect.height) / 2;
  const bounds = { centerX: cx, centerY: cy, centerZ: 0, radius: r };
  boundsCache.set(target, { bounds, ts: now });
  return bounds;
}
