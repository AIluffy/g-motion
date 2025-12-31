import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { engine, motion, type AnimationControl } from '@g-motion/animation';

import { PlayerController } from '@/components/player-controller';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { linkButtonClass } from '@/components/ui/link-styles';

export const Route = createFileRoute('/animation-controller-demo' as any)({
  component: AnimationControllerDemo,
});

type DemoStatus = 'idle' | 'running' | 'paused' | 'stopped';

type LogItem = {
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
};

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '0.000';
  return (ms / 1000).toFixed(3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function AnimationControllerDemo() {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<AnimationControl | null>(null);
  const loopWatchRef = useRef<{ lastTime: number; loops: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const [status, setStatus] = useState<DemoStatus>('idle');
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [globalSpeed, setGlobalSpeed] = useState<number>(1);
  const [targetFps, setTargetFps] = useState<number>(60);
  const [samplingFps, setSamplingFps] = useState<number>(60);
  const [repeatCount, setRepeatCount] = useState<number>(Infinity);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number>(0);
  const [loopsDetected, setLoopsDetected] = useState<number>(0);
  const [logs, setLogs] = useState<LogItem[]>([]);

  const pushLog = (level: LogItem['level'], message: string) => {
    setLogs((prev) => {
      const next = [...prev, { ts: Date.now(), level, message }];
      return next.length > 80 ? next.slice(next.length - 80) : next;
    });
  };

  const safeRepeatCount = useMemo(() => {
    if (repeatCount === Infinity) return Infinity;
    if (!Number.isFinite(repeatCount)) return 0;
    return Math.max(0, Math.floor(repeatCount));
  }, [repeatCount]);

  const applyEngineConfig = () => {
    try {
      engine.setSpeed(globalSpeed);
      engine.setFps(targetFps);
      engine.setSamplingFps(samplingFps);
      pushLog(
        'info',
        `engine config applied: speed=${globalSpeed}, fps=${targetFps}, samplingFps=${samplingFps}`,
      );
    } catch (e) {
      pushLog('error', e instanceof Error ? e.message : String(e));
    }
  };

  const stopAndReset = () => {
    const control = controlRef.current;
    if (control) {
      control.stop();
      control.seek(0);
    }
    const el = boxRef.current;
    if (el) {
      el.style.transform = 'translate3d(0px, 0px, 0px) rotate(0deg) scale(1, 1)';
      el.style.backgroundColor = 'rgb(34, 197, 94)';
      el.style.opacity = '1';
    }
    loopWatchRef.current = null;
    setLoopsDetected(0);
    setCurrentTimeMs(0);
    setDurationMs(0);
    setStatus('stopped');
    pushLog('info', 'stop + reset');
  };

  const ensureTarget = (): HTMLDivElement | null => {
    const el = boxRef.current;
    if (!el) {
      pushLog('warn', 'target element not ready yet');
      return null;
    }
    return el;
  };

  const buildBasicTimeline = (el: HTMLDivElement) => {
    return motion(el)
      .mark([
        { to: { x: 180, y: 0, rotate: 12 }, at: 600 },
        { to: { x: 180, y: 120, rotate: 90 }, at: 1200 },
        { to: { x: 0, y: 120, rotate: 180 }, at: 1800 },
        { to: { x: 0, y: 0, rotate: 360 }, at: 2400 },
      ])
      .option({
        repeat: safeRepeatCount === Infinity ? Infinity : safeRepeatCount,
        onUpdate: () => {
          // onUpdate runs on every rendered frame (CPU/GPU). Use it for lightweight UI sync.
        },
        onComplete: () => {
          pushLog('info', 'onComplete fired');
          setStatus('idle');
        },
      });
  };

  const startBasic = () => {
    const el = ensureTarget();
    if (!el) return;

    applyEngineConfig();

    controlRef.current?.stop();
    const ctrl = buildBasicTimeline(el).play();
    ctrl.setPlaybackRate(playbackRate);
    controlRef.current = ctrl;

    setStatus('running');
    setDurationMs(ctrl.getDuration());
    pushLog('info', `start basic timeline (rate=${playbackRate})`);
  };

  const pause = () => {
    const ctrl = controlRef.current;
    if (!ctrl) {
      pushLog('warn', 'pause ignored: no active control');
      return;
    }
    ctrl.pause();
    setStatus('paused');
    pushLog('info', 'pause');
  };

  const resume = () => {
    const ctrl = controlRef.current;
    if (!ctrl) {
      pushLog('warn', 'play ignored: no active control');
      return;
    }
    ctrl.setPlaybackRate(playbackRate);
    ctrl.play();
    setStatus('running');
    pushLog('info', `play (rate=${playbackRate})`);
  };

  const startLoopForever = () => {
    const el = ensureTarget();
    if (!el) return;

    applyEngineConfig();

    controlRef.current?.stop();
    const ctrl = buildBasicTimeline(el).option({ repeat: Infinity }).play();
    ctrl.setPlaybackRate(playbackRate);
    controlRef.current = ctrl;

    loopWatchRef.current = { lastTime: 0, loops: 0 };
    setLoopsDetected(0);
    setStatus('running');
    setDurationMs(ctrl.getDuration());
    pushLog('info', 'start loop forever');
  };

  const startPingPong = () => {
    const el = ensureTarget();
    if (!el) return;

    applyEngineConfig();

    controlRef.current?.stop();
    const ctrl = buildBasicTimeline(el).option({ repeat: Infinity }).play();
    ctrl.seek(ctrl.getDuration());
    ctrl.setPlaybackRate(-Math.abs(playbackRate || 1));
    ctrl.play();
    controlRef.current = ctrl;

    loopWatchRef.current = { lastTime: ctrl.getCurrentTime(), loops: 0 };
    setLoopsDetected(0);
    setStatus('running');
    setDurationMs(ctrl.getDuration());
    pushLog('info', 'start ping-pong (manual reverse at edges)');
  };

  const seekStart = () => {
    const ctrl = controlRef.current;
    if (!ctrl) return;
    ctrl.seek(0);
    setCurrentTimeMs(0);
    pushLog('info', 'seek to start');
  };

  const seekEnd = () => {
    const ctrl = controlRef.current;
    if (!ctrl) return;
    const d = ctrl.getDuration();
    ctrl.seek(d);
    setCurrentTimeMs(d);
    setDurationMs(d);
    pushLog('info', 'seek to end');
  };

  const runSequence = () => {
    const el = ensureTarget();
    if (!el) return;
    applyEngineConfig();

    controlRef.current?.stop();
    setStatus('running');
    pushLog('info', 'sequence start');

    const step1 = motion(el)
      .mark([
        { to: { x: 160, y: 0, rotate: 0, scaleX: 1.1, scaleY: 1.1 }, at: 600 },
        { to: { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 }, at: 1000 },
      ])
      .option({
        onComplete: () => {
          pushLog('info', 'sequence step1 complete');
          const step2 = motion(el)
            .mark([
              { to: { x: 0, y: 120, rotate: 120 }, at: 800 },
              { to: { x: 0, y: 0, rotate: 360 }, at: 1600 },
            ])
            .option({
              onComplete: () => {
                pushLog('info', 'sequence step2 complete');
                setStatus('idle');
              },
            })
            .play();
          step2.setPlaybackRate(playbackRate);
          controlRef.current = step2;
          setDurationMs(step2.getDuration());
        },
      })
      .play();

    step1.setPlaybackRate(playbackRate);
    controlRef.current = step1;
    setDurationMs(step1.getDuration());
  };

  useEffect(() => {
    const prevSpeed = engine.getSpeed();
    const prevFps = engine.getFps();
    const prevMode = engine.getSamplingMode();
    const prevSamplingFps = engine.getSamplingFps();

    setGlobalSpeed(prevSpeed);
    setTargetFps(prevFps);
    setSamplingFps(prevSamplingFps);

    pushLog(
      'info',
      `engine baseline: speed=${prevSpeed}, fps=${prevFps}, samplingMode=${prevMode}, samplingFps=${prevSamplingFps}`,
    );

    return () => {
      try {
        engine.setSpeed(prevSpeed);
        engine.setFps(prevFps);
        engine.setSamplingFps(prevSamplingFps);
      } catch {}
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      controlRef.current?.stop();
      controlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;

    const tick = () => {
      if (!mounted) return;
      const ctrl = controlRef.current;
      if (ctrl) {
        const d = Math.max(0, ctrl.getDuration());
        const t = ctrl.getCurrentTime();
        setDurationMs(d);
        setCurrentTimeMs(clamp(t, 0, d || 0));

        const watcher = loopWatchRef.current;
        if (watcher && d > 0) {
          const forward = ctrl.getPlaybackRate() >= 0;
          const current = t;

          const wrapped = forward ? watcher.lastTime > current + 1 : watcher.lastTime < current - 1;
          if (wrapped) {
            watcher.loops += 1;
            setLoopsDetected(watcher.loops);
            pushLog('info', `loop detected (#${watcher.loops})`);
          }
          watcher.lastTime = current;

          const atEnd = forward ? current >= d : current <= 0;
          if (atEnd) {
            const nextRate = -ctrl.getPlaybackRate() || (forward ? -1 : 1);
            ctrl.setPlaybackRate(nextRate);
            ctrl.seek(forward ? d : 0);
            ctrl.play();
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const isActive = !!controlRef.current;
  const canPlay = isActive && status !== 'running';

  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Examples</p>
            <h1 className="text-2xl font-semibold text-slate-50">Animation controller demo</h1>
            <p className="text-sm text-slate-300">
              一个从基础到进阶的 AnimationControl
              使用示例：引擎配置、播放控制、速度、事件、状态切换、序列控制。
            </p>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back
          </Link>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Canvas</CardTitle>
              <CardDescription>
                绿色方块是被动画驱动的目标元素。通过下面的按钮触发不同控制场景。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative h-[240px] overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_40%,rgba(56,189,248,0.12),transparent_60%)]" />
                <div
                  ref={boxRef}
                  id="animation-controller-demo-box"
                  className="absolute left-8 top-8 h-16 w-16 rounded-lg shadow-lg"
                  style={{
                    backgroundColor: 'rgb(34, 197, 94)',
                    transform: 'translate3d(0px, 0px, 0px) rotate(0deg) scale(1, 1)',
                    willChange: 'transform',
                  }}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-100">1) 初始化配置</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-200">
                      globalSpeed
                      <input
                        className="w-24 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-slate-100"
                        type="number"
                        inputMode="decimal"
                        step={0.1}
                        value={globalSpeed}
                        onChange={(e) => setGlobalSpeed(Number(e.target.value))}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-200">
                      targetFps
                      <input
                        className="w-24 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-slate-100"
                        type="number"
                        inputMode="decimal"
                        step={1}
                        min={1}
                        value={targetFps}
                        onChange={(e) => setTargetFps(Number(e.target.value))}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-200">
                      samplingFps
                      <input
                        className="w-24 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-slate-100"
                        type="number"
                        inputMode="decimal"
                        step={0.1}
                        min={0.1}
                        value={samplingFps}
                        onChange={(e) => setSamplingFps(Number(e.target.value))}
                      />
                    </label>
                    <Button onClick={applyEngineConfig} variant="ghost">
                      Apply engine config
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-100">2) 播放参数</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-200">
                      playbackRate
                      <input
                        className="w-24 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-slate-100"
                        type="number"
                        inputMode="decimal"
                        step={0.1}
                        value={playbackRate}
                        onChange={(e) => setPlaybackRate(Number(e.target.value))}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-200">
                      repeat
                      <input
                        className="w-28 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-slate-100"
                        type="text"
                        value={repeatCount === Infinity ? 'Infinity' : String(repeatCount)}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          if (!raw) return;
                          if (raw.toLowerCase() === 'infinity') {
                            setRepeatCount(Infinity);
                            return;
                          }
                          const n = Number(raw);
                          if (Number.isFinite(n)) setRepeatCount(n);
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-300 tabular-nums">
                status: <span className="text-slate-100">{status}</span> · time:{' '}
                <span className="text-slate-100">{formatMs(currentTimeMs)}s</span> /{' '}
                <span className="text-slate-100">{formatMs(durationMs)}s</span> · loops:{' '}
                <span className="text-slate-100">{loopsDetected}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={startBasic}>Start (basic)</Button>
                <Button onClick={startLoopForever} variant="ghost">
                  Loop (forever)
                </Button>
                <Button onClick={startPingPong} variant="ghost">
                  Ping-pong
                </Button>
                <Button onClick={runSequence} variant="ghost">
                  Run sequence
                </Button>
                <Button onClick={canPlay ? resume : pause} disabled={!isActive} variant="ghost">
                  {canPlay ? 'Play' : 'Pause'}
                </Button>
                <Button
                  onClick={stopAndReset}
                  disabled={!isActive && status !== 'stopped'}
                  variant="ghost"
                >
                  Stop + Reset
                </Button>
              </div>
            </CardFooter>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Controller UI</CardTitle>
              <CardDescription>
                使用 PlayerController 组件对同一个 AnimationControl 做时间轴/帧级 seek 与速率控制。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PlayerController
                control={controlRef.current}
                defaultFps={samplingFps}
                defaultPlaybackRate={playbackRate}
                onStateChange={(s) => {
                  setCurrentTimeMs(s.currentTimeMs);
                  setDurationMs(s.durationMs);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={seekStart} disabled={!isActive} size="sm" variant="ghost">
                  Seek start
                </Button>
                <Button onClick={seekEnd} disabled={!isActive} size="sm" variant="ghost">
                  Seek end
                </Button>
                <Button
                  onClick={() => {
                    const ctrl = controlRef.current;
                    if (!ctrl) return;
                    const next = ctrl.getPlaybackRate() === 0 ? -1 : -ctrl.getPlaybackRate();
                    ctrl.setPlaybackRate(next);
                    pushLog('info', `toggle reverse => rate=${next}`);
                  }}
                  disabled={!isActive}
                  size="sm"
                  variant="ghost"
                >
                  Toggle reverse
                </Button>
              </div>
            </CardContent>
            <CardFooter className="text-xs text-slate-400">
              提示：Ping-pong 这里演示的是“在端点手动翻转 playbackRate”的做法。
            </CardFooter>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Event log</CardTitle>
            <CardDescription>
              onComplete / loop detection / user actions 都会写入日志，用于验证控制器行为。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[260px] overflow-auto rounded-md border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-200">
              {logs.length === 0 ? (
                <div className="text-slate-400">No events yet.</div>
              ) : (
                <div className="space-y-1">
                  {logs.map((l, index) => (
                    <div key={`${l.ts}-${index}`} className="flex items-start gap-2">
                      <div className="w-[88px] shrink-0 text-slate-400 tabular-nums">
                        {new Date(l.ts).toLocaleTimeString()}
                      </div>
                      <div className="w-[54px] shrink-0 text-slate-400">{l.level}</div>
                      <div className="text-slate-100">{l.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-400">
              说明：repeat/loop 事件当前通过时间回绕检测实现（API 暂未直接暴露 iteration）。
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setLogs([]);
                pushLog('info', 'log cleared');
              }}
            >
              Clear log
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
