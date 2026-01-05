# @g-motion/utils

通用工具库，供 Motion 各包共享使用。

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
