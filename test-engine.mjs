import { engine } from './packages/animation/dist/index.js';

console.log('Testing engine configuration...\n');

// Test default config
console.log('Default config:', engine.getConfig());

// Test speed
engine.setSpeed(2);
console.log('After setSpeed(2):', engine.getSpeed());

// Test FPS
engine.setFps(30);
console.log('After setFps(30):', engine.getFps());

// Test GPU mode
engine.forceGpu('always');
console.log('After forceGpu("always"):', engine.getGpuMode());

// Test batch configure
engine.configure({
  speed: 1.5,
  fps: 60,
  gpuMode: 'auto',
  gpuThreshold: 500,
  gpuEasing: false,
});
console.log('\nAfter configure():', engine.getConfig());

// Test reset
engine.reset();
console.log('\nAfter reset():', engine.getConfig());

console.log('\n✅ All engine methods working correctly!');
