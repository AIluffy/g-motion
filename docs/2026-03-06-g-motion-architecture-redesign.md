# G-Motion 架构改造设计文档

**日期**: 2026-03-06
**版本**: 1.0
**状态**: 已确认

---

## 1. 设计目标

基于 `API_DESIGN.md` 和 `PRD.md`，对 G-Motion 项目进行架构改造，实现以下目标：

1. **MotionValue 响应式系统** - 与 ECS 集成，支持批量更新
2. **简化插件系统** - 核心功能内置，插件仅用于平台扩展
3. **统一渲染层** - 内置常用渲染器，插件提供可选扩展
4. **可视化编辑器** - 嵌入式 React 组件

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    可视化编辑器 (嵌入式)                      │
│         @g-motion/editor - React 组件                        │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    控制层 API                                │
│  motion() │ timeline() │ compose() │ withAudio() │ ...      │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    MotionValue 响应式层                       │
│  value() │ transform() │ spring() │ velocity()               │
│         ┌─────────────────────────────────────┐              │
│         │  MotionValueComponent (ECS组件)      │              │
│         │  - current: number                   │              │
│         │  - subscribers: Set<entityId>        │              │
│         │  - dirty: boolean (批量标记)          │              │
│         └─────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    ECS 核心层                                │
│  Archetype │ World │ SystemScheduler │ MotionValueSystem     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    WebGPU 计算层                             │
│  BatchSamplingSystem │ PhysicsDispatch │ ValuePropagation    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    渲染层                                    │
│  ┌─────────────────┐  ┌─────────────────────────────────────┐│
│  │  内置渲染器      │  │  可选插件 (平台特定)                 ││
│  │  • DOMRenderer  │  │  • CanvasRenderer                   ││
│  │  • SVGRenderer  │  │  • WebGLRenderer                    ││
│  │  • ObjectRender │  │  • ReactNativeRenderer              ││
│  └─────────────────┘  └─────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 3. MotionValue 与 ECS 集成

### 3.1 组件定义

```typescript
// packages/core/src/components/motion-value.ts
export const MotionValueComponent: ComponentDef = {
  schema: {
    // 值存储
    current: 'float64',
    previous: 'float64',
    
    // 订阅者（实体ID数组，避免闭包）
    subscriberEntities: 'int32[]',
    
    // 派生关系
    sourceEntity: 'int32',        // -1 表示无源
    transformFnRef: 'string',     // 转换函数引用ID
    
    // 批量更新
    dirty: 'uint8',               // 0: clean, 1: dirty
    batchMode: 'uint8',           // 0: immediate, 1: batch
    
    // 物理类型
    physicsType: 'uint8',         // 0: none, 1: spring, 2: inertia, 3: velocity
    physicsParamsEntity: 'int32', // 指向物理参数组件
  },
};
```

### 3.2 MotionValue 类

```typescript
// packages/animation/src/api/motion-value.ts
export class MotionValue {
  constructor(
    private world: World,
    private entity: number
  ) {}
  
  get(): number {
    const comp = this.world.getComponent<MotionValueComponent>(
      this.entity, 
      'MotionValueComponent'
    );
    return comp.current;
  }
  
  set(v: number): void {
    const comp = this.world.getComponent<MotionValueComponent>(
      this.entity,
      'MotionValueComponent'
    );
    const prev = comp.current;
    comp.current = v;
    
    if (comp.batchMode) {
      comp.dirty = 1;
    } else {
      // 立即通知订阅者
      this.notifySubscribers(v, v - prev);
    }
  }
  
  onChange(fn: (v: number, delta: number) => void): () => void {
    // 创建订阅者实体
    const subscriber = this.world.createEntity();
    this.world.addComponent(subscriber, 'MotionValueSubscriber', {
      targetEntity: this.entity,
      callback: fn,
    });
    
    // 添加到订阅列表
    const comp = this.world.getComponent<MotionValueComponent>(
      this.entity,
      'MotionValueComponent'
    );
    comp.subscriberEntities.push(subscriber);
    
    return () => {
      this.unsubscribe(subscriber);
    };
  }
  
  private notifySubscribers(value: number, delta: number): void {
    const comp = this.world.getComponent<MotionValueComponent>(
      this.entity,
      'MotionValueComponent'
    );
    
    for (const subscriberId of comp.subscriberEntities) {
      const sub = this.world.getComponent<MotionValueSubscriber>(
        subscriberId,
        'MotionValueSubscriber'
      );
      if (sub && sub.callback) {
        sub.callback(value, delta);
      }
    }
  }
}
```

