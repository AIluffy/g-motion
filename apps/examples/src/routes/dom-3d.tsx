import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { motion, AnimationControl } from '@g-motion/animation';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { linkButtonClass } from '@/components/ui/link-styles';

const cubeId = 'dom-3d-cube';

export const Route = createFileRoute('/dom-3d')({
  component: Dom3dDemo,
});

function Cube3d() {
  const cubeControlRef = useRef<AnimationControl | null>(null);

  useEffect(() => {
    // 调试：检查元素是否存在
    const el = document.getElementById(cubeId);
    console.log('🔍 Cube element found:', el);
    console.log('🔍 Initial transform:', el?.style.transform);
    console.log('🔍 Initial rotate:', el?.style.rotate);

    let frameCount = 0;
    const control = motion(`#${cubeId}`)
      .mark([
        {
          to: {
            rotateX: 360,
            rotateY: 360,
            x: 199,
          },
          time: 4000,
        },
        {
          to: {
            rotateX: 0,
            rotateY: 0,
            x: 0,
          },
          time: 8000,
        },
      ])
      .animate({
        repeat: Infinity,
        onUpdate: () => {
          frameCount++;
          if (frameCount % 10 === 0) {
            // console.log(`🔄 Frame ${frameCount} update`);
            // 每10帧打印一次
            // const el = document.getElementById(cubeId);
            // console.log(`📊 Frame ${frameCount} - transform:`, el?.style.transform);
            // console.log(`   rotateX value (from style):`, el?.style.getPropertyValue('--rotate-x'));
          }
        },
      });

    cubeControlRef.current = control;

    return () => {
      cubeControlRef.current?.stop();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative" style={{ perspective: '1200px', width: '200px', height: '200px' }}>
        <div
          id={cubeId}
          className="relative w-32 h-32"
          style={{
            transformStyle: 'preserve-3d',
            width: '128px',
            height: '128px',
            transform: 'rotateX(0deg) rotateY(0deg)',
          }}
        >
          {/* Front */}
          <div
            className="absolute w-32 h-32 flex items-center justify-center text-white font-bold text-xl bg-red-500 opacity-90"
            style={{
              transform: 'translateZ(64px)',
            }}
          >
            Front
          </div>
          {/* Back */}
          <div
            className="absolute w-32 h-32 flex items-center justify-center text-white font-bold text-xl bg-blue-500 opacity-90"
            style={{
              transform: 'rotateY(180deg) translateZ(64px)',
            }}
          >
            Back
          </div>
          {/* Right */}
          <div
            className="absolute w-32 h-32 flex items-center justify-center text-white font-bold text-xl bg-green-500 opacity-90"
            style={{
              transform: 'rotateY(90deg) translateZ(64px)',
            }}
          >
            Right
          </div>
          {/* Left */}
          <div
            className="absolute w-32 h-32 flex items-center justify-center text-white font-bold text-xl bg-yellow-500 opacity-90"
            style={{
              transform: 'rotateY(-90deg) translateZ(64px)',
            }}
          >
            Left
          </div>
          {/* Top */}
          <div
            className="absolute w-32 h-32 flex items-center justify-center text-white font-bold text-xl bg-purple-500 opacity-90"
            style={{
              transform: 'rotateX(90deg) translateZ(64px)',
            }}
          >
            Top
          </div>
          {/* Bottom */}
          <div
            className="absolute w-32 h-32 flex items-center justify-center text-white font-bold text-xl bg-pink-500 opacity-90"
            style={{
              transform: 'rotateX(-90deg) translateZ(64px)',
            }}
          >
            Bottom
          </div>
        </div>
      </div>
      <p className="text-sm text-slate-300 mt-4">自动旋转的3D立方体</p>
    </div>
  );
}

function Dom3dDemo() {
  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">DOM demo</p>
            <h1 className="text-2xl font-semibold text-slate-50">
              3D transforms (translateZ / rotateX / rotateY)
            </h1>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>3D 立方体</CardTitle>
            <CardDescription>动画化的3D立方体，展示多个面的旋转变换效果。</CardDescription>
          </CardHeader>
          <CardContent>
            <Cube3d />
          </CardContent>
          <CardFooter className="text-sm text-slate-300">
            使用CSS 3D transforms和<span className="font-mono text-slate-100">preserve-3d</span>
            实现真实3D立方体效果。
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
