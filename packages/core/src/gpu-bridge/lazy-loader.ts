export type GPUModuleFacade = typeof import('@g-motion/webgpu/internal');

let _webgpuModule: GPUModuleFacade | null = null;
let _loadPromise: Promise<GPUModuleFacade | null> | null = null;

export async function getWebGPUModule(): Promise<GPUModuleFacade | null> {
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

export function getWebGPUModuleSync(): GPUModuleFacade | null {
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
