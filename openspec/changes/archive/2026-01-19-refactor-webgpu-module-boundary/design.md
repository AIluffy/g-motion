## Context
当前 WebGPU 相关逻辑同时分布在 packages/core/src/systems 与 packages/core/src/webgpu 中，职责边界不清晰，导致资源管理、管线缓存、readback 处理出现重复或耦合。目标是在不改变现有行为的前提下，抽离可复用的 WebGPU 核心能力，保留 systems 作为 ECS 调度层。

## Goals / Non-Goals
- Goals:
  - 明确 WebGPU 核心模块边界，集中复用 GPU 资源管理与管线组装
  - 统一 WebGPU 计算与命令编码入口，降低 systems 层的 GPU 细节耦合
  - 保持现有 WebGPU 行为与 API 兼容
- Non-Goals:
  - 不引入新的渲染后端
  - 不改变现有 ECS 生命周期与系统排序

## Decisions
- Decision: 将通用 GPU 资源管理与 pipeline 组装下沉至 packages/core/src/webgpu
  - Rationale: 这些逻辑与 ECS 无关，具备跨系统复用价值，适合独立 WebGPU 模块。
- Decision: systems/webgpu 仅保留 ECS 调度与结果交付
  - Rationale: systems 依赖 World、Renderer 与批处理上下文，属于业务编排层。

## Alternatives Considered
- 维持现状不迁移
  - 放弃：模块边界模糊导致重复实现与维护成本上升。
- 将全部 GPU 逻辑迁出 systems
  - 放弃：systems 仍需处理 ECS 绑定、结果写回、渲染同步，强行迁出会破坏清晰分层。

## Migration Plan
1. 迁移 pass 层 pipeline 与 shader 绑定逻辑
   - 从 systems/webgpu/keyframe、systems/webgpu/viewport 迁入 webgpu/passes
2. 统一缓冲管理入口
   - 保留 webgpu/persistent-buffer-manager、output-buffer-pool、staging-pool
   - systems 中的 buffer 创建转为调用 webgpu 接口
3. 拆分 readback handler
   - 保留 AsyncReadbackManager 在 webgpu
   - systems 仅处理 tag=physics/culling 的业务分支
4. 更新 imports 与出口路径
   - systems/webgpu 只依赖 webgpu 的公开接口

## Risks / Trade-offs
- pipeline cache 生命周期变更风险
  - Mitigation: 复用现有 clearPipelineCache 与 version check 逻辑
- 输出缓冲池统计口径不一致
  - Mitigation: 保持现有统计字段不变，仅统一入口调用
- readback 逻辑拆分导致 tag 分支遗漏
  - Mitigation: 为 physics/culling 路径补充覆盖测试

## Compatibility Notes
- WebGPUComputeSystem 行为与系统顺序保持不变
- 输出格式化与读回流程保持不变，仅调整模块归属

## Open Questions
- 是否需要为 viewport culling 引入专用 buffer pool
- 是否在 webgpu/index.ts 增加 passes 的统一导出
