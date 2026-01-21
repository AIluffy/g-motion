# Change: WebGPU 输出管线化与读回可观测性增强

## Why
当前输出处理路径在单一函数内完成格式化、copy 与读回排队，职责过度集中，且 readback 超时缺少可观测性，影响问题定位与性能优化。

## What Changes
- 将输出处理拆分为格式化、copy、readback 三段式管线
- 增强 readback 超时与排队深度的指标可观测性
- 视口裁剪 pass 的 CPU 数据准备逻辑与 GPU 计算逻辑分离
- 通过 WebGPUEngine 注入关键管理器，减少隐式全局依赖

## Impact
- Affected code: packages/core/src/webgpu/output-buffer-processing.ts, passes/viewport/culling-*.ts, async-readback.ts, metrics-provider.ts
- Affected subsystems: 输出格式化、GPU→CPU 读回、视口裁剪
