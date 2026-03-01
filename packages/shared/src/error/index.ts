export type MotionErrorContext = Record<string, unknown>;

const MOTION_FATAL_FLAG = '__motionFatal';
const MOTION_CONTEXT_KEY = '__motionContext';

export function panic(message: string, context?: MotionErrorContext): never {
  const error = new Error(message);
  const tagged = error as unknown as Record<string, unknown>;
  tagged[MOTION_FATAL_FLAG] = true;
  if (context) {
    tagged[MOTION_CONTEXT_KEY] = context;
  }
  throw error;
}

export function invariant(
  condition: unknown,
  message: string,
  context?: MotionErrorContext,
): asserts condition {
  if (condition) return;
  panic(message, context);
}

export function isFatalError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as Record<string, unknown>)[MOTION_FATAL_FLAG] === true;
}
