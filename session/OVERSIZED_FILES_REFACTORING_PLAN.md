# 代码组织重构计划 - Oversized Files 拆分

**日期**: 2026-01-09
**状态**: 分析完成，待实施

---

## 📊 总览

| 分类 | 文件数 | 总行数 | 平均行数 | 需拆分 |
|------|--------|--------|----------|--------|
| WebGPU 系统 | 6 | 4,180 | 697 | 6/6 |
| Animation Parsers | 5 | 3,391 | 678 | 5/5 |
| Animation API | 15 | ~2,800 | 187 | 3/15 |
| 其他核心文件 | 2 | 1,039 | 520 | 2/2 |
| **总计** | **28** | **~11,410** | **~408** | **16** |

---

## 🎯 优先级实施计划

### Phase 0: 共享基础设施提取 (跨文件复用)

#### 新建文件
```
packages/core/src/webgpu/
├── pipeline-cache.ts          # Pipeline 缓存模式 (从4个文件提取)
├── buffer-helpers.ts          # Buffer 创建辅助函数
└── scratch-pool.ts            # Scratch buffer 池化
```

**收益**: 减少 ~150 行重复代码，统一缓存策略

---

### Phase 1: WebGPU System (P0 - 最高优先级)

#### 1.1 `system.ts` (1066 → ~300 行)
```
packages/core/src/systems/webgpu/
├── system.ts                  # 主系统，提取后 ~300 行
├── debug.ts                   # 新建 (~50 行)
│   └── debugIO, float32Preview, firstEntityChannelPreview
├── physics-validation.ts      # 新建 (~130 行)
│   └── stepPhysicsShadow, physicsValidationShadow
└── output-buffer-processing.ts # 新建 (~120 行)
    └── processOutputBuffer
```

#### 1.2 `keyframe-passes.ts` (536 → 3×~150 行)
```
packages/core/src/systems/webgpu/keyframe/
├── index.ts                   # 桶导出
├── types.ts                   # KeyframePreprocessResult, KeyframeSearchResultGPU
├── pipeline.ts                # 3个 pipeline getters (~100 行)
├── preprocess.ts              # runKeyframePreprocessPass (~160 行)
├── search.ts                  # runKeyframeSearchPass (~125 行)
└── interp.ts                  # runKeyframeInterpPass (~75 行)
```

#### 1.3 `viewport-culling-pass.ts` (643 → ~400 行)
```
packages/core/src/systems/webgpu/viewport-culling/
├── pass.ts                    # 主逻辑 (~250 行)
├── scratch.ts                 # Scratch 池化 (~50 行)
└── pipeline.ts                # Pipeline 缓存 (~40 行)
```

#### 1.4 `delivery.ts` (642 行)
```
packages/core/src/systems/webgpu/delivery/
├── system.ts                  # GPUResultApplySystem (~570 行)
└── transforms.ts              # Transform 构建 (~70 行)
    └── buildMatrix2DTransformString, buildMatrix3DTransformString
```

#### 1.5 `output-format-pass.ts` (546 行)
- 已部分分离，可进一步提取 `OutputFormatBufferPool`

---

### Phase 2: Batch System (P0)

#### 2.1 `sampling.ts` (890 → ~450 行)
```
packages/core/src/systems/batch/
├── sampling.ts                # 系统主体 (~450 行)
├── constants.ts               # 常量 (~50 行)
├── utils.ts                   # 工具函数 (~25 行)
├── keyframe-packer.ts         # Keyframe 打包 (~220 行)
└── physics-state.ts           # 物理状态构建 (~150 行)
```

#### 2.2 `processor.ts` (467 行)
```
packages/core/src/systems/batch/processor/
├── index.ts
├── legacy.ts                  # Legacy batch API
├── archetype.ts               # Archetype batch API
├── entity-pool.ts             # Entity ID 租用
├── workgroup.ts               # Workgroup 选择
└── caching.ts                 # 结果缓存
```

