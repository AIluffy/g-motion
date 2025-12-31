# 技术债有序执行计划

> 适用范围：本仓库 `g-motion`（pnpm workspace + turbo）。
> 目标：把已识别的 P0/P1/P2 技术债拆成可逐条执行、可验证、可回滚的任务序列。

---

## 0. 执行约束（必须遵守）

### 0.1 不变更范围
- 不做无关重构；每次只处理一个任务卡。
- 不随意改 API 命名/导出；如需 breaking change，必须新增迁移说明与兼容层。
- 不引入新工具链（formatter/linter/test runner 维持现状）。

### 0.2 每个任务卡的统一工作流
1) 读相关文件，定位调用链与依赖。
2) 仅做该任务卡的最小代码改动。
3) 补/改测试用例（优先单测，其次集成测试）。
4) 运行最小验证命令：`pnpm -F <pkg> test`；必要时再 `pnpm test`。
5) 写更新记录：任务卡完成摘要 + 关键改动文件列表。

### 0.3 可执行验证命令（参考）
- 全量测试：`pnpm test`
- 指定包测试：`pnpm -F @g-motion/core test`、`pnpm -F @g-motion/animation test`
- Lint：`pnpm lint`
- Typecheck：`pnpm type-check`
- 本地 examples：`pnpm -F examples dev`

---

## 1. 里程碑总览（按优先级）

### P0（正确性/隔离性/一致性）
1) **P0-1 统一 World 获取与多 World 语义**
2) **P0-2 GPU 时间语义对齐（CPU/GPU 一致的 currentTime）**
3) **P0-3 热路径日志收敛（DOM renderer / scheduler）**
4) **P0-4 Component schema 与运行时数据一致性（dev 断言）**

### P1（架构一致性/可扩展）
5) **P1-1 插件注册方式分离：显式 vs auto（减少副作用）**
6) **P1-2 GPU delivery channel mapping 绑定到真实 tracks**
7) **P1-3 Active entity count 与 scheduler 启停：单一事实来源**

### P2（工程化/测试与文档）
8) **P2-1 覆盖率产物与 CI 对齐**
9) **P2-2 examples 作为性能/调试控制台规范化**

---

## 2. 任务卡（LLM 逐卡执行）

> 说明：每张任务卡都包含【范围】【执行步骤】【改动点】【验收标准】【建议测试】【风险与回滚】。

---

## 2.1 P0-1 统一 World 获取与多 World 语义

### 范围
- 统一系统读取 World 的入口：避免 `World.get()` 与 `WorldProvider.useWorld()` 混用造成读错 world。
- 保留现有 multi-world 测试与注入能力。

### 现状线索（需先确认）
- `packages/animation/src/systems/*` 使用 `World.get()`
- `packages/core/src/systems/*` 多数使用 `WorldProvider.useWorld()`

### 执行步骤
1) 搜索所有 `World.get()` 在 `packages/animation/src/systems` 的调用点。
2) 将这些系统改为使用 `WorldProvider.useWorld()`（从 `@g-motion/core` 导入）。
3) 检查 `packages/animation/src/index.ts` 的 `initEngine()`：确保注册系统的 world 与运行时读取的 world 一致。
4) 跑现有测试：
   - `pnpm -F @g-motion/animation test`
   - 重点关注 `packages/animation/tests/world.isolation.test.ts`
5) 若出现测试依赖 singleton world 的假设：
   - 修复为 `WorldProvider.withWorld(world, ...)` 作用域内读 world。

### 改动点（预期文件）
- `packages/animation/src/systems/timeline.ts`
- `packages/animation/src/systems/interpolation.ts`
- `packages/animation/src/systems/rovingResolver.ts`
- `packages/animation/src/index.ts`（如需）

### 验收标准
- `packages/animation/tests/world.isolation.test.ts` 全绿。
- 在两个 world 并行运行时：每个 world 的实体与状态更新互不影响。
- 不再存在同一帧内系统链路读不同 world 的行为。

### 建议新增测试（若缺）
- 新增 `packages/animation/tests/world.systems-consistency.test.ts`：
  - 创建两个 world，分别创建动画；推进/启动其中一个 scheduler；断言另一 world 不更新。

### 风险与回滚
- 风险：外部用户可能依赖 `World.get()` 的 singleton 行为。
- 回滚：若出现兼容性问题，提供“显式 singleton 模式”文档说明，不回退混用。

