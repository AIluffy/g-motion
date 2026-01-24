## ADDED Requirements
### Requirement: OpenSpec 变更治理
系统 SHALL 要求所有架构调整、性能优化或破坏性变更在实施前创建并评审 OpenSpec 提案。

#### Scenario: 架构变更前置治理
- **WHEN** 提出涉及系统边界或模块职责的变更
- **THEN** 必须存在 proposal.md 与 tasks.md，且通过评审后方可实施

### Requirement: 性能基线采集与报告
系统 SHALL 通过 Vitest bench 与现有基准脚本输出关键路径的基线性能报告，覆盖 CPU 与 GPU 关键路径。

#### Scenario: 基线采集
- **WHEN** 执行基准脚本
- **THEN** 产生可复现的指标数据并归档到基线报告中

### Requirement: 基线指标可重复性
系统 SHALL 确保基线采集在稳定环境下多次运行偏差小于 5%。

#### Scenario: 多次采集对比
- **WHEN** 在同一环境重复运行基准脚本
- **THEN** 关键指标偏差不超过 5%
