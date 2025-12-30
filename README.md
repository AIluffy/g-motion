# Motion Engine

High-performance, modular animation engine for the web, built on an Archetype ECS with optional WebGPU offload.

## Packages
- **@g-motion/core**: ECS runtime (World, Archetype), time/render/batch/webgpu systems.
- **@g-motion/animation**: Public `motion()` builder, timeline + interpolation systems.
- **@g-motion/plugin-dom**: DOM transform component + renderer.
- **@g-motion/utils**: Shared utilities.

## Quick Start
```bash
pnpm install
pnpm build       # or pnpm dev
pnpm test        # vitest via turbo
```

Basic usage:
```ts
import { motion } from '@g-motion/animation';

// Number tween
motion(0).mark({ to: 100 }, at: 10).play();

// DOM transform
motion('#box').mark({ to: { x: 100 }, at: 1000 }).play();
```

## Architecture Snapshot
- Archetype ECS: entities grouped by component signature for cache locality.
- Systems pipeline: Time -> Timeline -> Interpolation -> Render; optional Batch/WebGPU for large workloads.
- Plugins: add property handling, systems, or renderers (e.g., DOM plugin registers Transform + DOM renderer).

## VisualTarget & GPU 属性配置

`@g-motion/animation` 会把 DOM / 对象 / 原始值统一抽象成 `VisualTarget`，并在这一层决定哪些属性可以走 GPU 通道（WebGPU 批处理）、哪些属性走 CPU。

### 默认可 GPU 属性

系统级的“最大候选属性集”（对 DOM / 对象生效）为：

- `x`, `y`, `z`
- `translateX`, `translateY`, `translateZ`
- `scale`, `scaleX`, `scaleY`, `scaleZ`
- `rotate`, `rotateX`, `rotateY`, `rotateZ`
- `perspective`
- `opacity`

不同 `VisualTarget` kind 的默认行为：

- `dom`：默认允许上面所有属性走 GPU。
- `object`：默认允许上面所有属性走 GPU，但必须满足：
  - 属性名在上述集合中，且
  - 目标对象上该属性的初始值是有限数值（`number` 且 `Number.isFinite`）。
- `primitive`：不使用 GPU 通道。

### 全局 per-kind GPU 配置

可以通过全局配置，按 kind 精细控制允许走 GPU 的属性集合：

```ts
import { setVisualTargetGPUConfig } from '@g-motion/animation';

setVisualTargetGPUConfig({
  dom: ['x', 'y', 'opacity'],
  object: ['x', 'y'],
  primitive: [],
});
```

语义说明：

- `dom`：只为 `x / y / opacity` 注册 GPU 通道，其他属性走 CPU。
- `object`：只为对象目标的 `x / y` 注册 GPU 通道。
- `primitive`：保持禁用 GPU。

传入的属性名会自动与系统级集合求交集：不在默认集合中的属性名会被忽略，保证 GPU 通道只用于已支持的 transform/opacity 维度。

### Builder 与 GPU 通道映射

- `motion(target)` 在内部会为单个目标构建一个 `VisualTarget`，并基于 `VisualTarget.canUseGPU(prop)` 决定是否为该属性注册 GPU 通道。
- 对 DOM / 对象目标：
  - Timeline 中每条非 `__primitive` 轨道的属性键都会先收集；
  - 只要 `visualTarget.canUseGPU(prop)` 为真，就会把该属性加入 GPU 通道映射表。
- 如果所有属性都被过滤掉（即当前配置完全禁用 GPU），系统会回退到 CPU 路径，不会破坏原有行为或测试。

## Workflows
- Dev/watch: `pnpm dev`
- Build all: `pnpm build` (or `pnpm build:packages`, `pnpm build:apps`)
- Test all: `pnpm test` (filter: `pnpm --filter @g-motion/core test`)
- Example app: `cd apps/examples && pnpm dev`

## References
- Specs: specs/001-motion-engine
- WebGPU guides: WEBGPU_COMPUTE_SUMMARY.md, WEBGPU_INTEGRATION_GUIDE.md
