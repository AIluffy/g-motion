/**
 * Value Processing Module
 *
 * Provides value type detection, parsing, caching, and interpolation
 * for the enhanced motion capabilities system.
 *
 * @module values
 */

import { defaultRegistry } from './core/registry';
import {
  numberParser,
  stringParser,
  colorParser,
  unitParser,
  pathParser,
  gradientParser,
  shadowParser,
  transformParser,
  borderRadiusParser,
} from './parsers';

export * from './core/types';
export * from './core/registry';
export * from './core/cache';
export * from './parsers';

defaultRegistry.register(numberParser, { priority: 100 });
defaultRegistry.register(unitParser, { priority: 90 });
defaultRegistry.register(borderRadiusParser, { priority: 80 });
defaultRegistry.register(colorParser, { priority: 70 });
defaultRegistry.register(gradientParser, { priority: 60 });
defaultRegistry.register(shadowParser, { priority: 50 });
defaultRegistry.register(pathParser, { priority: 40 });
defaultRegistry.register(transformParser, { priority: 30 });
defaultRegistry.register(stringParser, { priority: 0 });