---

## 2.2 P0-2 GPU 时间语义对齐（CPU/GPU 一致的 currentTime）

### 范围
- GPU batch 采样的时间字段与 CPU path（`MotionState.currentTime`）保持同一语义。

### 现状线索
- `packages/core/src/systems/batch/sampling.ts` 使用 `now = performance.now()` 写入 batch entity 的 `currentTime`。
- CPU path 由 `TimeSystem` 维护 `MotionState.currentTime`。

### 执行步骤
1) 阅读 `BatchSamplingSystem` 组装 `BatchEntity` 的字段来源。
2) 改为：batch 的 `currentTime` 使用 `state.currentTime`（或定义统一字段 `timelineTimeMs`）。
3) 校对 GPU kernel / dispatch 输入期待的字段语义；同步注释与类型定义。
4) 新增/更新测试用例，验证 delay/repeat/pause（若支持）在 GPU on/off 下行为一致。
5) 运行：
   - `pnpm -F @g-motion/core test`
   - `pnpm -F @g-motion/animation test`

### 改动点（预期文件）
- `packages/core/src/systems/batch/sampling.ts`
- （可选）`packages/core/src/types.ts`（BatchEntity 注释/字段）

### 验收标准
- delay 时 GPU 不提前计算。
- repeat=1 时 GPU/CPU 结束值一致（允许小误差）。
- examples `/webgpu` 在 GPU 启用下节奏不明显偏离。

### 风险与回滚
- 风险：GPU path 设计可能需要 wall-clock。
- 回滚：保留 wall-clock 字段（例如 `globalTimeMs`）但插值使用统一 timeline time。

---

## 2.3 P0-3 热路径日志收敛（DOM renderer / scheduler）

### 范围
- 禁止高频路径默认 `console.debug/warn`；统一走可控 debug logger。

### 执行步骤
1) 定位 `packages/plugins/dom/src/renderer.ts` 中所有 `console.*`。
2) 用 `@g-motion/utils` 的 `createDebugger('DOMRenderer')` 替换，或引入可注入 logger。
3) 检查 `packages/core/src/scheduler.ts` 的异常输出策略：
   - 保留 `console.error` 但加节流/仅 dev 输出，或改为 debug logger。
4) 新增测试：默认情况下不调用 `console.debug`。
5) 运行：`pnpm -F @g-motion/plugin-dom test`。

### 改动点
- `packages/plugins/dom/src/renderer.ts`
- `packages/core/src/scheduler.ts`

### 验收标准
- 默认运行 examples 不刷屏。
- 开启 `globalThis.__MOTION_DEBUG__ = true` 后可看到 debug 输出。

---

## 2.4 P0-4 Component schema 与运行时数据一致性（dev 断言）

### 范围
- 在 dev 模式下对 schema 做合法性校验，尽早暴露 typed buffer 依赖问题。

### 执行步骤
1) 在 `App.registerComponent` 增加校验：
   - name 非空
   - schema key/value 合法（ComponentType 枚举内）
2) （可选）在 `World.createEntity` 对传入 component data 做一次浅校验（仅 dev）。
3) 写单测：非法 schema 抛错；合法 schema 可注册。

### 改动点
- `packages/core/src/app.ts`
- （可选）`packages/core/src/world.ts`

### 验收标准
- 非法 schema 明确失败信息。
- production 模式不引入额外开销（校验受环境变量开关控制）。

---

## 2.5 P1-1 插件注册方式分离：显式 vs auto（减少副作用）

### 范围
- 将插件“自动注册”从默认入口拆分到 `/auto` 子入口，减少副作用导入。

### 执行步骤
1) 对每个插件包创建新的入口文件：`src/auto.ts`（仅包含 auto-register）。
2) 默认入口 `src/index.ts` 仅导出 `Plugin`、`createRenderer` 等，不做自动注册。
3) 更新 `package.json exports` 增加子路径导出（如 `./auto`）。
4) 更新 examples：改为 `import '@g-motion/plugin-dom/auto'`（spring/inertia 同理）。
5) 加测试：不 import `/auto` 时不注册；import `/auto` 后注册。

