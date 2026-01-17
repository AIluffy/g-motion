# Change: 移除 CPU 兜底并强制 WebGPU（GPU-only）

## Why
当前动画计算管线支持 “GPU 优先 + CPU 自动兜底”，导致维护成本增加（多路径逻辑、测试矩阵扩大）且在部分故障场景下行为不稳定（降级后语义差异与性能不可控）。目标部署环境已明确 100% 支持 WebGPU，因此将 GPU 作为硬依赖并移除 CPU 兜底。

## What Changes
- **BREAKING**：移除 `gpuCompute='never'` 等 CPU 模式与相关配置/API
- **BREAKING**：WebGPU 初始化失败不再自动降级到 CPU，而是以错误终止（fail-fast）
- 移除 CPU 插值兜底系统与 “GPU→CPU fallback” 的错误恢复策略
- 清理 CPU vs GPU 对照测试与基准中依赖 CPU 路径的部分，改为 GPU-only 的正确性与稳定性验证

## Impact
- Affected packages:
  - `packages/core`：WebGPU 初始化、错误处理、系统状态与 metrics 语义
  - `packages/animation`：CPU 插值系统与引擎配置 API
- Key code areas:
  - WebGPU 初始化与设备可用性处理
  - CPU 插值/采样路径与相关开关
  - 错误处理中的 fallback 策略与状态标记
