# WebGPUComputeSystem 重构计划

## 背景

`packages/core/src/systems/webgpu/system.ts` 当前承担了 WebGPU 动画计算系统的“总入口”职责，包含：

- 系统初始化与状态管理
- 多条 GPU 子流水线（主插值、keyframe 预处理/搜索/插值、viewport culling compaction、output format）
- staging buffer 池与异步读回编排
- 调试输入输出采样与宿主（DOM）bounds 解析

随着功能增长，该文件已成为高耦合热点，变更风险与回归成本持续上升。

## 当前架构问题点（Problem Statement）

1. **单文件多职责、体量过大**
   - 系统调度与 pass 细节混在一起，阅读与定位成本高，改动容易牵一发而动全身。
2. **阶段边界隐式、控制流复杂**
   - `update()` 内含多处 early-return/try-catch/分支穿插，阶段顺序依赖“读者心智模型”，后续插入新 pass 容易引入顺序错误。
3. **资源生命周期分散、难以证明正确性**
   - `GPUBuffer.destroy()`、staging buffer 归还、entityIds lease 的 acquire/release/markInFlight 分散在多分支中，维护者难静态验证“不泄漏/不重复释放”。
4. **全局 pipeline 缓存存在隐藏约束**
   - 某些 pipeline 只缓存单例，配置变化时是否应切换实现不直观，容易误用。
5. **热路径分配与同步点偏多**
   - output format pass 与 viewport culling compaction 内存在频繁创建/销毁 buffer 与 typed array 的情况，容易造成 GC 与 WebGPU 资源抖动。

## 重构目标（Goals）

- **功能完整性**：对外行为与结果保持一致（默认配置、开关、调试输出、metrics 与读回语义不变）。
- **模块职责单一**：将“pass 实现细节/缓存/辅助逻辑”从 `system.ts` 中拆分，`system.ts` 聚焦编排。
- **可维护性提升**：显式化每帧阶段与关键状态机，降低未来新增 pass 的回归风险。
- **性能优化（可验证）**：在不改变语义的前提下减少热路径分配与重复创建的 GPU 资源；通过现有 bench/示例验证“性能有可观提升”。

## 非目标（Non-goals）

- 不改变外部 API（导出符号与运行时开关保持兼容）。
- 不引入新的第三方依赖。
- 不对 GPU culling 的同步读回做跨帧异步化（这会改变结果到达时序，属于行为语义变更）。

## 技术方案（Technical Approach）

### 1) 模块化拆分（以“内部模块”为主）

将 `system.ts` 中的实现拆分到同目录下的内部模块，原则：

- `system.ts`：只保留系统状态、每帧阶段编排、以及“把各 pass 串起来”的 glue code。
- 每个 pass 自己维护 pipeline/bindGroupLayout 缓存与（必要的）重置方法。

建议的内部模块（均为内部实现，不改变对外导出）：

- `webgpu/system-config.ts`：开关解析（debug、viewport culling、keyframe search optimized 等）
- `webgpu/viewport-bounds.ts`：DOM bounds 解析与缓存
- `webgpu/output-format-pass.ts`：output format pipeline 与 dispatch；包含资源复用策略
- `webgpu/viewport-culling-pass.ts`：viewport culling compaction；包含 typed array 复用策略
- `webgpu/keyframe-passes.ts`：keyframe preprocess/search/interp 三段流水线

### 2) 显式化 `update()` 的阶段结构

把 `update()` 组织为稳定的阶段块（语义不变）：

1. 依赖检查与开关短路
2. Lazy init
3. Pipeline 重建（custom easing 版本变化）
4. 读回 drain（异步回调）
5. per-archetype 批处理
6. frame 收尾（staging pool / persistent buffer manager）

### 3) 性能优化策略（不改变语义）

- **Output format pass**
  - 对 channels buffer 做缓存复用（按“channels 映射签名”缓存，避免每 archetype/每帧创建/销毁）。
  - params buffer 做小型复用（或按 archetype 复用），减少 `createBuffer/destroy` 频率。
- **Viewport culling compaction**
  - 对 CPU 侧 typed arrays（states/bounds）做 capacity 缓存复用，避免每帧按 entityCount 重新分配大块 ArrayBuffer。
  - frustum 数据结构复用（仅更新 width/height 与 planes 值）。

### 4) 测试策略

单元测试目标：

- pipeline 模式选择与缓存语义（例如 keyframe search optimized 模式是否按预期“首次决定、后续不切换”）
- output format pass 的“needsFormat”判定一致性（不需要格式化时必须返回原 buffer）
- viewport bounds 缓存（100ms TTL）行为

回归测试：

- `pnpm test`（turbo 级全量）
- `pnpm lint`、`pnpm type-check`
- `pnpm -C packages/core test`（核心包单独跑）

性能验证（现有基准优先）：

- `pnpm -C packages/core bench`
- 优先关注与改动相关的基准：`gpu-persistent-buffers`、`gpu-keyframe-search`、`memory-allocation-regression` 等

## 验收标准（Acceptance Criteria）

- 代码结构清晰，`system.ts` 只负责编排，内部模块职责单一。
- 关键算法/逻辑点具备必要注释（阶段、资源所有权、缓存策略）。
- 通过所有自动化测试（test / lint / type-check）。
- 性能提升以“基准/示例”结果为准：目标是减少分配与资源抖动并呈现可测改善；具体百分比以基准数据记录为准。

## 回滚策略

重构以“内部模块拆分 + 等价重排 + 可控缓存优化”为主，若出现回归：

- 逐模块回滚到拆分前版本（保留接口一致）；
- 禁用新增缓存路径（保留原 per-frame create/destroy 行为）以快速恢复语义一致性。

