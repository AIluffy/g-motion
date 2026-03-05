import { AsyncReadbackManager } from './async-readback';

export class ReadbackManager extends AsyncReadbackManager {
  async initialize(): Promise<void> {
    this.reset();
  }

  destroy(): void {
    this.reset();
  }
}
