## Context
WebGPU 输出处理当前耦合格式化、copy 与 readback，且 readback 超时为“静默丢弃”，难以定位性能退化。视口裁剪 pass 混合 CPU 数据采集与 GPU 计算，增加单文件复杂度。

## Goals / Non-Goals
- Goals:
  - 输出处理三段式管线化，降低职责耦合
  - 引入 readback 超时/排队深度指标
  - 视口裁剪 CPU 采集逻辑与 GPU pass 分离
- Non-Goals:
  - 不改变 ECS 调度顺序
  - 不引入新的渲染后端

## Decisions
- 将 output-buffer-processing 拆分为三个内部步骤并形成可替换管线
- readback 超时与排队深度上报到 metrics provider
- culling pass 仅接收 GPU buffer 与参数，不直接访问 world

## Alternatives Considered
- 维持现状，仅增加指标
  - 放弃：依然保留高耦合与单点复杂问题
- 完全迁出 readback 逻辑到系统层
  - 放弃：会破坏 webgpu 目录内复用能力

## Risks / Trade-offs
- 结构拆分初期可能引入额外接口协调成本
  - Mitigation: 先拆出最小三段式接口，保持调用路径不变
- 指标采样引入轻微开销
  - Mitigation: 控制采样频率，保留可配置阈值

## Migration Plan
1. 拆分输出处理路径：format → copy → readback
2. 增加 readback 超时/排队深度指标上报
3. 分离 culling CPU 采集逻辑，保留 GPU pass 纯计算
4. 更新调用方与测试用例
