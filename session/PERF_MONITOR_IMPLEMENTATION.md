# Performance Monitor Implementation

## Overview
实现了一个类似 stats.js 的实时性能监控组件，自动挂载在页面右上角，显示关键的性能指标。

## 创建的文件

### 1. `apps/examples/src/components/perf-monitor.tsx`
- **功能**: 实时性能监控组件
- **指标显示**:
  - **FPS**: 每秒帧数（实时计算）
  - **Avg**: 平均帧时间（毫秒）
  - **Last**: 最后一帧耗时（毫秒）
  - **Mem**: 内存使用量（MB，如果可用）

- **关键特性**:
  - 使用 60 样本的滚动缓冲区（约1秒@60fps）
  - 每 250ms 更新一次指标（提供实时反馈）
  - 基于 FPS 动态改变颜色：
    - 🟢 绿色: FPS >= 55
    - 🟡 黄色: FPS >= 30
    - 🔴 红色: FPS < 30

### 2. `apps/examples/src/components/perf-monitor.css`
- **样式特性**:
  - 固定位置在右上角（top: 10px, right: 10px）
  - 高 z-index (9999) 确保始终在最上层
  - 半透明黑色背景 + 模糊效果
  - 类似 stats.js 的紧凑布局

### 3. `apps/examples/src/routes/__root.tsx` 修改
- 在根路由中导入并挂载 `PerfMonitor` 组件
- 确保在所有页面上都显示性能监控信息

## 技术实现细节

### 性能采样
```typescript
// 使用 requestAnimationFrame 收集帧时间差
const loop = (ts: number) => {
  if (lastTs !== undefined) {
    const delta = ts - lastTs;
    buf.push(delta);
    if (buf.length > 60) buf.shift(); // 保持滚动缓冲区
  }
  lastTs = ts;
  rafIdRef.current = requestAnimationFrame(loop);
};
```

### 定期更新
- 每 250ms 更新一次统计数据
- 计算平均帧时间和 FPS
- 如果可用，显示内存使用量（性能 API）

### 内存安全
- 使用 TypeScript 类型守卫处理 `performance.memory` API
- 正确处理浏览器兼容性问题

## 样式设计

### 视觉特性
- **字体**: Monaco/Menlo 等单空间字体（便于数据阅读）
- **尺寸**: 紧凑的 11px 字体
- **配色**:
  - FPS 指标根据性能动态变色
  - 标签为半透明白色（便于读取）
  - 值为实心白色（高对比度）

### 交互
- `pointer-events: none` - 不干扰页面交互
- `user-select: none` - 防止选中文本
- 固定定位 - 即使页面滚动也始终可见

## 使用方式

该组件已自动集成到所有示例中，无需额外配置。打开任何示例页面时，右上角会自动显示实时性能监控面板。

## 对比现有 PerfPanel

| 特性 | PerfMonitor | PerfPanel |
|------|-----------|----------|
| 位置 | 固定右上角 | 页面中嵌入 |
| 更新频率 | 250ms | 500ms |
| 样式 | Stats.js 风格 | 卡片风格 |
| 常驻显示 | ✅ 始终显示 | ❌ 需要集成 |
| GPU 指标 | ❌ | ✅ |
| 实时感 | ✅ 更流畅 | ✅ |

## 性能影响

- **开销极小**: 仅进行简单的数学运算，不涉及 DOM 操作
- **内存占用**: 固定大小（60 个样本 + 1 个间隔计时器）
- **不会阻塞主线程**: 完全异步处理

