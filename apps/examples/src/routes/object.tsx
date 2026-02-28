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

type CounterTarget = { value: number };

export const Route = createFileRoute('/object')({
  component: ObjectDemo,
});

function ObjectDemo() {
  const controlRef = useRef<AnimationControl | null>(null);
  const targetRef = useRef<CounterTarget>({ value: 0 });
  const [display, setDisplay] = useState(0);
  const [primitiveDisplay, setPrimitiveDisplay] = useState(0);

  const start = () => {
    controlRef.current?.stop();
    targetRef.current.value = 0;
    setDisplay(0);

    const control = motion(targetRef.current)
      .mark([{ to: { value: 100 }, at: 900 }])
      .mark([{ to: { value: 20 }, at: 1400 }])
      .mark([{ to: { value: 60 }, at: 1800 }])
      .option({
        onUpdate: (latest) => {
          console.log('onUpdate', latest);
          const numeric =
            typeof latest === 'number'
              ? latest
              : typeof (latest as any)?.value === 'number'
                ? (latest as any).value
                : targetRef.current.value;
          setDisplay(numeric);
        },
      })
      .play();

    controlRef.current = control;
  };

  const startPrimitive = () => {
    controlRef.current?.stop();
    setPrimitiveDisplay(0);

    // Direct primitive number animation - no object wrapping needed
    const control = motion(0)
      .mark([{ to: 100 as any, at: 900 }])
      .mark([{ to: 20 as any, at: 1400 }])
      .mark([{ to: 60 as any, at: 1800 }])
      .option({
        onUpdate: (val) => {
          console.log('onUpdate primitive', val);
          setPrimitiveDisplay(val);
        },
      })
      .play();

    controlRef.current = control;
  };

  const stop = () => {
    controlRef.current?.stop();
  };

  useEffect(() => {
    return () => controlRef.current?.stop();
  }, []);

  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Callback demo</p>
            <h1 className="text-2xl font-semibold text-slate-50">Tween numbers and objects</h1>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Object Counter tween</CardTitle>
            <CardDescription>
              Animate a plain object property and render its value via a callback.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex-1 rounded-lg border border-slate-800 bg-slate-900/60 p-6">
                <p className="text-sm text-slate-300">Current value</p>
                <p className="text-5xl font-semibold text-slate-50">{display.toFixed(0)}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={start}>Start tween</Button>
                <Button variant="ghost" onClick={stop}>
                  Stop
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="text-sm text-slate-300">
            Animation: <code className="font-mono">motion(obj).mark({`{to: {value: 100}}`})</code>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Primitive Number tween</CardTitle>
            <CardDescription>
              Animate a primitive number directly without object wrapping.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex-1 rounded-lg border border-slate-800 bg-slate-900/60 p-6">
                <p className="text-sm text-slate-300">Current value</p>
                <p className="text-5xl font-semibold text-slate-50">
                  {primitiveDisplay.toFixed(0)}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={startPrimitive}>Start tween</Button>
                <Button variant="ghost" onClick={stop}>
                  Stop
                </Button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="text-sm text-slate-300">
            Animation: <code className="font-mono">motion(0).mark({`{to: 100}`})</code>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
