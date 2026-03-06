# G-Motion Animation API - 设计文档

**版本**: 1.0
**日期**: 2026-03-06
**状态**: 已确认

---

## 1. 核心架构

```
┌─────────────────────────────────────────┐
│              插件层 (可选)                │
│    withAudio | withGesture | withPerf    │
├─────────────────────────────────────────┤
│              控制层                       │
│    motion() | timeline() | compose()     │
├─────────────────────────────────────────┤
│              驱动层                       │
│         value() | transform()            │
│         spring() | velocity()            │
├─────────────────────────────────────────┤
│              渲染层                       │
│         DOM | Canvas | SVG | Object      │
└─────────────────────────────────────────┘
```

---

## 2. 基础 API

### 2.1 MotionValue

#### `value(initial)`

创建响应式值。

```typescript
function value(initial: number): MotionValue;

interface MotionValue {
  get(): number;
  set(v: number): void;
  update(fn: (v: number) => number): void;
  onChange(fn: (latest: number, delta: number) => void): () => void;
}
```

**示例**:
```typescript
import { value } from '@g-motion/animation';

const x = value(0);

// 监听变化
const unsubscribe = x.onChange((latest, delta) => {
  console.log('当前值:', latest, '变化量:', delta);
});

// 设置值
x.set(50);
x.update(v => v + 10);

// 获取值
console.log(x.get()); // 60

// 取消监听
unsubscribe();
```

---

### 2.2 派生值

#### `transform(source, config)`

创建派生值。

```typescript
// 函数映射
function transform(source: MotionValue, fn: (v: number) => number): MotionValue;

// 范围映射
function transform(source: MotionValue, config: {
  input: [number, number];
  output: [number, number];
}): MotionValue;

// 多值组合
function transform(sources: MotionValue[], fn: (...values: number[]) => number): MotionValue;
```

**示例**:
```typescript
import { value, transform } from '@g-motion/animation';

const x = value(0);

// 函数映射
const doubled = transform(x, v => v * 2);

// 范围映射
const mapped = transform(x, {
  input: [0, 100],
  output: [0, 200]
});

// 多值组合
const y = value(10);
const combined = transform([x, y], (xv, yv) => xv + yv);
```

---

### 2.3 弹簧物理

#### `spring(source, config)`

创建弹簧跟随值。

```typescript
function spring(source: MotionValue, config?: SpringConfig): MotionValue;

interface SpringConfig {
  stiffness?: number;  // 刚度，默认 100
  damping?: number;    // 阻尼，默认 10
  mass?: number;       // 质量，默认 1
}
```

**示例**:
```typescript
import { value, spring } from '@g-motion/animation';

const target = value(0);
const springX = spring(target, {
  stiffness: 100,
  damping: 10,
  mass: 1
});

springX.onChange(v => console.log('弹簧值:', v));

target.set(100); // springX 会平滑跟随到 100
```

---

### 2.4 速度计算

#### `velocity(source)`

创建速度值。

```typescript
function velocity(source: MotionValue): MotionValue;
```

**示例**:
```typescript
import { value, velocity } from '@g-motion/animation';

const x = value(0);
const velX = velocity(x);

velX.onChange(v => console.log('速度:', v));

x.set(100); // 速度值会相应变化
```

---

## 3. 动画创建 API

### 3.1 简单动画

#### `motion(target, props, options)`

创建简单动画。

```typescript
function motion(
  target: Element | string | object,
  props: MotionProps,
  options?: MotionOptions
): MotionController;

type MotionProps = Record<string, number | number[] | MotionValue>;

interface MotionOptions {
  duration?: number;
  delay?: number;
  easing?: string | EasingFunction;
  autoplay?: boolean;
  onComplete?: () => void;
  onUpdate?: (progress: number) => void;
}

interface MotionController {
  play(): void;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  reverse(): void;
  value(key: string): MotionValue | undefined;
}
```

**示例**:
```typescript
import { motion } from '@g-motion/animation';

// 立即播放
motion(element, { x: 100 }, { duration: 1000 });

// 返回控制器
const ctrl = motion(element, {
  x: [0, 100, 200],
  opacity: [0, 1]
}, {
  duration: 2000,
  easing: 'easeOut',
  autoplay: false
});

// 控制
ctrl.play();
ctrl.pause();
ctrl.seek(500);

// 获取内部 value
const x = ctrl.value('x');
x?.onChange(v => console.log('x:', v));
```

