# Change: 核心运行时质量与性能基线提升

## Why
核心运行时存在可维护性与性能风险的集中点：批处理缓存清理未生效、实体删除未同步到实体管理器、GPU 结果应用路径重复、时间源不统一以及 shader 注册依赖全局状态。这些问题会引入内存增长、行为不一致与维护成本上升。

## What Changes
- 修复批处理清理路径，确保 result/entity/keyframe 缓存释放
- 统一实体删除流程，保持 Archetype 与 EntityManager 状态一致
- 提炼 GPU 结果应用公共路径，统一通道映射与 transform 写回
- 统一 Scheduler 计时来源，减少环境差异
- 收敛 shader 注册入口，避免 globalThis 依赖
- 拆分超大文件以降低耦合与维护成本

## Impact
- Affected code: packages/core/src/systems/batch/batchCoordinator.ts, packages/core/src/archetypeManager.ts, packages/core/src/entity.ts, packages/core/src/systems/webgpu/delivery/delivery-system.ts, packages/core/src/scheduler-processor.ts, packages/core/src/app.ts, packages/core/src/context.ts
- Affected subsystems: ECS 运行时、批处理、GPU 结果交付、调度与时间基准、shader 注册流程
