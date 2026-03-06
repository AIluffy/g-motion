# G-Motion Animation API 实现计划

**日期**: 2026-03-06
**版本**: 1.0
**预计工期**: 4-6 周

---

## 1. 项目结构

```
packages/animation/
├── src/
│   ├── core/                    # 核心基础
│   │   ├── value.ts             # MotionValue 系统
│   │   ├── scheduler.ts         # 动画调度器
│   │   └── types.ts             # 核心类型定义
│   │
│   ├── animation/               # 动画创建
│   │   ├── motion.ts            # motion() 函数
│   │   ├── timeline.ts          # timeline() 函数
│   │   └── compose.ts           # compose() 函数
│   │
│   ├── keyframe/                # 关键帧系统
│   │   ├── parser.ts            # 关键帧解析器
│   │   ├── interpolator.ts      # 插值器
│   │   └── easing.ts            # 缓动函数
│   │
│   ├── controller/              # 控制器
│   │   ├── base.ts              # 基础控制器
│   │   ├── timeline-ctrl.ts     # 时间轴控制器
│   │   └── state.ts             # 状态管理
│   │
│   ├── features/                # 增强功能
│   │   ├── time-remap.ts        # 时间重映射
│   │   ├── expression.ts        # 表达式系统
│   │   ├── snapshot.ts          # 快照系统
│   │   └── editor.ts            # 轨道编辑
│   │
│   ├── plugins/                 # 插件系统
│   │   ├── index.ts             # 插件基础
│   │   ├── audio.ts             # 音频插件
│   │   ├── gesture.ts           # 手势插件
│   │   └── perf.ts              # 性能插件
│   │
│   ├── render/                  # 渲染层
│   │   ├── dom.ts               # DOM 渲染
│   │   ├── svg.ts               # SVG 渲染
│   │   └── object.ts            # 对象渲染
│   │
│   └── index.ts                 # 统一导出
│
├── tests/
│   ├── unit/                    # 单元测试
│   ├── integration/             # 集成测试
│   └── e2e/                     # 端到端测试
│
└── package.json
```

---

## 2. 实现阶段

### 第一阶段：基础架构（第 1 周）

#### 2.1 MotionValue 系统

**文件**: `src/core/value.ts`

**功能**:
- 创建响应式值
- 订阅/取消订阅机制
- 值更新通知

**接口**:
```typescript
interface MotionValue {
  get(): number;
  set(v: number): void;
  update(fn: (v: number) => number): void;
  onChange(fn: (latest: number, delta: number) => void): () => void;
}
```

**测试要点**:
- 基本读写
- 订阅触发
- 内存泄漏检查

#### 2.2 调度器

**文件**: `src/core/scheduler.ts`

**功能**:
- requestAnimationFrame 管理
- 批量更新
- 优先级调度

#### 2.3 类型定义

**文件**: `src/core/types.ts`

**内容**:
- 核心接口定义
- 配置类型
- 事件类型

---

### 第二阶段：动画创建（第 2 周）

#### 2.1 motion() 函数

**文件**: `src/animation/motion.ts`

**功能**:
- 简单动画创建
- 内部使用 value 驱动
- 返回控制器

**接口**:
```typescript
function motion(
  target: Element | string,
  props: MotionProps,
  options?: MotionOptions
): MotionController;
```

**依赖**: value.ts, scheduler.ts

#### 2.2 timeline() 函数 - 基础版

**文件**: `src/animation/timeline.ts`

**功能**:
- 单层时间轴
- 关键帧解析
- 基础播放控制

**接口**:
```typescript
function timeline(config: TimelineConfig): TimelineController;
```

#### 2.3 关键帧解析器

**文件**: `src/keyframe/parser.ts`

**功能**:
- 支持多种语法格式
- 规范化关键帧数据

**支持格式**:
- 完整单词: `{ time, value, easing }`
- 简写: `{ t, v, e }`
- 辅助函数: `keyframe(t, v, e)`

---

### 第三阶段：时间轴增强（第 3 周）

#### 3.1 多层时间轴

**文件**: `src/animation/timeline.ts` (扩展)

**新增功能**:
- layers 支持
- 图层管理
- 父子关系

#### 3.2 compose() 函数

**文件**: `src/animation/compose.ts`

**功能**:
- 预合成创建
- 在时间轴中复用

#### 3.3 控制器完善

**文件**: `src/controller/timeline-ctrl.ts`

**功能**:
- 播放头控制
- 工作区
- 标记点
- 轨道编辑

---

### 第四阶段：增强功能（第 4 周）

#### 4.1 时间重映射

**文件**: `src/features/time-remap.ts`

**功能**:
- 时间-帧映射
- 速度变化

#### 4.2 表达式系统

**文件**: `src/features/expression.ts`

**功能**:
- 表达式解析
- 上下文提供
- 性能优化（缓存）

#### 4.3 快照系统

**文件**: `src/features/snapshot.ts`

**功能**:
- 状态保存
- 状态恢复
- 历史管理

