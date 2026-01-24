# @g-motion/animation

面向多目标（DOM/对象/数值）的动画编排与执行库，构建在 Motion ECS 引擎之上，默认使用 GPU 计算路径，并提供链式 API、批量动画、物理弹性/惯性、GPU 指标查询与全局引擎配置能力。

## 目录结构与模块划分

```
src/
  index.ts                 # 包入口与统一导出
  engine.ts                # 全局引擎配置
  registery.ts             # 系统/组件注册
  batch-runner.ts          # 批量动画执行器
  component-types.ts       # ECS 组件类型定义
  api/
    builder.ts             # motion() 链式构建器
    animate.ts             # animate() 便捷 API
    control.ts             # AnimationControl 控制器
    mark.ts                # Mark/Target 解析与校验入口
    keyframes.ts           # 关键帧轨道构建
    render.ts              # Render/Transform 组件构建
    adjust.ts              # 时间轴调整
    validation.ts          # Mark 参数校验与标准化
    gpu-status.ts          # GPU 指标查询
    gpuChannelMapper.ts    # GPU 轨道映射注册
    visualTarget.ts        # 统一 VisualTarget 适配
    timeline.ts            # 关键帧时间/插值工具
```

## 整体架构与执行流程

1. 调用 `motion(target)` 创建 `MotionBuilder`，收集 `mark()`/`set()`/`adjust()` 等指令形成轨道（Timeline）。
2. `play()` 时注册必要 ECS 组件与系统（Time/Timeline/Roving/BatchSampling/WebGPU/Render），构造实体并启动调度器。
3. `VisualTarget` 抽象统一处理 DOM、对象与数值目标；`keyframes.ts` 将 Mark 解析为关键帧轨道。
4. GPU 通道映射在 `play()` 里注册，优先走 GPU 计算路径；渲染通过 `Render`/`Transform` 组件完成。
5. `AnimationControl` 负责播放控制、进度查询、销毁与批量控制协调。

## 核心功能

- 链式构建动画：`mark()`、`set()`、`track()`、`adjust()`、`option()`、`play()`
- 单体与批量动画：数组目标自动切换为批量模式，支持 `stagger` 与 per-entity 函数
- 物理能力：Spring 与 Inertia（由插件分析器注入组件）
- 目标解析：支持 DOM 选择器、DOM 元素、对象、数值与数组/类数组
- GPU 能力：GPU 轨道映射与指标查询
- 全局引擎配置：全局速度、FPS、采样模式、工作切片等

## 依赖关系

- 运行时依赖：`@g-motion/core`、`@g-motion/utils`、`@g-motion/values`、`@g-motion/shared`
- 物理插件：`@g-motion/plugin-spring`、`@g-motion/plugin-inertia`
- 构建与测试：`@rslib/core`、`vitest`、`typescript`

## 快速使用

### 1) 链式构建动画

```ts
import { motion } from '@g-motion/animation';

const control = motion('.box')
  .mark({ to: { x: 200, opacity: 0.5 }, duration: 300 })
  .mark({ to: { x: 0, opacity: 1 }, duration: 300, ease: 'easeOutQuad' })
  .option({ onUpdate: (v) => console.log(v) })
  .play();
```

### 2) 批量动画与 stagger

```ts
import { motion } from '@g-motion/animation';

const control = motion([{ x: 0 }, { x: 0 }, { x: 0 }])
  .mark([
    {
      to: (index) => ({ x: 100 + index * 10 }),
      duration: 300,
      stagger: 100,
    },
  ])
  .play();
```

### 3) animate 便捷 API

```ts
import { animate } from '@g-motion/animation';

animate({ value: 0 }, { value: [0, 100, 0] }, { duration: 600, ease: 'easeInOutQuad' });
```

### 4) Scoped Motion（DOM 范围内查询）

```ts
import { createScopedMotion } from '@g-motion/animation';

const scopedMotion = createScopedMotion(document.querySelector('#scope')!);
scopedMotion('.box').mark({ to: { x: 120 }, duration: 200 }).play();
```

