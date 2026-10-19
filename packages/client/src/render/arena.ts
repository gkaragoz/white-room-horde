import * as THREE from 'three';
import { MAPS } from '@wrh/shared';

/** Cover colours per layout so the four arenas read differently at a glance. */
const THEMES: { side: string; top: string; rim: string }[] = [
  { side: '#c8b393', top: '#e0d2b4', rim: '#8b7a5e' }, // warehouse: cardboard tan
  { side: '#a9b0bd', top: '#cfd5df', rim: '#6c7482' }, // courtyard: stone
  { side: '#c98f7c', top: '#e3b8a6', rim: '#8a5a4a' }, // corridors: brick
  { side: '#9fb27c', top: '#c5d4a3', rim: '#667a49' }, // field: hedge green
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
