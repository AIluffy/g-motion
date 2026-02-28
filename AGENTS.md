# Motion 仓库简明协作指南（packages）

## 1. 仓库定位
- 这是一个 `pnpm workspace + turbo` 的动画引擎 monorepo，核心代码在 `packages/` 与 `packages/plugins/`。
- 主执行链路：`@g-motion/animation` 组装轨道与实体 -> `@g-motion/core` 调度系统 -> `@g-motion/webgpu` 计算 -> 回写渲染（如 DOM）。
- 物理插件（spring/inertia）为 GPU-only 设计，无 CPU fallback。

## 2. 包职责与依赖方向
- `@g-motion/shared`: 共享类型/常量/错误、easing registry 与通用工具（debug、time、math、DOM target 解析）。
- `@g-motion/values`: 值解析与插值 parser 注册（color/transform/gradient/path 等）。
- `@g-motion/webgpu`: WebGPU engine、shader pass、dispatch、readback、metrics。
- `@g-motion/core`: ECS Runtime（World/Archetype/Scheduler/System）与系统编排。
- `@g-motion/animation`: 对外 API（`motion/animate`），注册系统并驱动执行。
- `@g-motion/plugin-dom`: DOM 渲染插件（Transform 组件 + dom renderer）。
- `@g-motion/plugin-spring` / `@g-motion/plugin-inertia`: 物理组件与 WGSL shader，导入时自动 `registerPlugin(...)`。

推荐依赖层级：`shared/values -> webgpu/core -> animation -> plugins(dom)`。

## 3. 开发命令
```bash
pnpm install
pnpm build
pnpm build:packages
pnpm test
pnpm lint
pnpm format
pnpm type-check

# 按包执行
pnpm --filter @g-motion/core run build
pnpm --filter @g-motion/core test
pnpm --filter @g-motion/core run bench
```

## 4. 代码约束（以当前配置为准）
- TypeScript 全局 `strict: true`，同时启用 `noImplicitAny/noUnusedLocals/noUnusedParameters`。
- 格式化：2 空格、单引号、分号、trailing comma（见 `.oxfmtrc.json`）。
- Lint 重点：`no-var`、`prefer-const`、`prefer-arrow-callback`；`no-console` 为 warn。
- 包构建统一使用 `rslib`；大部分包输出 `esm + cjs`，插件包输出 `esm`。

## 5. 变更原则（针对 packages）
- 优先在既有层内修改，避免跨层反向依赖（尤其不要让底层包依赖 animation/plugin）。
- 修改系统调度相关逻辑时，确认顺序链路仍为：`Time -> Timeline -> Roving -> BatchSampling -> WebGPU -> GPUResultApply -> ActiveEntityMonitor -> Render`。
- 涉及 WGSL 的包（`core/webgpu/plugin-spring/plugin-inertia`）保持 `?raw` 导入模式与对应 `rslib` rule 一致。
- 新增公共 API 时，同步更新对应包 `src/index.ts` 导出与 README 示例。

## 6. 测试要求
- 行为变更必须补 `tests/**/*.test.ts`。
- Node 环境测试：`core/shared/values/webgpu`。
- JSDOM 环境测试：`animation` 与 `plugins/*`。
- 性能相关改动补充基准（已有目录：`packages/*/benchmarks/`）。

## 7. 常用定位
- Core 入口：`packages/core/src/index.ts`
- World/Scheduler：`packages/core/src/world.ts`, `packages/core/src/scheduler.ts`
- 动画入口：`packages/animation/src/index.ts`, `packages/animation/src/api/builder.ts`
- WebGPU 入口：`packages/webgpu/src/index.ts`
- DOM 插件入口：`packages/plugins/dom/src/index.ts`
