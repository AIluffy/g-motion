# G-Motion P0 Facade 重设计实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把文档里的可发布核心 P0 落到 `@g-motion/animation`，提供可直接使用的 facade API。

**Architecture:** `packages/animation` 作为 facade 和 bridge 层，复用 `core` runtime / ECS / scheduler / renderer，并自动注册 DOM 能力。MotionValue 保留在 animation 层，通过 controller 将值同步到 core 实体和渲染状态。

**Tech Stack:** TypeScript, Vitest, jsdom, Rslib, workspace packages (`@g-motion/core`, `@g-motion/values`, `@g-motion/plugin-dom`)

---

## Summary

- 在 `packages/animation` 新增 runtime、motion-value、normalize、controllers 四层。
- 自动 bootstrap core 组件/系统和 DOM 插件，隐藏 world/plugin 细节。
- 公开导出 `value`、`transform`、`spring`、`velocity`、`motion`、`timeline` 及 P0 类型。
- 以测试驱动方式补齐 MotionValue、motion()、timeline() 的包级测试。

## Public API Decisions

- `motion(target, props, options)` 支持 `Element | string | object`。
- `timeline(config)` 支持单层 `target + props`、基础 `layers`、全局 `markers`、`workArea`。
- 首版 controller 仅包含核心播放控制和 `timeValue()/progressValue()`。
- 仅承诺数值属性插值；`MotionValue` 仅支持作为整个属性源。
- 单值起始值优先读取当前目标状态，读不到时回退默认值：`x/y/z/rotate* = 0`、`scale* = 1`、`opacity = 1`、其他数值属性为 `0`。

## Test Plan

- MotionValue 单元测试：读写、订阅、取消订阅、transform（函数/范围/多源）、spring、velocity。
- motion() 行为测试：object/DOM 目标、自动 from、数组/对象关键帧、暂停/seek/反向/停止、`value(key)`、回调行为。
- timeline() 集成测试：单层、多层、duration 聚合、markers、workArea、`timeValue/progressValue`、清理。
- bootstrap 幂等测试：重复初始化不重复注册组件/系统，也不触发 schema 冲突。

## Assumptions

- DOM 能力随主包交付，不拆单独入口。
- `seekToMarker(name)` 找不到 marker 时抛出显式错误。
- `play()` / `stop()` 默认遵守 `workArea`，`seek()` 仍基于全时间轴绝对时间并 clamp 到 `[0, duration]`。
- P1/P2 能力如 `compose()`、`keyframe()` helper、快照、表达式、时间重映射、layer/track 编辑全部延期。
