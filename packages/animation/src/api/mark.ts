import {
  TimelineData,
  Keyframe,
  SpringOptions,
  InertiaOptions,
  Easing,
  ErrorCode,
  ErrorSeverity,
  MotionError,
  getErrorHandler,
} from '@g-motion/core';
import { createDebugger, isDev, resolveDomElements } from '@g-motion/utils';

export type MarkOptions = {
  to?: any | ((index: number, entityId: number, target?: any) => any);
  at?: number | ((index: number, entityId: number) => number);
  duration?: number; // Relative duration (used with previous mark's end time)
  ease?: Easing;
  interp?: 'linear' | 'bezier' | 'hold' | 'autoBezier';
  bezier?: { cx1: number; cy1: number; cx2: number; cy2: number };
  spring?: SpringOptions;
  inertia?: InertiaOptions;
  stagger?: number | ((index: number) => number); // Linear or function-based stagger
};

export type ResolvedMarkOptions = Omit<MarkOptions, 'to' | 'time'> & {
  to: any;
  time: number;
};

export enum TargetType {
  Primitive = 'primitive',
  DOM = 'dom',
  Object = 'object',
}

const debugResolveTargets = createDebugger('Animation:resolveTargets');

export function resolveTimeValue(
  opts: MarkOptions,
  currentTime: number,
  index: number,
  entityId: number,
): number {
  if (typeof opts.at === 'function') {
    return opts.at(index, entityId);
  }
  if (typeof opts.at === 'number') {
    return opts.at;
  }

  if (typeof opts.duration === 'number') {
    return currentTime + opts.duration;
  }

  return currentTime + 1000;
}

export function resolveMarkOptions(
  raw: MarkOptions,
  target: any,
  currentTime: number,
  index: number,
  entityId: number,
): ResolvedMarkOptions {
  const time = resolveTimeValue(raw, currentTime, index, entityId);
  const to = typeof raw.to === 'function' ? raw.to(index, entityId, target) : raw.to;

  return {
    ...raw,
    to,
    time,
  };
}

export function computeMaxTime(tracks: TimelineData): number {
  let maxTime = 0;
  for (const track of tracks.values()) {
    for (const kf of track as Keyframe[]) {
      if (kf.time > maxTime) {
        maxTime = kf.time;
      }
    }
  }
  return maxTime;
}

export function getTargetType(target: any): TargetType {
  if (typeof target === 'number') return TargetType.Primitive;
  if (
    typeof target === 'string' ||
    (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement)
  ) {
    return TargetType.DOM;
  }
  return TargetType.Object;
}

export type TargetScopeRoot = Element | Document | null | undefined;

export type SelectorCache = Record<string, Element[]>;

export type TargetResolutionOptions = {
  root?: TargetScopeRoot;
  selectorCache?: SelectorCache;
  onSelectorError?: (selector: string, reason: string) => void;
  strictTargets?: boolean;
};

export type ResolvedTarget = {
  target: unknown;
  type: TargetType;
};

export type TargetResolveContext = {
  root: TargetScopeRoot;
  selectorCache: SelectorCache;
  strictTargets: boolean;
};

export type TargetResolveResult = ResolvedTarget[];

export type TargetResolver = (
  input: unknown,
  ctx: TargetResolveContext,
) => TargetResolveResult | null | undefined;

const targetResolvers: TargetResolver[] = [];

type ResolverNamespace = {
  name: string;
  resolvers: TargetResolver[];
};

const resolverNamespaces: ResolverNamespace[] = [
  {
    name: 'default',
    resolvers: targetResolvers,
  },
];

export function registerTargetResolver(resolver: TargetResolver): void {
  targetResolvers.push(resolver);
}

export function registerTargetResolverWithScope(
  _scopeName: string,
  resolver: TargetResolver,
): void {
  targetResolvers.push(resolver);
}

function resolveWithRegisteredResolvers(
  input: unknown,
  ctx: TargetResolveContext,
): TargetResolveResult | null {
  if (targetResolvers.length === 0) {
    return null;
  }
  const activeResolvers = resolverNamespaces[0]?.resolvers ?? targetResolvers;
  for (const resolver of activeResolvers) {
    const resolved = resolver(input, ctx);
    if (resolved && resolved.length > 0) {
      return resolved;
    }
  }
  return null;
}

