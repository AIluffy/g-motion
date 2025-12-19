# GPU 数据传输优化实施计划

**日期**: 2024-12-20
**基于**: GPU_CPU_DATA_TRANSFER_ANALYSIS.md
**目标**: 实施 P0 和 P1 优化，提升 GPU/CPU 数据传输性能

---

## 一、优化任务清单

### Phase 1: P0 优化（立即实施）

#### ✅ Task 1: 消除 States 数据冗余检测
**文件**: `packages/core/src/webgpu/persistent-buffer-manager.ts`
**预期收益**: 减少 0.2-0.5ms/帧 CPU 开销
**实施步骤**:
1. 在 `getOrCreateBuffer` 方法添加 `alwaysUpdate` 选项
2. 当 `alwaysUpdate=true` 时跳过变化检测
3. 在 `dispatch.ts` 中为 states 数据传递 `alwaysUpdate: true`

#### ✅ Task 2: 使用版本号替代 Keyframes 变化检测
**文件**:
- `packages/core/src/webgpu/persistent-buffer-manager.ts`
- `packages/core/src/systems/webgpu/dispatch.ts`

**预期收益**: 减少 0.5-1ms/帧 CPU 开销（大规模场景）
**实施步骤**:
1. 在 `PersistentBuffer` 接口添加 `contentVersion` 字段
2. 修改 `detectChanges` 方法支持版本号快速检测
3. 在 `dispatch.ts` 中传递 keyframes 版本号
4. 版本号不匹配时才执行逐元素比较

### Phase 2: P1 优化（短期实施）

#### ✅ Task 3: 分级缓冲区对齐
**文件**: `packages/core/src/webgpu/persistent-buffer-manager.ts`
**预期收益**: 减少 10-20% 内存浪费（小缓冲区）
**实施步骤**:
1. 修改 `calculateOptimalSize` 方法
2. 根据数据大小采用不同对齐策略（64B/256B/4KB）

#### 🔄 Task 4: 双缓冲回读（可选，复杂度高）
**文件**: 新建 `packages/core/src/webgpu/double-buffered-readback.ts`
**预期收益**: 减少 1-2 帧延迟
**实施步骤**:
1. 创建 `DoubleBufferedReadback` 类
2. 实现双缓冲逻辑
3. 集成到 `WebGPUComputeSystem`
4. 测试验证

**决策**: 暂时跳过，因为当前异步回读已经足够好（98% 成功率）

---

## 二、实施顺序

```
1. Task 1: 消除 States 数据冗余检测 (30 分钟)
   ↓
2. Task 2: 使用版本号替代 Keyframes 变化检测 (45 分钟)
   ↓
3. Task 3: 分级缓冲区对齐 (15 分钟)
   ↓
4. 测试验证 (30 分钟)
   ↓
5. 性能基准测试 (30 分钟)
```

**总预计时间**: 2.5 小时

---

## 三、技术设计

### 3.1 Task 1: 消除 States 数据冗余检测

**修改点 1**: `persistent-buffer-manager.ts`

```typescript
export interface BufferUpdateOptions {
  label?: string;
  forceUpdate?: boolean;
  allowGrowth?: boolean;
  skipChangeDetection?: boolean; // 新增：跳过变化检测
}

getOrCreateBuffer(
  key: string,
  data: Float32Array,
  usage: GPUBufferUsageFlags,
  options?: BufferUpdateOptions,
): GPUBuffer {
  const existing = this.buffers.get(key);

  if (existing && existing.size >= requiredSize) {
    existing.lastUsedFrame = this.currentFrame;

    // 跳过变化检测（用于 states 数据）
    if (options?.skipChangeDetection) {
      this.uploadData(existing.buffer, data, key);
      existing.version++;
      existing.isDirty = false;
      this.stats.totalUpdates++;
      this.stats.totalBytesProcessed += requiredSize;
      return existing.buffer;
    }

    // 正常变化检测流程
    if (!options?.forceUpdate) {
      const hasChanges = this.detectChanges(key, data);
      if (!hasChanges) {
        this.stats.bytesSkipped += requiredSize;
        return existing.buffer;
      }
    }

    this.uploadData(existing.buffer, data, key);
    existing.version++;
    existing.isDirty = false;
    this.stats.totalUpdates++;
    this.stats.totalBytesProcessed += requiredSize;
    return existing.buffer;
  }

  // 创建新缓冲区...
}
```

**修改点 2**: `systems/webgpu/dispatch.ts`