### 3.3 批量更新系统

```typescript
// packages/core/src/systems/motion-value-system.ts
export class MotionValueSystem {
  private dirtyThreshold = 100; // CPU/GPU 切换阈值
  
  update(world: World): void {
    // Phase 1: 收集所有 dirty 的 MotionValue
    const dirtyValues = this.collectDirtyValues(world);
    
    if (dirtyValues.length === 0) return;
    
    // Phase 2: 批量传播
    if (dirtyValues.length < this.dirtyThreshold) {
      this.propagateCPU(world, dirtyValues);
    } else {
      this.propagateGPU(world, dirtyValues);
    }
    
    // Phase 3: 清理 dirty 标记
    this.clearDirtyMarks(world, dirtyValues);
  }
  
  private collectDirtyValues(world: World): Array<{ entity: number; value: number }> {
    const archetypes = world.query(['MotionValueComponent']);
    const dirty: Array<{ entity: number; value: number }> = [];
    
    for (const archetype of archetypes) {
      for (let i = 0; i < archetype.count; i++) {
        const entity = archetype.getEntityAt(i);
        const comp = archetype.getComponent<MotionValueComponent>(i, 'MotionValueComponent');
        
        if (comp.dirty) {
          dirty.push({ entity, value: comp.current });
          comp.previous = comp.current;
        }
      }
    }
    
    return dirty;
  }
  
  private propagateCPU(
    world: World,
    updates: Array<{ entity: number; value: number }>
  ): void {
    for (const { entity, value } of updates) {
      const comp = world.getComponent<MotionValueComponent>(
        entity,
        'MotionValueComponent'
      );
      
      const delta = value - comp.previous;
      
      // 通知订阅者
      for (const subscriberId of comp.subscriberEntities) {
        const sub = world.getComponent<MotionValueSubscriber>(
          subscriberId,
          'MotionValueSubscriber'
        );
        if (sub?.callback) {
          sub.callback(value, delta);
        }
      }
      
      // 如果是派生源，更新派生值
      this.updateDerivedValues(world, entity, value);
    }
  }
  
  private propagateGPU(
    world: World,
    updates: Array<{ entity: number; value: number }>
  ): void {
    // 使用 WebGPU Compute Shader 批量更新
    // 将更新数据上传到 GPU，并行处理所有订阅者通知
    const gpuSystem = world.getSystem<GPUMotionValueSystem>();
    gpuSystem.batchUpdate(updates);
  }
  
  private updateDerivedValues(world: World, sourceEntity: number, sourceValue: number): void {
    // 查找所有依赖此源的派生 MotionValue
    const archetypes = world.query(['MotionValueComponent']);
    
    for (const archetype of archetypes) {
      for (let i = 0; i < archetype.count; i++) {
        const entity = archetype.getEntityAt(i);
        const comp = archetype.getComponent<MotionValueComponent>(i, 'MotionValueComponent');
        
        if (comp.sourceEntity === sourceEntity) {
          // 应用转换函数
          const newValue = this.applyTransform(comp.transformFnRef, sourceValue);
          comp.current = newValue;
          comp.dirty = 1;
        }
      }
    }
  }
}
```

### 3.4 工厂函数

