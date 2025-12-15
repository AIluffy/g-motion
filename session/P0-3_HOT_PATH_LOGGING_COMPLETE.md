# P0-3 热路径日志收敛 - 完成摘要

> 执行日期：2025-12-15
> 任务：统一日志系统，禁止高频路径默认输出，统一走可控 debug logger

---

## 执行范围

- 禁止高频路径默认 `console.debug/warn`；统一走可控 debug logger
- 目标文件：
  - `packages/plugins/dom/src/renderer.ts`
  - `packages/core/src/scheduler.ts`

---

## 关键改动

### 1. DOM Renderer 日志收敛

**文件**: `packages/plugins/dom/src/renderer.ts`

**改动**:
- 引入 `createDebugger('DOMRenderer')` 替代直接 `console.debug` 调用
- 移除 3 处 `console.debug` 调用：
  1. `createDOMRenderer()` 创建时的日志
  2. `resolveCachedElement()` 中的元素解析日志
  3. 移除冗余的 `if (typeof window !== 'undefined')` 检查

**代码变更**:
```typescript
// 新增导入
import { createDebugger } from '@g-motion/utils';
const debug = createDebugger('DOMRenderer');

// 替换前
console.debug('[DOMRenderer] created');
console.debug('[DOMRenderer] resolveCachedElement selector', target, '->', el);

// 替换后
debug('created');
debug('resolveCachedElement selector', target, '->', el);
```

### 2. Scheduler 日志收敛

**文件**: `packages/core/src/scheduler.ts`

**改动**:
- 引入 `createDebugger('Scheduler')` 替代 `console.error`
- 系统错误日志改为通过 debug logger 输出
- 移除生产环境下的无条件错误输出

**代码变更**:
```typescript
// 新增导入
import { createDebugger } from '@g-motion/utils';
const debug = createDebugger('Scheduler');

// 替换前
console.error(`[Motion] System '${system.name}' error:`, e);

// 替换后
debug(`System '${system.name}' error:`, e);
```

---

## 新增测试

### 1. DOM Renderer 日志测试

**文件**: `packages/plugins/dom/tests/logging.test.ts`

**覆盖场景**:
- ✅ 生产模式下默认不调用 `console.debug`
- ✅ 开启 `__MOTION_DEBUG__` 后可正常输出日志
- ✅ 热路径操作（100次 update）不刷屏
- ✅ 元素解析默认不输出日志

### 2. Scheduler 日志测试

**文件**: `packages/core/src/tests/scheduler-logging.test.ts`

**覆盖场景**:
- ✅ 正常运行时不刷屏
- ✅ 开启 debug 时记录系统错误
- ✅ 生产模式下默认不输出错误（除非 `__MOTION_DEBUG__` 开启）
- ✅ 开启 `__MOTION_DEBUG__` 后生产环境也输出错误

---

## 测试结果

### DOM Plugin 测试

```bash
pnpm -F @g-motion/plugin-dom test logging
```

**结果**: ✅ 4/4 测试通过

```
✓ DOMRenderer Logging (4)
  ✓ should not call console.debug by default in production-like mode
  ✓ should log when __MOTION_DEBUG__ is enabled
  ✓ should not flood console in hot-path operations
  ✓ element resolution should not log by default
```

### Core Package 测试

```bash
pnpm -F @g-motion/core test scheduler-logging
```

**结果**: ✅ 4/4 测试通过

```
✓ SystemScheduler Logging (4)
  ✓ should not flood console during normal operation
  ✓ should log system errors when debug is enabled
  ✓ should not log errors in production unless __MOTION_DEBUG__ is enabled
  ✓ should log errors when __MOTION_DEBUG__ is enabled in production
```

---

## 验收标准达成

### ✅ 默认运行 examples 不刷屏

- 生产模式下所有热路径日志默认关闭
- 仅在 `globalThis.__MOTION_DEBUG__ = true` 时输出

### ✅ 开启 `__MOTION_DEBUG__` 后可看到 debug 输出

- DOM renderer 创建和元素解析日志正常输出
- Scheduler 系统错误日志正常输出
- 日志格式统一：`[Motion <Namespace>] <message>`

### ✅ TypeScript 类型检查通过

- 无类型错误
- 无 import 错误

---

## 影响范围

### 直接修改
- `packages/plugins/dom/src/renderer.ts` (3 处日志调用)
- `packages/core/src/scheduler.ts` (1 处日志调用)

### 新增文件
- `packages/plugins/dom/tests/logging.test.ts` (4 个测试用例)
- `packages/core/tests/scheduler-logging.test.ts` (4 个测试用例)

### 依赖
- 使用现有 `@g-motion/utils` 的 `createDebugger` 工具
- 无新增外部依赖

---

## 后续建议

### 可选优化（非本任务范围）

以下文件中仍存在直接 `console.warn/error` 调用，可在后续任务中统一收敛：

1. **API 层警告** (较低频，影响小):
   - `packages/animation/src/api/keyframes.ts` (3 处 console.warn)

2. **WebGPU 系统** (非热路径):
   - `packages/core/src/systems/webgpu.ts` (4 处 console.warn)
   - `packages/core/src/systems/webgpu/initialization.ts` (2 处 console.warn)
   - `packages/core/src/systems/webgpu/delivery.ts` (1 处 console.warn)

3. **Batch 处理** (错误情况):
   - `packages/core/src/systems/batch/processor.ts` (3 处 console.error)

4. **Render 系统** (错误情况):
   - `packages/core/src/systems/render.ts` (1 处 console.warn)

5. **工具/基准测试** (非生产路径):
   - `packages/core/src/webgpu/benchmark.ts` (3 处 console.warn/error)
   - `packages/core/src/webgpu/async-readback.ts` (2 处 console.warn)

**优先级评估**:
- P2: API 层警告（用户可见，但低频）
- P3: 系统层错误/警告（内部异常，已有 try-catch）
- P4: 工具/基准测试（开发时工具，非生产路径）

---

## 风险与回滚

### 风险
- **低风险**: 仅修改日志输出方式，不改变业务逻辑
- **向后兼容**: 开发环境行为不变（默认启用日志）
- **可控降级**: 用户可通过 `__MOTION_DEBUG__` 手动启用日志

### 回滚方案
如出现问题，可快速回退到直接 `console.debug/error` 调用：
```typescript
// 回退方案（不推荐）
const debug = console.debug.bind(console, '[Motion DOMRenderer]');
```

但当前实现已通过完整测试覆盖，无需回滚。

---

## 完成确认

- [x] DOM renderer 热路径日志收敛完成
- [x] Scheduler 错误日志收敛完成
- [x] 新增 8 个测试用例全部通过
- [x] TypeScript 类型检查通过
- [x] 验收标准达成
- [x] 文档更新（本文件）

**任务状态**: ✅ **完成**