## 公共 API 速览

### motion() 与 MotionBuilder

```ts
motion(target, options?)
  .track(prop)
  .set(prop, timeOrDuration, to, options?)
  .mark(mark | mark[])
  .adjust({ offset?, scale? })
  .option({ delay?, repeat?, onUpdate?, onComplete? })
  .play(options?)
```

- `motion(target, options?)`：创建构建器。`target` 可为 DOM 选择器、DOM 元素、对象、数值或数组。
- `track(prop)`：为下一次 `mark()` 绑定默认属性。
- `set(prop, timeOrDuration, to, options?)`：快捷设置单属性目标值。
- `mark()`：添加关键帧标记，支持数组与 per-entity 函数、`stagger`。
- `adjust({ offset?, scale? })`：对时间轴整体平移与缩放。
- `option()`：设置播放选项。
- `play()`：生成 `AnimationControl` 并开始播放。

### AnimationControl

- `play()` / `pause()` / `stop()` / `reverse()`
- `seek(timeMs)` / `seekFrame(frame, fps?)`
- `getCurrentTime()` / `getDuration()`
- `getFramePosition(fps?)` / `getFrameIndex(fps?)`
- `setPlaybackRate(rate)` / `getPlaybackRate()`
- `setFps(fps)` / `getFps()`
- `getEntityIds()` / `getControls()` / `getCount()` / `isBatchAnimation()`
- `destroy(removeEntities = true)`

### animate()

```ts
animate(target, to, options?)
```

将 `to` 转换为一个或多个 `mark()` 片段，并返回 `AnimationControl`。`to` 支持数值、对象或包含 keyframe 数组的对象。

### inspectTargets()

```ts
inspectTargets(input, { root?, strictTargets? })
```

返回目标解析结果与环境信息，便于调试 DOM 选择器或复杂输入。

### engine（全局引擎配置）

```ts
engine.setSpeed(speed)
engine.setFps(fps)
engine.setSamplingMode('time' | 'frame')
engine.setSamplingFps(fps)
engine.setMetricsSamplingRate(rate)
engine.setWorkSlicing({ enabled?, interpolationArchetypesPerFrame?, batchSamplingArchetypesPerFrame? })
engine.configure({...})
engine.getConfig()
engine.reset()
```

### GPU 指标查询

```ts
isGPUAvailable()
getGPUBatchStatus()
getGPUMetrics()
getLatestGPUMetric()
clearGPUMetrics()
getSystemTimings()
```

### VisualTarget 配置

```ts
setVisualTargetGPUConfig({
  dom: ['x', 'y', 'opacity'],
  object: ['x', 'y', 'scale'],
})
```

用于限制可走 GPU 的属性集合。

## MarkOptions（关键帧标记）

```ts
type MarkOptions = {
  to?: any | ((index, entityId, target?) => any)
  at?: number | ((index, entityId) => number)
  duration?: number
  ease?: Easing
  interp?: 'linear' | 'bezier' | 'hold' | 'autoBezier'
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number }
  spring?: SpringOptions
  inertia?: InertiaOptions
  stagger?: number | ((index) => number)
}
```

要点：
- `at` 为绝对时间，`duration` 为相对时长（二者任选其一）。
- `stagger` 支持线性间隔或函数。
- `spring` 与 `inertia` 互斥。

## 目标解析与范围配置

- `motion(target, { strictTargets? })`：控制目标解析严格度。
- `createScopedMotion(root)`：在指定 DOM 根节点内解析选择器。
- `resolveTargets()` 支持 DOM 选择器、DOM 元素、对象、数值、数组、NodeList、类数组等。

## 构建与测试

在仓库根目录执行：

```bash
pnpm --filter @g-motion/animation build
pnpm --filter @g-motion/animation dev
pnpm --filter @g-motion/animation test
```

或执行全局脚本：

```bash
pnpm build
pnpm test
pnpm lint
pnpm type-check
```
