## Context
当前 pipeline 缓存以模块级单例存在，缺少 device 维度，导致多设备与 device lost 场景下可能复用失效 pipeline。

## Goals / Non-Goals
- Goals:
  - pipeline 缓存按 device 隔离
  - 创建与获取必须显式绑定 device
  - device 释放或 lost 后清理关联缓存
- Non-Goals:
  - 不改变现有 pipeline 计算逻辑与调度顺序
  - 不引入新的渲染后端

## Decisions
- 采用方案一：基于 device 分区的缓存结构
- 复用现有 pipeline-manager 的入口，但内部缓存改为 Map<GPUDevice, Map<CacheKey, Pipeline>>
- 各 pass 的 pipeline 工厂函数显式接收 device 参数

## Risks / Trade-offs
- 风险：多处调用点需要更新，易漏传 device
  - Mitigation：集中新增 helper 并用类型约束强制 device 必填
- 风险：device lost 清理路径不足
  - Mitigation：在 device 初始化与销毁路径中统一触发清理

## Migration Plan
1. 盘点 pipeline 缓存位置与调用点
2. 改造缓存结构并接入 device 参数
3. 更新调用点并补充测试
4. 验证单设备无回退，多设备切换稳定

## Open Questions
- 是否需要在 PipelineManager 内部暴露清理统计
