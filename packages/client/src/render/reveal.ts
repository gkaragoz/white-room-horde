import * as THREE from 'three';

/**
 * Dissolve / materialise effect for the floors of the climb. One set of uniforms is shared by every patched material, and
 * the floor a fragment belongs to is told by its height: below `split` it is the floor being left (it dissolves outward
 * from the party, with a glowing edge), above it the floor being reached (it appears the same way). With the radii at
 * their idle values nothing is discarded, so normal rendering is untouched. WebGPU's node materials ignore this patch
 * (the floors then simply swap at the end of the flight).
 */
export const REVEAL = {
  /** x, y, z of the party centre and the dissolve radius of the old floor (<= 0: off). */
  old: new THREE.Uniform(new THREE.Vector4(0, 0, 0, -1)),
  /** Same for the new floor: radius < 0 means fully visible, 0 means hidden. */
  next: new THREE.Uniform(new THREE.Vector4(0, 0, 0, -1)),
  split: new THREE.Uniform(9),
  glow: new THREE.Uniform(new THREE.Color('#5fd2ff')),
};

/** Idle state: everything visible. */
export function revealOff(): void {
  REVEAL.old.value.w = -1;
  REVEAL.next.value.w = -1;
}

const NOISE = /* glsl */ `
float rvHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rvNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rvHash(i), rvHash(i + vec2(1.0, 0.0)), f.x), mix(rvHash(i + vec2(0.0, 1.0)), rvHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

const FRAGMENT = /* glsl */ `
float rvEdge = 0.0;
{
  float rvN = rvNoise(vRvWorld.xz * 0.45) * 3.2 + rvNoise(vRvWorld.xz * 1.7) * 0.8;
  if (vRvWorld.y < uRvSplit) {
    if (uRvOld.w > 0.0) {
      float t = uRvOld.w - distance(vRvWorld.xz, uRvOld.xz) + rvN;
      if (t > 0.0) discard;
      rvEdge = smoothstep(-1.5, 0.0, t);
    }
  } else if (uRvNext.w >= 0.0) {
    float t = distance(vRvWorld.xz, uRvNext.xz) + rvN - uRvNext.w;
    if (t > 0.0) discard;
    rvEdge = smoothstep(-1.5, 0.0, t);
  }
}
`;

/** Make a standard material take part in the reveal. Safe to call more than once. */
export function patchReveal(material: THREE.Material): void {
  const m = material as THREE.MeshStandardMaterial & { userData: { rv?: boolean } };
  if (m.userData.rv || !('isMeshStandardMaterial' in m)) return;
  m.userData.rv = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.uRvOld = REVEAL.old;
    shader.uniforms.uRvNext = REVEAL.next;
    shader.uniforms.uRvSplit = REVEAL.split;
    shader.uniforms.uRvGlow = REVEAL.glow;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRvWorld;').replace('#include <project_vertex>', '#include <project_vertex>\nvRvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRvWorld;\nuniform vec4 uRvOld;\nuniform vec4 uRvNext;\nuniform float uRvSplit;\nuniform vec3 uRvGlow;\n${NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAGMENT}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRvGlow * rvEdge * 2.2;');
  };
  m.customProgramCacheKey = () => `${m.type}-rv`;
  m.needsUpdate = true;
}

/** Patch every standard material under an object. */
export function patchRevealTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const x of Array.isArray(mat) ? mat : [mat]) patchReveal(x);
  });
}