```typescript
// States 数据：跳过变化检测
const stateBuffer = persistentBufferManager.getOrCreateBuffer(
  `states:${archetypeId}`,
  batch.statesData,
  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  {
    label: `states-${archetypeId}`,
    skipChangeDetection: true, // 每帧必变，跳过检测
  }
);

// Keyframes 数据：保持变化检测
const keyframeBuffer = persistentBufferManager.getOrCreateBuffer(
  `keyframes:${archetypeId}`,
  batch.keyframesData,
  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  {
    label: `keyframes-${archetypeId}`,
    skipChangeDetection: false, // 保持变化检测
  }
);
```

### 3.2 Task 2: 使用版本号替代 Keyframes 变化检测

**修改点 1**: `persistent-buffer-manager.ts`

```typescript
export interface PersistentBuffer {
  buffer: GPUBuffer;
  size: number;
  usage: GPUBufferUsageFlags;
  lastUsedFrame: number;
  version: number;
  isDirty: boolean;
  label?: string;
  contentVersion?: number; // 新增：内容版本号
}

export interface BufferUpdateOptions {
  label?: string;
  forceUpdate?: boolean;
  allowGrowth?: boolean;
  skipChangeDetection?: boolean;
  contentVersion?: number; // 新增：内容版本号
}

getOrCreateBuffer(
  key: string,
  data: Float32Array,
  usage: GPUBufferUsageFlags,
  options?: BufferUpdateOptions,
): GPUBuffer {
  const existing = this.buffers.get(key);

  if (existing && existing.size >= requiredSize) {
    existing.lastUsedFrame = this.currentFrame;

    // 跳过变化检测
    if (options?.skipChangeDetection) {
      this.uploadData(existing.buffer, data, key);
      existing.version++;
      existing.isDirty = false;
      this.stats.totalUpdates++;
      this.stats.totalBytesProcessed += requiredSize;
      return existing.buffer;
    }

    // 版本号快速检测
    if (options?.contentVersion !== undefined) {
      if (existing.contentVersion === options.contentVersion) {
        // 版本号相同，数据未变化
        this.stats.bytesSkipped += requiredSize;
        return existing.buffer;
      }
      // 版本号不同，更新数据
      this.uploadData(existing.buffer, data, key);
      existing.version++;
      existing.contentVersion = options.contentVersion;
      existing.isDirty = false;
      this.stats.totalUpdates++;
      this.stats.incrementalUpdates++;
      this.stats.totalBytesProcessed += requiredSize;
      return existing.buffer;
    }

    // 回退到逐元素比较
    if (!options?.forceUpdate) {
      const hasChanges = this.detectChanges(key, data);
      if (!hasChanges) {
        this.stats.bytesSkipped += requiredSize;
        return existing.buffer;
      }
    }

    this.uploadData(existing.buffer, data, key);
    existing.version++;
    existing.isDirty = false;
    this.stats.totalUpdates++;
    this.stats.totalBytesProcessed += requiredSize;
    return existing.buffer;
  }

  // 创建新缓冲区
  const newBuffer = this.createNewBuffer(key, data, usage, options);
  if (options?.contentVersion !== undefined) {
    const persistentBuffer = this.buffers.get(key);
    if (persistentBuffer) {
      persistentBuffer.contentVersion = options.contentVersion;
    }
  }
  return newBuffer;
}
```

**修改点 2**: `systems/batch/sampling.ts`

```typescript
// 计算 keyframes 版本号签名
let keyframesVersion = 0;
const typedTimelineVersion = archetype.getTypedBuffer('Timeline', 'version');
for (let eIndex = 0; eIndex < entityCount; eIndex++) {
  const i = entityIndicesBuf[eIndex];
  const v = typedTimelineVersion
    ? (typedTimelineVersion[i] as unknown as number)
    : Number((timelineBuffer[i] as any).version ?? 0);
  keyframesVersion = (((keyframesVersion * 31) >>> 0) ^ (v >>> 0)) >>> 0;
}

// 存储版本号到 batch
const batch: ArchetypeBatchDescriptor = {
  archetypeId,
  entityIds: entityIdsView,
  entityCount,
  entityIdsLeaseId: lease.leaseId,
  statesData,
  keyframesData,
  keyframesVersion, // 新增：版本号
  workgroupHint,
  createdAt: Date.now(),
};
```

**修改点 3**: `systems/webgpu/dispatch.ts`

```typescript
// Keyframes 数据：使用版本号检测
const keyframeBuffer = persistentBufferManager.getOrCreateBuffer(
  `keyframes:${archetypeId}`,
  batch.keyframesData,
  GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  {
    label: `keyframes-${archetypeId}`,
    contentVersion: batch.keyframesVersion, // 传递版本号
  }
);
```

### 3.3 Task 3: 分级缓冲区对齐

**修改点**: `persistent-buffer-manager.ts`

