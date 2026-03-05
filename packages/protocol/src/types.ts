export interface Disposable {
  dispose(): void;
}

export type FrameCallback = (dt: number, time: number) => void;

export type Priority = 'early' | 'default' | 'late' | 'render';
