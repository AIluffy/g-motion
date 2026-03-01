/**
 * TimelineTracksMap - 优化的轨道映射类
 *
 * 提供 O(1) 索引访问的时间线轨道数据结构。
 * 继承自 Map，同时维护扁平化的键值数组以支持快速索引访问。
 *
 * Note: flatKeys 顺序在 delete 后不保证与插入顺序一致（使用 swap-remove 优化）。
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
 *
 * @internal
 */
export class TimelineTracksMap extends Map<string, Track> {
  /** 内部可变数组 - 用于类内部操作 */
  private _flatKeys: string[] = [];
  private _flatValues: Track[] = [];
  private readonly indexByKey = new Map<string, number>();
  private _version = 0;

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

  /**
   * Version number that increments on mutations.
   * Useful for caching invalidation.
   */
  get version(): number {
    return this._version;
  }

  constructor(entries?: Iterable<readonly [string, Track]> | null) {
    super();
    // CRITICAL: Must call super() WITHOUT entries argument.
    // Map(entries) internally calls this.set() before class field initializers
    // (_flatKeys, _flatValues, indexByKey) are assigned, causing TypeError.
    // We manually iterate entries after super() returns.
    if (entries) {
      for (const [key, value] of entries) {
        this.set(key, value);
      }
    }
  }

  override set(key: string, value: Track): this {
    if (process.env.NODE_ENV !== 'production') {
      if (!Array.isArray(value)) {
        console.warn(
          `[TimelineTracksMap] Track for key "${key}" should be a Keyframe[], got ${typeof value}`,
        );
      }
    }
    const existingIndex = this.indexByKey.get(key);
    if (existingIndex === undefined) {
      this._flatKeys.push(key);
      this._flatValues.push(value);
      this.indexByKey.set(key, this._flatKeys.length - 1);
      this._version++;
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

    const lastIndex = this._flatKeys.length - 1;
    if (existingIndex !== lastIndex) {
      const lastKey = this._flatKeys[lastIndex];
      this._flatKeys[existingIndex] = lastKey;
      this._flatValues[existingIndex] = this._flatValues[lastIndex];
      this.indexByKey.set(lastKey, existingIndex);
    }
    this._flatKeys.pop();
    this._flatValues.pop();
    this.indexByKey.delete(key);
    this._version++;
    return true;
  }

  override clear(): void {
    super.clear();
    this._flatKeys.length = 0;
    this._flatValues.length = 0;
    this.indexByKey.clear();
    this._version++;
  }
}
