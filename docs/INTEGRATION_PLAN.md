# G-Motion Animation API 与 Core 整合方案

**版本**: 1.0
**日期**: 2026-03-06
**状态**: 已确认

---

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                    用户层 (User Layer)                           │
│  motion()  |  timeline()  |  compose()  |  value()              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Animation API 层 (packages/animation)               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  API 实现                                                  │   │
│  │  - motion.ts      (简单动画)                              │   │
│  │  - timeline.ts    (时间轴)                                │   │
│  │  - compose.ts     (预合成)                                │   │
│  │  - value.ts       (MotionValue)                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Bridge 层                                                 │   │
│  │  - animation-bridge.ts  (API ↔ Core 桥梁)                 │   │
│  │  - value-binding.ts     (MotionValue 绑定)                │   │
│  │  - update-strategy.ts   (更新策略)                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Core 层 (packages/core) - 保留并扩展                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  运行时 (Runtime)                                          │   │
│  │  - World (保留)                                           │   │
│  │  - Engine (保留)                                          │   │
│  │  - Scheduler (保留)                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ECS (保留)                                                │   │
│  │  - Archetype                                              │   │
│  │  - EntityManager                                          │   │
│  │  - ComponentRegistry                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  组件 (Components) - 扩展                                  │   │
│  │  - TimelineComponent (保留)                               │   │
│  │  - MotionStateComponent (保留)                            │   │
│  │  - RenderComponent (保留)                                 │   │
│  │  - AnimationBridgeComponent (新增)                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  系统 (Systems) - 扩展                                     │   │
│  │  - TimelineSystem (扩展)                                  │   │
│  │  - BatchSystem (扩展)                                     │   │
│  │  - RenderSystem (保留)                                    │   │
│  │  - ValueBindingSystem (新增)                              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              WebGPU 层 (packages/webgpu) - 保留                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  计算管线                                                  │   │
│  │  - keyframe-search.wgsl                                   │   │
│  │  - interpolation.wgsl                                     │   │
│  │  - transform-2d/3d.wgsl                                   │   │
│  │  - physics-combined.wgsl                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  GPU 管理                                                  │   │
│  │  - GPUDevice 管理                                         │   │
│  │  - Buffer 管理                                            │   │
│  │  - Pipeline 管理                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据流

```
用户调用 API
    │
    ▼
┌─────────────────┐
│  animation API  │  motion(), timeline(), value()
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  Bridge 层      │  创建/更新 ECS 实体，绑定 MotionValue
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  Core ECS       │  组件数据存储
│  - Transform    │
│  - Animation    │
│  - Bridge       │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  Systems        │  TimelineSystem, ValueBindingSystem
│  每帧更新       │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  BatchSystem    │  收集数据，准备 GPU 缓冲区
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  WebGPU Compute │  关键帧搜索、插值计算
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  RenderSystem   │  应用结果到 DOM
└─────────────────┘
```

---

## 3. Core 包扩展细节

### 3.1 新增组件：AnimationBridgeComponent

**文件**: `packages/core/src/components/animation-bridge.ts`

```typescript
export interface AnimationBridgeComponent {
  // API 层分配的 ID，用于反向查找
  apiId: string;
  
  // MotionValue 绑定
  // key: 属性名 (如 'x', 'y', 'opacity')
  // value: MotionValue 的引用 ID
  valueBindings: Map<string, number>;
  
  // 更新策略
  updateStrategy: 'realtime' | 'batch' | 'lazy';
  
  // 脏标记
  dirtyProperties: Set<string>;
  
  // 外部控制标记
  isControlledByAPI: boolean;
}

export const AnimationBridgeComponentDef: ComponentDef = {
  name: 'AnimationBridge',
  schema: {
    apiId: 'string',
    valueBindings: 'map',
    updateStrategy: 'string',
    dirtyProperties: 'set',
    isControlledByAPI: 'boolean'
  }
};
```

### 3.2 扩展现有组件

**TimelineComponent 扩展**:

```typescript
// 在原有基础上添加
export interface TimelineComponent {
  // 原有字段...
  
  // 新增：支持表达式
  expressions?: Map<string, ExpressionFn>;
  
  // 新增：支持时间重映射
  timeRemap?: TimeRemapKeyframe[];
  
  // 新增：标记点
  markers?: Map<string, number>;
  
  // 新增：工作区
  workArea?: [number, number];
}
```

