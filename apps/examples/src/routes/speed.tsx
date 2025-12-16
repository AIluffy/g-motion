import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, type AnimationControl } from '@g-motion/animation';

export const Route = createFileRoute('/speed')({
  component: SpeedRoute,
});

declare global {
  interface Window {
    TweenLite?: any;
    Cubic?: any;
    jQuery?: any;
    $?: any;
    anime?: any;
    popmotion?: any;
    mojs?: any;
    Zepto?: any;
    just?: any;
    define?: any;
  }
}

type EngineKey =
  | 'jquery'
  | 'gsap'
  | 'anime'
  | 'popmotion'
  | 'just'
  | 'webanimations'
  | 'css'
  | 'mojs'
  | 'zepto'
  | 'gmotion'
  | 'jqueryGSAP'
  | 'gsaptransform'
  | 'animetransform'
  | 'popmotiontransform'
  | 'justtransform'
  | 'webanimationstransform'
  | 'csstransform'
  | 'mojstransform'
  | 'zeptotransform'
  | 'gmotiontransform';

type Test = {
  milliseconds: boolean;
  nativeSize: boolean;
  wrapDot: (dot: HTMLElement) => any;
  tween: (dot: any) => void;
  stop: (dot: any) => void;
};

type DotEl = HTMLElement & {
  due?: number;
  killed?: boolean;
  isKilled?: boolean;
  onFinish?: (e?: any) => void;
  anim?: any;
  _animation?: any;
};

type WrappedDot = any;

const engineOptions: Array<{ value: EngineKey; label: string }> = [
  { value: 'jquery', label: 'jQuery 3' },
  { value: 'gsap', label: 'GSAP (GreenSock)' },
  { value: 'anime', label: 'anime' },
  { value: 'popmotion', label: 'Popmotion' },
  { value: 'just', label: 'Just Animate' },
  { value: 'webanimations', label: 'Web Animations (WAAPI)' },
  { value: 'css', label: 'CSS Transitions' },
  { value: 'gmotion', label: 'Motion (layout)' },
  { value: 'mojs', label: 'mo.js' },
  { value: 'zepto', label: 'Zepto' },
  { value: 'jqueryGSAP', label: 'jquery.gsap.js plugin' },
  { value: 'gsaptransform', label: 'GSAP (translate/scale)' },
  { value: 'animetransform', label: 'anime (translate/scale)' },
  { value: 'popmotiontransform', label: 'Popmotion (translate/scale)' },
  { value: 'justtransform', label: 'Just Animate (translate/scale)' },
  { value: 'gmotiontransform', label: 'Motion (translate/scale)' },
  { value: 'webanimationstransform', label: 'Web Animations (translate/scale)' },
  { value: 'csstransform', label: 'CSS Transitions (translate/scale)' },
  { value: 'mojstransform', label: 'mo.js (translate/scale)' },
  { value: 'zeptotransform', label: 'Zepto (translate/scale)' },
];

