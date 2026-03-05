let _webgpuModule: typeof import('@g-motion/webgpu/internal') | null = null;
let _loadPromise: Promise<typeof import('@g-motion/webgpu/internal') | null> | null = null;

export async function getWebGPUModule(): Promise<typeof import('@g-motion/webgpu/internal') | null> {
  if (_webgpuModule) return _webgpuModule;
  if (_loadPromise) return _loadPromise;

  _loadPromise = import('@g-motion/webgpu/internal')
    .then((mod) => {
      _webgpuModule = mod;
      return mod;
    })
    .catch(() => {
      _webgpuModule = null;
      return null;
    });

  return _loadPromise;
}

export function getWebGPUModuleSync(): typeof import('@g-motion/webgpu/internal') | null {
  return _webgpuModule;
}

export async function preloadWebGPUModule(): Promise<boolean> {
  const mod = await getWebGPUModule();
  return mod !== null;
}

export function __resetWebGPUModuleForTests(): void {
  _webgpuModule = null;
  _loadPromise = null;
}
