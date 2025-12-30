import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { animate, type AnimationControl } from '@g-motion/animation';
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

const domBoxId = 'animate-dom-box';
const colorBoxId = 'animate-color-box';
const svgPathId = 'animate-path';

type CounterTarget = { value: number };

export const Route = createFileRoute('/animate' as any)({
  component: AnimatePage,
});

function AnimatePage() {
  const domControlRef = useRef<AnimationControl | null>(null);
  const objectControlRef = useRef<AnimationControl | null>(null);
  const colorControlRef = useRef<AnimationControl | null>(null);
  const pathControlRef = useRef<AnimationControl | null>(null);
  const counterRef = useRef<CounterTarget>({ value: 0 });
  const [domRunning, setDomRunning] = useState(false);
  const [objectRunning, setObjectRunning] = useState(false);
  const [colorRunning, setColorRunning] = useState(false);
  const [pathRunning, setPathRunning] = useState(false);
  const [counterDisplay, setCounterDisplay] = useState(0);

  useEffect(() => {
    return () => {
      domControlRef.current?.stop();
      objectControlRef.current?.stop();
      colorControlRef.current?.stop();
      pathControlRef.current?.stop();
    };
  }, []);

  const resetDomBox = () => {
    const el = document.getElementById(domBoxId);
    if (el) {
      el.style.transform = 'translate3d(0px, 0px, 0px) scale(1, 1) rotate(0deg)';
    }
  };

  const startDomAnimate = () => {
    domControlRef.current?.stop();
    resetDomBox();

    const control = animate(
      `#${domBoxId}`,
      {
        x: [0, 180, 0],
        y: [0, 0, 0],
        scaleX: [1, 1.05, 1],
        scaleY: [1, 1, 1],
        rotate: [0, 8, 0],
      },
      {
        duration: 1500,
        times: [0, 0.4, 1],
        repeat: 1,
        repeatType: 'reverse',
        onComplete: () => {
          setDomRunning(false);
        },
      },
    );

    domControlRef.current = control;
    setDomRunning(true);
  };

  const stopDomAnimate = () => {
    domControlRef.current?.stop();
    resetDomBox();
    setDomRunning(false);
  };

  const startObjectAnimate = () => {
    objectControlRef.current?.stop();
    counterRef.current.value = 0;
    setCounterDisplay(0);

    const control = animate(
      counterRef.current,
      {
        value: [0, 100, 20, 60],
      },
      {
        duration: 1800,
        times: [0, 0.5, 0.75, 1],
        onUpdate: (latest) => {
          const numeric =
            typeof latest === 'number'
              ? latest
              : typeof (latest as any)?.value === 'number'
                ? (latest as any).value
                : counterRef.current.value;
          setCounterDisplay(numeric);
        },
        onComplete: () => {
          setObjectRunning(false);
        },
      },
    );

    objectControlRef.current = control;
    setObjectRunning(true);
  };

  const stopObjectAnimate = () => {
    objectControlRef.current?.stop();
    setObjectRunning(false);
  };

  const startColorAnimate = () => {
    colorControlRef.current?.stop();

    const control = animate(
      `#${colorBoxId}`,
      {
        backgroundColor: ['#22c55e', '#eab308', '#ef4444', '#22c55e'],
        opacity: [1, 0.8, 0.6, 1],
      },
      {
        duration: 2000,
        times: [0, 0.3, 0.7, 1],
        repeat: 1,
        repeatType: 'reverse',
        onComplete: () => {
          setColorRunning(false);
        },
      },
    );

    colorControlRef.current = control;
    setColorRunning(true);
  };

  const stopColorAnimate = () => {
    colorControlRef.current?.stop();
    setColorRunning(false);
  };

  const startPathAnimate = () => {
    pathControlRef.current?.stop();

    const control = animate(
      `#${svgPathId}`,
      {
        d: [
          'M10 40 Q 52 10 94 40 T 178 40',
          'M10 80 Q 52 110 94 80 T 178 80',
          'M10 40 Q 52 10 94 40 T 178 40',
        ],
      },
      {
        duration: 1800,
        times: [0, 0.5, 1],
        repeat: 1,
        repeatType: 'reverse',
        onComplete: () => {
          setPathRunning(false);
        },
      },
    );

    pathControlRef.current = control;
    setPathRunning(true);
  };

  const stopPathAnimate = () => {
    pathControlRef.current?.stop();
    setPathRunning(false);
  };

  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">animate()</p>
            <h1 className="text-2xl font-semibold text-slate-50">
              One-shot animate() for DOM, objects, and values
            </h1>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>DOM animate() with keyframes</CardTitle>
            <CardDescription>
              Use animate() directly on a selector string with keyframes, times, and repeat
              configuration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative h-48 flex-1 rounded-lg border border-slate-800 bg-slate-900/60">
                <div
                  id={domBoxId}
                  className="absolute left-8 top-8 h-16 w-16 rounded-lg bg-emerald-400 shadow-lg shadow-emerald-800/50"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={startDomAnimate} disabled={domRunning}>
                  {domRunning ? 'Running…' : 'Start animate()'}
                </Button>
                <Button variant="ghost" onClick={stopDomAnimate}>
                  Stop / reset
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="text-sm text-slate-300">
            Target:
            <span className="font-mono text-slate-100"> {` '#${domBoxId}' `}</span>
            with keyframes on
            <span className="font-mono text-slate-100"> x</span>,
            <span className="font-mono text-slate-100"> y</span>,
            <span className="font-mono text-slate-100"> scaleX</span>,
            <span className="font-mono text-slate-100"> scaleY</span> and
            <span className="font-mono text-slate-100"> rotate</span>.
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Object animate() tween</CardTitle>
            <CardDescription>
              Animate a plain object field with animate() and update React state from the onUpdate
              callback.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex-1 rounded-lg border border-slate-800 bg-slate-900/60 p-6">
                <p className="text-sm text-slate-300">Current value</p>
                <p className="text-5xl font-semibold text-slate-50">{counterDisplay.toFixed(0)}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={startObjectAnimate} disabled={objectRunning}>
                  {objectRunning ? 'Running…' : 'Start object animate()'}
                </Button>
                <Button variant="ghost" onClick={stopObjectAnimate}>
                  Stop
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="text-sm text-slate-300">
            Animation:
            <span className="font-mono text-slate-100">
              {` animate(counter, { value: [0, 100, 20, 60] }, { duration: 1800 })`}
            </span>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Color and opacity animate()</CardTitle>
            <CardDescription>
              Animate backgroundColor and opacity with multiple color keyframes and custom times.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative h-32 flex-1 rounded-lg border border-slate-800 bg-slate-900/60">
                <div
                  id={colorBoxId}
                  className="absolute left-8 top-8 h-16 w-32 rounded-lg bg-emerald-400 shadow-lg shadow-emerald-800/50"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={startColorAnimate} disabled={colorRunning}>
                  {colorRunning ? 'Running…' : 'Start color animate()'}
                </Button>
                <Button variant="ghost" onClick={stopColorAnimate}>
                  Stop
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="text-sm text-slate-300">
            Values:
            <span className="font-mono text-slate-100"> backgroundColor </span>
            and
            <span className="font-mono text-slate-100"> opacity</span> use the color/unit parsers.
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SVG path animate()</CardTitle>
            <CardDescription>
              Animate an SVG path d attribute between wave-like shapes using the path parser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex-1 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <svg viewBox="0 0 190 120" className="h-32 w-full text-sky-400">
                  <path
                    id={svgPathId}
                    d="M10 40 Q 52 10 94 40 T 178 40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={4}
                  />
                </svg>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={startPathAnimate} disabled={pathRunning}>
                  {pathRunning ? 'Running…' : 'Start path animate()'}
                </Button>
                <Button variant="ghost" onClick={stopPathAnimate}>
                  Stop
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="text-sm text-slate-300">
            Target:
            <span className="font-mono text-slate-100"> '#{svgPathId}' </span>
            with
            <span className="font-mono text-slate-100"> d</span> keyframes uses the path parser.
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
