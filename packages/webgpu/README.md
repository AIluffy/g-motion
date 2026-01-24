# @g-motion/webgpu

Motion 引擎的 WebGPU 计算基础设施包。该包提供从 WebGPU 初始化、计算管线缓存、批处理派发、输出格式化、读回同步到性能度量的完整 GPU 计算链路，供 `@g-motion/animation` 与插件体系复用。

## 主要特性

- 统一的 WebGPUEngine，集中管理设备、队列、缓冲区与运行时状态
- 计算管线缓存与多 workgroup 变体预编译
- GPU 关键帧预处理、搜索与插值管线
- 物理模拟（Spring/Inertia）合并 Shader 基础设施
- 输出格式化与 GPU→CPU 读回链路（支持输出池复用）
- 视锥裁剪与异步读回，降低无效数据传输
- 统一的 GPU 指标与内存统计

## 架构概览

典型流程如下：

1. 初始化 WebGPU 设备与通用计算管线
2. 关键帧预处理与搜索（Keyframe Pass）
3. 插值与批处理派发（Dispatch）
4. 输出格式转换（Output Format Pass）
5. 读回与同步（Output Buffer Processing + Sync Manager）
6. 指标采集与状态更新（Metrics Provider）

## 安装

```bash
pnpm add @g-motion/webgpu
```

## 依赖与运行环境

- 运行依赖：`@g-motion/shared`、`@g-motion/utils`
- 开发依赖：`@webgpu/types`
- 运行环境：浏览器或支持 WebGPU 的宿主（`navigator.gpu` 可用）

## 快速开始

初始化 WebGPU 引擎与管线：

```ts
import { getWebGPUEngine, ensureWebGPUInitialized, ensureWebGPUPipelines } from '@g-motion/webgpu';
import { getGPUMetricsProvider } from '@g-motion/webgpu';
import { errorHandler } from '@g-motion/shared';

const engine = getWebGPUEngine();
const deps = {
  metricsProvider: getGPUMetricsProvider(),
  errorHandler,
  getCustomGpuEasings: () => [],
  getCustomEasingVersion: () => 0,
};

await ensureWebGPUInitialized({ engine, deps });

const device = engine.getGPUDevice();
if (device) {
  await ensureWebGPUPipelines({ engine, device, deps });
}
```

## 核心模块

### Engine 与初始化

- `WebGPUEngine`：设备与队列管理、缓冲区分配、运行态指标
- `ensureWebGPUInitialized` / `ensureWebGPUPipelines`：初始化设备并预编译插值与物理管线

### 调度与派发

- `dispatchGPUBatch`：插值批处理派发，支持输出缓冲池复用
- `dispatchPhysicsBatch`：物理批处理派发（用于 Spring/Inertia）

### 输出格式与读回

- `runOutputFormatPass`：将原始输出转换为目标格式
- `processOutputBuffer`：组织格式转换、拷贝、读回与释放
- `acquirePooledOutputBuffer` / `releasePooledOutputBuffer`：输出缓冲池管理

### 通道映射与结果投递

- `GPUChannelMappingRegistry`：管理批次通道表
- `createBatchChannelTable` / `createPackedRGBAChannelTable`：快速构建映射表
- `registerGPUChannelMappingForTracks`：按轨道注册 GPU 输出通道

### Shader 与数据布局

- 插值：`buildInterpolationShader`、`packKeyframeForGPU`
- 变换矩阵：`packTransform2D`、`packTransform3D`
- 裁剪：`packRenderStates`、`unpackCullResults`
- 物理：`packSpringStates`、`packInertiaStates`、`packSimParams`
- 输出格式：`packOutputChannels`、`packedRGBAToCSS`

### Pass 组件

- Keyframe：预处理、搜索、插值
- Physics：物理管线派发
- Viewport：视锥裁剪与异步读回

## API 速查

### 初始化与引擎

- `getWebGPUEngine` / `resetWebGPUEngine`
- `ensureWebGPUInitialized` / `ensureWebGPUPipelines`
- `initWebGPUCompute`
- `WebGPUEngineConfig`

### 管线与派发

- `cachePipeline` / `clearPipelineCache`
- `precompileWorkgroupPipelines` / `getPipelineForWorkgroup`
- `dispatchGPUBatch` / `dispatchPhysicsBatch`

### 输出与读回

- `runOutputFormatPass` / `enableGPUOutputFormatPass` / `disableGPUOutputFormatPass`
- `processOutputBuffer`
- `acquirePooledOutputBuffer` / `releasePooledOutputBuffer`

### 通道映射

- `createBatchChannelTable` / `createChannelMapping`
- `createMatrix2DTransformChannelTable` / `createMatrix3DTransformChannelTable`
- `createPackedRGBAChannelTable`
- `getGPUChannelMappingRegistry` / `GPUChannelMappingRegistry`

### 指标与调试

- `getGPUMetricsProvider` / `setGPUMetricsProvider`
- `TimingHelper` / `NonNegativeRollingAverage`

## 示例

### 自定义通道映射

```ts
import { createBatchChannelTable, getGPUChannelMappingRegistry } from '@g-motion/webgpu';

const registry = getGPUChannelMappingRegistry();
const table = createBatchChannelTable('demo-batch', 3, ['x', 'y', 'opacity']);
registry.registerBatchChannels(table);
```

### 输出格式转换

```ts
import { packOutputChannels, OUTPUT_FORMAT } from '@g-motion/webgpu';

const channels = packOutputChannels([
  { sourceIndex: 0, formatType: OUTPUT_FORMAT.FLOAT },
  { sourceIndex: 1, formatType: OUTPUT_FORMAT.ANGLE_DEG },
  { sourceIndex: 2, formatType: OUTPUT_FORMAT.COLOR_NORM, minValue: 0, maxValue: 1 },
]);
```

## 构建与测试

在仓库根目录：

```bash
pnpm install
pnpm --filter @g-motion/webgpu run build
pnpm --filter @g-motion/webgpu test
```

如需查看完整示例应用：

```bash
pnpm --filter ./apps/examples dev
```

## 二次开发建议

- WebGPU 初始化依赖 `navigator.gpu`，非浏览器环境需提供兼容实现或 mock
- 插件侧物理 shader 由各插件注册，核心包仅提供合并物理基础设施
- 输出格式与通道映射影响 GPU→CPU 读回成本，建议按实际渲染目标优化
