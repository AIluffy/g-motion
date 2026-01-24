# @g-motion/plugin-inertia

面向 Motion 的惯性物理插件，使用 GPU 计算实现指数衰减与边界反弹。该插件在模块加载时自动注册，并通过 WebGPU 计算管线执行惯性更新，没有 CPU 兜底实现。

## 项目概述

插件提供 Inertia 组件与对应的 GPU Shader。动画系统在批处理阶段把惯性状态写入 GPU 缓冲区，调用 updateInertia 计算下一帧的位置与速度，然后把结果回写到 Render 管线。

## 主要特性

- GPU 侧惯性衰减与弹性反弹，适合动量滑动与回弹场景
- 速度来源灵活：直接数值、函数回调、或通过 velocitySource 自行计算
- 支持边界限制与 clamp 行为，可切换为弹性回弹
- deceleration、duration、resistance 统一映射到 timeConstant
- 提供 VelocityTracker 工具用于采样速度
- 暴露分析与构建工具，便于自定义动画流程

## 安装

```bash
pnpm add @g-motion/plugin-inertia
```

## 使用方式

### 基础惯性衰减

```ts
import { motion } from '@g-motion/animation';
import '@g-motion/plugin-inertia';

motion('#element')
  .mark({
    inertia: {
      velocity: 800,
      deceleration: 4,
    },
  })
  .animate();
```

### 边界与反弹

```ts
motion('#element')
  .mark({
    inertia: {
      velocity: 1000,
      bounds: { min: 0, max: 500 },
      bounce: { stiffness: 400, damping: 10, mass: 1 },
    },
  })
  .animate();
```

### 自定义速度来源

```ts
motion('#element')
  .mark({
    inertia: {
      velocity: 'auto',
      velocitySource: (_track, ctx) => {
        return ctx.target?.velocityX ?? 0;
      },
    },
  })
  .animate();
```

### VelocityTracker 配合使用

```ts
import { VelocityTracker } from '@g-motion/plugin-inertia';

const element = document.querySelector('#draggable');
VelocityTracker.track(element, ['x', 'y']);

motion(element)
  .mark({
    inertia: {
      velocity: 'auto',
      velocitySource: (track) => VelocityTracker.getVelocity(element, track),
    },
  })
  .animate();

VelocityTracker.untrack(element);
```

## 配置说明

### InertiaOptions

```ts
interface InertiaOptions {
  velocity?: number | 'auto' | (() => number);
  velocitySource?: (track: string, ctx: { target: any }) => number;

  min?: number;
  max?: number;
  bounds?: { min?: number; max?: number };
  clamp?: boolean;

  deceleration?: number;
  resistance?: number;
  duration?: number | { min: number; max: number };

  bounce?: false | { stiffness?: number; damping?: number; mass?: number };

  restSpeed?: number;
  restDelta?: number;
}
```

### timeConstant 映射规则

插件内部会把惯性参数规范化为 timeConstant（毫秒）：

- deceleration > 0：timeConstant = 1000 / deceleration
- duration 为 number：timeConstant = duration * 1000
- duration 为 { min, max }：timeConstant 取区间均值并转换为毫秒
- resistance：timeConstant = 1000 / max(1, resistance)
- 未提供时默认 350ms

## 核心 API

### inertiaPlugin

插件实例，模块加载时会自动注册。引擎侧可直接使用：

```ts
import { inertiaPlugin } from '@g-motion/plugin-inertia';
```

### analyzeInertiaTracks(tracks, target)

扫描时间线轨道，收集惯性配置与各轨道速度：

```ts
import { analyzeInertiaTracks } from '@g-motion/plugin-inertia';

const result = analyzeInertiaTracks(tracks, target);
```

### buildInertiaComponent(config, velocities)

构建 Inertia 组件数据：

```ts
import { buildInertiaComponent } from '@g-motion/plugin-inertia';

const inertiaComponent = buildInertiaComponent(config, velocities);
```

### VelocityTracker

速度跟踪工具：

```ts
import { VelocityTracker } from '@g-motion/plugin-inertia';

VelocityTracker.track(target, ['x', 'y']);
const vx = VelocityTracker.getVelocity(target, 'x');
VelocityTracker.untrack(target);
```

### INERTIA_GPU_SHADER

暴露的 WGSL Shader 源码，供自定义渲染或调试使用：

```ts
import { INERTIA_GPU_SHADER } from '@g-motion/plugin-inertia';
```

## 常见问题

### 为什么没有运动或速度为 0？

确保 inertia.velocity 有值，或在 velocity 为 auto 时提供 velocitySource。未能解析速度时会被视为 0。

### 边界为什么没有触发？

GPU 侧仅在 min < max 时启用边界判断，请确保 bounds 或 min/max 合法。

### 可以和 spring 同时使用吗？

同一 mark 内同时使用 spring 与 inertia 会触发参数校验错误，应拆分为不同 mark 或选择一种物理模型。

### 是否必须有 WebGPU？

是的，该插件仅提供 GPU 实现，没有 CPU 兜底，需在 WebGPU 可用环境运行。

## 贡献指南

- 构建：pnpm --filter @g-motion/plugin-inertia run build
- 测试：pnpm --filter @g-motion/plugin-inertia test
- 提交前建议运行：pnpm lint 与 pnpm type-check
