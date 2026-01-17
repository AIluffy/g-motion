# Project Context

## Purpose
Motion 是一个以 ECS 为核心的动画引擎，目标是在保证可预测性与可扩展性的前提下提供高性能的动画计算与多渲染后端接入（DOM/Canvas/WebGL/WebGPU）。

## Tech Stack
- TypeScript（strict）
- pnpm workspace
- WebGPU + WGSL（动画插值与相关数值计算）
- Vitest（测试）
- oxlint + oxfmt（lint/format）

## Project Conventions

### Code Style
- 2 空格缩进、单引号、分号
- 避免 default export，优先 named exports
- 核心包禁止每帧分配（热路径 zero-allocation）
- 复用集中类型定义（packages/core/src/types.ts）

### Architecture Patterns
- ECS：entity 为数字 ID，component 为 SoA buffer，system 为纯函数式更新
- WebGPU：计算与调度分离，WGSL shader 文件单独维护

### Testing Strategy
- 单元测试：Vitest
- 行为变更需要补充覆盖，性能变更建议补充 bench

### Git Workflow
- 由仓库既定流程管理（本文件不强制规定）

## Domain Context
- 主要计算：时间轴采样、关键帧查找与插值、（可选）物理模拟相关计算
- 渲染层通过 Render/Transform 等组件写回驱动

## Important Constraints
- 核心系统热路径避免 per-frame allocation
- shader 逻辑与 JS/TS 逻辑分离，避免内联 WGSL

## External Dependencies
- WebGPU（浏览器或运行时提供）
