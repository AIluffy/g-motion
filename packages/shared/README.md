# @g-motion/shared

Motion 动画引擎的共享基础包，提供各包通用的类型定义、工具函数和常量。

## 包含内容

- **类型定义**: ECS 基础类型、动画类型、物理选项、GPU 批处理类型
- **Transform 常量**: Transform 属性定义、GPU 通道属性、半精度浮点组件
- **工具函数**: 调试工具、DOM 目标解析、数学插值、时间采样、流处理
- **错误处理**: Panic/Invariant 错误机制

## 安装与构建

```bash
pnpm install
pnpm run build
```

## 调试工具

- `createDebugger(namespace: string)`

## DOM TargetResolver 工具

- `createDomTargetResolver(domType)`
  - 输入：任意目标值、包含 `root` 的上下文对象
  - 支持：
    - CSS 选择器字符串
    - `Element` 实例
    - `NodeList` / `HTMLCollection`
    - `Element[]`
