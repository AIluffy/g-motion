import type { MarkOptions, ResolvedMarkOptions } from './mark';
import { normalizeMarkOptions, validateMarkOptions } from './validation';

export class AnimationValidator {
  normalizeMark(rawOptions: MarkOptions): MarkOptions {
    return normalizeMarkOptions(rawOptions);
  }

  validateMark(rawOptions: MarkOptions): MarkOptions {
    const normalized = this.normalizeMark(rawOptions);
    validateMarkOptions(normalized);
    return normalized;
  }

  validateResolvedMark(resolved: ResolvedMarkOptions): void {
    validateMarkOptions(resolved);
  }
}
