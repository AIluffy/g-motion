import { InertiaOptions, Keyframe, SpringOptions, TimelineData } from '@g-motion/core';
import { Easing, createWarn, panic } from '@g-motion/shared';
import {
  createDebugger,
  isArrayLike,
  isDev,
  isDomElement,
  isNodeList,
  resolveDomElements,
} from '@g-motion/shared';

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
const warnTargets = createWarn('Targets');

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

type SelectorResolutionPolicy = {
  useCache: boolean;
  reportDomEnvMissing: boolean;
  reportResolutionError: boolean;
};

const DEFAULT_SELECTOR_POLICY: SelectorResolutionPolicy = {
  useCache: true,
  reportDomEnvMissing: true,
  reportResolutionError: true,
};

function logRootOptionDiagnostics(
  options: TargetResolutionOptions | undefined,
  input: unknown,
): void {
  if (!options || !('root' in options)) return;

  if (options.root === null) {
    debugResolveTargets('Received null scope root for target resolution', { input });
    return;
  }
  if (!options.root) return;

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

function createTargetErrorHandlers(params: {
  input: unknown;
  root: TargetScopeRoot;
  strict: boolean;
  options?: TargetResolutionOptions;
}): {
  handleTargetError: (message: string, context: Record<string, unknown>, fatal: boolean) => void;
  handleSelectorDomEnvMissing: (selector: string, reason: string) => void;
  handleSelectorResolutionError: (selector: string, reason: string) => void;
} {
  const { input, root, strict, options } = params;

  const handleTargetError = (message: string, context: Record<string, unknown>, fatal: boolean) => {
    const shape = {
      inputType: typeof input,
      isArray: Array.isArray(input),
      arrayLength: Array.isArray(input) ? (input as any[]).length : undefined,
      isNodeListLike: isNodeList(input),
      isArrayLikeInput: isArrayLike(input),
    };
    const payload = { ...shape, ...context };
    if (fatal) {
      panic(message, payload);
    } else {
      warnTargets(message, payload);
    }
  };

  const handleSelectorDomEnvMissing = (selector: string, reason: string) => {
    const { rootKind, hasQuerySelectorAll } = getRootDiagnostics(root ?? null);
    handleTargetError(
      'DOM environment missing for selector resolution',
      {
        selector,
        root: root ?? null,
        reason,
        rootKind,
        hasQuerySelectorAll,
      },
      strict,
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
      {
        selector,
        root,
        reason,
        rootKind,
        hasQuerySelectorAll,
      },
      strict,
    );
    if (options?.onSelectorError) {
      options.onSelectorError(selector, reason);
    } else {
      debugResolveTargets('Selector resolution error', selector, reason);
    }
  };

  return {
    handleTargetError,
    handleSelectorDomEnvMissing,
    handleSelectorResolutionError,
  };
}

function resolveSelectorWithPolicy(params: {
  selector: string;
  rootNode: TargetScopeRoot;
  cache: SelectorCache;
  policy?: SelectorResolutionPolicy;
  handleSelectorDomEnvMissing: (selector: string, reason: string) => void;
  handleSelectorResolutionError: (selector: string, reason: string) => void;
}): { elements: Element[] | null; handled: boolean } {
  const {
    selector,
    rootNode,
    cache,
    policy = DEFAULT_SELECTOR_POLICY,
    handleSelectorDomEnvMissing,
    handleSelectorResolutionError,
  } = params;

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

  try {
    let elements = cache[selector];
    if (!elements) {
      const resolved = resolveDomElements(selector, rootNode as Element | Document);
      elements = resolved ?? [];
      cache[selector] = elements;
    }
    return { elements, handled: false };
  } catch (e) {
    if (policy.reportResolutionError) {
      const reason =
        e instanceof Error && e.message ? e.message : 'Unknown error during selector resolution';
      handleSelectorResolutionError(selector, reason);
    }
    return { elements: null, handled: false };
  }
}

function pushResolvedTarget(params: {
  value: unknown;
  input: unknown;
  root: TargetScopeRoot;
  strict: boolean;
  seen: Set<unknown>;
  result: ResolvedTarget[];
  handleTargetError: (message: string, context: Record<string, unknown>, fatal: boolean) => void;
}): void {
  const { value, input, root, strict, seen, result, handleTargetError } = params;
  if (value == null) {
    const { rootKind } = getRootDiagnostics(root ?? null);
    handleTargetError(
      'Resolved target is null or undefined',
      {
        input,
        root: root ?? null,
        rootKind,
        strictTargets: strict,
      },
      strict,
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
  result.push({ target: value, type });
}

function addTargetsFromValue(params: {
  value: unknown;
  input: unknown;
  root: TargetScopeRoot;
  selectorCache: SelectorCache;
  strict: boolean;
  seen: Set<unknown>;
  result: ResolvedTarget[];
  handleTargetError: (message: string, context: Record<string, unknown>, fatal: boolean) => void;
  handleSelectorDomEnvMissing: (selector: string, reason: string) => void;
  handleSelectorResolutionError: (selector: string, reason: string) => void;
}): void {
  const {
    value,
    input,
    root,
    selectorCache,
    strict,
    seen,
    result,
    handleTargetError,
    handleSelectorDomEnvMissing,
    handleSelectorResolutionError,
  } = params;

  if (value == null) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      addTargetsFromValue({ ...params, value: item });
    }
    return;
  }

  if (isNodeList(value)) {
    for (let i = 0; i < value.length; i++) {
      addTargetsFromValue({ ...params, value: value.item(i) });
    }
    return;
  }

  if (isArrayLike(value)) {
    const length = (value as any).length as number;
    for (let i = 0; i < length; i++) {
      if (i in (value as any)) {
        addTargetsFromValue({ ...params, value: (value as any)[i] });
      }
    }
    return;
  }

  if (typeof value === 'string') {
    const { elements, handled } = resolveSelectorWithPolicy({
      selector: value,
      rootNode: root ?? null,
      cache: selectorCache,
      policy: DEFAULT_SELECTOR_POLICY,
      handleSelectorDomEnvMissing,
      handleSelectorResolutionError,
    });

    if (handled) return;

    if (elements && elements.length > 1) {
      for (const el of elements) {
        pushResolvedTarget({ value: el, input, root, strict, seen, result, handleTargetError });
      }
      return;
    }

    pushResolvedTarget({ value, input, root, strict, seen, result, handleTargetError });
    return;
  }

  if (isDomElement(value)) {
    pushResolvedTarget({ value, input, root, strict, seen, result, handleTargetError });
    return;
  }

  pushResolvedTarget({ value, input, root, strict, seen, result, handleTargetError });
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

  logRootOptionDiagnostics(options, input);

  const { handleTargetError, handleSelectorDomEnvMissing, handleSelectorResolutionError } =
    createTargetErrorHandlers({
      input,
      root: root ?? null,
      strict,
      options,
    });

  addTargetsFromValue({
    value: input,
    input,
    root: root ?? null,
    selectorCache,
    strict,
    seen,
    result,
    handleTargetError,
    handleSelectorDomEnvMissing,
    handleSelectorResolutionError,
  });

  if (input != null && result.length === 0) {
    debugResolveTargets('No valid targets resolved from input', { input, root });
    handleTargetError(
      'No valid targets resolved from input',
      {
        input,
        root,
      },
      strict,
    );
  }
  return result;
}
