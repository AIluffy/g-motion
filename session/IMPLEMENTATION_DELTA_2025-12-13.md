# Implementation Delta (2025-12-13)

This note summarizes small, focused improvements applied today.

- Builder API: `mark()` now accepts either a single `MarkOptions` or an array. This restores ergonomic single-mark usage while preserving batch semantics.
  - File: packages/animation/src/api/builder.ts
  - Rationale: Reduce friction for common single-mark cases; maintain backward compatibility for array inputs.

- DOM Renderer: Added automatic `selectorCache` clearing via `MutationObserver` to avoid stale entries when the DOM mutates.
  - File: packages/plugins/dom/src/renderer.ts
  - Rationale: Prevent memory growth and ensure fresh element resolution for dynamic UIs.

No public types were changed. Behavior is backward-compatible for existing array-based `mark()` calls.
