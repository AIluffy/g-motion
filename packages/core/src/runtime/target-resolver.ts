export type {
  SelectorCache,
  TargetResolveContext,
  TargetResolveResult,
  TargetResolver,
  TargetScopeRoot,
} from '@g-motion/protocol';

export {
  registerTargetResolver,
  registerTargetResolverWithScope,
  resolveWithRegisteredTargetResolvers,
} from './target-resolver-registry';
