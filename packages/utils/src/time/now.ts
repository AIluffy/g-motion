export function getNowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
