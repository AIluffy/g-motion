# @g-motion/core

ECS runtime and systems for Motion. Provides World, Archetype storage, scheduler, and core systems (time, timeline, interpolation, render, batch, webgpu).

## Develop
- Install: `pnpm install`
- Build: `pnpm --filter @g-motion/core run build`
- Test: `pnpm --filter @g-motion/core test`

## Architecture
- **World**: singleton holding component registry, entity manager, scheduler, archetypes.
- **Archetype**: groups entities by component signature; contiguous buffers for cache-friendly access.
- **Systems**: time → timeline → interpolation → render; batch/webgpu for large workloads.
- **Plugins**: register components/systems via MotionPlugin (e.g., WebGPUComputePlugin in webgpu/plugin.ts).

## Key files
- src/world.ts — World singleton and archetype management
- src/archetype.ts — buffer storage for components
- src/systems/time.ts — clocks and delta updates
- src/systems/render.ts — applies Render components
- src/systems/batch.ts, src/systems/webgpu.ts — batching and GPU compute path
- src/webgpu/* — buffer/shader orchestration

## Contracts
- Keep component buffers contiguous; avoid per-frame allocations in hot paths.
- Preserve public exports in src/index.ts and package.json `exports`.
- When adding components/systems, ensure registration paths are updated and tests cover new behavior.

## Frame-based Sampling

`MotionAppConfig` 支持配置采样模式：
- `samplingMode: 'time' | 'frame'`（默认 `time`）
- `samplingFps: number`（按帧采样的 FPS，支持小数）

当 `samplingMode === 'frame'` 时，调度器会基于 `samplingFps` 计算每帧的 `deltaFrame / deltaTimeMs`，并在 `SystemContext.sampling` 中暴露给系统使用；`TimeSystem` 会用该 `deltaTimeMs` 推进动画时间，从而实现帧对齐推进。

## Reverse Playback

- `MotionState.playbackRate` 支持负数，表示反向播放（由 `TimeSystem` 推进 `currentTime`）。
- 当 `currentTime` 超出 `[0, duration]` 区间时，时间轴系统会进行夹取/循环处理以保证动画可完成。
