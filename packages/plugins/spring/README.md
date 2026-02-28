# @g-motion/plugin-spring

面向 Motion 的 GPU 弹簧物理插件。它在批处理管线中通过 WebGPU Shader 计算弹簧动力学，并在达到静止阈值时自动结束动画。插件仅提供 GPU 实现，没有 CPU 兜底。

## 主要特性

- GPU 弹簧物理计算，使用半隐式欧拉积分保证稳定性
- 基于组件的弹簧参数管理，支持每个轨道的初始速度
- 内置常用弹簧预设与临界阻尼计算工具
- 导入即自动注册，适配 @g-motion/animation 的 mark 流程
- 基于 restSpeed/restDelta 判定动画是否收敛

## 安装

```bash
pnpm add @g-motion/plugin-spring
```

## 快速开始

```ts
import { motion } from '@g-motion/animation';
import '@g-motion/plugin-spring';

motion('#box')
  .mark({
    to: { x: 200, y: 100 },
    spring: {
      stiffness: 200,
      damping: 15,
      mass: 1,
      restSpeed: 10,
      restDelta: 0.01,
    },
  })
  .animate();
```

## 详细配置说明

`spring` 配置与 `SpringOptions` 类型一致，默认值由插件提供：

- stiffness：弹簧刚度，默认 100
- damping：阻尼系数，默认 10
- mass：质量，默认 1
- restSpeed：速度阈值，低于该值可判定为静止，默认 10
- restDelta：位移阈值，低于该值可判定为静止，默认 0.01
- initialVelocity：可选的初始速度，按轨道记录

当 `mark()` 中出现 `spring` 配置时，时间线会走弹簧物理流程，完成时机由收敛阈值决定。

常用预设可直接复用：

- gentle
- default
- wobbly
- stiff
- slow
- molasses

## API 文档

### springPlugin

插件实例，包含 Spring 组件与 GPU Shader 清单。导入模块后会自动注册。

### SpringComponentSchema

Spring 组件的 schema 定义，包含 stiffness、damping、mass、restSpeed、restDelta 与 velocities 字段。

### analyzeSpringTracks(tracks)

扫描时间线轨道，返回：

- hasSpring：是否存在弹簧配置
- springConfig：首个出现的 spring 配置
- springVelocities：按轨道记录的 initialVelocity

### buildSpringComponent(config, velocities)

根据 SpringOptions 与速度表构建 Spring 组件数据，缺省值与默认配置一致。

### SPRING_PRESETS

常用弹簧参数预设集合。

### calculateCriticalDamping(stiffness, mass)

根据刚度与质量计算临界阻尼值，公式为 `2 * sqrt(stiffness * mass)`。

### SPRING_GPU_SHADER

导出用于调试或自定义管线的 WGSL Shader 源码字符串。

### SpringOptions

弹簧配置类型定义，来自 `@g-motion/core`。

## 使用示例

### 使用预设

```ts
import { SPRING_PRESETS } from '@g-motion/plugin-spring';

motion('#panel')
  .mark({
    to: { x: 240 },
    spring: SPRING_PRESETS.wobbly,
  })
  .animate();
```

### 设置初始速度

```ts
motion('#ball')
  .mark({
    to: { x: 320 },
    spring: { stiffness: 170, damping: 26, initialVelocity: 120 },
  })
  .animate();
```

### 计算临界阻尼

```ts
import { calculateCriticalDamping } from '@g-motion/plugin-spring';

const damping = calculateCriticalDamping(220, 1.2);

motion('#chip')
  .mark({
    to: { x: 180 },
    spring: { stiffness: 220, damping, mass: 1.2 },
  })
  .animate();
```

## 常见问题

### 为什么动画没有触发弹簧？

确认 mark 中包含 `spring` 配置，且插件已被导入（自动注册）。

### spring 可以和 inertia 同时使用吗？

不可以。同一 mark 内同时使用 spring 与 inertia 会触发参数校验错误。

### 是否必须有 WebGPU？

是的，该插件仅提供 GPU 实现，没有 CPU 兜底。

## 贡献指南

- 构建：pnpm --filter @g-motion/plugin-spring run build
- 测试：pnpm --filter @g-motion/plugin-spring test
- 提交前建议运行：pnpm lint 与 pnpm type-check