```typescript
// packages/animation/src/api/value.ts
export function value(initial: number, opts?: { 
  world?: World;
  batchMode?: boolean;
}): MotionValue {
  const world = opts?.world ?? getDefaultWorld();
  const entity = world.createEntity();
  
  world.addComponent(entity, 'MotionValueComponent', {
    current: initial,
    previous: initial,
    subscriberEntities: [],
    sourceEntity: -1,
    transformFnRef: '',
    dirty: 0,
    batchMode: opts?.batchMode ? 1 : 0,
    physicsType: 0,
    physicsParamsEntity: -1,
  });
  
  return new MotionValue(world, entity);
}

export function transform<T, R>(
  source: MotionValue,
  fn: (v: number) => number
): MotionValue;

export function transform<T extends MotionValue[], R>(
  sources: T,
  fn: (...values: number[]) => number
): MotionValue;

export function transform(
  source: MotionValue | MotionValue[],
  fn: ((v: number) => number) | ((...values: number[]) => number)
): MotionValue {
  const world = source instanceof MotionValue 
    ? source.getWorld() 
    : source[0].getWorld();
  
  // 注册转换函数
  const fnRef = world.registerTransformFn(fn);
  
  // 创建派生 MotionValue
  const derived = value(
    source instanceof MotionValue 
      ? fn(source.get()) 
      : fn(...source.map(s => s.get())),
    { world }
  );
  
  // 建立派生关系
  const entity = derived.getEntity();
  const comp = world.getComponent<MotionValueComponent>(entity, 'MotionValueComponent');
  
  if (source instanceof MotionValue) {
    comp.sourceEntity = source.getEntity();
  } else {
    // 多源派生需要特殊处理
    comp.sourceEntity = -2; // 标记为多源
    world.addComponent(entity, 'MultiSourceTransform', {
      sourceEntities: source.map(s => s.getEntity()),
    });
  }
  
  comp.transformFnRef = fnRef;
  
  return derived;
}
```

---

## 4. 插件系统简化

### 4.1 当前问题

| 插件 | 当前状态 | 问题 |
|-----|---------|------|
| spring | 独立插件 | 核心物理功能，应该内置 |
| inertia | 独立插件 | 核心物理功能，应该内置 |
| dom | 独立插件 | 最常用渲染器，应该内置 |

### 4.2 改造方案

**合并到核心**（原 plugins/spring, plugins/inertia）：

```
packages/core/src/physics/
├── spring.ts           # SpringComponent, SpringSystem
├── inertia.ts          # InertiaComponent, InertiaSystem
├── velocity.ts         # VelocityComponent, VelocitySystem
└── index.ts            # 统一导出
```

**保留插件**（仅平台特定）：

```
packages/plugins/
├── dom/                # 保留，但 DOM 渲染也内置到 animation 包
├── canvas/             # 可选 Canvas 2D 渲染
├── webgl/              # 可选 WebGL 渲染
└── react-native/       # 可选 React Native 渲染
```

### 4.3 高阶函数扩展

替代部分插件功能，实现 API_DESIGN 中的 `withXxx` 风格：

```typescript
// packages/animation/src/extensions/with-audio.ts
export function withAudio<T extends TimelineController>(
  controller: T,
  config: AudioConfig
): T & { audio: AudioController } {
  const audioController = new AudioController(config);
  
  // 同步时间轴和音频
  controller.timeValue().onChange(time => {
    audioController.seek(time);
  });
  
  return Object.assign(controller, { audio: audioController });
}

// packages/animation/src/extensions/with-gesture.ts
export function withGesture<T extends TimelineController>(
  controller: T,
  config: GestureConfig
): T & { gesture: GestureController } {
  const gestureController = new GestureController(config);
  
  // 手势驱动时间轴
  gestureController.onDrag(delta => {
    controller.seek(controller.currentTime + delta);
  });
  
  return Object.assign(controller, { gesture: gestureController });
}

// packages/animation/src/extensions/with-perf.ts
export function withPerf<T extends TimelineController>(
  controller: T,
  config: PerfConfig
): T & { perf: PerfController } {
  const perfController = new PerfController(config);
  
  // 性能监控
  perfController.monitor(controller);
  
  return Object.assign(controller, { perf: perfController });
}
```

---

## 5. 渲染层架构

### 5.1 内置渲染器

