## ADDED Requirements

### Requirement: 实体删除一致性
系统 SHALL 在实体删除时同步更新实体管理器的活跃集合，并保持 Archetype 与 EntityManager 状态一致。

#### Scenario: 执行延迟删除后实体不可见
- **WHEN** 调用 flushDeletions 并完成删除
- **THEN** EntityManager.exists(entityId) 返回 false

### Requirement: 批处理清理释放缓存
系统 SHALL 在清理 batchId 时释放结果缓存与实体/关键帧缓冲缓存。

#### Scenario: 清理后缓存不再可用
- **WHEN** 调用 clearBatch(batchId)
- **THEN** getResults(batchId) 返回 null 且缓存不再占用

### Requirement: GPU 结果应用一致性
系统 SHALL 在所有 GPU 结果应用路径中保持通道映射与 transform 写回的一致行为。

#### Scenario: 稳定与非稳定 archetype 路径行为一致
- **WHEN** 通过不同结果应用路径写回同一组通道值
- **THEN** Render.props 与版本号更新结果一致

### Requirement: 统一调度时间源
系统 SHALL 使用统一的时间源获取帧时间与采样时间戳。

#### Scenario: 非浏览器环境的时间回退
- **WHEN** 运行在无 performance API 的环境
- **THEN** 时间计算回退到 Date.now 且行为一致

### Requirement: Shader 注册隔离
系统 SHALL 通过 AppContext 管理 shader 注册与访问，避免依赖 globalThis。

#### Scenario: Shader 仅通过受控入口注册
- **WHEN** 注册 shader
- **THEN** 数据仅存储在 AppContext 管理的 registry 中