function SpeedRoute() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [engine, setEngine] = useState<EngineKey>('gsap');
  const [dotQuantity, setDotQuantity] = useState(1000);
  const [durationSec, setDurationSec] = useState(0.75);
  const [inProgress, setInProgress] = useState(false);
  const [fpsText, setFpsText] = useState('-- fps');
  const [tardyText, setTardyText] = useState('');
  const [instructionsVisible, setInstructionsVisible] = useState(false);

  const stateRef = useRef({
    tests: {} as Record<EngineKey, Test>,
    currentTest: null as Test | null,
    dots: [] as WrappedDot[],
    rawDots: [] as DotEl[],
    centerX: 0,
    centerY: 0,
    radius: 0,
    duration: 0,
    startingCSS: '',
    fpsActive: false,
    frames: 0,
    lastUpdate: 0,
    fpsIntervalId: 0 as any,
    tardyTotal: 0,
    tardyCount: 0,
    lastTardyReport: 0,
    count: 0,
  });

  const styleText = useMemo(
    () => `
html, body { overflow: hidden; }
body { background-color: #000; margin: 0; padding: 0; color: #ccc; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; font-weight: 300; font-size: 17px; line-height: 150%; }
h1 { font-weight: 300; font-size: 48px; margin: 10px 0 0 0; padding: 0; line-height: 115%; color: #fff; }
a, a:hover, a:visited { color: #71B200; }
#footer { position: fixed; bottom: 0; left: 0; right: 0; background: linear-gradient(to bottom, #777 0%, #444 100%); padding: 7px; z-index: 1000; }
#start { color: #000; border-radius: 6px; padding: 5px 18px; border: 2px solid #000; background: linear-gradient(to bottom, #9af600 0%, #71B200 100%); cursor: pointer; font-weight: 400; user-select: none; }
#footer form li { display: block; padding: 2px 6px; vertical-align: middle; text-shadow: 1px 1px 1px #000; }
#instructions { position: relative; z-index: 10; width: 70%; margin-left: 15%; padding-top: 50px; padding-bottom: 60px; opacity: 0; transition: opacity 700ms ease; }
#instructions.visible { opacity: 1; }
#instructions h2 { font-weight: 400; margin-bottom: -10px; padding-bottom: 0; color: #fff; }
#container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; z-index: 0; pointer-events: none; }
#footer #fps { text-shadow: none; background-color: #ccc; padding: 6px; margin-right: 14px; color: #c00; border-radius: 5px; border: 1px solid #000; font-size: 24px; }
#footer-container { width: 100%; }
#form { display: flex; align-items: center; flex-wrap: wrap; list-style: none; margin: 0; padding: 0; }
strong { color: #fff; }
`,
    [],
  );

  const stop = () => {
    const s = stateRef.current;
    setInProgress(false);
    s.fpsActive = false;
    setFpsText('-- fps');
    if (s.fpsIntervalId) {
      window.clearInterval(s.fpsIntervalId);
      s.fpsIntervalId = 0 as any;
    }

    if (s.currentTest) {
      for (let i = s.dots.length - 1; i >= 0; i -= 1) {
        try {
          s.currentTest.stop(s.dots[i]);
        } catch {
          continue;
        }
      }
    }

    const container = containerRef.current;
    if (container) container.replaceChildren();

    s.dots = [];
    s.rawDots = [];
    s.currentTest = null;
  };

  const getTime = () => Date.now();

  const updateFPS = () => {
    const s = stateRef.current;
    s.frames += 1;
    const elapsed = getTime() - s.lastUpdate;
    if (s.fpsActive && elapsed > 1000) {
      setFpsText(`${Number((s.frames / elapsed) * 1000).toFixed(1)} fps`);
      s.lastUpdate += elapsed;
      s.frames = 0;
    }
  };

  const activateFPS = () => {
    const s = stateRef.current;
    s.fpsActive = true;
    s.frames = 0;
    s.lastUpdate = getTime();
    s.fpsIntervalId = window.setInterval(updateFPS, 10);
  };

  const reportTardy = (amount: number) => {
    const s = stateRef.current;
    s.tardyTotal += amount;
    s.tardyCount += 1;
    s.lastTardyReport = Date.now();
    const average = Math.round(s.tardyTotal / s.tardyCount);
    setTardyText(
      `Overdue animations: ${Math.ceil((s.tardyCount * 100) / Math.max(1, s.count))}% (${average}ms average, ${Math.round((average * 100) / 750)}%)`,
    );
  };

  const checkTardyAndGetDelay = (dot: DotEl) => {
    const s = stateRef.current;
    const delay = Math.random() * s.duration;
    const now = Date.now();
    if (dot.due != null && now - dot.due > 150) {
      reportTardy(now - dot.due);
    } else if (s.tardyCount && now - s.lastTardyReport > 1500) {
      const average = Math.round(s.tardyTotal / s.tardyCount);
      setTardyText(
        `Overdue animations: ${Math.ceil((s.tardyCount * 100) / Math.max(1, s.count))}% (${average}ms average, ${Math.round((average * 100) / 750)}%)`,
      );
      s.lastTardyReport = now;
    }
    dot.due = now + (delay + s.duration) * (s.currentTest?.milliseconds ? 1 : 1000);
    s.count += 1;
    return delay;
  };

  const createDots = () => {
    const s = stateRef.current;
    const container = containerRef.current;
    if (!container || !s.currentTest) return;

    const qty = dotQuantity;
    const dots: WrappedDot[] = [];
    const rawDots: DotEl[] = [];
    for (let i = qty - 1; i >= 0; i -= 1) {
      const dot = document.createElement('img') as DotEl;
      dot.id = `dot${i}`;
      (dot as HTMLImageElement).src = 'https://gsap.com/js/img/dot.png';
      dot.style.cssText = s.startingCSS;
      dot.style.willChange = 'transform, left, top, width, height';
      container.appendChild(dot);
      rawDots.push(dot);
      dots.push(s.currentTest.wrapDot(dot));
    }
    s.dots = dots;
    s.rawDots = rawDots;
  };

  const buildTests = useMemo(() => {
    const tests = {} as Record<EngineKey, Test>;

    tests.css = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => dot,
      tween: (dot: DotEl) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot);
        dot.style.cssText = s.startingCSS;
        const angle = Math.random() * Math.PI * 2;
        window.setTimeout(() => {
          if (!dot.killed) {
            dot.style.transition = `all 750ms cubic-bezier(0.550, 0.055, 0.675, 0.190) ${delay}ms`;
            dot.style.left = `${Math.cos(angle) * s.radius + s.centerX}px`;
            dot.style.top = `${Math.sin(angle) * s.radius + s.centerY}px`;
            dot.style.width = '32px';
            dot.style.height = '32px';
            if (dot.onFinish) dot.removeEventListener('transitionend', dot.onFinish);
            dot.onFinish = () => {
              tests.css.tween(dot);
            };
            dot.addEventListener('transitionend', dot.onFinish, false);
          }
        }, 33);
        dot.due = (dot.due ?? 0) + 33;
      },
      stop: (dot: DotEl) => {
        dot.killed = true;
        dot.style.transition = 'none';
      },
    };

    tests.gmotion = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => {
        const state = { left: 0, top: 0, size: 1 };
        return { dot, state, control: null as AnimationControl | null };
      },
      tween: (wrapped: {
        dot: DotEl;
        state: { left: number; top: number; size: number };
        control: AnimationControl | null;
      }) => {
        const s = stateRef.current;
        const dot = wrapped.dot;
        const state = wrapped.state;

        const delay = checkTardyAndGetDelay(dot);
        const angle = Math.random() * Math.PI * 2;
        dot.style.cssText = s.startingCSS;

        const from = {
          left: s.centerX,
          top: s.centerY,
          size: 1,
        };
        const to = {
          left: Math.cos(angle) * s.radius + s.centerX,
          top: Math.sin(angle) * s.radius + s.centerY,
          size: 32,
        };

        wrapped.control?.stop?.();

        console.log('gmotion tween', delay, s.duration);

        wrapped.control = motion(state)
          .mark([{ to: from, at: 0 }])
          .mark([{ to, at: s.duration }])
          .animate({
            delay,
            repeat: Infinity,
            onUpdate: (state) => {
              dot.style.left = `${state.left}px`;
              dot.style.top = `${state.top}px`;
              dot.style.width = `${state.size}px`;
              dot.style.height = `${state.size}px`;
            },
            onComplete: () => {
              tests.gmotion.tween(wrapped);
            },
          });
      },
      stop: (wrapped: { control: AnimationControl | null }) => {
        wrapped.control?.stop?.();
      },
    };

    tests.csstransform = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => dot,
      tween: (dot: DotEl) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot);
        dot.style.cssText = `${s.startingCSS} transform: translate(0px, 0px) scale(1)`;
        const angle = Math.random() * Math.PI * 2;
        window.setTimeout(() => {
          if (!dot.killed) {
            dot.style.transition = `all 750ms cubic-bezier(0.550, 0.055, 0.675, 0.190) ${delay}ms`;
            dot.style.transform = `translate(${Math.cos(angle) * s.radius}px, ${Math.sin(angle) * s.radius}px) scale(32)`;
            if (dot.onFinish) dot.removeEventListener('transitionend', dot.onFinish);
            dot.onFinish = () => {
              tests.csstransform.tween(dot);
            };
            dot.addEventListener('transitionend', dot.onFinish, false);
          }
        }, 33);
        dot.due = (dot.due ?? 0) + 33;
      },
      stop: (dot: DotEl) => {
        dot.killed = true;
        dot.style.transition = 'none';
      },
    };

    tests.webanimations = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => dot,
      tween: (dot: DotEl) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot);
        dot.style.cssText = s.startingCSS;
        const angle = Math.random() * Math.PI * 2;
        dot.anim = dot.animate(
          [
            { left: `${s.centerX}px`, top: `${s.centerY}px`, width: '1px', height: '1px' },
            {
              left: `${Math.cos(angle) * s.radius + s.centerX}px`,
              top: `${Math.sin(angle) * s.radius + s.centerY}px`,
              width: '32px',
              height: '32px',
            },
          ],
          {
            duration: s.duration,
            delay,
            fill: 'forwards',
            easing: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)',
          },
        );
        dot.anim.onfinish = () => {
          tests.webanimations.tween(dot);
        };
      },
      stop: (dot: DotEl) => {
        if (dot.anim) {
          dot.anim.onfinish = null;
          dot.anim.cancel();
        }
      },
    };

    tests.webanimationstransform = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => dot,
      tween: (dot: DotEl) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot);
        dot.style.cssText = s.startingCSS;
        const angle = Math.random() * Math.PI * 2;
        dot.anim = dot.animate(
          [
            {
              transform: 'translate(0px, 0px) scale(1)',
              left: `${s.centerX}px`,
              top: `${s.centerY}px`,
            },
            {
              transform: `translate(${Math.cos(angle) * s.radius}px, ${Math.sin(angle) * s.radius}px) scale(32)`,
              left: `${s.centerX}px`,
              top: `${s.centerY}px`,
            },
          ],
          {
            duration: s.duration,
            delay,
            fill: 'forwards',
            easing: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)',
          },
        );
        dot.anim.onfinish = () => {
          tests.webanimationstransform.tween(dot);
        };
      },
      stop: (dot: DotEl) => {
        if (dot.anim) {
          dot.anim.onfinish = null;
          dot.anim.cancel();
        }
      },
    };

    tests.gsap = {
      milliseconds: false,
      nativeSize: false,
      wrapDot: (dot) => dot,
      tween: (dot: DotEl) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot);
        const angle = Math.random() * Math.PI * 2;
        dot.style.cssText = s.startingCSS;
        window.TweenLite.to(dot, s.duration, {
          css: {
            left: Math.cos(angle) * s.radius + s.centerX,
            top: Math.sin(angle) * s.radius + s.centerY,
            width: 32,
            height: 32,
          },
          delay,
          ease: window.Cubic?.easeIn,
          overwrite: 'none',
          onComplete: tests.gsap.tween,
          onCompleteParams: [dot],
        });
      },
      stop: (dot: DotEl) => {
        window.TweenLite?.killTweensOf(dot);
      },
    };

    tests.gsaptransform = {
      milliseconds: false,
      nativeSize: true,
      wrapDot: (dot) => dot,
      tween: (dot: DotEl) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot);
        window.TweenLite.set(dot, { css: { x: 0, y: 0, scale: 0.06, force3D: false } });
        const angle = Math.random() * Math.PI * 2;
        window.TweenLite.to(dot, s.duration, {
          css: {
            x: Math.cos(angle) * s.radius,
            y: Math.sin(angle) * s.radius,
            scaleX: 2,
            scaleY: 2,
          },
          delay,
          ease: window.Cubic?.easeIn,
          overwrite: 'none',
          onComplete: tests.gsaptransform.tween,
          onCompleteParams: [dot],
        });
      },
      stop: (dot: DotEl) => {
        window.TweenLite?.killTweensOf(dot);
      },
    };

    tests.jquery = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => window.jQuery?.(dot) ?? dot,
      tween: (dot: any) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot[0] as DotEl);
        (dot[0] as DotEl).style.cssText = s.startingCSS;
        const angle = Math.random() * Math.PI * 2;
        dot.delay(delay).animate(
          {
            left: Math.cos(angle) * s.radius + s.centerX,
            top: Math.sin(angle) * s.radius + s.centerY,
            width: 32,
            height: 32,
          },
          s.duration,
          'cubicIn',
          () => {
            tests.jquery.tween(dot);
          },
        );
      },
      stop: (dot: any) => {
        dot.stop(true);
      },
    };

    tests.jqueryGSAP = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => window.jQuery?.(dot) ?? dot,
      tween: (dot: any) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot[0] as DotEl);
        (dot[0] as DotEl).style.cssText = s.startingCSS;
        const angle = Math.random() * Math.PI * 2;
        dot.animate(
          {
            left: Math.cos(angle) * s.radius + s.centerX,
            top: Math.sin(angle) * s.radius + s.centerY,
            width: 32,
            height: 32,
            delay: delay / 1000,
          },
          s.duration,
          'easeInCubic',
          () => {
            tests.jqueryGSAP.tween(dot);
          },
        );
      },
      stop: (dot: any) => {
        dot.stop(true);
      },
    };

    tests.anime = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => {
        dot.removeAttribute('width');
        dot.removeAttribute('height');
        return dot;
      },
      tween: (dot: DotEl) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot);
        const angle = Math.random() * Math.PI * 2;
        dot.style.cssText = s.startingCSS;
        window.anime({
          targets: dot,
          duration: s.duration,
          left: `${Math.cos(angle) * s.radius + s.centerX}px`,
          top: `${Math.sin(angle) * s.radius + s.centerY}px`,
          width: '32px',
          height: '32px',
          delay,
          easing: 'easeInCubic',
          complete: () => {
            tests.anime.tween(dot);
          },
        });
      },
      stop: (dot: DotEl) => {
        window.anime?.remove(dot);
      },
    };

    tests.animetransform = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => dot,
      tween: (dot: DotEl) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot);
        dot.style.cssText = `position:absolute; top:${s.centerY}px; left:${s.centerX}px; transform: none; width: 1px; height: 1px;`;
        const angle = Math.random() * Math.PI * 2;
        window.anime({
          targets: dot,
          duration: s.duration,
          translateX: Math.cos(angle) * s.radius,
          translateY: Math.sin(angle) * s.radius,
          scale: 32,
          delay,
          easing: 'easeInCubic',
          complete: () => {
            tests.animetransform.tween(dot);
          },
        });
      },
      stop: (dot: DotEl) => {
        window.anime?.remove(dot);
      },
    };

    const widthRange = [1, 32] as const;
    const scaleRange = [0.06, 2] as const;
    const cubicEaseIn = (t: number) => t * t * t;

    tests.popmotion = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => window.popmotion?.css(dot) ?? dot,
      tween: (dot: any) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot.get ? (dot.get() as DotEl) : (dot.el as DotEl));
        const angle = Math.random() * Math.PI * 2;
        const mapWidthToLeft = window.popmotion.transform.interpolate(widthRange, [
          s.centerX,
          Math.cos(angle) * s.radius + s.centerX,
        ]);
        const mapWidthToTop = window.popmotion.transform.interpolate(widthRange, [
          s.centerY,
          Math.sin(angle) * s.radius + s.centerY,
        ]);
        const dotStyles: any = { left: s.centerX, top: s.centerY, width: 1, height: 1 };
        const updateDotStyles = (v: number) => {
          dotStyles.left = `${mapWidthToLeft(v)}px`;
          dotStyles.top = `${mapWidthToTop(v)}px`;
          dotStyles.width = `${v}px`;
          dotStyles.height = `${v}px`;
          dot.set(dotStyles);
        };
        updateDotStyles(widthRange[0]);
        dot._animation = window.popmotion
          .chain([
            window.popmotion.delay(delay),
            window.popmotion.tween({
              from: widthRange[0],
              to: widthRange[1],
              duration: s.duration,
              ease: cubicEaseIn,
              onUpdate: updateDotStyles,
              onComplete: () => tests.popmotion.tween(dot),
            }),
          ])
          .start();
      },
      stop: (dot: any) => {
        dot._animation?.stop?.();
      },
    };

    tests.popmotiontransform = {
      milliseconds: true,
      nativeSize: true,
      wrapDot: (dot) => window.popmotion?.css(dot) ?? dot,
      tween: (dot: any) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot.get ? (dot.get() as DotEl) : (dot.el as DotEl));
        const angle = Math.random() * Math.PI * 2;
        const mapScaleToX = window.popmotion.transform.interpolate(scaleRange, [
          0,
          Math.cos(angle) * s.radius,
        ]);
        const mapScaleToY = window.popmotion.transform.interpolate(scaleRange, [
          0,
          Math.sin(angle) * s.radius,
        ]);
        const dotStyles: any = { x: 0, y: 0, scale: 0 };
        const updateDotStyles = (v: number) => {
          dotStyles.x = mapScaleToX(v);
          dotStyles.y = mapScaleToY(v);
          dotStyles.scale = v;
          dot.set(dotStyles);
        };
        updateDotStyles(scaleRange[0]);
        dot._animation = window.popmotion
          .chain([
            window.popmotion.delay(delay),
            window.popmotion.tween({
              from: scaleRange[0],
              to: scaleRange[1],
              duration: s.duration,
              ease: cubicEaseIn,
              onUpdate: updateDotStyles,
              onComplete: () => tests.popmotiontransform.tween(dot),
            }),
          ])
          .start();
      },
      stop: (dot: any) => {
        dot._animation?.stop?.();
      },
    };

    tests.just = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => dot,
      tween: (dot: DotEl) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot);
        const angle = Math.random() * Math.PI * 2;
        const anim = (dot.anim = window.just.animate({
          targets: dot,
          duration: s.duration,
          delay: delay | 0,
          web: {
            left: [`${s.centerX}px`, `${Math.cos(angle) * s.radius + s.centerX}px`],
            top: [`${s.centerY}px`, `${Math.sin(angle) * s.radius + s.centerY}px`],
            width: ['1px', '32px'],
            height: ['1px', '32px'],
          },
          easing: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)',
        }));
        anim.on('finish', () => {
          tests.just.tween(dot);
        });
        anim.play();
      },
      stop: (dot: DotEl) => {
        dot.anim?.cancel?.();
      },
    };

    tests.justtransform = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => dot,
      tween: (dot: DotEl) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot);
        const angle = Math.random() * Math.PI * 2;
        const anim = (dot.anim = window.just.animate({
          targets: dot,
          duration: s.duration,
          delay: delay | 0,
          web: {
            transform: [
              'translate(0px, 0px) scale(1)',
              `translate(${Math.cos(angle) * s.radius}px, ${Math.sin(angle) * s.radius}px) scale(32)`,
            ],
          },
          easing: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)',
        }));
        anim.on('finish', () => {
          tests.justtransform.tween(dot);
        });
        anim.play();
      },
      stop: (dot: DotEl) => {
        dot.anim?.cancel?.();
      },
    };

    tests.gmotiontransform = {
      milliseconds: true,
      nativeSize: true,
      wrapDot: (dot) => dot,
      tween: (dot: DotEl) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot);
        const angle = Math.random() * Math.PI * 2;
        dot.style.cssText = s.startingCSS;
        const dx = Math.cos(angle) * s.radius;
        const dy = Math.sin(angle) * s.radius;

        const existing = dot._animation as AnimationControl | undefined;
        existing?.stop?.();

        window.setTimeout(() => {
          if (dot.killed) return;
          const control = motion(dot)
            .mark([{ to: { x: 0, y: 0, scale: 0.06 }, at: 0 }])
            .mark([{ to: { x: dx, y: dy, scale: 2 }, at: s.duration }])
            .animate({
              repeat: Infinity,
              onComplete: () => {
                tests.gmotiontransform.tween(dot);
              },
            });
          dot._animation = control;
        }, delay);
      },
      stop: (dot: DotEl) => {
        const control = dot._animation as AnimationControl | undefined;
        control?.stop?.();
      },
    };

    tests.mojs = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) =>
        new window.mojs.Html({
          el: dot,
          customProperties: {
            left: 0,
            top: 0,
            width: 1,
            height: 1,
            draw: (e: any, props: any) => {
              e.style.left = `${props.left}px`;
              e.style.top = `${props.top}px`;
              e.style.width = `${props.width}px`;
              e.style.height = `${props.height}px`;
            },
          },
        }),
      tween: (dot: any) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot._props?.el as DotEl);
        const angle = Math.random() * Math.PI * 2;
        const left: any = { duration: s.duration, delay, easing: 'cubic.in' };
        const top: any = { duration: s.duration, delay, easing: 'cubic.in' };
        left[s.centerX] = Math.cos(angle) * s.radius + s.centerX;
        top[s.centerY] = Math.sin(angle) * s.radius + s.centerY;
        dot.reset();
        dot
          .then({
            left,
            top,
            width: { duration: s.duration, delay, easing: 'cubic.in', 1: 32 },
            height: {
              duration: s.duration,
              delay,
              easing: 'cubic.in',
              1: 32,
              onComplete: () => {
                tests.mojs.tween(dot);
              },
            },
          })
          .play();
      },
      stop: (dot: any) => {
        dot.stop();
      },
    };

    tests.mojstransform = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => new window.mojs.Html({ el: dot }),
      tween: (dot: any) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot._props?.el as DotEl);
        const angle = Math.random() * Math.PI * 2;
        dot.reset();
        dot
          .then({
            y: { duration: s.duration, delay, easing: 'cubic.in', 0: Math.sin(angle) * s.radius },
            x: { duration: s.duration, delay, easing: 'cubic.in', 0: Math.cos(angle) * s.radius },
            scaleX: { duration: s.duration, delay, easing: 'cubic.in', 1: 32 },
            scaleY: {
              duration: s.duration,
              delay,
              easing: 'cubic.in',
              1: 32,
              onComplete: () => {
                tests.mojstransform.tween(dot);
              },
            },
          })
          .play();
      },
      stop: (dot: any) => {
        dot.stop();
      },
    };

    tests.zepto = {
      milliseconds: true,
      nativeSize: false,
      wrapDot: (dot) => window.Zepto?.(dot) ?? dot,
      tween: (dot: any) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot[0] as DotEl);
        (dot[0] as DotEl).style.cssText = s.startingCSS;
        window.setTimeout(() => {
          if (!dot.isKilled) {
            const angle = Math.random() * Math.PI * 2;
            dot.animate(
              {
                left: Math.cos(angle) * s.radius + s.centerX,
                top: Math.sin(angle) * s.radius + s.centerY,
                width: 32,
                height: 32,
              },
              s.duration,
              'cubic-bezier(0.550, 0.055, 0.675, 0.190)',
              () => {
                tests.zepto.tween(dot);
              },
            );
          }
        }, delay);
      },
      stop: (dot: any) => {
        dot.isKilled = true;
      },
    };

    tests.zeptotransform = {
      milliseconds: true,
      nativeSize: true,
      wrapDot: (dot) => window.Zepto?.(dot) ?? dot,
      tween: (dot: any) => {
        const s = stateRef.current;
        const delay = checkTardyAndGetDelay(dot[0] as DotEl);
        dot.animate(
          {
            translateX: '0px',
            translateY: '0px',
            rotateY: '0rad',
            rotateX: '0rad',
            scale: '0.06,0.06',
          },
          0,
        );
        window.setTimeout(() => {
          if (!dot.isKilled) {
            const angle = Math.random() * Math.PI * 2;
            dot.animate(
              {
                translateX: `${Math.cos(angle) * s.radius}px`,
                translateY: `${Math.sin(angle) * s.radius}px`,
                scale: '2,2',
                delay: Math.random() * s.duration,
              },
              s.duration,
              'cubic-bezier(0.550, 0.055, 0.675, 0.190)',
              () => {
                tests.zeptotransform.tween(dot);
              },
            );
          }
        }, delay);
      },
      stop: (dot: any) => {
        dot.isKilled = true;
      },
    };

    return tests;
  }, [dotQuantity]);

  useEffect(() => {
    stateRef.current.tests = buildTests;
  }, [buildTests]);

  useEffect(() => {
    const t = window.setTimeout(() => setInstructionsVisible(true), 250);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  useEffect(() => {
    if (!inProgress) return;
    stop();
  }, [engine, dotQuantity, durationSec]);

  const start = () => {
    setTardyText('Overdue animations: 0% (0ms average, 0%)');
    setFpsText('-- fps');

    const engineKey = engine;

    if (engineKey === 'jquery' || engineKey === 'jqueryGSAP') {
      const $ = window.jQuery;
      if ($?.easing) {
        $.easing.cubicIn = (p: number, _n: number, firstNum: number, diff: number) =>
          firstNum + p * p * p * diff;
      }
      if (engineKey === 'jqueryGSAP' && $.gsap) {
        $.gsap.enabled(true);
      }
    }

    if (engineKey !== 'jqueryGSAP') {
      const $ = window.jQuery;
      if ($?.gsap) {
        $.gsap.enabled(false);
      }
    }

    const container = containerRef.current;
    if (!container) return;

    const s = stateRef.current;
    s.tests = buildTests;
    const current = s.tests[engineKey];
    s.currentTest = current;
    s.count = 0;
    s.tardyTotal = 0;
    s.tardyCount = 0;
    s.lastTardyReport = 0;

    const size = current.nativeSize ? '16px' : '1px';
    const rect = container.getBoundingClientRect();
    s.centerX = rect.width / 2;
    s.centerY = rect.height / 2 - 30;
    s.radius = Math.sqrt(s.centerX * s.centerX + s.centerY * s.centerY);
    s.duration = Number(durationSec);
    if (current.milliseconds) s.duration *= 1000;
    s.startingCSS = `position:absolute; left:${s.centerX}px; top:${s.centerY}px; width:${size}; height:${size};`;

    container.replaceChildren();
    createDots();
    setInProgress(true);
    setInstructionsVisible(false);

    for (let i = s.dots.length - 1; i >= 0; i -= 1) {
      current.tween(s.dots[i]);
    }

    window.setTimeout(() => {
      activateFPS();
    }, 1000);
  };

  const toggle = () => {
    if (inProgress) {
      stop();
      setInstructionsVisible(true);
      return;
    }
    start();
  };

  return (
    <div className="page-shell">
      <style>{styleText}</style>

      <div id="footer-container">
        <div id="footer">
          <form id="form">
            <li style={{ display: 'none' }}>
              Duration:
              <select
                id="duration"
                size={1}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                disabled={inProgress}
              >
                <option value={0.5}>0.5 seconds</option>
                <option value={0.75}>0.75 seconds</option>
                <option value={1}>1 second</option>
                <option value={5}>5 seconds</option>
              </select>
            </li>

            <li>
              Engine:
              <select
                id="engine"
                size={1}
                value={engine}
                onChange={(e) => setEngine(e.target.value as EngineKey)}
                disabled={inProgress}
              >
                {engineOptions.map((opt, idx) => (
                  <option key={`${opt.value}-${idx}`} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </li>

            <li>
              Dots:
              <select
                id="dotQuantity"
                size={1}
                value={dotQuantity}
                onChange={(e) => setDotQuantity(Number(e.target.value))}
                disabled={inProgress}
              >
                {[25, 50, 100, 200, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000].map(
                  (n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ),
                )}
              </select>
            </li>

            <li style={{ verticalAlign: 'bottom' }}>
              <div
                id="start"
                onClick={() => {
                  toggle();
                }}
                style={
                  inProgress
                    ? { background: '#C00', backgroundColor: '#C00' }
                    : {
                        background: 'linear-gradient(to bottom, #9af600 0%,#71B200 100%)',
                        backgroundColor: '#9af600',
                      }
                }
              >
                {inProgress ? 'STOP' : 'START'}
              </div>
            </li>

            <li id="tardy" style={{ flexGrow: 3, color: '#fcd000' }}>
              {tardyText}
            </li>
            <li id="fps">{fpsText}</li>
          </form>
        </div>
      </div>

      <div id="instructions" className={instructionsVisible ? 'visible' : ''}>
        <h1>JavaScript Animation Speed Test</h1>
        <p>
          Compare the performance of various JavaScript libraries with{' '}
          <a href="http://greensock.com/gsap/" target="_blank" rel="noreferrer">
            GSAP
          </a>
          . This test simply animates the left, top, width, and height css properties of standard
          elements. There are also versions of several of the tests that use transforms
          ("translate/scale") instead so that you can compare performance.
        </p>
        <p>
          The goal was to be extremely fair and use the same code for everything except the actual
          animation.
        </p>
        <h2>Instructions</h2>
        <p>
          At the bottom of the screen, choose the number of dots you'd like to animate and the
          engine/library and click the "START" button. Keep increasing the quantity of dots to see
          where (and how) things break down.
        </p>
        <h2>Overdue animations</h2>
        <p>
          If any animation completes <strong>more than 150ms</strong> later than it was supposed to,
          it will be logged and shown in orange text next to the START/STOP button along with the
          average amount of time they blew past their schedued end time.
        </p>
        <h2>Notes</h2>
        <p>
          CSS transitions (which Zepto uses) won't work in some browsers. Also beware that some
          browsers incorrectly fire requestAnimationFrame events even when the browser clearly isn't
          updating the screen.
        </p>
      </div>

      <div id="container" ref={containerRef} />
    </div>
  );
}
