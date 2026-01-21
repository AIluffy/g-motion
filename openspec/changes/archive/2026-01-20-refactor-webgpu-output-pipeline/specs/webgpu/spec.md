## ADDED Requirements
### Requirement: 输出处理管线化
系统 SHALL 将输出处理拆分为格式化、copy、readback 三段式管线，并允许在不改变调用方的情况下替换任一阶段实现。

#### Scenario: 输出格式化被跳过
- **WHEN** 输出通道不需要格式化
- **THEN** 系统 SHALL 跳过格式化阶段并直接进入 copy 阶段

### Requirement: Readback 可观测性
系统 SHALL 记录 readback 超时率与排队深度，并对超阈值情况提供可追踪指标。

#### Scenario: Readback 超时
- **WHEN** readback 超过超时阈值
- **THEN** 系统 SHALL 记录超时事件并更新指标

### Requirement: Culling 采集与 GPU 计算分离
系统 SHALL 将视口裁剪的 CPU 数据采集逻辑与 GPU 计算逻辑分离，GPU pass 不直接访问 world。

#### Scenario: GPU pass 输入纯粹
- **WHEN** 视口裁剪 GPU pass 执行
- **THEN** 其输入仅包含预处理后的 GPU buffer 与参数
