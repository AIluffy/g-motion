# Spring Demo Fix

Summary of the issue and patch applied.

## Issue
- Spring demo crashed when writing to `Transform` due to using the `in` operator on an undefined per-entity `Transform` object.
- Condition checked `transformBuffer && key in transformBuffer[i]` which fails when `transformBuffer[i]` is undefined.

## Fix
- Guard per-entity `Transform` existence before using `in`:
  - Use `const transform = transformBuffer ? transformBuffer[i] : undefined`.
  - Read/write to `Transform` only if `transform && key in transform`.
  - Otherwise fall back to `Render.props`.
- Applied in [packages/plugins/spring/src/spring-system.ts](packages/plugins/spring/src/spring-system.ts).

## Validation
- Full monorepo build succeeded: `pnpm build`.
- Examples bundle includes `spring` route without errors.

## Notes
- This preserves compatibility with typed buffers and AoS paths.
- Further optimization can write to typed `Transform` buffers where available.