### 3.3 新增系统：ValueBindingSystem

**文件**: `packages/core/src/systems/value-binding.ts`

```typescript
export const ValueBindingSystem: SystemDef = {
  name: 'ValueBindingSystem',
  order: 3, // 在 TimelineSystem 之前
  phase: 'update',
  
  update(dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    if (!world) return;
    
    for (const archetype of world.getArchetypes()) {
      const bridgeBuffer = archetype.getBuffer('AnimationBridge');
      if (!bridgeBuffer) continue;
      
      for (let i = 0; i < archetype.entityCount; i++) {
        const bridge = bridgeBuffer[i] as AnimationBridgeComponent;
        if (!bridge?.isControlledByAPI) continue;
        
        // 处理 MotionValue 更新
        processValueBindings(archetype, i, bridge, ctx);
      }
    }
  }
};

function processValueBindings(
  archetype: Archetype,
  index: number,
  bridge: AnimationBridgeComponent,
  ctx: SystemContext
) {
  const { updateStrategy, dirtyProperties, valueBindings } = bridge;
  
  if (updateStrategy === 'lazy' && dirtyProperties.size === 0) {
    return;
  }
  
  for (const [property, valueId] of valueBindings) {
    if (updateStrategy === 'lazy' && !dirtyProperties.has(property)) {
      continue;
    }
    
    // 从 Bridge 层获取最新值
    const latestValue = ctx.services.bridge?.getValue(valueId);
    if (latestValue !== undefined) {
      // 更新到 Transform 或 Animation 组件
      updateProperty(archetype, index, property, latestValue);
    }
  }
  
  // 清除脏标记
  dirtyProperties.clear();
}
```

### 3.4 扩展 TimelineSystem

**修改**: `packages/core/src/systems/timeline.ts`

```typescript
export const TimelineSystem: SystemDef = {
  name: 'TimelineSystem',
  order: 4,
  
  update(dt: number, ctx?: SystemContext) {
    // 原有逻辑...
    
    // 新增：处理时间重映射
    const timeRemap = timelineBuffer[i].timeRemap;
    if (timeRemap) {
      timelineTime = applyTimeRemap(timelineTime, timeRemap);
    }
    
    // 新增：处理表达式
    const expressions = timelineBuffer[i].expressions;
    if (expressions) {
      evaluateExpressions(archetype, i, expressions, timelineTime, ctx);
    }
  }
};
```

### 3.5 扩展 BatchSystem

**修改**: `packages/core/src/systems/batch/batch-coordinator.ts`

```typescript
export class BatchCoordinator {
  // 原有方法...
  
  // 新增：支持动态值更新
  updateDynamicValues(batchId: string, updates: DynamicValueUpdate[]) {
    const batch = this.getBatch(batchId);
    if (!batch) return;
    
    for (const update of updates) {
      const { entityIndex, property, value } = update;
      
      // 更新 GPU 缓冲区
      this.updateGPUBuffer(batch, entityIndex, property, value);
    }
  }
  
  // 新增：支持 MotionValue 直接绑定
  bindMotionValue(
    batchId: string,
    entityIndex: number,
    property: string,
    motionValue: MotionValue
  ) {
    // 订阅 MotionValue 变化
    const unsubscribe = motionValue.onChange((value) => {
      this.queueUpdate(batchId, entityIndex, property, value);
    });
    
    return unsubscribe;
  }
}
```

---

## 4. Animation 包实现

### 4.1 目录结构

```
packages/animation/
├── src/
│   ├── core/                          # MotionValue 核心
│   │   ├── value.ts                   # MotionValue 实现
│   │   ├── transform.ts               # 派生值
│   │   ├── spring.ts                  # 弹簧物理
│   │   └── velocity.ts                # 速度计算
│   │
│   ├── api/                           # 用户 API
│   │   ├── motion.ts                  # motion() 函数
│   │   ├── timeline.ts                # timeline() 函数
│   │   ├── compose.ts                 # compose() 函数
│   │   └── keyframe.ts                # keyframe() 辅助函数
│   │
│   ├── bridge/                        # Bridge 层
│   │   ├── animation-bridge.ts        # 主桥梁
│   │   ├── value-binding.ts           # 值绑定管理
│   │   ├── update-strategy.ts         # 更新策略
│   │   └── entity-manager.ts          # 实体生命周期
│   │
│   ├── types/                         # 类型定义
│   │   └── index.ts
│   │
│   └── index.ts                       # 统一导出
│
├── tests/
├── package.json
└── tsconfig.json
```

