export type Backend = 'webgl' | 'webgpu';

/** True when the browser exposes a WebGPU adapter. */
export async function webgpuSupported(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

/** The renderer the player asked for, falling back to WebGL2 when WebGPU is not available. */
export async function pickBackend(want: Backend): Promise<Backend> {
  return want === 'webgpu' && (await webgpuSupported()) ? 'webgpu' : 'webgl';
}