```typescript
// packages/animation/src/render/renderer-interface.ts
export interface Renderer {
  readonly name: string;
  supports(target: unknown): boolean;
  render(entity: number, values: Record<string, number>, world: World): void;
  attach?(world: World): void;
  detach?(world: World): void;
}

// packages/animation/src/render/dom.ts
export class DOMRenderer implements Renderer {
  readonly name = 'dom';
  
  supports(target: unknown): boolean {
    return target instanceof Element || 
           (typeof target === 'string' && typeof document !== 'undefined');
  }
  
  render(entity: number, values: Record<string, number>, world: World): void {
    const target = world.getComponent<RenderComponent>(entity, 'RenderComponent')?.target;
    if (!target || !(target instanceof Element)) return;
    
    // 应用样式
    const style = target.style;
    
    if (values.x !== undefined || values.y !== undefined) {
      const x = values.x ?? 0;
      const y = values.y ?? 0;
      style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
    
    if (values.opacity !== undefined) {
      style.opacity = String(values.opacity);
    }
    
    // ... 其他属性
  }
}

// packages/animation/src/render/svg.ts
export class SVGRenderer implements Renderer {
  readonly name = 'svg';
  
  supports(target: unknown): boolean {
    return target instanceof SVGElement ||
           (target instanceof Element && target.tagName.toLowerCase() === 'svg');
  }
  
  render(entity: number, values: Record<string, number>, world: World): void {
    // SVG 属性渲染
  }
}

// packages/animation/src/render/object.ts
export class ObjectRenderer implements Renderer {
  readonly name = 'object';
  
  supports(target: unknown): boolean {
    return typeof target === 'object' && target !== null && !Array.isArray(target);
  }
  
  render(entity: number, values: Record<string, number>, world: World): void {
    const target = world.getComponent<RenderComponent>(entity, 'RenderComponent')?.target;
    if (!target || typeof target !== 'object') return;
    
    // 直接设置对象属性
    for (const [key, value] of Object.entries(values)) {
      (target as Record<string, unknown>)[key] = value;
    }
  }
}
```

### 5.2 渲染器注册

```typescript
// packages/animation/src/render/registry.ts
export class RendererRegistry {
  private renderers: Map<string, Renderer> = new Map();
  private defaultRenderer: Renderer | null = null;
  
  register(renderer: Renderer): void {
    this.renderers.set(renderer.name, renderer);
  }
  
  get(name: string): Renderer | undefined {
    return this.renderers.get(name);
  }
  
  findForTarget(target: unknown): Renderer | undefined {
    for (const renderer of this.renderers.values()) {
      if (renderer.supports(target)) {
        return renderer;
      }
    }
    return undefined;
  }
  
  setDefault(renderer: Renderer): void {
    this.defaultRenderer = renderer;
  }
}

// 全局注册表
export const globalRendererRegistry = new RendererRegistry();

// 注册内置渲染器
globalRendererRegistry.register(new DOMRenderer());
globalRendererRegistry.register(new SVGRenderer());
globalRendererRegistry.register(new ObjectRenderer());
```

---

## 6. 可视化编辑器

### 6.1 包结构

```
packages/editor/
├── src/
│   ├── components/
│   │   ├── timeline.tsx          # 时间轴面板
│   │   ├── layer-panel.tsx       # 图层面板
│   │   ├── keyframe-editor.tsx   # 关键帧编辑器
│   │   ├── ruler.tsx             # 标尺
│   │   └── playhead.tsx          # 播放头
│   ├── hooks/
│   │   ├── use-timeline-state.ts # 状态同步
│   │   └── use-animation-frame.ts
│   ├── utils/
│   │   └── time-format.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

### 6.2 核心组件

```typescript
// packages/editor/src/components/timeline-editor.tsx
import { useSyncExternalStore } from 'react';
import type { TimelineController } from '@g-motion/animation';

interface TimelineEditorProps {
  controller: TimelineController;
  onSeek?: (time: number) => void;
  onLayerSelect?: (layerName: string) => void;
}

