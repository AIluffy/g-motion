import type { SystemContext } from '../runtime/plugin';
import { SystemDef } from '../runtime/plugin';

/**
 * ActiveEntityMonitorSystem — 同步活跃动画实体计数到调度器。
 *
 * @description
 * 每帧读取 World 中当前活跃运动实体数量，并调用 scheduler.setActiveEntityCount
 * 以驱动调度器的自动启动/保活/空闲收敛策略。
 *
 * @phase postUpdate
 * @order 9
 *
 * @reads world.getActiveMotionEntityCount
 * @writes scheduler.setActiveEntityCount
 *
 * @dependsOn TimelineSystem (order 4) — 其状态推进会影响活跃实体集合
 * @dependendBy SystemScheduler 运行循环控制 — 使用该计数决定继续调度与保活
 */
export const ActiveEntityMonitorSystem: SystemDef = {
  name: 'ActiveEntityMonitorSystem',
  order: 9,
  phase: 'postUpdate',
  reads: ['world.getActiveMotionEntityCount'],
  writes: ['scheduler.setActiveEntityCount'],
  update(_dt: number, ctx?: SystemContext) {
    const world = ctx?.services.world;
    if (!world) {
      return;
    }
    world.scheduler.setActiveEntityCount(world.getActiveMotionEntityCount());
  },
};