### 4.2 AnimationBridge 实现

**文件**: `packages/animation/src/bridge/animation-bridge.ts`

```typescript
import { World } from '@g-motion/core';
import { MotionValue } from '../core/value';

export class AnimationBridge {
  private world: World;
  private valueRegistry = new Map<number, MotionValue>();
  private entityMap = new Map<string, number>(); // apiId -> entityId
  private nextValueId = 1;
  
  constructor(world: World) {
    this.world = world;
  }
  
  // 创建动画实体
  createEntity(config: AnimationConfig): string {
    const apiId = this.generateApiId();
    
    // 在 Core 中创建实体
    const entityId = this.world.entityManager.createEntity();
    
    // 添加 Transform 组件
    this.world.archetypeManager.addComponent(entityId, 'Transform', {
      x: 0, y: 0, z: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
      rotation: 0
    });
    
    // 添加 Animation 组件
    this.world.archetypeManager.addComponent(entityId, 'Animation', {
      target: config.target,
      tracks: this.convertTracks(config.tracks),
      state: 'idle',
      currentTime: 0
    });
    
    // 添加 Bridge 组件
    this.world.archetypeManager.addComponent(entityId, 'AnimationBridge', {
      apiId,
      valueBindings: new Map(),
      updateStrategy: config.updateStrategy || 'lazy',
      dirtyProperties: new Set(),
      isControlledByAPI: true
    });
    
    // 绑定 MotionValue
    this.bindMotionValues(entityId, config.tracks);
    
    this.entityMap.set(apiId, entityId);
    return apiId;
  }
  
  // 绑定 MotionValue
  private bindMotionValues(entityId: number, tracks: TrackConfig[]) {
    const bridge = this.getBridgeComponent(entityId);
    if (!bridge) return;
    
    for (const [property, track] of Object.entries(tracks)) {
      if (track instanceof MotionValue) {
        const valueId = this.registerMotionValue(track);
        bridge.valueBindings.set(property, valueId);
        
        // 订阅变化
        track.onChange((value) => {
          this.onValueChange(entityId, property, value);
        });
      }
    }
  }
  
  // 注册 MotionValue
  private registerMotionValue(value: MotionValue): number {
    const id = this.nextValueId++;
    this.valueRegistry.set(id, value);
    return id;
  }
  
  // 获取 MotionValue
  getValue(valueId: number): MotionValue | undefined {
    return this.valueRegistry.get(valueId);
  }
  
  // 值变化回调
  private onValueChange(entityId: number, property: string, value: number) {
    const bridge = this.getBridgeComponent(entityId);
    if (!bridge) return;
    
    // 根据策略处理
    switch (bridge.updateStrategy) {
      case 'realtime':
        this.updateComponentRealtime(entityId, property, value);
        break;
      case 'batch':
      case 'lazy':
        bridge.dirtyProperties.add(property);
        break;
    }
  }
  
  // 控制方法
  play(apiId: string) {
    const entityId = this.entityMap.get(apiId);
    if (entityId !== undefined) {
      this.world.setMotionStatus(entityId, MotionStatus.Running);
    }
  }
  
  pause(apiId: string) {
    const entityId = this.entityMap.get(apiId);
    if (entityId !== undefined) {
      this.world.setMotionStatus(entityId, MotionStatus.Paused);
    }
  }
  
  seek(apiId: string, time: number) {
    const entityId = this.entityMap.get(apiId);
    if (entityId !== undefined) {
      this.world.archetypeManager.setComponentField(
        entityId,
        'MotionState',
        'currentTime',
        time
      );
    }
  }
}
```

### 4.3 motion() API 实现

**文件**: `packages/animation/src/api/motion.ts`

