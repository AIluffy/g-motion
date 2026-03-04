import type { Easing } from '@g-motion/shared';
import type { StaggerOptions, StaggerValue } from '../types/animation-target-types';

function applyNamedEase(name: string, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (name) {
    case 'linear':
      return x;
    case 'easeInQuad':
    case 'easeIn':
    case 'ease-in':
      return x * x;
    case 'easeOutQuad':
    case 'easeOut':
    case 'ease-out':
      return 1 - (1 - x) * (1 - x);
    case 'easeInOutQuad':
    case 'easeInOut':
    case 'ease-in-out':
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    default:
      return x;
  }
}

function applyEase(ease: Easing | undefined, value: number): number {
  if (!ease) return value;
  const x = Math.min(1, Math.max(0, value));
  return applyNamedEase(ease, x);
}

function resolveOrigin(options: StaggerOptions, total: number): number {
  const from = options.from ?? 'first';
  if (typeof from === 'number') {
    return Math.min(Math.max(0, from), Math.max(0, total - 1));
  }
  switch (from) {
    case 'last':
      return Math.max(0, total - 1);
    case 'center':
      return Math.max(0, (total - 1) / 2);
    case 'edges':
      return -1;
    case 'first':
    default:
      return 0;
  }
}

function distance1D(index: number, total: number, options: StaggerOptions): number {
  const from = options.from ?? 'first';
  if (from === 'edges') {
    return Math.min(index, Math.max(0, total - 1 - index));
  }
  const origin = resolveOrigin(options, total);
  return Math.abs(index - origin);
}

function resolveGridOrigin(
  options: StaggerOptions,
  rows: number,
  cols: number,
): { row: number; col: number; edges: boolean } {
  const from = options.from ?? 'first';
  if (from === 'last') return { row: rows - 1, col: cols - 1, edges: false };
  if (from === 'center') return { row: (rows - 1) / 2, col: (cols - 1) / 2, edges: false };
  if (from === 'edges') return { row: 0, col: 0, edges: true };
  if (typeof from === 'number') {
    const clamped = Math.max(0, Math.min(rows * cols - 1, from));
    return { row: Math.floor(clamped / cols), col: clamped % cols, edges: false };
  }
  return { row: 0, col: 0, edges: false };
}

function distanceGrid(index: number, total: number, options: StaggerOptions): number {
  const [rowsRaw, colsRaw] = options.grid ?? [0, 0];
  const rows = Math.max(1, Math.floor(rowsRaw || 1));
  const cols = Math.max(1, Math.floor(colsRaw || 1));
  const i = Math.max(0, Math.min(total - 1, index));
  const row = Math.floor(i / cols);
  const col = i % cols;

  const origin = resolveGridOrigin(options, rows, cols);

  if (origin.edges) {
    const dRow = Math.min(row, Math.max(0, rows - 1 - row));
    const dCol = Math.min(col, Math.max(0, cols - 1 - col));
    return options.axis === 'x' ? dCol : options.axis === 'y' ? dRow : Math.hypot(dRow, dCol);
  }

  const dRow = Math.abs(row - origin.row);
  const dCol = Math.abs(col - origin.col);

  if (options.axis === 'x') return dCol;
  if (options.axis === 'y') return dRow;
  return Math.hypot(dRow, dCol);
}

export function resolveStagger(stagger: StaggerValue, index: number, total: number): number {
  const safeTotal = Math.max(1, total);
  const safeIndex = Math.max(0, Math.min(index, safeTotal - 1));

  if (typeof stagger === 'number') {
    return safeIndex * stagger;
  }

  if (typeof stagger === 'function') {
    const value = stagger(safeIndex, safeTotal);
    return Number.isFinite(value) ? value : 0;
  }

  const options = stagger;
  const each = Number.isFinite(options.each) ? Math.max(0, options.each) : 0;
  if (safeTotal <= 1 || each === 0) return 0;

  const distance = options.grid
    ? distanceGrid(safeIndex, safeTotal, options)
    : distance1D(safeIndex, safeTotal, options);

  let maxDistance = 0;
  for (let i = 0; i < safeTotal; i++) {
    const d = options.grid
      ? distanceGrid(i, safeTotal, options)
      : distance1D(i, safeTotal, options);
    if (d > maxDistance) maxDistance = d;
  }

  const normalizedDistance = maxDistance > 0 ? distance / maxDistance : 0;
  const eased = applyEase(options.ease, normalizedDistance);

  return eased * each * (safeTotal - 1);
}