export function TimelineEditor({ 
  controller, 
  onSeek,
  onLayerSelect 
}: TimelineEditorProps) {
  // 同步时间轴状态
  const state = useSyncExternalStore(
    (callback) => {
      const unsubscribe = controller.bindState().subscribe(callback);
      return unsubscribe;
    },
    () => controller.getState()
  );
  
  return (
    <div className="timeline-editor">
      <TimelineRuler 
        duration={state.duration}
        currentTime={state.currentTime}
        markers={state.markers}
        workArea={state.workArea}
        onSeek={onSeek}
      />
      <LayerPanel 
        layers={state.layers}
        selectedLayer={state.selectedLayer}
        onLayerSelect={onLayerSelect}
      />
      <KeyframeTracks 
        tracks={state.tracks}
        selectedLayer={state.selectedLayer}
      />
      <PlaybackControls
        isPlaying={state.isPlaying}
        onPlay={() => controller.play()}
        onPause={() => controller.pause()}
        onStop={() => controller.stop()}
      />
    </div>
  );
}
```

---

## 7. 改造路线图

### Phase 1: MotionValue 基础设施 (Week 1-2)

| 任务 | 文件 | 说明 |
|-----|------|------|
| 创建 MotionValueComponent | `packages/core/src/components/motion-value.ts` | ECS 组件定义 |
| 创建 MotionValueSystem | `packages/core/src/systems/motion-value.ts` | 批量更新系统 |
| 创建 MotionValue 类 | `packages/animation/src/api/motion-value.ts` | 用户-facing API |
| 实现 value() | `packages/animation/src/api/value.ts` | 工厂函数 |
| 实现 transform() | `packages/animation/src/api/transform.ts` | 派生值 |

### Phase 2: 物理系统合并 (Week 2-3)

| 任务 | 文件 | 说明 |
|-----|------|------|
| 迁移 spring 到核心 | `packages/core/src/physics/spring.ts` | 从 plugins/spring 迁移 |
| 迁移 inertia 到核心 | `packages/core/src/physics/inertia.ts` | 从 plugins/inertia 迁移 |
| 实现 velocity() | `packages/core/src/physics/velocity.ts` | 速度计算 |
| 批量更新优化 | `packages/webgpu/src/` | GPU 批量传播 |

### Phase 3: 控制层改造 (Week 3-4)

| 任务 | 文件 | 说明 |
|-----|------|------|
| 改造 motion() | `packages/animation/src/api/motion.ts` | 新 API 签名 |
| 增强 timeline() | `packages/animation/src/api/timeline-api.ts` | 标记点/工作区 |
| 实现 compose() | `packages/animation/src/api/compose.ts` | 预合成 |
| 实现 keyframe() | `packages/animation/src/api/keyframe.ts` | 辅助函数 |

### Phase 4: 渲染层统一 (Week 4-5)

| 任务 | 文件 | 说明 |
|-----|------|------|
| 创建 Renderer 接口 | `packages/animation/src/render/renderer.ts` | 抽象接口 |
| 实现 DOMRenderer | `packages/animation/src/render/dom.ts` | 内置 DOM 渲染 |
| 实现 SVGRenderer | `packages/animation/src/render/svg.ts` | 内置 SVG 渲染 |
| 实现 ObjectRenderer | `packages/animation/src/render/object.ts` | 内置对象渲染 |
| 简化 dom 插件 | `packages/plugins/dom/` | 仅保留平台适配 |

### Phase 5: 高阶函数扩展 (Week 5-6)

| 任务 | 文件 | 说明 |
|-----|------|------|
| 实现 withAudio | `packages/animation/src/extensions/with-audio.ts` | 音频同步 |
| 实现 withGesture | `packages/animation/src/extensions/with-gesture.ts` | 手势驱动 |
| 实现 withPerf | `packages/animation/src/extensions/with-perf.ts` | 性能优化 |

### Phase 6: 可视化编辑器 (Week 6-8)

| 任务 | 文件 | 说明 |
|-----|------|------|
| 创建 editor 包 | `packages/editor/` | 新包初始化 |
| Timeline 组件 | `packages/editor/src/components/timeline.tsx` | 时间轴 |
| LayerPanel 组件 | `packages/editor/src/components/layer-panel.tsx` | 图层面板 |
| KeyframeEditor 组件 | `packages/editor/src/components/keyframe-editor.tsx` | 关键帧编辑 |
| 状态同步 | `packages/editor/src/hooks/use-timeline-state.ts` | 与 controller 同步 |

---

## 8. 依赖关系

```
value.ts (基础)
  ├── motion.ts
  ├── timeline.ts
  │     ├── compose.ts
  │     └── layers
  │           ├── time-remap.ts
  │           └── expression.ts
  ├── transform.ts
  │     ├── spring.ts (核心物理)
  │     ├── inertia.ts (核心物理)
  │     └── velocity.ts (核心物理)
  │
scheduler.ts (驱动)
  ├── motion.ts
  ├── timeline.ts
  └── extensions/*
```

---

## 9. 验收标准

- [ ] MotionValue 系统稳定运行
- [ ] 批量更新模式正常工作（CPU/GPU 切换）
- [ ] spring/inertia 物理功能从插件迁移到核心
- [ ] DOM/SVG/Object 渲染器内置
- [ ] motion() / timeline() / compose() API 符合 API_DESIGN
- [ ] withAudio / withGesture / withPerf 高阶函数可用
- [ ] 可视化编辑器基础功能可用
- [ ] 单元测试覆盖 > 80%
- [ ] 性能测试 60fps

---

**设计确认**: 已确认
**最后更新**: 2026-03-06
