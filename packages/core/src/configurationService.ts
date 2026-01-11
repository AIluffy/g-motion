import type { MotionAppConfig } from './plugin';
import { ErrorCode, ErrorSeverity, MotionError } from './errors';

export class ConfigurationService {
  private _config: MotionAppConfig;

  constructor(config?: MotionAppConfig) {
    this._config = ConfigurationService.normalizeConfig(config);
  }

  get config(): MotionAppConfig {
    return this._config;
  }

  setConfig(config?: MotionAppConfig): void {
    this._config = ConfigurationService.normalizeConfig(config);
  }

  private static normalizeConfig(config?: MotionAppConfig): MotionAppConfig {
    if (config?.gpuCompute && !['auto', 'always', 'never'].includes(config.gpuCompute)) {
      throw new MotionError(
        `Invalid gpuCompute mode: ${config.gpuCompute}. Must be 'auto', 'always', or 'never'.`,
        ErrorCode.INVALID_GPU_MODE,
        ErrorSeverity.FATAL,
        { providedMode: config.gpuCompute },
      );
    }

    return {
      gpuCompute: 'always',
      gpuEasing: true,
      ...config,
    };
  }
}
