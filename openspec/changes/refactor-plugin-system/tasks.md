## 1. Proposal Validation
- [x] 1.1 确认变更范围与 breaking 点（types、MarkOptions、Keyframe）
- [x] 1.2 明确“自动发现”的定义与边界（import 驱动，不做扫描）
- [x] 1.3 明确测试隔离策略（reset API + autoPlugins 开关 + 幂等）

## 2. Core: Plugin Host
- [ ] 2.1 实现全局 Auto Plugin Registry（register/apply/list）
- [ ] 2.2 引擎初始化时自动 apply 已注册插件（可通过 config 关闭）
- [ ] 2.3 插件 apply 幂等策略（组件/系统/renderer/kernel 注册防重）

## 3. Animation: Extensible Mark/Keyframe
- [ ] 3.1 将 MarkOptions 改为 interface 并允许声明合并
- [ ] 3.2 移除 animation 对 spring/inertia 的显式字段依赖
- [ ] 3.3 Keyframe 引入 extensions 容器并完成兼容迁移（短期双读/双写或读旧写新）

## 4. Core: GPU Kernel Registry
- [ ] 4.1 定义 kernel 接口（wgsl/pack/apply/dispatch meta）
- [ ] 4.2 WebGPU 初始化阶段编译并缓存插件 kernels
- [ ] 4.3 Compute dispatch 阶段按 kernelId/kind 分派
- [ ] 4.4 提供测试环境禁用 GPU kernel 或 mock WebGPU 的策略

## 5. Plugin Migration: Spring/Inertia
- [ ] 5.1 plugin-spring：自包含 types/mark extractor/component factory/cpu system/gpu kernel/shader/tests
- [ ] 5.2 plugin-inertia：同上，并包含 handoff 行为测试
- [ ] 5.3 删除 animation/src/api/physics.ts 等硬编码路径
- [ ] 5.4 删除 core 内置 physics shader/packing 的 spring/inertia 硬编码依赖（最终阶段）

## 6. Tests
- [ ] 6.1 添加“自动发现 + 可禁用 + 可重置”的单元测试覆盖
- [ ] 6.2 修复/调整现有插件测试：避免全局污染，确保并行/顺序无关
- [ ] 6.3 覆盖 GPU kernel 注册与编译注入路径（至少一条 smoke test）

## 7. Tooling / DX
- [ ] 7.1 为应用侧提供推荐用法：import 插件即启用（可选聚合包策略，非强制）
- [ ] 7.2 为测试侧提供推荐用法：beforeEach reset + 显式 import 需要的插件
