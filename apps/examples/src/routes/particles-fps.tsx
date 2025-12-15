import { Link, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimationControl } from '@g-motion/animation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { linkButtonClass } from '@/components/ui/link-styles';

export const Route = createFileRoute('/particles-fps')({
  component: ParticlesFpsPage,
});

type ParticleHandle = {
  el: HTMLDivElement;
  control: AnimationControl | null;
};

const INITIAL_PARTICLE_COUNT = 50;
const MAX_PARTICLE_COUNT = 500;
const DELAY_MAX_MS = 1000;
const BASE_DURATION_MS = 1800; // 60fps baseline

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function ParticlesFpsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<ParticleHandle[]>([]);
  const [fps, setFps] = useState(60);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [particleCount, setParticleCount] = useState(INITIAL_PARTICLE_COUNT);
  const [gpuEnabled, setGpuEnabled] = useState(true);
  const [gpuAvailable, setGpuAvailable] = useState(false);

  // 检查GPU是否可用
  useEffect(() => {
    const available = typeof navigator !== 'undefined' && 'gpu' in navigator;
    setGpuAvailable(available);
  }, []);

  // 创建粒子元素
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const currentCount = particlesRef.current.length;

    // 如果粒子数增加，添加新粒子
    if (particleCount > currentCount) {
      const newParticles = particleCount - currentCount;
      for (let i = 0; i < newParticles; i++) {
        const el = document.createElement('div');

        // 使用left/top定位而非transform，避免与motion的transform冲突
        el.style.position = 'absolute';
        el.style.left = '50%';
        el.style.top = '50%';
        el.style.width = '0.75rem';
        el.style.height = '0.75rem';
        el.style.willChange = 'transform';
        el.style.mixBlendMode = 'plus-lighter';
        el.style.zIndex = '2';
        el.style.backgroundColor = '#a369ff';
        container.appendChild(el);

        particlesRef.current.push({ el, control: null });
      }
    }
    // 如果粒子数减少，移除粒子
    else if (particleCount < currentCount) {
      const toRemove = currentCount - particleCount;
      for (let i = 0; i < toRemove; i++) {
        const p = particlesRef.current.pop();
        if (p) {
          p.control?.stop();
          p.el.remove();
        }
      }
    }

    setIsReady(true);

    return () => {
      particlesRef.current.forEach((p) => p.control?.stop());
      particlesRef.current.forEach((p) => p.el.remove());
      particlesRef.current = [];
      setIsReady(false);
    };
  }, [particleCount]);

  // 启动/重启动画
  useEffect(() => {
    if (!isReady || !isPlaying) return;

    const speedFactor = 60 / Math.max(1, fps);
    const duration = BASE_DURATION_MS * speedFactor;

    particlesRef.current.forEach((p) => {
      p.control?.stop();

      const offsetX = randomInRange(-160, 160);
      const offsetY = randomInRange(-90, 90);
      const delay = Math.random() * DELAY_MAX_MS;

      p.control = motion(p.el)
        .mark([
          {
            to: { x: 0, y: 0, scale: 0 },
            at: 0,
          },
          {
            to: {
              // x: offsetX / 2,
              // y: offsetY / 2,
              scale: 1,
            },
            at: duration,
          },
          {
            to: {
              x: offsetX,
              y: offsetY,
              scale: 0,
            },
            at: duration * 2,
          },
        ])
        .animate({
          repeat: Infinity,
          delay,
        });
    });
  }, [fps, isReady, isPlaying]);

  const handlePlay = () => {
    if (!isReady) return;

    if (isPlaying) {
      // 重启：先停止再开始
      setIsPlaying(false);
      setTimeout(() => setIsPlaying(true), 0);
    } else {
      // 首次播放
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    // 停止所有动画
    particlesRef.current.forEach((p) => {
      p.control?.stop();
      p.control = null;
    });
  };

  const handleAddParticles = () => {
    if (particleCount < MAX_PARTICLE_COUNT) {
      setParticleCount(Math.min(particleCount + 50, MAX_PARTICLE_COUNT));
    }
  };

  const handleRemoveParticles = () => {
    if (particleCount > 0) {
      setParticleCount(Math.max(particleCount - 50, 0));
    }
  };

  const handleGpuToggle = () => {
    setGpuEnabled(!gpuEnabled);
  };

  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Particles</p>
            <h1 className="text-2xl font-semibold text-slate-50">
              FPS-controlled particle drift with GPU
            </h1>
            <p className="max-w-2xl text-slate-300">
              Dynamically add/remove particles and animate them with Motion. Adjust FPS to scale
              animation speed, or toggle GPU acceleration. DOM particles with optional WebGPU batch
              processing for large-scale scenarios.
            </p>
          </div>
          <Link to="/" className={linkButtonClass('ghost')}>
            Back to hub
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Controls</CardTitle>
            <CardDescription>Adjust FPS, particle count, and GPU settings.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                FPS Control ({fps} fps)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={240}
                  step={1}
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="w-64"
                />
                <Button variant="ghost" size="sm" onClick={() => setFps(60)}>
                  Reset
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Higher FPS → shorter timelines (baseline 60fps = {BASE_DURATION_MS}ms per leg).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Particle Count ({particleCount} / {MAX_PARTICLE_COUNT})
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={MAX_PARTICLE_COUNT}
                  step={10}
                  value={particleCount}
                  onChange={(e) => setParticleCount(Number(e.target.value))}
                  className="w-64"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveParticles}
                  disabled={particleCount === 0}
                >
                  -50
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddParticles}
                  disabled={particleCount >= MAX_PARTICLE_COUNT}
                >
                  +50
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">GPU Settings</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={gpuEnabled}
                    onChange={handleGpuToggle}
                    disabled={!gpuAvailable}
                    className="rounded"
                  />
                  <span className="text-sm text-slate-300">
                    {gpuEnabled ? 'GPU Enabled' : 'GPU Disabled'}
                  </span>
                </label>
                <span className="text-xs text-slate-400">
                  {gpuAvailable ? '✓ GPU available' : '✗ GPU not available'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handlePlay} disabled={!isReady}>
                {isPlaying ? 'Restart' : 'Play'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStop}
                disabled={!isReady || !isPlaying}
              >
                Stop
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Particle field</CardTitle>
            <CardDescription>
              Dynamically sized particle system with FPS-controlled animation and optional GPU
              acceleration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              ref={containerRef}
              className="relative h-[420px] overflow-hidden rounded-xl border border-slate-800/60 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.08),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(248,113,113,0.08),transparent_28%),radial-gradient(circle_at_50%_80%,rgba(186,230,253,0.08),transparent_32%)]" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
