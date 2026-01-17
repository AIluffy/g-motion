import type { MotionAppConfig } from './plugin';

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
    return {
      ...config,
    };
  }
}
