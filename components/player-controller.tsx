import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { FrameSampler, type AnimationControl } from '@g-motion/animation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/components/ui/cn';

export type PlayerLoopMode = 'loop' | 'pingpong';

export type PlayerControllerState = {
  fps: number;
  loopMode: PlayerLoopMode;
  playbackRate: number;
  currentTimeMs: number;
  durationMs: number;
  framePosition: number;
  frameIndex: number;
  maxFrame: number;
  isPlaying: boolean;
};

export type PlayerControllerHandle = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekSeconds: (seconds: number) => void;
  seekFrame: (framePosition: number) => void;
  setPlaybackRate: (rate: number) => void;
  setFps: (fps: number) => void;
  setLoopMode: (mode: PlayerLoopMode) => void;
  getState: () => PlayerControllerState;
};

export type PlayerControllerProps = {
  control?: AnimationControl | null;
  defaultFps?: number;
  defaultPlaybackRate?: number;
  defaultLoopMode?: PlayerLoopMode;
  disabled?: boolean;
  className?: string;
  onStateChange?: (state: PlayerControllerState) => void;
};

/**
 * 将任意输入转换为有限数字；失败则回退到 fallback。
 */
export function coerceFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 将任意输入转换为正数（>0）；失败或非正数则回退到 fallback。
 */