### 改动点
- `packages/plugins/dom/src/index.ts` + 新增 `src/auto.ts`
- `packages/plugins/spring/src/index.ts` + 新增 `src/auto.ts`
- `packages/plugins/inertia/src/index.ts` + 新增 `src/auto.ts`
- 对应 `packages/plugins/*/package.json` 的 `exports`
- `apps/examples/src/main.tsx`

### 验收标准
- examples 正常运行。
- 用户可选择显式注册或 side-effect auto。

---

## 2.6 P1-2 GPU delivery channel mapping 绑定到真实 tracks

### 范围
- 移除 `GPUResultApplySystem` 的硬编码 default channels 依赖；将 channel mapping 与实际 timeline tracks 绑定。

### 执行步骤
1) 在创建 entity（builder）时，拿到 `TimelineData` 的 track keys，确定稳定顺序（例如字典序或插入序 + 明确规则）。
2) 将该顺序注册到 `GPUChannelMappingRegistry`（stride=trackCount, channels=keys）。
3) `BatchSamplingSystem` 打包数据时可带上该 stride/channels（或 registry 查询）。
4) `GPUResultApplySystem` 优先使用 packet/registry 的 mapping；无 mapping 时给出明确告警（dev only）。
5) 补测试：三通道映射正确写回 Render.props。

### 改动点
- `packages/animation/src/api/builder.ts`（注册 mapping）
- `packages/core/src/webgpu/channel-mapping.ts`（若需增强 API）
- `packages/core/src/systems/webgpu/delivery.ts`

### 验收标准
- GPU path 下 x/y/rotate 等属性不串值。
- 无 mapping 时行为可解释且可观测（dev warning）。

---

## 2.7 P1-3 Active entity count 与 scheduler 启停：单一事实来源

### 范围
- 将 active entity count 的统计与 scheduler 启停从 `TimelineSystem` 分离为独立系统。

### 执行步骤
1) 新增系统 `ActiveEntityMonitorSystem`：遍历 archetypes，统计 Running/Paused。
2) 将 scheduler 的 `setActiveEntityCount` 调用移到该系统。
3) `TimelineSystem` 仅做 duration/repeat/finished 状态机。
4) 跑回归测试（尤其 spring/inertia 混用）。

### 改动点
- `packages/animation/src/systems/timeline.ts`
- 新增 `packages/animation/src/systems/activeEntityMonitor.ts`
- `packages/animation/src/index.ts` 注册顺序（确保 monitor 在合适的 order）

### 验收标准
- 动画结束后 scheduler 稳定 stop。
- paused（如存在）不会导致意外停。

---

## 2.8 P2-1 覆盖率产物与 CI 对齐

### 范围
- 确保 `pnpm test` 生成 CI 期望的 coverage 文件并上传。

### 执行步骤
1) 检查现有 vitest config 是否开启 coverage。
2) 统一输出路径（推荐根目录 `coverage/` 或每包 `coverage/` 并在 CI 聚合）。
3) 更新 CI 的 `files:` 路径与本地文档说明。

### 改动点
- `packages/*/vitest.config.ts`
- `.github/workflows/ci.yml`

### 验收标准
- CI 上传 coverage 非空。

---

## 2.9 P2-2 examples 作为性能/调试控制台规范化

### 范围
- examples 提供一致的 engine/gpu/debug 配置入口，用于回归验证与性能观测。

### 执行步骤
1) 盘点当前 examples routes：`gpu-config.tsx`、`engine-config.tsx` 等。
2) 将 UI 控件与 `world.config`/metrics provider 对齐（mode/threshold/fps/globalSpeed/debug）。
3) 给每个 demo 页面补“当前引擎状态”展示（只读）。

### 验收标准
- 能稳定复现：CPU/GPU 切换、阈值变化、帧率限制、debug 开关。

---

## 3. 推荐执行顺序（最小风险路径）
1) P0-1（World 统一）
2) P0-2（GPU 时间语义）
3) P0-3（日志收敛）
4) P1-1（插件 auto 拆分）
5) P1-2（channel mapping 绑定）
6) P1-3（active count 单一来源）
7) P2-1（coverage）
8) P2-2（examples 控制台）

---

## 4. 执行记录模板（每卡完成后追加）

### <任务卡编号> 完成摘要
- 变更范围：
- 关键文件：
- 新增/修改测试：
- 运行的命令与结果：
- 风险与后续：

