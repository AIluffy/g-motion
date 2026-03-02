# @g-motion/core

Motion 的 ECS 运行时与核心系统集合。提供 World、Archetype、调度器、渲染派发与 WebGPU 计算路径的基础能力，是插件与上层动画包的底座。

## 定位

- 负责 ECS 数据组织、系统执行与渲染派发
- 面向引擎开发与插件作者，上层 API 建议使用 `@g-motion/animation`
- 对外导出集中于 `src/index.ts`

## 安装与开发

在仓库内使用：

```bash
pnpm install
pnpm --filter @g-motion/core run build
pnpm --filter @g-motion/core test
```

## 架构概览

- **World**：持有 ComponentRegistry、EntityManager、SystemScheduler、ArchetypeManager
- **Archetype**：按组件签名分组，采用 SoA TypedBuffer 以提升访问局部性
- **SystemScheduler**：按 `order` 排序执行系统，并在活跃实体存在时自动启动
- **App**：统一注册组件、系统、Renderer 与 Shader
- **Plugin**：通过 manifest 描述组件/系统/Shader，或由 engine.use 应用

## 核心组件

- **MotionStateComponent**：运行态状态与时间推进字段（status、startTime、currentTime 等）
- **TimelineComponent**：轨道数据与播放控制（tracks、duration、loop、repeat 等）
- **RenderComponent**：渲染目标与输出（rendererId、target、props、version 等）

## 系统管线

常用系统及默认顺序：

- `TimeSystem`（order=0）：根据开始时间、延迟与播放速率计算当前时间
- `TimelineSystem`（order=4）：处理循环/重复、时间夹取与完成状态
- `ActiveEntityMonitorSystem`（order=9）：统计活跃实体数量以驱动调度器
- `RovingResolverSystem`（order=12）：为未显式指定时间的关键帧分配时间
- `RenderSystem`（order=30）：按 Renderer 分组批量写回渲染目标

WebGPU 与批处理相关系统位于 `systems/webgpu` 与 `systems/batch`，用于大批量插值计算与读回。

## 关键 API

### World

- `World.create(config?)`
- `createEntity(data)` / `createEntitiesBurst(names, dataArray)`
- `markForDeletion(ids)` / `flushDeletions()` / `getPendingDeletions()`
- `getArchetype(names)` / `getEntityArchetype(id)`

### Engine

- `createEngine(config?)`
- `getDefaultEngine(config?)`
- `getEngineForWorld(world)`
- `engine.use(plugin)` / `engine.reset()` / `engine.dispose()`

### App

- `registerComponent(name, def)`
- `registerSystem(system)`
- `registerRenderer(name, renderer)`
- `registerShader(shader)` / `registerGpuEasing(wgslFn)`

内置 Renderer：`callback`、`primitive`、`object`。

### 插件

- `MotionPlugin` + `PluginManifest`
- `registerPlugin(plugin)` 用于全局自动发现

## 配置项（MotionAppConfig）

常见字段：

- `globalSpeed` / `targetFps` / `frameDuration`
- `samplingMode: 'time' | 'frame'` / `samplingFps`
- `workSlicing`、`keyframePreprocess`、`keyframeSearchOptimized`
- `metricsSamplingRate`、`debugWebGPUIO`
- `webgpuCulling`、`webgpuReadbackMode`、`webgpuOutputBufferReuse`

## 快速示例

### 创建引擎与注册基础系统

```ts
import {
  createEngine,
  MotionStateComponent,
  TimelineComponent,
  RenderComponent,
  TimeSystem,
  TimelineSystem,
  RenderSystem,
} from '@g-motion/core';

const engine = createEngine({ samplingMode: 'time' });
const { app, world, scheduler } = engine;

app.registerComponent('MotionState', MotionStateComponent);
app.registerComponent('Timeline', TimelineComponent);
app.registerComponent('Render', RenderComponent);
app.registerSystem(TimeSystem);
app.registerSystem(TimelineSystem);
app.registerSystem(RenderSystem);

world.createEntity({
  MotionState: { status: 1, startTime: 0, currentTime: 0, playbackRate: 1 },
  Timeline: { tracks: new Map(), duration: 1000, loop: 0, repeat: 0, version: 0, rovingApplied: 0 },
  Render: { rendererId: 'object', target: { value: 0 }, props: {} },
});

scheduler.ensureRunning();
```

### 定义并应用插件

```ts
import type { MotionPlugin } from '@g-motion/core';
import { createEngine, registerPlugin } from '@g-motion/core';

const ExamplePlugin: MotionPlugin = {
  name: 'example',
  manifest: {
    components: {
      Foo: { schema: { value: 'float32' } },
    },
    systems: [
      {
        name: 'FooSystem',
        order: 20,
        update() {},
      },
    ],
  },
};

registerPlugin(ExamplePlugin);
const engine = createEngine();
engine.use(ExamplePlugin);
```

## MotionAppConfig 迁移指南

本次调整将 WebGPU、关键帧与调试配置收拢到嵌套对象。旧字段仍可用但会输出 warn，新字段优先。映射关系：`keyframePreprocess`→`keyframe.preprocess`，`keyframeSearchOptimized`→`keyframe.searchOptimized`，`keyframeEntryExpandOnGPU`→`keyframe.entryExpandOnGPU`，`keyframeSearchIndexed`→`keyframe.searchIndexed`，`keyframeSearchIndexedMinKeyframes`→`keyframe.searchIndexedMinKeyframes`，`timelineFlat`→`keyframe.timelineFlat`；`debugWebGPUIO`→`debug.webgpuIO`，`physicsValidation`→`debug.physicsValidation`；`webgpuCulling`→`webgpu.culling`，`webgpuStatesConditionalUpload`→`webgpu.statesConditionalUpload`，`webgpuForceStatesUpload`→`webgpu.forceStatesUpload`，`webgpuBatchedSubmit`→`webgpu.batchedSubmit`，`webgpuReadbackMode`→`webgpu.readbackMode`，`webgpuOutputBufferReuse`→`webgpu.outputBufferReuse`。

旧配置：
```ts
const config = {
  keyframeSearchOptimized: true,
  webgpuReadbackMode: 'visible',
  debugWebGPUIO: true,
};
```
新配置：
```ts
const config = {
  keyframe: { searchOptimized: true },
  webgpu: { readbackMode: 'visible' },
  debug: { webgpuIO: true },
};
```

## Frame-based Sampling

`MotionAppConfig` 支持配置采样模式：

- `samplingMode: 'time' | 'frame'`（默认 `time`）
- `samplingFps: number`（按帧采样的 FPS，支持小数）

当 `samplingMode === 'frame'` 时，调度器会基于 `samplingFps` 计算每帧的 `deltaFrame / deltaTimeMs`，并在 `SystemContext.sampling` 中暴露给系统使用；`TimeSystem` 会用该 `deltaTimeMs` 推进动画时间，实现帧对齐推进。

## Reverse Playback

- `MotionState.playbackRate` 支持负数，表示反向播放
- `TimelineSystem` 会在 `[0, duration]` 区间内夹取/循环，确保动画状态可收敛

## 贡献

参考仓库根目录的 [CONTRIBUTING.md](../../CONTRIBUTING.md) 与 [ARCHITECTURE.md](../../ARCHITECTURE.md)。

## License

ISC（见仓库根目录 package.json 的 license 字段）。
