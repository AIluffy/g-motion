export type TargetScopeRoot = Element | Document | null | undefined;
export type SelectorCache = Record<string, Element[]>;

export type TargetResolveContext = {
  root: TargetScopeRoot;
  selectorCache: SelectorCache;
  strictTargets: boolean;
};

export type TargetResolveResult = Array<{
  target: unknown;
  type: string;
}>;

export type TargetResolver = (
  input: unknown,
  ctx: TargetResolveContext,
) => TargetResolveResult | null | undefined;
