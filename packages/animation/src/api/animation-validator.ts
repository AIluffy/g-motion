import type { MarkOptions, ResolvedMarkOptions } from './mark';
import { normalizeMarkOptions, validateMarkOptions } from './validation';

export class AnimationValidator {
  normalizeMark<T = any>(rawOptions: MarkOptions<T>): MarkOptions<T> {
    return normalizeMarkOptions(rawOptions);
  }

  validateMark<T = any>(rawOptions: MarkOptions<T>): MarkOptions<T> {
    const normalized = this.normalizeMark(rawOptions);
    validateMarkOptions(normalized);
    return normalized;
  }

  validateResolvedMark<T = any>(resolved: ResolvedMarkOptions<T>): void {
    validateMarkOptions(resolved);
  }
}
