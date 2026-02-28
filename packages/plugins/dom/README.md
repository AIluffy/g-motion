# @g-motion/plugin-dom

面向 Motion 的 DOM 渲染插件，提供 Transform 组件与 DOM Renderer，用于把时间线结果批量写入 DOM 样式。插件内置 GPU 加速策略、选择器缓存与按帧批处理，避免频繁 DOM 写入导致的性能抖动。

## 主要功能

- 注册 Transform 组件与 DOM Renderer
- 根据 Transform 组件或 Render.props 自动生成 CSS transform
- 支持 translate/rotate/scale/perspective，自动 2D/3D 切换
- 统一批量写入 style 与 transform，按帧合并更新
- GPU 加速可配置，支持 will-change 与 translateZ(0) 兜底
- 选择器缓存与对象目标缓存，降低 querySelector 开销

## 安装

```bash
pnpm add @g-motion/plugin-dom
```

## 使用方式

### 方式一：注册插件后使用 motion()

```ts
import { app } from '@g-motion/core';
import { motion } from '@g-motion/animation';
import { DOMPlugin } from '@g-motion/plugin-dom';

DOMPlugin.manifest?.setup?.(app);

motion('#box')
  .mark({ to: { x: 120, y: 40, scaleX: 1.1 } })
  .animate();
```

### 方式二：自定义渲染器配置

```ts
import { app } from '@g-motion/core';
import { createDOMPlugin } from '@g-motion/plugin-dom';

const plugin = createDOMPlugin({
  rendererConfig: {
    forceGPUAcceleration: true,
    enableWillChange: true,
    useHardwareAcceleration: true,
    enableObjectTargetCache: false,
  },
});

plugin.manifest?.setup?.(app);
```

## API 文档

### createDOMPlugin(options?)

创建一个 Motion 插件实例并注册：

- Transform 组件（组件名：Transform）
- DOM Renderer（rendererId：dom）
- DOM 目标解析器（TargetType.DOM）

```ts
import { createDOMPlugin } from '@g-motion/plugin-dom';

const plugin = createDOMPlugin({ rendererConfig: { enableWillChange: false } });
```

### DOMPlugin

默认插件实例，等价于 createDOMPlugin()

### createDOMRenderer(config?)

创建 DOM 渲染器，负责把组件值应用到 DOM 元素上。可单独在自定义 Renderer 场景使用。

```ts
import { createDOMRenderer } from '@g-motion/plugin-dom';

const renderer = createDOMRenderer({ forceGPUAcceleration: false });
```

### DOMRendererConfig

DOM 渲染器配置项：

- forceGPUAcceleration: 是否强制使用 translate3d 输出 2D 变换，默认 true
- enableWillChange: 是否写入 will-change: transform，默认 true
- useHardwareAcceleration: 是否在首次使用时写入 translateZ(0)，默认 true
- enableObjectTargetCache: 是否针对对象目标缓存 DOM 节点，默认 false

## Transform 组件

Transform 组件由插件注册，字段均为 float32：

- 位移：x, y, z
- 缩放：scaleX, scaleY, scaleZ
- 旋转：rotate, rotateX, rotateY, rotateZ
- 透视：perspective

组件值用于生成 transform 字符串，若 props.transform 为字符串则直接使用该字符串。

## 配置说明

GPU 加速流程：

- enableWillChange 为 true 时，会写入 will-change: transform
- useHardwareAcceleration 为 true 且元素没有 transform 时，会写入 translateZ(0)
- forceGPUAcceleration 为 true 时，2D 变换也会输出 translate3d

## 示例

### 直接传入元素引用

```ts
import { app } from '@g-motion/core';
import { motion } from '@g-motion/animation';
import { DOMPlugin } from '@g-motion/plugin-dom';

DOMPlugin.manifest?.setup?.(app);

const box = document.getElementById('box');
motion(box)
  .mark({ to: { x: 80, y: 24, rotate: 15, scaleX: 1.05 } })
  .animate();
```

### 使用 Render.props 写入样式

```ts
import { createDOMRenderer } from '@g-motion/plugin-dom';

const renderer = createDOMRenderer();
renderer.update(1, '#box', {
  Render: { props: { opacity: 0.6, backgroundColor: 'red' } },
  Transform: { x: 20, y: 10 },
});
renderer.postFrame?.();
```

## 贡献指南

- 构建：pnpm --filter @g-motion/plugin-dom run build
- 测试：pnpm --filter @g-motion/plugin-dom test
- 新增行为变更需补充 tests/ 下的 Vitest 用例
- 渲染逻辑更新需要保持批处理与零冗余 DOM 写入

## 兼容说明

- DOMRenderSystem 为兼容导出，推荐使用 createDOMRenderer 与插件注册方式
