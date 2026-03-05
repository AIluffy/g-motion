# WebGPU Systems Dependency Matrix (@g-motion/core)

## Scope
- Source set: `src/systems/webgpu/**`
- Objective: evaluate extractability and circular dependency risk.

## 1) WebGPU systems -> Core internal dependencies

| WebGPU module | Direct internal deps |
| --- | --- |
| `systems/webgpu/system.ts` | `gpu-bridge`, `gpu-bridge/types`, `runtime/plugin`, `systems/webgpu/*` |
| `systems/webgpu/initialization.ts` | `gpu-bridge`, `gpu-bridge/types` |
| `systems/webgpu/frame-context.ts` | `runtime/plugin`, `systems/webgpu/system-config` |
| `systems/webgpu/system/gpu-initialization-system.ts` | `gpu-bridge`, `gpu-bridge/types`, `runtime/plugin` |
| `systems/webgpu/system/output-buffer-processor.ts` | `gpu-bridge`, `gpu-bridge/types`, `runtime/world`, `systems/batch`, `systems/webgpu/debug`, `systems/webgpu/system/viewport-culling-system` |
| `systems/webgpu/system/physics-dispatch-system.ts` | `gpu-bridge`, `gpu-bridge/types`, `runtime/plugin`, `systems/batch`, `systems/webgpu/physics-validation` |
| `systems/webgpu/system/readback-processing-system.ts` | `gpu-bridge`, `gpu-bridge/types`, `runtime/plugin`, `systems/batch`, `systems/webgpu/physics-validation`, `systems/webgpu/system/*` |
| `systems/webgpu/system/viewport-culling-system.ts` | `gpu-bridge`, `gpu-bridge/types`, `runtime/world`, `systems/batch` |
| `systems/webgpu/delivery/*` | `gpu-bridge`, `gpu-bridge/types`, `runtime/world`, `runtime/plugin`, `components/state`, `render/renderer-code` |

## 2) Core internal -> WebGPU systems reverse dependencies

| Core module | Depends on `systems/webgpu/*` |
| --- | --- |
| `src/index.ts` | re-export only |
| `src/webgpu-systems.ts` | re-export only |
| Other core runtime modules | none |

## 3) Circular dependency risk

- In `systems/webgpu/**` internal import graph: **no cycles detected**.
- Main coupling blocker for extraction to another package is not cyclicity but dependency breadth:
  - `runtime/plugin`
  - `runtime/world`
  - `systems/batch`
  - `gpu-bridge`

## Decision

Choose **方案 C（保持在 core 中，通过 subpath export 隔离）**.

### Reasons
1. Keeps current public API stable (`@g-motion/core` root exports unchanged).
2. Avoids creating cross-package back edges (`webgpu -> core` and `core -> webgpu` orchestration loops).
3. Matches current build setup where dedicated subpath already exists (`./webgpu-systems`) for isolating GPU-only imports.

## Execution notes

- Continue using dedicated entry `src/webgpu-systems.ts` and package subpath `@g-motion/core/webgpu-systems` for GPU-only consumption.
- Keep non-GPU users on `@g-motion/core/systems` and root exports unaffected.
