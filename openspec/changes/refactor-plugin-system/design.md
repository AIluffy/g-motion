## Context
目标是让“插件=自包含单元”，并消除 core/animation 对具体插件（Spring/Inertia 等）的硬编码依赖；同时支持插件携带 WGSL shader 并自动集成到 WebGPU 计算管道。

## Goals / Non-Goals
- Goals
  - 插件自治：Types/Components/Systems/Shader/Registration/Tests 归插件所有，core 不出现插件关键词与专有逻辑。
  - 自动发现：插件被 import 后可自动注册；引擎初始化时自动 apply；animation 不需要知道插件存在。
  - GPU 集成：插件可注册 GPU kernel（wgsl + pack/apply），core 负责通用编译与调度。
  - 测试可控：提供禁用自动插件与重置注册表能力，确保用例隔离与顺序无关。
- Non-Goals
  - 运行时扫描 node_modules；“自动发现”定义为“被 import 到依赖图后自动注册”。
  - 一次性重写所有插件；以 Spring/Inertia 作为首批迁移样例。

## Decisions
- Decision: Auto-Discovery via side-effect registration
  - 插件包入口执行 registerAutoPlugin(...) 写入全局注册表。
  - core 在 engine/world 初始化时调用 applyAutoPlugins(...)。
  - 允许通过 config 或测试 API 关闭自动插件注入。
  - “自动发现”仅指 import 触发的注册；不做 node_modules/文件系统扫描，也不做运行时反射。
- Decision: Extensible MarkOptions + Keyframe extensions
  - @g-motion/animation 导出 interface MarkOptions（可声明合并）。
  - Keyframe 使用通用扩展容器承载插件数据：core 不依赖插件类型。
- Decision: GPU Kernel Registry
  - core 提供通用 kernel 编译/缓存/dispatch 框架。
  - 插件提供：
    - kernelId
    - wgsl 源码（插件资源）
    - 状态打包（pack）与结果回写（apply）
    - 可选：finished 判定/状态同步策略
- Decision: Test Isolation
  - 提供 resetAutoPluginRegistry()（测试专用导出或仅在 test build 暴露）。
  - 提供 engine/world config：autoPlugins: false（测试推荐显式关闭；不依赖运行时环境自动判断）。
  - 插件 apply 必须幂等（重复 apply 不产生重复系统/重复管道项）。

## Risks / Trade-offs
- 全局注册表会带来污染风险 → 通过 reset API + config 禁用来控制。
- Mark/Keyframe schema 变化属于 breaking → 提供迁移期兼容层（短期）与明确迁移说明。
- GPU kernel 可扩展会增加调度复杂度 → 以统一 batch/kind 分派协议与严格接口约束降低复杂度。

## Migration Plan
1. 引入 Plugin Host（不改变现有 spring/inertia 路径）。
2. 引入 MarkOptions 接口化与 Keyframe extensions（先加后迁移，保留兼容读取）。
3. 引入 GPU Kernel Registry（先并存，physics 仍走内置）。
4. 迁移 Spring/Inertia 到插件自治（删除 animation/api/physics.ts 等硬编码）。
5. 移除 core 内置 physics shader/packing（最终达成 core 不知道 spring/inertia）。

## Open Questions
- 自动插件默认策略：在 browser 环境默认开启？在 node/test 默认关闭？
- GPU kernel 的 finished/状态同步：是否统一由 core 处理 MotionStatus，还是由插件提供 apply hook？
