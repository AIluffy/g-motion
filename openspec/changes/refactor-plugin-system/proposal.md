# Change: Refactor Plugin System for Autonomy + Auto-Discovery + GPU Integration

## Why
当前 Spring/Inertia 等“插件功能”分散在 core/animation/plugins 多处，导致修改成本高、边界不清晰，且 GPU 物理路径被 core 硬编码，无法作为插件自包含交付。

## What Changes
- 引入 Plugin Host / Plugin Runtime：插件可自注册到全局注册表，并在引擎初始化时自动注入系统（无需 animation 包感知）。
- 自动发现边界：仅支持 “import 驱动的自注册”（side-effect registration），不做 node_modules/文件系统扫描，不做运行时反射。
- 引入可扩展的 MarkOptions / Keyframe 扩展容器：插件字段通过声明合并注入，timeline 中承载插件数据无需 core 知道具体插件类型。
- 引入 GPU Kernel Registry：shader 作为插件资源，插件声明 kernel 并由 core 自动编译/注入到 WebGPU 管道，支持插件自定义 state packing 与结果回写。
- 测试隔离机制：支持禁用自动插件（autoPlugins: false）与重置注册表（reset），避免测试全局污染，并保证并行/顺序无关。

### BREAKING
- @g-motion/core 不再内置 SpringOptions/InertiaOptions 等具体插件类型；相关类型与组件/系统由对应插件包提供。
- @g-motion/animation 的 MarkOptions 从“显式 spring/inertia 字段”迁移为 “export interface MarkOptions” + TypeScript 声明合并。
- Keyframe 不再内置 spring/inertia 等插件字段，改为通用扩展容器（例如 extensions），由插件自行读写。

## Impact
- Affected packages: @g-motion/core, @g-motion/animation, @g-motion/plugin-spring, @g-motion/plugin-inertia
- Affected areas:
  - Plugin lifecycle / registration
  - Animation mark/keyframe schema
  - WebGPU compute pipeline (kernel compilation & dispatch)
  - Test isolation & determinism
