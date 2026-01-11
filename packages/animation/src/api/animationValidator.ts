import type { MarkOptions, ResolvedMarkOptions } from './mark';
import { validateMarkOptions } from './validation';

export class AnimationValidator {
  validateMark(rawOptions: MarkOptions): void {
    const legacy = rawOptions as MarkOptions & {
      time?: number | ((index: number, entityId: number) => number);
    };
    const time = legacy.time ?? legacy.at;
    const { at: _at, ...rest } = legacy;
    validateMarkOptions({
      ...rest,
      time,
    });
  }

  validateResolvedMark(resolved: ResolvedMarkOptions): void {
    validateMarkOptions(resolved);
  }
}