function isDomElement(value: unknown): value is Element {
  if (typeof Element === 'undefined') return false;
  return value instanceof Element;
}

function isNodeList(value: unknown): value is NodeListOf<Element> | HTMLCollection {
  if (typeof NodeList !== 'undefined' && value instanceof NodeList) return true;
  if (typeof HTMLCollection !== 'undefined' && value instanceof HTMLCollection) return true;
  return false;
}

function isArrayLike(value: unknown): value is { length: number } & { [index: number]: unknown } {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  if (typeof (value as any).length !== 'number') return false;
  if ((value as any) instanceof String) return false;
  return true;
}

function getRootDiagnostics(root: TargetScopeRoot): {
  rootKind: string;
  hasQuerySelectorAll: boolean;
} {
  const rootKind =
    root == null
      ? 'null'
      : typeof Document !== 'undefined' && root instanceof Document
        ? 'document'
        : typeof Element !== 'undefined' && root instanceof Element
          ? 'element'
          : 'custom';
  const hasQuerySelectorAll = !!root && typeof (root as any).querySelectorAll === 'function';
  return { rootKind, hasQuerySelectorAll };
}

export function resolveTargets(
  input: unknown,
  options?: TargetResolutionOptions,
): ResolvedTarget[] {
  const root = options?.root ?? (typeof document !== 'undefined' ? document : null);
  const selectorCache = options?.selectorCache ?? {};
  const seen = new Set<unknown>();
  const result: ResolvedTarget[] = [];
  const strict = options?.strictTargets ?? isDev();

  const resolverCtx: TargetResolveContext = {
    root: root ?? null,
    selectorCache,
    strictTargets: strict,
  };

  const resolvedByNamespace = resolveWithRegisteredResolvers(input, resolverCtx);
  if (resolvedByNamespace && resolvedByNamespace.length > 0) {
    return resolvedByNamespace;
  }

  const handler = getErrorHandler();

  if (options && 'root' in options) {
    if (options.root === null) {
      debugResolveTargets('Received null scope root for target resolution', { input });
    } else if (options.root) {
      const r = options.root;
      if (typeof Element !== 'undefined' && typeof Document !== 'undefined') {
        if (!(r instanceof Element) && !(r instanceof Document)) {
          debugResolveTargets('Received non-DOM scope root for target resolution', {
            input,
            root: r,
          });
        }
      }
    }
  }

  const handleTargetError = (
    message: string,
    code: ErrorCode,
    severity: ErrorSeverity,
    context: Record<string, unknown>,
  ) => {
    const shape = {
      inputType: typeof input,
      isArray: Array.isArray(input),
      arrayLength: Array.isArray(input) ? (input as any[]).length : undefined,
      isNodeListLike: isNodeList(input),
      isArrayLikeInput: isArrayLike(input),
    };
    const error = new MotionError(message, code, severity, { ...shape, ...context });
    handler.handle(error);
  };

  const handleSelectorDomEnvMissing = (selector: string, reason: string) => {
    const severity = strict ? ErrorSeverity.FATAL : ErrorSeverity.WARNING;
    const { rootKind, hasQuerySelectorAll } = getRootDiagnostics(root ?? null);
    handleTargetError(
      'DOM environment missing for selector resolution',
      ErrorCode.DOM_ENV_MISSING,
      severity,
      {
        selector,
        root: root ?? null,
        reason,
        rootKind,
        hasQuerySelectorAll,
      },
    );
    if (options?.onSelectorError) {
      options.onSelectorError(selector, reason);
    } else {
      debugResolveTargets('Selector resolution skipped in non-DOM environment', selector);
    }
  };

  const handleSelectorResolutionError = (selector: string, reason: string) => {
    const { rootKind, hasQuerySelectorAll } = getRootDiagnostics(root ?? null);
    handleTargetError(
      'Invalid selector or error during selector resolution',
      ErrorCode.INVALID_SELECTOR,
      ErrorSeverity.WARNING,
      {
        selector,
        root,
        reason,
        rootKind,
        hasQuerySelectorAll,
      },
    );
    if (options?.onSelectorError) {
      options.onSelectorError(selector, reason);
    } else {
      debugResolveTargets('Selector resolution error', selector, reason);
    }
  };

  type SelectorResolutionPolicy = {
    useCache: boolean;
    reportDomEnvMissing: boolean;
    reportResolutionError: boolean;
  };

  const defaultSelectorPolicy: SelectorResolutionPolicy = {
    useCache: true,
    reportDomEnvMissing: true,
    reportResolutionError: true,
  };

  const resolveSelectorWithPolicy = (
    selector: string,
    rootNode: TargetScopeRoot,
    cache: SelectorCache,
    policy: SelectorResolutionPolicy = defaultSelectorPolicy,
  ): { elements: Element[] | null; handled: boolean } => {
    if (!rootNode || typeof (rootNode as any).querySelectorAll !== 'function') {
      if (policy.reportDomEnvMissing) {
        const reason = 'No DOM root with querySelectorAll available for selector resolution';
        handleSelectorDomEnvMissing(selector, reason);
      }
      return { elements: null, handled: true };
    }

    if (!policy.useCache) {
      const resolved = resolveDomElements(selector, rootNode as Element | Document);
      return { elements: resolved, handled: false };
    }

    const elements = resolveSelectorElementsWithCache(
      selector,
      rootNode as Element | Document,
      cache,
    );
    return { elements, handled: false };
  };

  const resolveSelectorElementsWithCache = (
    selector: string,
    rootNode: Element | Document,
    cache: SelectorCache,
  ): Element[] | null => {
    try {
      let elements = cache[selector];
      if (!elements) {
        const resolved = resolveDomElements(selector, rootNode as Element | Document);
        elements = resolved ?? [];
        cache[selector] = elements;
      }
      return elements;
    } catch (e) {
      const reason =
        e instanceof Error && e.message ? e.message : 'Unknown error during selector resolution';
      handleSelectorResolutionError(selector, reason);
      return null;
    }
  };

  const pushTarget = (value: unknown) => {
    if (value == null) {
      const { rootKind } = getRootDiagnostics(root ?? null);
      handleTargetError(
        'Resolved target is null or undefined',
        ErrorCode.TARGET_NULL,
        ErrorSeverity.WARNING,
        {
          input,
          root: root ?? null,
          rootKind,
          strictTargets: strict,
        },
      );
      return;
    }
    if (seen.has(value)) return;
    seen.add(value);
    const type = getTargetType(value);
    if (
      type === TargetType.Object &&
      (typeof value !== 'object' || value === null) &&
      typeof value !== 'function'
    ) {
      debugResolveTargets('Unsupported non-object target value resolved as Object type', {
        input,
        value,
        valueType: typeof value,
      });
    }
    result.push({
      target: value,
      type,
    });
  };

  const addFrom = (value: unknown) => {
    if (value == null) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        addFrom(item);
      }
      return;
    }

    if (isNodeList(value)) {
      for (let i = 0; i < value.length; i++) {
        addFrom(value.item(i));
      }
      return;
    }

    if (isArrayLike(value)) {
      const length = (value as any).length as number;
      for (let i = 0; i < length; i++) {
        if (i in (value as any)) {
          addFrom((value as any)[i]);
        }
      }
      return;
    }

    if (typeof value === 'string') {
      const { elements, handled } = resolveSelectorWithPolicy(
        value,
        root ?? null,
        selectorCache,
        defaultSelectorPolicy,
      );

      if (handled) {
        return;
      }

      if (elements && elements.length > 1) {
        for (const el of elements) {
          pushTarget(el);
        }
        return;
      }

      pushTarget(value);
      return;
    }

    if (isDomElement(value)) {
      pushTarget(value);
      return;
    }

    pushTarget(value);
  };

  addFrom(input);
  if (input != null && result.length === 0) {
    const severity = strict ? ErrorSeverity.FATAL : ErrorSeverity.WARNING;
    debugResolveTargets('No valid targets resolved from input', { input, root });
    handleTargetError('No valid targets resolved from input', ErrorCode.TARGETS_EMPTY, severity, {
      input,
      root,
    });
  }
  return result;
}
