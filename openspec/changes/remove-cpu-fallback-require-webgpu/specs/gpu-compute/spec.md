## ADDED Requirements

### Requirement: GPU-only 动画计算
动画引擎 SHALL 将 WebGPU 作为动画计算的硬依赖，并在运行时仅使用 GPU 执行动画插值与相关数值计算。

#### Scenario: WebGPU 可用时正常运行
- **GIVEN** 运行环境支持 WebGPU 且设备初始化成功
- **WHEN** 动画引擎开始 tick 并处理动画实体
- **THEN** 动画插值计算 SHALL 在 GPU 上执行

### Requirement: WebGPU 初始化失败的 fail-fast 行为
当 WebGPU 不可用或初始化失败时，动画引擎 SHALL 以错误终止运行，而不是自动降级到 CPU 计算路径。

#### Scenario: WebGPU 不可用
- **GIVEN** 运行环境不支持 WebGPU 或 WebGPU 初始化失败
- **WHEN** 动画引擎尝试初始化 GPU 计算后端
- **THEN** 引擎 SHALL 抛出错误并终止启动

## REMOVED Requirements

### Requirement: CPU 兜底与降级运行
**Reason**: 目标部署环境 100% 支持 WebGPU，移除多路径以降低维护成本与不确定性。

#### Scenario: WebGPU 不可用时继续运行
- **GIVEN** WebGPU 不可用或初始化失败
- **WHEN** 动画引擎运行
- **THEN** 引擎继续执行 CPU 插值路径
