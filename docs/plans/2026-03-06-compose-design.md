# Compose Design

**Date:** 2026-03-06
**Status:** Approved

## Goal

为 `@g-motion/animation` 增加 `compose()`，把可复用动画片段建模为纯数据模板，并在 `timeline()` authoring 阶段展开为普通 layer。

## Scope

- 新增 `compose(config)` 导出
- 新增 `Composition` / `ComposeConfig` 类型
- 允许 `timeline({ layers })` 接受 `composition` layer
- 在 authoring 阶段把 composition layer 展开成现有 `LayerModel`
- 覆盖 `compose()` 和 `timeline()` 的集成测试

## Non-Goals

- 不实现嵌套 runtime controller
- 不实现 time remap、expression、snapshot
- 不实现 composition 到模板的反向编辑同步

## API

```ts
type ComposeConfig = {
  target?: AnimationTarget;
  duration?: number;
} & Record<string, unknown>;

type Composition = {
  readonly kind: 'composition';
  readonly duration: number;
  readonly target?: AnimationTarget;
  readonly props: MotionProps;
};

function compose(config: ComposeConfig): Composition;
```

`timeline()` 接受两类 layer：

```ts
type TimelineLayerConfig =
  | {
      name: string;
      target: AnimationTarget;
      duration?: number;
      startTime?: number;
      visible?: boolean;
      locked?: boolean;
      [key: string]: unknown;
    }
  | {
      name: string;
      composition: Composition;
      target?: AnimationTarget;
      duration?: number;
      startTime?: number;
      visible?: boolean;
      locked?: boolean;
    };
```

## Expansion Rules

- `timeline()` 在 `createTimelineAuthoringModel()` 中识别 `composition` layer
- `layer.target` 优先于 `composition.target`
- 两者都缺失时抛错
- `composition` layer 不能再混入动画属性；检测到后直接抛错
- `composition.duration` 来自模板内部 props 的归一化结果
- `layer.duration` 仍可覆盖模板时长，沿用现有 layer duration 语义
- composition 自身只读，不暴露控制能力，不保存播放状态

## Data Flow

1. `compose(config)` 过滤出合法 `MotionProps`
2. `compose(config)` 根据 props 归一化得到模板时长
3. `timeline()` 创建 authoring model 时展开 composition layer
4. 展开后的 layer 继续走现有 `LayerModel -> binding -> controller` 流程

## Files

- Create: `packages/animation/src/compose.ts`
- Modify: `packages/animation/src/index.ts`
- Modify: `packages/animation/src/facade/types.ts`
- Modify: `packages/animation/src/controllers/authoring.ts`
- Modify: `packages/animation/tests/authoring.test.ts`
- Create: `packages/animation/tests/compose.test.ts`

## Error Handling

- `compose()` 没有任何合法动画属性时允许创建，时长为 `duration ?? DEFAULT_DURATION`
- `timeline()` 使用 composition layer 且无法解析 target 时抛出显式错误
- `timeline()` 使用 composition layer 且混入额外动画属性时报错

## Testing

- `compose()` 返回模板对象并正确计算时长
- `compose()` 仅保留合法动画属性
- 同一 composition 可在多个 layer 中复用
- layer target 可覆盖 composition target
- composition layer 支持 `startTime` / `duration` / `visible` / `locked`
- 缺失 target 和混入动画属性的错误路径有测试覆盖
