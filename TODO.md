toolName: todo_write

status: success

Todos updated: 4 items




toolName: search_codebase

status: success

query: overall architecture, packages, entry points, build scripts, tooling (pnpm, lint, typecheck), testing setup, docs




toolName: search_codebase

status: success

query: test files, benchmarks, coverage config, ci pipeline, turbo config, lint config, formatting config




toolName: search_codebase

status: success

query: CI pipeline, GitHub Actions, coverage configuration, release workflow, deployment docs




toolName: view_files

status: success


filePath: /Users/zhangxueai/Projects/idea/motion/openspec/AGENTS.md




toolName: run_command

status: success

command: openspec list undefined




toolName: run_command

status: success

command: openspec list --specs undefined




toolName: view_files

status: success


filePath: /Users/zhangxueai/Projects/idea/motion/openspec/project.md




toolName: search_by_regex

status: success

query: TODO|FIXME|HACK|XXX




toolName: run_command

status: success

command: python - <<'PY'
import os
root='/Users/zhangxueai/Projects/idea/motion'
large=[]
for dirpath, _, filenames in os.walk(root):
    if '/node_modules/' in dirpath or '/dist/' in dirpath or '/build/' in dirpath or '/.turbo/' in dirpath:
        continue
    for fn in filenames:
        if fn.endswith(('.ts','.tsx','.js','.jsx','.md')):
            path=os.path.join(dirpath,fn)
            try:
                with open(path,'rb') as f:
                    count=sum(1 for _ in f)
            except Exception:
                continue
            if count>400:
                large.append((count,path))
large.sort(reverse=True)
for count,path in large[:30]:
    print(count,path)
PY undefined




toolName: run_command

status: success

command: python -c "import os;root='/Users/zhangxueai/Projects/idea/motion';large=[]
for dirpath,_,filenames in os.walk(root):
    if any(p in dirpath for p in ('/node_modules/','/dist/','/build/','/.turbo/')):
        continue
    for fn in filenames:
        if fn.endswith(('.ts','.tsx','.js','.jsx','.md')):
            path=os.path.join(dirpath,fn)
            try:
                with open(path,'rb') as f:
                    count=sum(1 for _ in f)
            except Exception:
                continue
            if count>400:
                large.append((count,path))
large.sort(reverse=True)
print('\n'.join(f'{c} {p}' for c,p in large[:30]))" undefined




toolName: run_command

status: success

command: find . -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.md' \) -not -path './node_modules/*' -not -path './dist/*' -not -path './build/*' -not -path './.turbo/*' -print0 | xargs -0 wc -l | sort -nr | head -n 30 undefined




toolName: run_command

status: success

command: find packages apps -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.md' \) -path '*/src/*' -print0 | xargs -0 wc -l | sort -nr | head -n 30 undefined




toolName: view_files

status: success


filePath: /Users/zhangxueai/Projects/idea/motion/packages/webgpu/README.md




toolName: view_files

status: success


filePath: /Users/zhangxueai/Projects/idea/motion/packages/core/src/systems/batch/sampling.ts




toolName: view_files

status: success


filePath: /Users/zhangxueai/Projects/idea/motion/packages/core/src/systems/batch/sampling.ts




toolName: view_files

status: success


filePath: /Users/zhangxueai/Projects/idea/motion/packages/webgpu/src/engine.ts




toolName: view_files

status: success


filePath: /Users/zhangxueai/Projects/idea/motion/packages/core/src/systems/webgpu/system.ts




toolName: view_files

status: success


filePath: /Users/zhangxueai/Projects/idea/motion/packages/animation/src/api/mark.ts




toolName: view_files

status: success


filePath: /Users/zhangxueai/Projects/idea/motion/packages/plugins/dom/src/renderer.ts




toolName: file_search

status: success

file_pattern: **/vitest*.{ts,js,mjs,cjs}




toolName: file_search

status: success