---

### 3.2 时间轴

#### `timeline(config)`

创建时间轴动画。

```typescript
function timeline(config: TimelineConfig): TimelineController;

interface TimelineConfig {
  // 单层模式
  target?: Element | string | object;
  duration?: number;
  [property: string]: KeyframeDefinition | any;

  // 多层模式
  layers?: LayerConfig[];

  // 全局配置
  markers?: Record<string, number>;
  workArea?: [number, number];
}

type KeyframeDefinition =
  | Keyframe[]
  | { from: number; to: number; duration: number; easing?: Easing }
  | MotionValue;

interface Keyframe {
  time?: number;      // 或 t
  value?: number;     // 或 v
  easing?: Easing;    // 或 e
  hold?: boolean;
}

interface LayerConfig {
  name: string;
  target: Element | string | object;
  [property: string]: KeyframeDefinition | any;
}

interface TimelineController {
  play(): void;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  seekToMarker(name: string): void;
  reverse(): void;

  // 属性
  duration: number;
  currentTime: number;
  progress: number;
  playhead: number;
  workArea: [number, number];

  // 图层控制
  layer(name: string): LayerController;

  // MotionValue
  timeValue(): MotionValue;
  progressValue(): MotionValue;

  // 状态
  bindState(): AnimationState;
}
```

**示例 - 单层**:
```typescript
import { timeline, spring, keyframe } from '@g-motion/animation';

// 方式 1: 完整单词
const ctrl = timeline({
  target: '.card',
  duration: 3000,
  x: [
    { time: 0, value: 0, easing: 'easeOut' },
    { time: 1000, value: 100, easing: spring() },
    { time: 2000, value: 200, hold: true }
  ],
  opacity: [
    { time: 0, value: 0 },
    { time: 500, value: 1 }
  ]
});

// 方式 2: 简写
const ctrl = timeline({
  target: '.card',
  x: [
    { t: 0, v: 0, e: 'easeOut' },
    { t: 1000, v: 100, e: spring() }
  ]
});

// 方式 3: 辅助函数
const ctrl = timeline({
  target: '.card',
  x: [
    keyframe(0, 0),
    keyframe(1000, 100, spring()),
    keyframe(2000, 200)
  ]
});

// 方式 4: 对象简写
const ctrl = timeline({
  target: '.card',
  x: { from: 0, to: 100, duration: 1000, easing: spring() }
});
```

**示例 - 多层**:
```typescript
import { timeline, value, transform } from '@g-motion/animation';

const mouseX = value(0);
window.addEventListener('mousemove', (e) => mouseX.set(e.clientX));

const ctrl = timeline({
  layers: [
    {
      name: 'bg',
      target: '.bg',
      x: transform(mouseX, (v) => v / 5)
    },
    {
      name: 'card',
      target: '.card',
      x: [
        { time: 0, value: 0 },
        { time: 1000, value: 100 },
        { time: 1000, value: mouseX, blend: 'add' }
      ]
    }
  ],
  markers: { start: 0, peak: 1000 }
});

// 控制
ctrl.play();
ctrl.seek(500);
ctrl.seekToMarker('peak');

// 图层控制
ctrl.layer('card').hide();
```

---

### 3.3 预合成

#### `compose(config)`

创建可复用的动画片段。

```typescript
function compose(config: ComposeConfig): Composition;

interface ComposeConfig {
  target?: Element | string | object;
  duration?: number;
  [property: string]: KeyframeDefinition | any;
}

interface Composition {
  duration: number;
  // 内部使用，不直接暴露控制方法
}
```

**示例**:
```typescript
import { timeline, compose } from '@g-motion/animation';

// 创建预合成
const cardEnter = compose({
  target: '.card',
  x: [
    { time: 0, value: 100 },
    { time: 500, value: 0, easing: spring() }
  ],
  opacity: [
    { time: 0, value: 0 },
    { time: 300, value: 1 }
  ]
});

// 在时间轴中复用
const ctrl = timeline({
  layers: [
    { name: 'card1', composition: cardEnter, startTime: 0 },
    { name: 'card2', composition: cardEnter, startTime: 1000 }
  ]
});
```

---

## 4. 关键帧辅助函数

### `keyframe(time, value, easing?)`

