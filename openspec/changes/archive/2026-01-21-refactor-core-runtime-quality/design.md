## Context
核心运行时在批处理清理、实体删除、GPU 结果应用与时间基准上存在一致性与可维护性问题。问题主要体现为缓存释放未生效、活跃实体集合不一致、结果应用路径重复导致复杂度上升，以及 shader 注册依赖全局状态。

## Goals / Non-Goals
- Goals:
  - 修复批处理与实体生命周期的状态一致性问题
  - 统一 GPU 结果应用路径，减少重复实现
  - 统一调度时间源，降低环境差异
  - 收敛 shader 注册入口，降低全局依赖
  - 拆分超大文件，改善可维护性
- Non-Goals:
  - 不改变现有 ECS 调度顺序
  - 不引入新的渲染后端
  - 不改变现有对外 API 语义

## Decisions
- Decision: 批处理清理需释放缓存与统计
  - Rationale: 避免长期内存增长并保证重复 batchId 行为一致
- Decision: 实体删除需同步更新 EntityManager
  - Rationale: 保证存在性判断与内部索引一致
- Decision: GPU 结果应用提炼公共路径
  - Rationale: 保持通道映射与 transform 写回逻辑一致，降低重复 bug 风险
- Decision: Scheduler 统一使用 getNowMs 作为时间来源
  - Rationale: 在浏览器与非浏览器环境保持一致行为
- Decision: shader 注册移入 AppContext 管理
  - Rationale: 去除 globalThis 依赖，提升可测试性与隔离性

## Alternatives Considered
- 仅修复单点问题，不做结构调整
  - 放弃：重复逻辑与全局依赖仍会带来维护成本
- 完全迁出 GPU 结果应用逻辑到新模块
  - 放弃：需要更大规模改动，超出本次迭代范围

## Risks / Trade-offs
- 拆分文件可能引入接口改动成本
  - Mitigation: 保持公共 API 不变，仅拆分内部实现
- GPU 结果应用统一路径可能带来微小性能差异
  - Mitigation: 使用基准对比并保留关键热路径优化

## Migration Plan
1. 修复批处理清理与实体删除一致性
2. 提炼 GPU 结果应用公共路径并回归验证
3. 统一时间源与 shader 注册入口
4. 拆分超大文件并更新引用

## Open Questions
- 是否需要为 shader registry 增加可选的只读访问器
