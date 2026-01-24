# Change: WebGPU pipeline 缓存按设备隔离

## Why
当前 pipeline 缓存多为模块级单例，无法区分不同的 GPU device，上下文切换与 device lost 后存在错误复用风险。

## What Changes
- 将 pipeline 缓存从全局单例改为按 device 分区存储与检索
- pipeline 工厂函数与调用点显式传入 device
- 在 device 销毁或 lost 事件后清理其关联缓存
- 为多设备、设备切换与 device lost 场景补充测试

## Impact
- Affected specs: webgpu-pipeline-cache
- Affected code: packages/webgpu/src/pipeline-manager.ts, packages/webgpu/src/passes/**/pipeline.ts, packages/webgpu/src/passes/**, packages/core/src/systems/webgpu/system/*
