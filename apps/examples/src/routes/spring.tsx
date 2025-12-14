import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimationControl } from '@g-motion/animation';
import '@g-motion/plugin-spring'; // Auto-register spring plugin
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

export const Route = createFileRoute('/spring')({
  component: SpringDemo,
});

function SpringDemo() {
  const controlsRef = useRef<Map<string, AnimationControl>>(new Map());
  const [runningAnimations, setRunningAnimations] = useState<Set<string>>(new Set());

  // Spring parameters
  const stiffness = 100;
  const damping = 5;
  const mass = 1;

  const clearTimers = () => {
    controlsRef.current.forEach((control) => control.stop());
    controlsRef.current.clear();
  };

  const resetBoxes = () => {
    ['bouncy-box', 'stiff-box', 'heavy-box'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.style.transform = 'translate3d(0px, 0px, 0px)';
      }
    });
  };

  const startAnimation = (
    boxId: string,
    springConfig: { stiffness: number; damping: number; mass?: number },
  ) => {
    controlsRef.current.get(boxId)?.stop();

    const control = motion(`#${boxId}`)
      .mark([
        {
          to: { x: 250 },
          spring: springConfig,
        },
      ])
      .animate();

    controlsRef.current.set(boxId, control);
    setRunningAnimations((prev) => new Set(prev).add(boxId));

    // Monitor completion (approximate - spring completes when at rest)
    setTimeout(() => {
      setRunningAnimations((prev) => {
        const next = new Set(prev);
        next.delete(boxId);
        return next;
      });
    }, 3000); // Rough estimate
  };

  const startBouncy = () => {
    startAnimation('bouncy-box', { stiffness, damping, mass });
  };

  const startStiff = () => {
    startAnimation('stiff-box', { stiffness: stiffness * 4, damping: damping * 6, mass });
  };

  const startHeavy = () => {
    startAnimation('heavy-box', { stiffness, damping: damping * 4, mass: mass * 5 });
  };

  const stopAll = () => {
    clearTimers();
    setRunningAnimations(new Set());
    resetBoxes();
  };

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);

  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Spring physics</p>
            <h1 className="text-2xl font-semibold text-slate-50">
              Spring-based animations with different parameters
            </h1>
            <p className="mt-2 text-slate-400">
              Compare bouncy, stiff, and heavy spring animations using semi-implicit Euler
              integration
            </p>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bouncy spring</CardTitle>
            <CardDescription>
              Low damping (5) creates a bouncy, oscillating motion.{' '}
              <span className="font-mono text-xs text-slate-400">
                stiffness: 100, damping: 5, mass: 1
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative h-32 flex-1 rounded-lg border border-slate-800 bg-slate-900/60">
                <div
                  id="bouncy-box"
                  className="absolute left-8 top-8 h-16 w-16 rounded-lg bg-emerald-400 shadow-lg shadow-emerald-800/50"
                />
              </div>
              <Button
                onClick={startBouncy}
                disabled={runningAnimations.has('bouncy-box')}
                className="md:w-32"
              >
                {runningAnimations.has('bouncy-box') ? 'Running…' : 'Start'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stiff spring</CardTitle>
            <CardDescription>
              High stiffness (400) and damping (30) creates quick, non-bouncy motion.{' '}
              <span className="font-mono text-xs text-slate-400">
                stiffness: 400, damping: 30, mass: 1
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative h-32 flex-1 rounded-lg border border-slate-800 bg-slate-900/60">
                <div
                  id="stiff-box"
                  className="absolute left-8 top-8 h-16 w-16 rounded-lg bg-blue-400 shadow-lg shadow-blue-800/50"
                />
              </div>
              <Button
                onClick={startStiff}
                disabled={runningAnimations.has('stiff-box')}
                className="md:w-32"
              >
                {runningAnimations.has('stiff-box') ? 'Running…' : 'Start'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Heavy object</CardTitle>
            <CardDescription>
              Higher mass (5) creates sluggish, slow motion.{' '}
              <span className="font-mono text-xs text-slate-400">
                stiffness: 100, damping: 20, mass: 5
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative h-32 flex-1 rounded-lg border border-slate-800 bg-slate-900/60">
                <div
                  id="heavy-box"
                  className="absolute left-8 top-8 h-16 w-16 rounded-lg bg-purple-400 shadow-lg shadow-purple-800/50"
                />
              </div>
              <Button
                onClick={startHeavy}
                disabled={runningAnimations.has('heavy-box')}
                className="md:w-32"
              >
                {runningAnimations.has('heavy-box') ? 'Running…' : 'Start'}
              </Button>
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <span className="text-sm text-slate-300">
              Spring physics uses per-track velocity state and semi-implicit Euler integration.
            </span>
            <Button variant="ghost" onClick={stopAll}>
              Stop all / reset
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