```typescript
import { AnimationBridge } from '../bridge/animation-bridge';
import { MotionValue } from '../core/value';

export interface MotionController {
  play(): void;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  value(key: string): MotionValue | undefined;
}

export function motion(
  target: Element | string | object,
  props: MotionProps,
  options: MotionOptions = {}
): MotionController {
  const bridge = AnimationBridge.getInstance();
  
  // 创建实体
  const apiId = bridge.createEntity({
    target,
    tracks: props,
    updateStrategy: options.updateStrategy || 'lazy'
  });
  
  // 内部 MotionValue 映射
  const valueMap = new Map<string, MotionValue>();
  
  for (const [key, value] of Object.entries(props)) {
    if (value instanceof MotionValue) {
      valueMap.set(key, value);
    }
  }
  
  // 自动播放
  if (options.autoplay !== false) {
    bridge.play(apiId);
  }
  
  return {
    play: () => bridge.play(apiId),
    pause: () => bridge.pause(apiId),
    stop: () => {
      bridge.seek(apiId, 0);
      bridge.pause(apiId);
    },
    seek: (time: number) => bridge.seek(apiId, time),
    value: (key: string) => valueMap.get(key)
  };
}
```

---

## 5. 更新策略实现

### 5.1 Realtime 策略

```typescript
// 立即更新到 ECS
function updateRealtime(entityId: number, property: string, value: number) {
  world.archetypeManager.setComponentField(
    entityId,
    'Transform',
    property,
    value
  );
}
```

### 5.2 Batch 策略

```typescript
// 批量更新，在 scheduler 中统一处理
class BatchUpdateManager {
  private updates = new Map<number, Map<string, number>>();
  
  queueUpdate(entityId: number, property: string, value: number) {
    if (!this.updates.has(entityId)) {
      this.updates.set(entityId, new Map());
    }
    this.updates.get(entityId)!.set(property, value);
  }
  
  flush() {
    for (const [entityId, properties] of this.updates) {
      for (const [property, value] of properties) {
        updateRealtime(entityId, property, value);
      }
    }
    this.updates.clear();
  }
}
```

### 5.3 Lazy 策略

```typescript
// 标记脏，在需要时更新
function updateLazy(entityId: number, property: string, value: number) {
  const bridge = getBridgeComponent(entityId);
  bridge.dirtyProperties.add(property);
  
  // 在 ValueBindingSystem 中处理
}
```

---

## 6. 文件变更清单

### Core 包修改（最小）

```
packages/core/src/
├── components/
│   ├── animation-bridge.ts (新增)
│   └── index.ts (导出新增)
├── systems/
│   ├── value-binding.ts (新增)
│   ├── timeline.ts (扩展)
│   └── index.ts (导出新增)
└── index.ts (导出新增组件)
```

### Animation 包新建

```
packages/animation/
├── src/
│   ├── core/
│   │   ├── value.ts
│   │   ├── transform.ts
│   │   ├── spring.ts
│   │   └── velocity.ts
│   ├── api/
│   │   ├── motion.ts
│   │   ├── timeline.ts
│   │   ├── compose.ts
│   │   └── keyframe.ts
│   ├── bridge/
│   │   ├── animation-bridge.ts
│   │   ├── value-binding.ts
│   │   ├── update-strategy.ts
│   │   └── entity-manager.ts
│   ├── types/
│   │   └── index.ts
│   └── index.ts
├── tests/
├── package.json
└── tsconfig.json
```

---

## 7. 实施步骤

### Phase 1: Core 扩展（1 周）
- [ ] 添加 AnimationBridgeComponent
- [ ] 扩展 TimelineComponent
- [ ] 实现 ValueBindingSystem
- [ ] 扩展 TimelineSystem
- [ ] 扩展 BatchSystem

### Phase 2: Animation 基础（1 周）
- [ ] 实现 MotionValue
- [ ] 实现 transform/spring/velocity
- [ ] 实现 AnimationBridge
- [ ] 实现 motion() API

### Phase 3: Animation 高级（1 周）
- [ ] 实现 timeline() API
- [ ] 实现 compose() API
- [ ] 实现关键帧解析
- [ ] 集成测试

### Phase 4: 优化（1 周）
- [ ] 性能测试
- [ ] 内存优化
- [ ] 边界情况处理
- [ ] 文档完善

---

## 8. 风险评估

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| Core 修改引入 Bug | 中 | 高 | 充分测试，渐进式修改 |
| 性能不达标 | 低 | 高 | 早期性能测试 |
| API 与 Core 不匹配 | 低 | 中 | 设计阶段充分讨论 |

---

**方案确认**: 待确认
**预计工期**: 4 周