创建关键帧。

```typescript
function keyframe(time: number, value: number, easing?: Easing): Keyframe;
```

**示例**:
```typescript
import { timeline, keyframe, spring } from '@g-motion/animation';

const ctrl = timeline({
  target: '.box',
  x: [
    keyframe(0, 0),
    keyframe(500, 100, 'easeOut'),
    keyframe(1000, 200, spring())
  ]
});
```

---

## 5. 控制器 API

### 5.1 基础控制

| 方法 | 说明 |
|------|------|
| `play()` | 播放动画 |
| `pause()` | 暂停动画 |
| `stop()` | 停止动画，重置到开始 |
| `reverse()` | 反向播放 |
| `seek(time)` | 跳转到指定时间（ms） |
| `seekToMarker(name)` | 跳转到标记点 |

### 5.2 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `duration` | `number` | 总时长（ms） |
| `currentTime` | `number` | 当前时间（ms） |
| `progress` | `number` | 播放进度（0-1） |
| `playhead` | `number` | 播放头位置（可设置） |
| `workArea` | `[number, number]` | 工作区范围（可设置） |

### 5.3 图层控制

```typescript
interface LayerController {
  // 可见性
  show(): void;
  hide(): void;
  get visible(): boolean;

  // 锁定
  lock(): void;
  unlock(): void;
  get locked(): boolean;

  // 时间
  get startTime(): number;
  get duration(): number;
  move(delta: number): void;

  // 轨道
  track(property: string): TrackController;
}

interface TrackController {
  getCurve(): CurveData;
  setCurve(keyframes: Keyframe[]): void;
  insertKeyframe(kf: Keyframe): void;
  removeKeyframe(time: number): void;
  moveKeyframe(from: number, to: number): void;
}
```

### 5.4 快照系统

```typescript
interface Snapshot {
  time: number;
  playhead: number;
  layerStates: LayerState[];
}

// 方法
const snapshot = ctrl.snapshot();
ctrl.restore(snapshot);
```

---

## 6. 增强功能

### 6.1 时间重映射

```typescript
interface TimeRemapKeyframe {
  time: number;    // 时间轴时间
  frame: number;   // 映射到的帧
}

// 使用
timeline({
  layers: [{
    name: 'video',
    target: videoElement,
    timeRemap: [
      { time: 0, frame: 0 },
      { time: 1000, frame: 500 },  // 2倍速
      { time: 2000, frame: 500 }   // 冻结
    ]
  }]
});
```

### 6.2 表达式

```typescript
timeline({
  layers: [{
    name: 'follower',
    target: '.follower',
    x: {
      expression: (time, ctx) => {
        // 获取其他图层值
        const leaderX = ctx.layer('leader').valueAt('x', time - 100);
        return leaderX;
      }
    }
  }]
});

interface ExpressionContext {
  layer(name: string): LayerContext;
  keyframe(property: string, time: number): number;
  velocity(property: string): number;
}
```

---

## 7. 插件系统

### 7.1 使用方式

```typescript
import { timeline } from '@g-motion/animation';
import { withAudio } from '@g-motion/animation/plugins/audio';
import { withGesture } from '@g-motion/animation/plugins/gesture';
import { withPerf } from '@g-motion/animation/plugins/perf';

// 链式组合
const ctrl = withAudio(
  withGesture(
    withPerf(timeline({...}), { strategy: 'gpu' }),
    { drag: 'x' }
  ),
  { src: '/bgm.mp3', bpm: 120 }
);

// 或使用管道函数
import { pipe } from '@g-motion/animation';

const ctrl = pipe(
  timeline({...}),
  withPerf({ strategy: 'gpu' }),
  withGesture({ drag: 'x' }),
  withAudio({ src: '/bgm.mp3', bpm: 120 })
);
```

### 7.2 音频插件

```typescript
import { withAudio } from '@g-motion/animation/plugins/audio';

const ctrl = withAudio(timeline({...}), {
  src: '/bgm.mp3',
  bpm: 120,
  markers: { beat1: 0, drop: 5000 }
});

// 扩展的 API
ctrl.audio.play();
ctrl.audio.pause();
ctrl.audio.setVolume(0.5);
```

### 7.3 手势插件

