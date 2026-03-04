export class GPURuntimeState {
  private _isInitialized = false;
  private _deviceAvailable = false;
  private _mockWebGPU = false;
  private _shaderVersion = -1;
  private _physicsPipelinesReady = false;
  private _frameId = 0;
  private _outputFormatStatsCounter = 0;
  private _latestAsyncCullingFrameByArchetype = new Map<string, number>();
  private _physicsParams = new Float32Array(4);

  get isInitialized() {
    return this._isInitialized;
  }
  get deviceAvailable() {
    return this._deviceAvailable;
  }
  get mockWebGPU() {
    return this._mockWebGPU;
  }
  get shaderVersion() {
    return this._shaderVersion;
  }
  get physicsPipelinesReady() {
    return this._physicsPipelinesReady;
  }
  get frameId() {
    return this._frameId;
  }
  get outputFormatStatsCounter() {
    return this._outputFormatStatsCounter;
  }
  get latestAsyncCullingFrameByArchetype() {
    return this._latestAsyncCullingFrameByArchetype;
  }
  get physicsParams() {
    return this._physicsParams;
  }

  setInitialized(value: boolean): void {
    this._isInitialized = value;
  }
  setDeviceAvailable(value: boolean): void {
    this._deviceAvailable = value;
  }
  setMockWebGPU(value: boolean): void {
    this._mockWebGPU = value;
  }
  setShaderVersion(value: number): void {
    this._shaderVersion = value;
  }
  setPhysicsPipelinesReady(value: boolean): void {
    this._physicsPipelinesReady = value;
  }
  incrementFrameId(): void {
    this._frameId += 1;
  }
  incrementOutputFormatStatsCounter(): void {
    this._outputFormatStatsCounter += 1;
  }

  reset(): void {
    this._isInitialized = false;
    this._deviceAvailable = false;
    this._mockWebGPU = false;
    this._shaderVersion = -1;
    this._physicsPipelinesReady = false;
    this._frameId = 0;
    this._outputFormatStatsCounter = 0;
    this._latestAsyncCullingFrameByArchetype.clear();
    this._physicsParams.fill(0);
  }
}
