## ADDED Requirements
### Requirement: WebGPU 模块边界收敛
系统 SHALL 将纯 WebGPU 资源管理与计算逻辑集中在 packages/core/src/webgpu 目录内，并保持 ECS 调度逻辑在 packages/core/src/systems/webgpu。

#### Scenario: 纯 GPU 组件可复用
- **WHEN** 需要在非 ECS 场景复用 WebGPU 计算能力
- **THEN** 可仅通过 webgpu 目录导入命令编码、管线管理与输出格式化能力

### Requirement: 管线缓存唯一入口
系统 SHALL 提供统一的 WebGPU 管线缓存入口，避免多个缓存实现并存。

#### Scenario: 计算管线预编译
- **WHEN** 初始化 WebGPU 计算管线
- **THEN** 仅使用统一管线缓存模块进行预编译与缓存命中

### Requirement: 输出缓冲与格式化分层
系统 SHALL 区分读回缓冲、输出复用缓冲、输出格式化缓冲三类池化能力，并保留明确的职责边界。

#### Scenario: 输出格式化读回
- **WHEN** 输出需要格式化后读回
- **THEN** 输出格式化缓冲由独立池管理，读回缓冲由 staging-pool 管理