```typescript
import { withGesture } from '@g-motion/animation/plugins/gesture';

const ctrl = withGesture(timeline({...}), {
  drag: 'x',
  dragConstraints: { left: -100, right: 100 },
  onDragStart: () => console.log('drag start'),
  onDragEnd: () => console.log('drag end')
});

// 扩展的 API
ctrl.gesture.enable();
ctrl.gesture.disable();
```

### 7.4 性能插件

```typescript
import { withPerf } from '@g-motion/animation/plugins/perf';

const ctrl = withPerf(timeline({...}), {
  strategy: 'auto',  // auto | gpu | none
  cull: true,
  cullMargin: 100
});
```

---

## 8. 渐进式使用场景

| 场景 | API | 代码示例 |
|------|-----|---------|
| 按钮 hover | `motion()` | `motion(btn, { scale: 1.1 }, { duration: 200 })` |
| 卡片入场 | `timeline()` | `timeline({ target: card, x: [0, 100] })` |
| 多元素联动 | `timeline({ layers })` | `timeline({ layers: [{...}, {...}] })` |
| 复杂序列 | `timeline() + compose()` | `timeline({ layers: [{ composition }] })` |
| 交互式动画 | `timeline() + value()` | `timeline({ x: mouseX })` |
| 音频同步 | `withAudio()` | `withAudio(timeline(), { src, bpm })` |

---

## 9. 完整示例

```typescript
import {
  timeline,
  motion,
  value,
  transform,
  spring,
  velocity,
  keyframe,
  compose,
  withAudio,
  withGesture
} from '@g-motion/animation';

// 1. 创建 MotionValue
const mouseX = value(0);
const scrollY = value(0);

window.addEventListener('mousemove', (e) => mouseX.set(e.clientX));
window.addEventListener('scroll', () => scrollY.set(window.scrollY));

// 2. 派生值
const parallaxY = transform(scrollY, {
  input: [0, 1000],
  output: [0, -200]
});

const rotate = transform(mouseX, (v) => (v - 500) / 20);
const smoothRotate = spring(rotate, { stiffness: 50 });

// 3. 创建预合成
const cardEnter = compose({
  target: '.card',
  x: [
    keyframe(0, 100),
    keyframe(500, 0, spring())
  ],
  opacity: [
    keyframe(0, 0),
    keyframe(300, 1)
  ]
});

// 4. 创建主时间轴
const scene = timeline({
  layers: [
    {
      name: 'bg',
      target: '.bg',
      y: parallaxY,
      scale: [
        { time: 0, value: 1 },
        { time: 5000, value: 1.2 }
      ]
    },
    {
      name: 'card',
      target: '.card',
      composition: cardEnter,
      rotate: smoothRotate,
      x: {
        expression: (time, ctx) => {
          const base = ctx.keyframe('x', time);
          const mouse = (mouseX.get() - 500) / 10;
          return base + mouse;
        }
      },
      scale: {
        expression: (time, ctx) => {
          const vel = ctx.velocity('x');
          return 1 + Math.abs(vel) / 500;
        }
      }
    }
  ],
  markers: { start: 0, cardIn: 500, end: 3000 }
});

// 5. 添加插件
const ctrl = withAudio(
  withGesture(scene, { drag: 'x' }),
  { src: '/bgm.mp3', bpm: 120 }
);

// 6. 控制
ctrl.play();
ctrl.seekToMarker('cardIn');

// 7. 响应式状态
const state = ctrl.bindState();
// state.currentTime, state.isPlaying, state.progress
```

---

## 10. 命名规范

| 功能 | 命名 | 说明 |
|------|------|------|
| 简单动画 | `motion` | 底层使用 `value` |
| 时间轴 | `timeline` | 多层动画编排 |
| 预合成 | `compose` | 可复用动画片段 |
| 关键帧辅助 | `keyframe` | 简写语法 |
| 缓动函数 | `spring`, `bezier`, `inertia` | 物理缓动 |
| 响应式值 | `value` | 所有动画基础 |
| 派生值 | `transform` | 值映射/组合 |
| 弹簧跟随 | `spring` | value 的弹簧 |
| 速度计算 | `velocity` | 计算变化速度 |
| 音频插件 | `withAudio` | 高阶函数 |
| 手势插件 | `withGesture` | 高阶函数 |
| 性能插件 | `withPerf` | 高阶函数 |

---

**文档确认**: 已确认
**最后更新**: 2026-03-06