file_pattern: packages/*/vitest.config.ts




toolName: view_files

status: success


filePath: /Users/zhangxueai/Projects/idea/motion/packages/core/vitest.config.ts




toolName: file_search

status: success

file_pattern: .github/workflows/*




toolName: view_files

status: success


filePath: /Users/zhangxueai/Projects/idea/motion/.github/workflows/ci.yml




toolName: todo_write

status: failed

Todos updated: 0 items




toolName: todo_write

status: success

Todos updated: 4 items

**评估概览**
- **代码结构**：Monorepo + pnpm workspace + Turbo，核心包清晰，但 GPU、批处理、渲染与 API 逻辑仍存在大型聚合模块与跨层耦合。[package.json](file:///Users/zhangxueai/Projects/idea/motion/package.json#L1-L47) [turbo.json](file:///Users/zhangxueai/Projects/idea/motion/turbo.json#L1-L32) [ARCHITECTURE.md](file:///Users/zhangxueai/Projects/idea/motion/ARCHITECTURE.md#L1-L140)
- **系统热点**：批采样系统、WebGPU 引擎、WebGPU 计算系统承担了过多职责，出现超长函数与“巨型模块”迹象，影响可维护性与可测试性。[sampling.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/core/src/systems/batch/sampling.ts#L1-L200) [sampling.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/core/src/systems/batch/sampling.ts#L850-L1049) [engine.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/webgpu/src/engine.ts#L1-L200) [system.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/core/src/systems/webgpu/system.ts#L1-L190)
- **API 聚合**：`mark.ts` 同时处理目标解析、时间计算、轨道构建与物理选项，职责集中且边界模糊。[mark.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/animation/src/api/mark.ts#L1-L200)
- **渲染层复杂度**：DOM 渲染器包含缓存、选择器策略与变换计算等多职责逻辑，并在模块加载阶段注册观察器，副作用边界不清晰。[renderer.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/plugins/dom/src/renderer.ts#L1-L200)
- **构建/测试/CI**：CI 有 lint/type-check/build/test 和 coverage 上传，但 Vitest 配置未启用覆盖率，coverage 产出与上传配置存在潜在不一致。[ci.yml](file:///Users/zhangxueai/Projects/idea/motion/.github/workflows/ci.yml#L1-L99) [vitest.config.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/core/vitest.config.ts#L1-L9)
- **文档现状**：架构与 WebGPU 文档完整，可作为重构基线输入；但文档与代码模块边界的一致性仍需审视。[ARCHITECTURE.md](file:///Users/zhangxueai/Projects/idea/motion/ARCHITECTURE.md#L1-L140) [@g-motion/webgpu README](file:///Users/zhangxueai/Projects/idea/motion/packages/webgpu/README.md#L1-L178)

**技术债务与代码异味**
- **超长文件**：核心源码存在 400 行以上文件，违反项目硬性拆分约束，导致阅读与回归风险上升（例如 `sampling.ts`、`engine.ts`、`preprocess-pass.ts`、`persistent-buffer-manager.ts`、`mark.ts`）。[sampling.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/core/src/systems/batch/sampling.ts) [engine.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/webgpu/src/engine.ts)
- **职责聚合**：WebGPU 引擎负责初始化、缓冲池、管线缓存、运行时状态与指标，单类过度集中；WebGPUComputeSystem 既做调度又做读回与状态管理，层次边界不清。[engine.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/webgpu/src/engine.ts#L1-L200) [system.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/core/src/systems/webgpu/system.ts#L1-L190)
- **跨层依赖风险**：批处理系统直接涉及 GPU 数据结构与物理状态打包，CPU/GPU 计算层缺乏清晰“接口边界”。[sampling.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/core/src/systems/batch/sampling.ts#L1-L200)
- **副作用初始化**：DOM 渲染器在模块加载阶段注册 MutationObserver，影响可测试性与 SSR/非 DOM 环境行为一致性。[renderer.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/plugins/dom/src/renderer.ts#L81-L95)
- **覆盖率与质量门禁不一致**：CI 上传 coverage，但当前 Vitest 配置未定义覆盖率输出，质量信号可能失真。[ci.yml](file:///Users/zhangxueai/Projects/idea/motion/.github/workflows/ci.yml#L1-L99) [vitest.config.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/core/vitest.config.ts#L1-L9)

**重构目标与原则（激进版）**
- **核心目标**
  - 提升可维护性：拆分巨型模块，建立清晰层级与边界。
  - 提升可扩展性：让 GPU/CPU、渲染器与 API 拓展更低耦合。
  - 保持性能：性能热路径零分配原则不退让。
  - 优化开发体验：测试覆盖与工程约束更一致，改动更可验证。
- **重构原则**
  - **长期收益优先**：允许破坏性变更与 API 清理。
  - **架构简洁**：模块对齐职责，避免“层间直连”。
  - **边界清晰**：统一由接口/协议沟通，减少跨包访问内部细节。
  - **性能不可退化**：每阶段包含基准对比与回归指标。

**详细重构路线图（含任务/产出/技术选型/成功标准）**
- **阶段 0：变更治理与基线建立（1–2 周）**
  - 任务：建立 OpenSpec 变更提案、清点核心路径与基线指标（CPU/GPU 吞吐、内存、批处理开销）。
  - 产出：变更提案与风险清单、性能基线报告。
  - 技术选型：OpenSpec 变更流程、Vitest + Bench 脚本基线。
  - 成功标准：基线数据可重复、覆盖关键 API 与 GPU 关键路径。
- **阶段 1：运行时与调度拆分（2–3 周）**
  - 任务：拆分 `BatchSamplingSystem` 为“采样准备/轨道打包/物理状态准备”，引入明确的 CPU/GPU 批处理接口；将复杂逻辑分解为小文件。
  - 产出：分层系统模块、清晰的数据流与接口边界。
  - 技术选型：显式 DTO/Buffer contracts、内部 module boundary 文件夹。
  - 成功标准：采样系统文件规模 < 400 行；CPU/GPU 批处理接口单测覆盖。
- **阶段 2：WebGPU 计算层解耦（3–4 周）**
  - 任务：拆分 `WebGPUEngine` 责任为设备管理、管线缓存、缓冲池、读回管理；`WebGPUComputeSystem` 变为单纯调度器。
  - 产出：独立 GPU 子模块（DeviceManager/PipelineManager/BufferManager/ReadbackManager）。
  - 技术选型：依赖注入（AppContext）、显式生命周期接口。
  - 成功标准：引擎类 < 300 行；系统只做“调度+状态编排”。
- **阶段 3：API 与渲染器边界优化（2–3 周）**
  - 任务：拆分 `mark.ts` 为目标解析、时间轴构建、物理配置模块；DOM 渲染器拆分选择器缓存/渲染/变换三层，并控制副作用时机。
  - 产出：更小 API 模块与渲染层职责边界。
  - 技术选型：Resolver registry 独立包内模块、可替换的缓存策略。
  - 成功标准：API 模块平均文件 < 200 行，渲染器逻辑可独立测试。
- **阶段 4：质量与迁移收口（2 周）**
  - 任务：补齐覆盖率配置、更新 CI 质量门禁、提供迁移指南与示例更新。
  - 产出：覆盖率可追踪、迁移文档与示例更新。
  - 技术选型：Vitest coverage，示例应用迁移脚本。
  - 成功标准：CI coverage 产出一致；示例运行通过。

**关键风险与应对**
- **接口破坏**：激进重构会引入 API 破坏，需提供迁移层或临时适配器。
- **性能回退**：模块化可能引入额外分配；必须以基准测试为准入门槛。
- **GPU 兼容性**：WebGPU 初始化/管线拆分可能导致微妙行为差异，需要交叉测试。
- **测试不足**：覆盖率不足会放大重构风险，优先补齐核心路径测试。

**测试策略**
- **单元测试**：CPU/GPU 批处理 DTO、管线选择、目标解析与轨道合并。
- **集成测试**：时间轴→采样→GPU dispatch→读回闭环。
- **回归测试**：示例应用（DOM 与 WebGPU）作为高层回归场景。
- **基准测试**：批处理吞吐、GPU dispatch 延迟、读回稳定性。

**交付物：详细重构计划文档（摘要版）**
- **范围**：核心 ECS、WebGPU 计算链路、动画 API、DOM 渲染器、测试与 CI。
- **阶段**：0–4 五阶段，总周期 10–14 周。
- **人力需求**：技术负责人 1 人 + 核心工程师 2–3 人 + QA/工具支持 1 人。
- **时间估算**：阶段 0(1–2w) → 1(2–3w) → 2(3–4w) → 3(2–3w) → 4(2w)。
- **成功标准**：超长文件消除、模块职责清晰、覆盖率可追踪、基准性能不退化。

**目标架构草图（模块关系示意）**
```
[API Layer]
  ├─ Animation Builder (mark/track/timeline)
  └─ Target Resolution (DOM/Object/Primitive)

[Runtime Core]
  ├─ World/Archetype/Components
  ├─ Scheduler
  └─ Batch Preparation (CPU)
        └─ Batch DTO Contract

[Compute Layer]
  ├─ CPU Compute (fallback)
  ├─ GPU Device Manager
  ├─ GPU Pipeline Manager
  ├─ GPU Buffer Manager
  └─ Readback Manager

[Renderer Layer]
  ├─ DOM Renderer (selector cache / transform / apply)
  ├─ Canvas/WebGL/WebGPU Renderers
  └─ Plugin Systems
```

**重构优先级建议**
- **P0：拆分 BatchSamplingSystem 与 WebGPUEngine**
  - 直接降低维护成本、风险最大且收益最高。
- **P1：解耦 WebGPUComputeSystem 与读回流程**
  - 让调度层更可测试与可替换。
- **P2：拆分 Animation API（mark/target/track）**
  - 便于新增目标类型与新 API。
- **P3：DOM 渲染器职责拆分与副作用治理**
  - 降低渲染层复杂度，提高可预测性。

**说明**
- 本次未执行代码改动与测试，仅基于静态分析与结构评估输出重构计划。
