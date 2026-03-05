const g = globalThis as any;

if (!g.navigator) {
  g.navigator = {};
}

if (!g.navigator.gpu) {
  g.navigator.gpu = { __isFake: true };
} else if (g.navigator.gpu.__isFake !== true) {
  g.navigator.gpu.__isFake = true;
}
