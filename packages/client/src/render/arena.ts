import * as THREE from 'three';
import { MAPS } from '@wrh/shared';

/** Cover colours per layout so the four arenas read differently at a glance. */
const THEMES: { side: string; top: string; rim: string }[] = [
  { side: '#7f93ad', top: '#b4c3d6', rim: '#4d5d73' }, // warehouse: blue steel containers
  { side: '#a4a9b2', top: '#d3d7de', rim: '#656b76' }, // courtyard: stone
  { side: '#b27c76', top: '#d9aaa3', rim: '#7a4944' }, // corridors: brick
  { side: '#7ea06a', top: '#aecb97', rim: '#506b40' }, // field: hedge green
];

/** The cover boxes of the current arena layout. Rebuilt when the layout changes. */
export class ArenaView {
  readonly group = new THREE.Group();
  private current = -1;
  private readonly disposables: THREE.Material[] = [];

  setMap(index: number): void {
    if (index === this.current) return;
    this.current = index;
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    for (const m of this.disposables) m.dispose();
    this.disposables.length = 0;
    const t = THEMES[index] ?? THEMES[0]!;
    const side = new THREE.MeshStandardMaterial({ color: t.side, roughness: 0.9, flatShading: true });
    const top = new THREE.MeshStandardMaterial({ color: t.top, roughness: 0.9, flatShading: true });
    const rimMat = new THREE.MeshStandardMaterial({ color: t.rim, roughness: 1, flatShading: true });
    this.disposables.push(side, top, rimMat);
    for (const o of MAPS[index]?.boxes ?? MAPS[0]!.boxes) {
      const h = 1.1;
      const box = new THREE.Mesh(new THREE.BoxGeometry(o.w, h, o.h), [side, side, top, side, side, side]);
      box.position.set(o.x, h / 2, -o.y);
      box.castShadow = true;
      box.receiveShadow = true;
      this.group.add(box);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.1, 0.12, o.h + 0.1), rimMat);
      rim.position.set(o.x, 0.06, -o.y);
      this.group.add(rim);
    }
  }

  get boxCount(): number {
    return this.group.children.length / 2;
  }
}