export function coercePositiveNumber(value: unknown, fallback: number): number {
  const n = coerceFiniteNumber(value, fallback);
  return n > 0 ? n : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * 循环策略计算：
 * - loop：到端点后跳回另一端继续同方向
 * - pingpong：到端点后停在端点并反向播放
 */
export function computeLoopAdjustment(params: {
  loopMode: PlayerLoopMode;
  timeMs: number;
  durationMs: number;
  playbackRate: number;
}): { nextTimeMs: number; nextPlaybackRate: number } | null {
  const { loopMode, timeMs, durationMs, playbackRate } = params;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  if (!Number.isFinite(timeMs) || !Number.isFinite(playbackRate) || playbackRate === 0) return null;

  const forward = playbackRate > 0;
  const atEnd = forward ? timeMs >= durationMs : timeMs <= 0;
  if (!atEnd) return null;

  if (loopMode === 'loop') {
    return {
      nextTimeMs: forward ? 0 : durationMs,
      nextPlaybackRate: playbackRate,
    };
  }

  const abs = Math.abs(playbackRate) || 1;
  return {
    nextTimeMs: forward ? durationMs : 0,
    nextPlaybackRate: forward ? -abs : abs,
  };
}

export const PlayerController = forwardRef<PlayerControllerHandle, PlayerControllerProps>(
  (
    {
      control,
      defaultFps = 60,
      defaultPlaybackRate = 1,
      defaultLoopMode = 'loop',
      disabled = false,
      className,
      onStateChange,
    },
    ref,
  ) => {
    const [fps, setFpsState] = useState(() => coercePositiveNumber(defaultFps, 60));
    const [loopMode, setLoopModeState] = useState<PlayerLoopMode>(defaultLoopMode);
    const [playbackRate, setPlaybackRateState] = useState(() =>
      coerceFiniteNumber(defaultPlaybackRate, 1),
    );
    const [currentTimeMs, setCurrentTimeMs] = useState(0);
    const [durationMs, setDurationMs] = useState(0);
    const [seekSecondsInput, setSeekSecondsInput] = useState<string>('');
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    const isPlayingRef = useRef(false);
    const lastTimeRef = useRef<number | null>(null);
    const rafIdRef = useRef<number | null>(null);

    const sampler = useMemo(() => new FrameSampler(fps), [fps]);

    const derived = useMemo(() => {
      const safeDuration = Math.max(0, durationMs);
      const safeTime = clamp(currentTimeMs, 0, safeDuration || 0);
      const framePosition = sampler.timeToFramePosition(safeTime);
      const frameIndex = sampler.timeToFrameIndex(safeTime, 'floor');
      const maxFrame = sampler.timeToFrameIndex(safeDuration, 'ceil');
      return { safeDuration, safeTime, framePosition, frameIndex, maxFrame };
    }, [currentTimeMs, durationMs, sampler]);

    const snapshotState = useMemo<PlayerControllerState>(
      () => ({
        fps,
        loopMode,
        playbackRate,
        currentTimeMs,
        durationMs,
        framePosition: derived.framePosition,
        frameIndex: derived.frameIndex,
        maxFrame: derived.maxFrame,
        isPlaying,
      }),
      [
        currentTimeMs,
        derived.frameIndex,
        derived.framePosition,
        derived.maxFrame,
        durationMs,
        fps,
        loopMode,
        playbackRate,
      ],
    );

    useEffect(() => {
      onStateChange?.(snapshotState);
    }, [onStateChange, snapshotState]);

    const applyPlaybackRate = (nextRate: number) => {
      if (!Number.isFinite(nextRate)) return;
      setPlaybackRateState(nextRate);
      if (control) control.setPlaybackRate(nextRate);
    };

    const applyFps = (nextFps: number) => {
      const safe = coercePositiveNumber(nextFps, fps);
      setFpsState(safe);
    };

    const applyLoopMode = (next: PlayerLoopMode) => {
      setLoopModeState(next);
    };

    const applySeekMs = (timeMs: number) => {
      if (!control) return;
      const duration = control.getDuration();
      const clamped = clamp(timeMs, 0, Math.max(0, duration));
      control.seek(clamped);
      setCurrentTimeMs(clamped);
      setDurationMs(duration);
    };

    const applySeekFrame = (framePosition: number) => {
      if (!control) return;
      if (!Number.isFinite(framePosition)) return;
      control.seekFrame(framePosition, fps);
      const nextTime = control.getCurrentTime();
      setCurrentTimeMs(nextTime);
      setDurationMs(control.getDuration());
    };

    const play = () => {
      if (!control || disabled) return;
      isPlayingRef.current = true;
      setIsPlaying(true);
      control.setPlaybackRate(playbackRate);
      control.play();
    };

    const pause = () => {
      if (!control || disabled) return;
      isPlayingRef.current = false;
      setIsPlaying(false);
      control.pause();
    };

    const stop = () => {
      if (!control || disabled) return;
      isPlayingRef.current = false;
      setIsPlaying(false);
      control.stop();
      control.seek(0);
      setCurrentTimeMs(0);
      setDurationMs(control.getDuration());
    };

    useImperativeHandle(
      ref,
      () => ({
        play,
        pause,
        stop,
        seekSeconds: (seconds: number) => {
          const s = coerceFiniteNumber(seconds, 0);
          applySeekMs(s * 1000);
        },
        seekFrame: (framePosition: number) => {
          applySeekFrame(framePosition);
        },
        setPlaybackRate: (rate: number) => {
          applyPlaybackRate(coerceFiniteNumber(rate, playbackRate));
        },
        setFps: (fpsValue: number) => {
          applyFps(fpsValue);
        },
        setLoopMode: (mode: PlayerLoopMode) => {
          applyLoopMode(mode);
        },
        getState: () => snapshotState,
      }),
      [disabled, playbackRate, snapshotState],
    );

    useEffect(() => {
      if (!control) return;
      setDurationMs(control.getDuration());
      setCurrentTimeMs(control.getCurrentTime());
      setPlaybackRateState(control.getPlaybackRate());
    }, [control]);

    useEffect(() => {
      if (!control) return;
      let mounted = true;

      const tick = () => {
        if (!mounted) return;
        const nextDuration = control.getDuration();
        const nextTime = control.getCurrentTime();
        const nextRate = control.getPlaybackRate();

        setDurationMs(nextDuration);
        setCurrentTimeMs(nextTime);
        if (Number.isFinite(nextRate) && nextRate !== playbackRate) {
          setPlaybackRateState(nextRate);
        }

        if (isPlayingRef.current) {
          const last = lastTimeRef.current;
          lastTimeRef.current = nextTime;

          const adjustment = computeLoopAdjustment({
            loopMode,
            timeMs: nextTime,
            durationMs: nextDuration,
            playbackRate: nextRate,
          });

          if (adjustment) {
            control.seek(adjustment.nextTimeMs);
            control.setPlaybackRate(adjustment.nextPlaybackRate);
            control.play();
            setCurrentTimeMs(adjustment.nextTimeMs);
            setPlaybackRateState(adjustment.nextPlaybackRate);
            lastTimeRef.current = adjustment.nextTimeMs;
          } else if (nextRate < 0 && Number.isFinite(nextTime) && nextTime < 0) {
            control.seek(0);
            control.stop();
            isPlayingRef.current = false;
            setIsPlaying(false);
            setCurrentTimeMs(0);
            lastTimeRef.current = 0;
          } else if (last !== null && nextTime === last && nextDuration > 0) {
            const forward = nextRate > 0;
            const done = forward ? nextTime >= nextDuration : nextTime <= 0;
            if (done && loopMode === 'loop') {
              const t = forward ? 0 : nextDuration;
              control.seek(t);
              control.play();
              setCurrentTimeMs(t);
              lastTimeRef.current = t;
            }
          }
        }

        rafIdRef.current = requestAnimationFrame(tick);
      };

      rafIdRef.current = requestAnimationFrame(tick);
      return () => {
        mounted = false;
        if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      };
    }, [control, loopMode, playbackRate]);

    const currentSeconds = derived.safeTime / 1000;
    const durationSeconds = derived.safeDuration / 1000;
    const percent = derived.safeDuration > 0 ? (derived.safeTime / derived.safeDuration) * 100 : 0;

    const disabledAll = disabled || !control;

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Player</CardTitle>
          <div className="text-sm text-slate-300 tabular-nums">
            {currentSeconds.toFixed(3)}s / {durationSeconds.toFixed(3)}s · frame{' '}
            {derived.frameIndex} / {derived.maxFrame}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={play} disabled={disabledAll}>
                Play
              </Button>
              <Button onClick={pause} disabled={disabledAll} variant="ghost">
                Pause
              </Button>
              <Button onClick={stop} disabled={disabledAll} variant="ghost">
                Stop
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => applyLoopMode('loop')}
                disabled={disabledAll}
                variant={loopMode === 'loop' ? 'primary' : 'ghost'}
              >
                Loop
              </Button>
              <Button
                onClick={() => applyLoopMode('pingpong')}
                disabled={disabledAll}
                variant={loopMode === 'pingpong' ? 'primary' : 'ghost'}
              >
                Ping-pong
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                FPS
                <input
                  className="w-24 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-slate-100"
                  type="number"
                  inputMode="decimal"
                  step={0.1}
                  min={0.1}
                  value={fps}
                  disabled={disabledAll}
                  onChange={(e) => applyFps(Number(e.target.value))}
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-200">
                Rate
                <input
                  className="w-24 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-slate-100"
                  type="number"
                  inputMode="decimal"
                  step={0.1}
                  value={playbackRate}
                  disabled={disabledAll}
                  onChange={(e) => applyPlaybackRate(Number(e.target.value))}
                />
              </label>

              <Button
                variant="ghost"
                disabled={disabledAll}
                onClick={() => applyPlaybackRate(playbackRate === 0 ? -1 : -playbackRate)}
              >
                Reverse
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <div
                className={cn(
                  'pointer-events-none absolute top-0 h-full w-[2px] bg-sky-400/90',
                  !isScrubbing && 'transition-[left] duration-150 ease-out',
                )}
                style={{ left: `${clamp(percent, 0, 100)}%` }}
              />
              <Slider
                value={[clamp(derived.framePosition, 0, derived.maxFrame)]}
                onValueChange={(v) => {
                  const raw = v[0] ?? 0;
                  setIsScrubbing(true);
                  applySeekFrame(raw);
                }}
                min={0}
                max={Math.max(0, derived.maxFrame)}
                step={1}
                className={cn(disabledAll && 'opacity-60')}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-slate-300 tabular-nums">
                CTI: {currentSeconds.toFixed(3)}s ({derived.framePosition.toFixed(2)}f)
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-200">Seek (s)</label>
                <input
                  className="w-28 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-slate-100"
                  type="number"
                  inputMode="decimal"
                  step={0.001}
                  min={0}
                  value={seekSecondsInput}
                  disabled={disabledAll}
                  onChange={(e) => setSeekSecondsInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    applySeekMs(coerceFiniteNumber(Number(seekSecondsInput), 0) * 1000);
                    setIsScrubbing(false);
                  }}
                  onBlur={() => setIsScrubbing(false)}
                />
                <Button
                  size="sm"
                  disabled={disabledAll}
                  onClick={() => {
                    applySeekMs(coerceFiniteNumber(Number(seekSecondsInput), 0) * 1000);
                    setIsScrubbing(false);
                  }}
                >
                  Go
                </Button>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="justify-between">
          <div className="text-xs text-slate-400">
            时间轴以秒显示，内部以毫秒计算，并用 FPS 做帧/时间映射。
          </div>
          <div className="text-xs text-slate-400">{isPlaying ? 'Playing' : 'Idle'}</div>
        </CardFooter>
      </Card>
    );
  },
);

PlayerController.displayName = 'PlayerController';
