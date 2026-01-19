# Change: 提炼 WebGPU 核心模块边界以支持独立迁移

## Why
当前 WebGPU 相关逻辑分散在 systems 与 webgpu 两个目录内，导致模块边界不清晰、复用困难。需要先明确模块归属，再推进独立 WebGPU 模块化。

## What Changes
- 把与 ECS 无关的 WebGPU 计算与资源管理逻辑迁移到 packages/core/src/webgpu
- 统一 WebGPU 管线缓存与命令编码入口，减少重复实现
- 保留 systems/webgpu 作为 ECS 调度层，仅负责生命周期、批处理与结果交付
- 更新相关导出与引用路径，确保兼容现有 WebGPU 使用方

## Impact
- Affected code: packages/core/src/systems/webgpu/*, packages/core/src/webgpu/*
- Affected subsystems: WebGPU 初始化、管线管理、输出格式化、读回与缓冲池复用
