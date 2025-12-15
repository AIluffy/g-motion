import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimationControl } from '@g-motion/animation';
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

const boxId = 'dom-demo-box';

export const Route = createFileRoute('/dom')({
  component: DomDemo,
});

function DomDemo() {
  const controlRef = useRef<AnimationControl | null>(null);
  const timerRef = useRef<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const resetBox = () => {
    const el = document.getElementById(boxId);
    if (el) {
      el.style.transform = 'translate3d(0px, 0px, 0px) scale(1, 1) rotate(0deg)';
    }
  };

  const start = () => {
    clearTimer();
    controlRef.current?.stop();

    const totalDuration = 600 + 500 + 400;
    const repeat = 0;
    timerRef.current = window.setTimeout(() => setIsRunning(false), totalDuration * (repeat + 1));

    const control = motion(`#${boxId}`)
      .mark([{ to: { x: 180, y: 0, scaleX: 1.05, rotate: 8 }, at: 600 }])
      .mark([{ to: { x: 180, y: 24, scaleX: 1, scaleY: 1.02, rotate: -6 }, at: 1100 }])
      .mark([{ to: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0 }, at: 1500 }])
      .animate({ repeat });

    controlRef.current = control;
    setIsRunning(true);
  };

  const startMulti = () => {
    // Create two extra boxes if not present
    const container = document.getElementById('multi-container');
    if (container && container.childElementCount === 0) {
      for (let i = 0; i < 3; i++) {
        const div = document.createElement('div');
        div.className =
          'multi-box absolute left-8 top-8 h-10 w-10 rounded-md bg-indigo-400 shadow-md shadow-indigo-800/40';
        div.style.left = `${8 + i * 24}px`;
        div.style.top = `${8 + i * 24}px`;
        container.appendChild(div);
      }
    }

    // Fan-out selector animates all matched elements
    motion('.multi-box')
      .mark([{ to: { x: 100, y: 0 }, at: 400 }])
      .mark([{ to: { x: 0, y: 0 }, at: 800 }])
      .animate();
  };

  const stop = () => {
    controlRef.current?.stop();
    clearTimer();
    setIsRunning(false);
    resetBox();
  };

  useEffect(() => {
    return () => {
      controlRef.current?.stop();
      clearTimer();
    };
  }, []);

  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">DOM demo</p>
            <h1 className="text-2xl font-semibold text-slate-50">Chained marks on a DOM element</h1>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Box timeline</CardTitle>
            <CardDescription>
              Three marks: move right, dip down with a tilt, then return to origin. Repeat is set to
              0 here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative h-48 flex-1 rounded-lg border border-slate-800 bg-slate-900/60">
                <div
                  id={boxId}
                  className="absolute left-8 top-8 h-16 w-16 rounded-lg bg-emerald-400 shadow-lg shadow-emerald-800/50"
                />
                <div id="multi-container" className="absolute right-8 top-8 h-32 w-48" />
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={start} disabled={isRunning}>
                  {isRunning ? 'Running…' : 'Start animation'}
                </Button>
                <Button variant="ghost" onClick={stop}>
                  Stop / reset
                </Button>
                <Button variant="ghost" onClick={startMulti}>
                  Animate multiple ('.multi-box')
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="text-sm text-slate-300">
            Motion uses the DOM plugin (auto-registered in examples) to animate DOM elements. Use
            <span className="font-mono text-slate-100"> mark() </span>to build the timeline and
            <span className="font-mono text-slate-100"> animate() </span>to play it. Selectors like
            <span className="font-mono text-slate-100"> '.multi-box' </span>fan-out to multiple
            elements.
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
