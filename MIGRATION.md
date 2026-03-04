# @g-motion/animation v2 → v3 Migration Guide

## Breaking changes

1. **`MarkOptions.easing` removed**
   - v2 (deprecated): `mark({ easing: 'easeOutQuad' })`
   - v3: use `ease` only.

2. **`MarkOptions.time` / `MarkValidationOptions.time` removed**
   - v2 (deprecated): `mark({ time: 500 })`
   - v3: use `at` only.

3. **Legacy runtime alias normalization removed**
   - v2 accepted alias mapping (`easing -> ease`, `time -> at`) at runtime.
   - v3 removes alias fallback. Old fields are ignored by types and should be migrated.

4. **Generic typing is now default API behavior**
   - `motion()` is now typed as `motion<T extends MotionTarget>(target: T)`.
   - `MarkOptions<T>.to` now uses `AnimatableProps<T>`.
   - `onUpdate` payload is now typed as `Partial<AnimatableProps<T>>`.

5. **Unified Promise-like control return shape**
   - `motion(...).play()` returns `AnimationControl & PromiseLike<void>`.
   - `animate(...)` returns `AnimationControl & PromiseLike<void>`.

---

## Manual migration

### 1) Rename `easing` to `ease`

```ts
// v2
motion('.box').mark({ to: { x: 100 }, easing: 'easeOutQuad', duration: 300 });

// v3
motion('.box').mark({ to: { x: 100 }, ease: 'easeOutQuad', duration: 300 });
```

### 2) Rename `time` to `at`

```ts
// v2
motion('.box').mark({ to: { opacity: 1 }, time: 500 });

// v3
motion('.box').mark({ to: { opacity: 1 }, at: 500 });
```

### 3) Update typed usage where needed

```ts
const obj = { x: 0, y: 0 };

// v3 typed suggestions/errors are stricter
motion(obj).mark({ to: { x: 100 } }); // ✅
motion(obj).mark({ to: { z: 100 } }); // ❌ Property 'z' does not exist
```

### 4) Await control directly (optional)

```ts
await motion('.item').mark({ to: { opacity: 1 }, duration: 300 }).play();
```

---

## Automated migration (codemod)

A codemod is provided at `tools/codemod-v3.ts`.

### Example usage with jscodeshift

```bash
jscodeshift -t tools/codemod-v3.ts "src/**/*.{ts,tsx,js,jsx}"
```

This codemod performs:
- `easing:` → `ease:`
- `time:` → `at:`

> Review output after transformation, especially for edge cases (comments/strings/object literals with unrelated `time` keys).

---

## Q&A

### Q1: Why remove aliases if they were working?
For v3, API clarity and type safety are prioritized. Keeping aliases creates naming ambiguity and weakens typing contracts.

### Q2: Does runtime behavior change for correctly migrated code?
No. For code already using `ease` and `at`, runtime semantics remain the same.

### Q3: I rely on dynamic targets and loose typing. Is that still possible?
Yes. You can still use broader target types, but typed APIs now provide stronger inference by default.

### Q4: Do I have to use `await` now?
No. Existing imperative control style (`play/pause/stop/reverse/destroy`) remains available.

### Q5: What about `onComplete`?
`onComplete` is still supported. Promise-like `finished`/`await` is an additional composition option.
