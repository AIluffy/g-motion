# GPU Shader 优化计划

## 概述

将更多计算从 CPU 迁移到 GPU Shader，提升动画系统性能。

## 实现状态

所有优化已完成 ✅

### High Priority (P0) - 立即性能提升 ✅

1. **Bezier 曲线计算** ✅ - GPU 端 cubic bezier 评估
2. **Transform 矩阵计算** ✅ - 2D/3D 矩阵计算
3. **批量剔除 (Batch Culling)** ✅ - GPU 端可见性判断

### Medium Priority (P1) - 优化增强 ✅

1. **物理集成 (Spring/Inertia)** ✅ - GPU 加速物理模拟
2. **多通道输出处理** ✅ - 优化内存布局

### Low Priority (P2) - 未来增强 ✅

1. **关键帧预处理** ✅ - GPU 端关键帧打包
2. **高级剔除** ✅ - 视锥体/时间剔除

---

## 新增文件

| 文件 | 功能 |
|------|------|
| `transform-shader.ts` | 2D/3D Transform 矩阵计算 |
| `culling-shader.ts` | 批量剔除 + 高级剔除 |
| `physics-shader.ts` | Spring/Inertia 物理模拟 |
| `output-format-shader.ts` | 多通道输出格式处理 |
| `keyframe-preprocess-shader.ts` | 关键帧预处理 |

## 修改文件

| 文件 | 变更 |
|------|------|
| `shader.ts` | 添加 Bezier 支持，扩展 Keyframe 结构 |
| `index.ts` | 导出新模块 |
| `sampling.ts` | 支持 10-float keyframe 结构 |

---

## 性能预期

| 功能 | CPU 耗时 | GPU 耗时 | 提升 |
|------|----------|----------|------|
| Bezier 曲线 | ~0.5ms/1000实体 | ~0.02ms | 25x |
| Transform 矩阵 | ~1ms/1000实体 | ~0.05ms | 20x |
| 批量剔除 | ~0.3ms/1000实体 | ~0.01ms | 30x |
| Spring 物理 | ~0.8ms/1000实体 | ~0.03ms | 27x |

## 使用示例

### Bezier 曲线动画

```typescript
const keyframe = {
  startTime: 0,
  time: 1000,
  startValue: 0,
  endValue: 100,
  interpMode: 'bezier',
  bezier: { cx1: 0.25, cy1: 0.1, cx2: 0.25, cy2: 1 }
};
```

### Spring 物理动画

```typescript
import { packSpringStates, SPRING_PRESETS } from '@g-motion/core';

const springs = [
  { position: 0, velocity: 0, target: 100, ...SPRING_PRESETS.wobbly }
];
const gpuData = packSpringStates(springs);
```
