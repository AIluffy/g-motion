import { defaultRegistry } from './registry';
import {
  borderRadiusParser,
  colorParser,
  gradientParser,
  numberParser,
  pathParser,
  shadowParser,
  stringParser,
  transformParser,
  unitParser,
} from '../parsers';

let initialized = false;

export function ensureValueParsersRegistered(): void {
  if (initialized) return;
  initialized = true;

  defaultRegistry.register(numberParser, { priority: 100 });
  defaultRegistry.register(unitParser, { priority: 90 });
  defaultRegistry.register(borderRadiusParser, { priority: 80 });
  defaultRegistry.register(colorParser, { priority: 70 });
  defaultRegistry.register(gradientParser, { priority: 60 });
  defaultRegistry.register(shadowParser, { priority: 50 });
  defaultRegistry.register(pathParser, { priority: 40 });
  defaultRegistry.register(transformParser, { priority: 30 });
  defaultRegistry.register(stringParser, { priority: 0 });
}
