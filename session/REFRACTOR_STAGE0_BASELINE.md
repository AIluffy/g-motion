# 阶段 0 性能基线报告（初始版）

## 环境信息
- OS: macos
- Node: v25.2.1
- pnpm: 10.26.0
- 运行目录: /Users/zhangxueai/Projects/idea/motion

## 核心 API 路径清单
- Animation 入口: motion / createScopedMotion / inspectTargets
  [index.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/animation/src/index.ts#L1-L170)
- Animation API: builder / control / mark / adjust / animate / visualTarget / gpu-status
  [index.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/animation/src/index.ts#L161-L170)
- Core 入口: World / scheduler / archetype / systems / renderer
  [index.ts](file:///Users/zhangxueai/Projects/idea/motion/packages/core/src/index.ts#L1-L26)
- WebGPU 入口: WebGPUEngine / dispatch / pipeline / output format
  [@g-motion/webgpu README](file:///Users/zhangxueai/Projects/idea/motion/packages/webgpu/README.md#L63-L133)

## 基线采集执行记录
- 命令: pnpm --filter @g-motion/core bench
- 状态: 运行到 88s 后手动中止，GPU 相关基准未执行完毕
- 结果范围: 已完成 keyframe-search-optimized 基准，其他基准待补齐

## 采集结果（已完成）
### Keyframe Search Performance - Real-world Scenarios
单位: ms（来自 vitest bench 输出）

| 场景 | mean | p75 | p99 | p995 | p999 | samples |
| --- | --- | --- | --- | --- | --- | --- |
| 60fps animation (1000 frames, 200 keyframes) | 0.0072 | 0.0073 | 0.0095 | 0.0120 | 0.0192 | 69719 |
| Multi-entity simulation (100 entities, 50 keyframes) | 0.0055 | 0.0055 | 0.0078 | 0.0136 | 0.0203 | 90233 |
| Scrubbing timeline (seeking back and forth) | 0.0002 | 0.0002 | 0.0005 | 0.0005 | 0.0010 | 2732142 |
| Cache prewarm benefit | 0.0007 | 0.0007 | 0.0011 | 0.0015 | 0.0060 | 724469 |

## 待补齐与缺口
- GPU 相关基准未完成（如 gpu-persistent-buffers、gpu-keyframe-search）
- 基准报告缺少 P50/P95 输出，需通过自定义 reporter 或基准采集脚本补齐
- QPS、内存使用与 GPU buffer 统计尚未系统汇总

## 下一步采集指引
1. 重新执行完整基准并保留完整输出
   pnpm --filter @g-motion/core bench
2. 记录 GPU 相关指标（dispatchCount、buffer bytes、readback latency）
3. 输出 P50/P95/P99 与资源利用率汇总表