---

### Phase 3: Animation Parsers (P1)

#### 3.1 新建共享基础
```
packages/animation/src/values/parsers/
├── base-parser.ts             # 抽象基类 ValueParser<T>
└── utils/
    ├── interpolation.ts       # lerp, normalizeCounts, matchArrays
    ├── math.ts                # 颜色/四元数转换
    └── parsing.ts             # 通用解析工具
```

#### 3.2 各 Parser 拆分

**path.ts** (878 → ~600 行)
```
packages/animation/src/values/parsers/path/
├── index.ts
├── types.ts                   # PathCommand types
├── commands.ts                # 命令解析
├── normalizer.ts              # 路径归一化
└── interpolator.ts            # 路径插值
```

**transform.ts** (803 → ~550 行)
```
packages/animation/src/values/parsers/transform/
├── index.ts
├── types.ts                   # TransformProperties
├── quaternion.ts              # 四元数数学
└── composer.ts                # TransformComposer
```

**color.ts** (613 → ~400 行)
```
packages/animation/src/values/parsers/color/
├── index.ts
├── types.ts                   # ColorValue
├── colors.ts                  # NAMED_COLORS 常量
└── conversions.ts             # RGB/HSL 转换
```

**gradient.ts** (691 → ~450 行)
**shadow.ts** (410 → ~300 行)

---

### Phase 4: Animation API (P2)

#### 4.1 新建目录结构
```
packages/animation/src/api/
├── index.ts                   # 主桶导出

public/                        # 公共 API
├── motion.ts                  # motion() + MotionBuilder
└── animate.ts                 # animate() 便捷 API

target/                        # 目标管理
├── index.ts
├── types.ts                   # MarkOptions, TargetType
├── resolution.ts              # resolveTargets, 解析器注册
└── visual-target.ts           # VisualTarget 抽象层

timeline/                      # 时间线构建
├── index.ts
├── builder.ts                 # TimelineData 构建
├── keyframes.ts               # Keyframe 创建
└── adjust.ts                  # 时间线调整

playback/                      # 播放控制
├── index.ts
├── control.ts                 # AnimationControl 核心
├── batch.ts                   # 批量动画
└── scope.ts                   # 作用域管理

physics/                       # 物理引擎
└── spring-inertia.ts          # Spring/Inertia 分析

utilities/                     # 工具函数
├── validation.ts              # MarkOptions 验证
└── gpu-status.ts              # GPU 状态查询
```

#### 4.2 删除/合并
- **删除**: `frameSampler.ts` (仅重新导出 `@g-motion/utils`)
- **合并**: `timeline.ts` → `timeline/utilities.ts`

---

## 📈 预期效果

| 指标 | 重构前 | 重构后 | 改进 |
|------|--------|--------|------|
| 最大文件行数 | 1,066 | ~450 | **-58%** |
| 平均文件行数 | 504 | ~150 | **-70%** |
| 文件数 | 28 | ~60 | +114% |
| 违反 400 行规则 | 16 | 0 | **-100%** |

---

## ⚠️ 风险与注意事项

1. **保持向后兼容**: 旧文件路径应重新导出新模块
2. **测试覆盖**: 重构前后必须运行测试确保行为一致
3. **逐步实施**: 每个 Phase 完成后构建+测试通过再继续
4. **导入更新**: 需同时更新所有引用这些文件的消费代码

---

## 🚀 下一步行动

1. **确认优先级**: 与团队确认 Phase 顺序
2. **创建子目录**: 按计划创建新目录结构
3. **逐步迁移**: 每次移动/拆分后运行测试
4. **更新 barrel 文件**: 确保导入路径正确

---

## 参考文档

- `AGENTS.md`: "Any file >400 lines must be split before PR"
- `packages/core/src/systems/webgpu/` - WebGPU 系统模式
- `packages/animation/src/values/parsers/` - Parser 模式
- `packages/animation/src/api/` - API 模式