```typescript
/**
 * Calculate optimal buffer size with tiered alignment
 *
 * Alignment strategy:
 * - < 1KB: 64-byte alignment (reduce waste for small buffers)
 * - 1KB - 64KB: 256-byte alignment (balanced)
 * - >= 64KB: 4KB alignment (page-aligned for large buffers)
 */
private calculateOptimalSize(requiredSize: number): number {
  // Add 25% headroom for growth
  const withHeadroom = Math.ceil(requiredSize * 1.25);

  // Tiered alignment based on size
  if (withHeadroom < 1024) {
    // Small buffers: 64-byte alignment
    return Math.ceil(withHeadroom / 64) * 64;
  } else if (withHeadroom < 64 * 1024) {
    // Medium buffers: 256-byte alignment
    return Math.ceil(withHeadroom / 256) * 256;
  } else {
    // Large buffers: 4KB alignment (page-aligned)
    return Math.ceil(withHeadroom / 4096) * 4096;
  }
}
```

---

## 四、测试计划

### 4.1 单元测试

**新增测试**: `packages/core/tests/persistent-buffer-optimization.test.ts`

```typescript
describe('PersistentGPUBufferManager Optimizations', () => {
  describe('Skip Change Detection', () => {
    it('should skip change detection when skipChangeDetection=true', () => {
      // 测试 states 数据跳过检测
    });

    it('should still detect changes when skipChangeDetection=false', () => {
      // 测试 keyframes 数据正常检测
    });
  });

  describe('Version-based Change Detection', () => {
    it('should skip upload when contentVersion matches', () => {
      // 测试版本号匹配时跳过上传
    });

    it('should upload when contentVersion differs', () => {
      // 测试版本号不匹配时上传
    });

    it('should fallback to element comparison when no version provided', () => {
      // 测试回退到逐元素比较
    });
  });

  describe('Tiered Buffer Alignment', () => {
    it('should use 64-byte alignment for small buffers', () => {
      // 测试小缓冲区 64 字节对齐
    });

    it('should use 256-byte alignment for medium buffers', () => {
      // 测试中等缓冲区 256 字节对齐
    });

    it('should use 4KB alignment for large buffers', () => {
      // 测试大缓冲区 4KB 对齐
    });
  });
});
```

### 4.2 性能基准测试

**新增基准**: `packages/core/benchmarks/gpu-data-transfer.bench.ts`

```typescript
describe('GPU Data Transfer Performance', () => {
  bench('States upload with change detection (baseline)', () => {
    // 基线：带变化检测
  });

  bench('States upload without change detection (optimized)', () => {
    // 优化：跳过变化检测
  });

  bench('Keyframes upload with element comparison (baseline)', () => {
    // 基线：逐元素比较
  });

  bench('Keyframes upload with version check (optimized)', () => {
    // 优化：版本号检测
  });
});
```

### 4.3 集成测试

**验证场景**:
1. 5000 实体动画（静态 keyframes）
2. 5000 实体动画（动态 keyframes）
3. 混合场景（部分静态，部分动态）

**验证指标**:
- CPU 时间减少 > 30%
- 带宽节省保持 80%+
- 内存占用减少 10%+

---

## 五、风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 版本号计算错误导致数据不同步 | 低 | 高 | 完善单元测试，添加版本号校验 |
| 跳过检测导致数据未更新 | 低 | 高 | 仅对 states 数据跳过，keyframes 保持检测 |
| 对齐策略导致 GPU 性能下降 | 低 | 中 | 保持 256B 对齐作为默认，仅优化边缘情况 |
| 回归测试失败 | 中 | 中 | 运行完整测试套件，确保兼容性 |

---

## 六、成功标准

### 性能指标

| 指标 | 当前 | 目标 | 验证方法 |
|------|------|------|----------|
| CPU 开销 | 1.5ms/帧 | < 1.0ms/帧 | 性能基准测试 |
| 带宽节省 | 80% | > 80% | 统计数据上传量 |
| 内存占用 | 3.2MB | < 3.0MB | 内存分析器 |
| 测试通过率 | 100% | 100% | CI/CD 测试 |

### 代码质量

- [ ] 所有单元测试通过
- [ ] 性能基准测试显示改进
- [ ] 代码审查通过
- [ ] 文档更新完成

---

## 七、实施时间表

**Day 1 (今天)**:
- ✅ 完成计划制定
- ⏳ 实施 Task 1: 消除 States 数据冗余检测
- ⏳ 实施 Task 2: 使用版本号替代 Keyframes 变化检测
- ⏳ 实施 Task 3: 分级缓冲区对齐
- ⏳ 编写单元测试
- ⏳ 运行测试验证

**Day 2 (如需要)**:
- 性能基准测试
- 文档更新
- 代码审查

---

**计划制定完成**: 2024-12-20
**开始实施**: 立即
