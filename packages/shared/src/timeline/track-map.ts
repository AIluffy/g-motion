/**
 * TimelineTracksMap - 优化的轨道映射类
 *
 * 提供 O(1) 索引访问的时间线轨道数据结构。
 * 继承自 Map，同时维护扁平化的键值数组以支持快速索引访问。
 *
 * @example
 * ```typescript
 * const tracks = new TimelineTracksMap([
 *   ['x', [{ time: 0, value: 0 }, { time: 1000, value: 100 }]],
 *   ['y', [{ time: 0, value: 0 }]]
 * ]);
 *
 * // O(1) 索引访问
 * console.log(tracks.flatKeys[0]);    // 'x'
 * console.log(tracks.flatValues[0]);  // Track for 'x'
 * ```
 */

import type { Track } from '../types/animation';

/**
 * 优化的轨道映射类 - 提供 O(1) 索引访问
 *
 * 特性:
 * - 继承 Map 的所有功能
 * - 维护 flatKeys 和 flatValues 数组支持 O(1) 索引访问
 * - 自动同步 Map 操作和数组状态
 * - 对外暴露只读数组视图防止外部修改
 */
export class TimelineTracksMap extends Map<string, Track> {
  /** 内部可变数组 - 用于类内部操作 */
  private _flatKeys: string[] = [];
  private _flatValues: Track[] = [];
  private readonly indexByKey = new Map<string, number>();

  /**
   * 只读视图 - 防止外部修改
   * 提供 O(1) 索引访问所有键
   */
  get flatKeys(): readonly string[] {
    return this._flatKeys;
  }

  /**
   * 只读视图 - 防止外部修改
   * 提供 O(1) 索引访问所有值
   */
  get flatValues(): readonly Track[] {
    return this._flatValues;
  }

  constructor(entries?: Iterable<readonly [string, Track]> | null) {
    super();
    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  override set(key: string, value: Track): this {
    const existingIndex = this.indexByKey.get(key);
    if (existingIndex === undefined) {
      this._flatKeys.push(key);
      this._flatValues.push(value);
      this.indexByKey.set(key, this._flatKeys.length - 1);
    } else {
      this._flatValues[existingIndex] = value;
    }
    return super.set(key, value);
  }

  override delete(key: string): boolean {
    const existingIndex = this.indexByKey.get(key);
    const didDelete = super.delete(key);
    if (!didDelete || existingIndex === undefined) {
      return didDelete;
    }

    this._flatKeys.splice(existingIndex, 1);
    this._flatValues.splice(existingIndex, 1);
    this.indexByKey.delete(key);
    for (let i = existingIndex; i < this._flatKeys.length; i++) {
      this.indexByKey.set(this._flatKeys[i], i);
    }
    return true;
  }

  override clear(): void {
    super.clear();
    this._flatKeys.length = 0;
    this._flatValues.length = 0;
    this.indexByKey.clear();
  }
}