#### 4.4 轨道编辑

**文件**: `src/features/editor.ts`

**功能**:
- 获取曲线数据
- 修改关键帧
- 程序化编辑

---

### 第五阶段：插件系统（第 5 周）

#### 5.1 插件基础

**文件**: `src/plugins/index.ts`

**功能**:
- 高阶函数接口
- 控制器扩展
- 生命周期管理

#### 5.2 音频插件

**文件**: `src/plugins/audio.ts`

**功能**:
- 音频同步
- BPM 同步
- 标记对齐

#### 5.3 手势插件

**文件**: `src/plugins/gesture.ts`

**功能**:
- 拖拽
- 手势识别
- 与动画结合

#### 5.4 性能插件

**文件**: `src/plugins/perf.ts`

**功能**:
- GPU 优化
- 裁剪策略
- 性能监控

---

### 第六阶段：渲染层与测试（第 6 周）

#### 6.1 DOM 渲染

**文件**: `src/render/dom.ts`

**功能**:
- 样式应用
- transform 处理
- 性能优化

#### 6.2 其他渲染器

**文件**: `src/render/svg.ts`, `src/render/object.ts`

#### 6.3 测试

- 单元测试覆盖 > 80%
- 集成测试
- 性能基准测试

---

## 3. 依赖关系图

```
value.ts (基础)
  ├── motion.ts
  ├── timeline.ts
  │     └── compose.ts
  │     └── layers
  │           └── time-remap.ts
  │           └── expression.ts
  ├── transform.ts
  │     └── spring.ts
  │     └── velocity.ts
  │
scheduler.ts (驱动)
  ├── motion.ts
  ├── timeline.ts
  └── plugins/*
```

---

## 4. 关键实现细节

### 4.1 MotionValue 实现

```typescript
// src/core/value.ts
export function value(initial: number): MotionValue {
  let current = initial;
  const subscribers = new Set<(v: number, d: number) => void>();

  return {
    get: () => current,
    set: (v: number) => {
      const delta = v - current;
      current = v;
      subscribers.forEach(fn => fn(v, delta));
    },
    update: (fn) => {
      const prev = current;
      current = fn(current);
      subscribers.forEach(fn => fn(current, current - prev));
    },
    onChange: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }
  };
}
```

### 4.2 motion() 实现

```typescript
// src/animation/motion.ts
export function motion(target, props, options) {
  // 为每个属性创建 value
  const values = {};
  for (const [key, prop] of Object.entries(props)) {
    values[key] = value(parseInitial(prop));
  }

  // 动画驱动
  const animate = () => {
    // 使用 scheduler 驱动 values 更新
  };

  // 渲染
  const render = () => {
    // 将 values 应用到 target
  };

  return {
    play: () => { animate(); render(); },
    pause: () => { /* ... */ },
    seek: (t) => { /* ... */ },
    value: (key) => values[key]
  };
}
```

### 4.3 关键帧插值

```typescript
// src/keyframe/interpolator.ts
export function interpolate(keyframes, time) {
  // 找到当前时间所在的关键帧区间
  const [prev, next] = findKeyframeRange(keyframes, time);

  // 计算进度
  const progress = (time - prev.time) / (next.time - prev.time);

  // 应用缓动
  const eased = applyEasing(progress, prev.easing);

  // 插值
  return lerp(prev.value, next.value, eased);
}
```

---

## 5. 测试策略

### 5.1 单元测试

```typescript
// tests/unit/value.test.ts
describe('MotionValue', () => {
  it('should get and set value', () => {
    const v = value(0);
    v.set(100);
    expect(v.get()).toBe(100);
  });

  it('should notify subscribers', () => {
    const v = value(0);
    const fn = vi.fn();
    v.onChange(fn);
    v.set(100);
    expect(fn).toHaveBeenCalledWith(100, 100);
  });
});
```

### 5.2 集成测试

```typescript
// tests/integration/motion.test.ts
describe('motion()', () => {
  it('should animate element', async () => {
    const el = document.createElement('div');
    const ctrl = motion(el, { x: [0, 100] }, { duration: 1000 });

    ctrl.play();
    await wait(500);

    expect(el.style.transform).toContain('translateX');
  });
});
```

---

## 6. 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 性能问题 | 高 | 早期进行性能测试，使用 requestAnimationFrame |
| 复杂度失控 | 中 | 分阶段实现，每个阶段可独立使用 |
| 浏览器兼容 | 中 | 使用特性检测，提供降级方案 |
| API 不稳定 | 低 | 设计阶段充分讨论，实现后冻结 |

---

## 7. 验收标准

- [ ] MotionValue 系统稳定
- [ ] motion() 基础功能可用
- [ ] timeline() 多层功能可用
- [ ] 关键帧多种语法支持
- [ ] 插件系统可用
- [ ] 单元测试覆盖 > 80%
- [ ] 文档完整
- [ ] 示例代码可运行

---

**计划确认**: 待确认
**开始日期**: 待定
