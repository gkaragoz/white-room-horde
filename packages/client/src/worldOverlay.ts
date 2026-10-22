import { MAX_PLAYERS } from '@wrh/shared';
import { icon } from './icons';

/**
 * The small pieces the game draws over the world, placed in screen pixels: names over teammates, arrows at the edge for
 * the ones out of view, revive rings, the ammo ring, loot labels, the kill streak and the rising damage numbers. Each
 * keeps its own elements and reuses them from frame to frame. It knows nothing of the menus or the HUD panels.
 */
export class WorldOverlay {
  private readonly tagEls: (HTMLDivElement | null)[] = new Array<HTMLDivElement | null>(MAX_PLAYERS).fill(
    null,
  );
  private arrowEls: HTMLElement[] = [];
  private comboEl: HTMLElement | null = null;
  private ammoEl: HTMLElement | null = null;
  private pickupLabels: HTMLElement[] = [];
  private ringEls: HTMLElement[] = [];
  private floaters = 0;
  private readonly dmgFree: HTMLElement[] = [];

  constructor(private readonly root: HTMLElement) {}

  /** Name label floating over a teammate (screen position in px); `visible` false hides it. */
  /** Arrow on the screen edge pointing at an off-screen teammate (angle in screen space, blinks while they are down). */
  setArrow(
    slot: number,
    name: string,
    color: string,
    px: number,
    py: number,
    angle: number,
    visible: boolean,
    down = false,
  ): void {
    let el = this.arrowEls[slot];
    if (!el) {
      el = document.createElement('div');
      el.className = 'wrh-arrow-off';
      el.innerHTML = '<i></i><span></span>';
      this.root.appendChild(el);
      this.arrowEls[slot] = el;
    }
    el.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.style.setProperty('--c', color);
    el.classList.toggle('down', down);
    (el.firstElementChild as HTMLElement).style.transform = `rotate(${angle}rad)`;
    const label = el.lastElementChild as HTMLElement;
    if (label.textContent !== name) label.textContent = name;
  }

  /** The kill counter on the right while a streak is going (count 0 hides it). */
  setCombo(count: number, label: string): void {
    let el = this.comboEl;
    if (!el) {
      el = document.createElement('div');
      el.className = 'wrh-combo';
      el.innerHTML = '<b></b><small></small>';
      this.root.appendChild(el);
      this.comboEl = el;
    }
    el.style.display = count >= 3 ? 'block' : 'none';
    if (count < 3) return;
    const b = el.firstElementChild as HTMLElement;
    if (b.textContent !== `x${count}`) {
      b.textContent = `x${count}`;
      el.style.transform = 'scale(1.18)';
      setTimeout(() => (el!.style.transform = 'scale(1)'), 80);
    }
    (el.lastElementChild as HTMLElement).textContent = label;
  }

  /** Name tags over the loot lying on the floor (screen positions in pixels). */
  setPickupLabels(items: { px: number; py: number; text: string; color: string }[]): void {
    while (this.pickupLabels.length < items.length) {
      const el = document.createElement('div');
      el.className = 'wrh-plabel';
      this.root.appendChild(el);
      this.pickupLabels.push(el);
    }
    for (let i = 0; i < this.pickupLabels.length; i++) {
      const el = this.pickupLabels[i]!;
      const it = items[i];
      if (!it) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      el.style.display = 'block';
      if (el.textContent !== it.text) el.textContent = it.text;
      el.style.borderColor = it.color;
      el.style.color = it.color;
      el.style.transform = `translate(${Math.round(it.px)}px,${Math.round(it.py)}px) translate(-50%,-100%)`;
    }
  }

  setAmmoRing(
    px: number,
    py: number,
    w: number,
    frac: number,
    text: string,
    visible: boolean,
    reloading: boolean,
  ): void {
    let el = this.ammoEl;
    if (!el) {
      el = document.createElement('div');
      el.className = 'wrh-ammo';
      el.innerHTML = '<i></i><b></b>';
      this.root.appendChild(el);
      this.ammoEl = el;
    }
    el.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.style.width = `${w}px`;
    el.style.height = `${w * 0.52}px`;
    const f = Math.max(0, Math.min(1, frac));
    el.style.setProperty('--f', String(Math.round(f * 100)));
    el.style.setProperty('--c', `hsl(${Math.round(f * 125)} 85% 48%)`);
    el.classList.toggle('reload', reloading);
    el.classList.toggle('low', f <= 0.25 && !reloading);
    const b = el.lastElementChild as HTMLElement;
    if (b.textContent !== text) b.textContent = text;
  }

  /** Round progress ring over a downed player: red = time left before they bleed out, green = the revive in progress. */
  setRing(
    slot: number,
    bleed: number,
    progress: number,
    px: number,
    py: number,
    visible: boolean,
    active: boolean,
  ): void {
    let el = this.ringEls[slot];
    if (!el) {
      el = document.createElement('div');
      el.className = 'wrh-ring';
      el.innerHTML = '<i class="bleed"></i><i class="prog"></i><b>' + icon('go_revives', 20) + '</b>';
      this.root.appendChild(el);
      this.ringEls[slot] = el;
    }
    el.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.style.setProperty('--b', String(Math.round(bleed * 100)));
    el.style.setProperty('--p', String(Math.round(progress * 100)));
    el.classList.toggle('live', active);
  }

  setTag(slot: number, text: string, color: string, px: number, py: number, visible: boolean): void {
    let el = this.tagEls[slot];
    if (!el) {
      el = document.createElement('div');
      el.className = 'wrh-tag';
      this.root.appendChild(el);
      this.tagEls[slot] = el;
    }
    if (el.textContent !== text) el.textContent = text;
    el.style.borderColor = color;
    el.style.display = visible ? 'block' : 'none';
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
  }

  /** A damage number that rises from a screen position and fades out. */
  popNumber(px: number, py: number, text: string, big: boolean, teammate: string | null = null): void {
    if (this.floaters >= 60) return;
    this.floaters++;
    const el = this.dmgFree.pop() ?? document.createElement('div');
    el.className = 'wrh-dmg';
    el.style.display = '';
    el.style.opacity = '';
    el.textContent = text;
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    // your own numbers are white (gold when big); a teammate's are smaller, in their colour and a little see-through
    el.style.fontSize = teammate ? (big ? '16px' : '12px') : big ? '22px' : '15px';
    el.style.color = teammate ?? (big ? '#ffd23a' : '#fff');
    if (teammate) el.style.opacity = '0.85';
    this.root.appendChild(el);
    const dx = (Math.random() - 0.5) * 30;
    const a = el.animate(
      [
        { transform: 'translate(-50%,0) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px),-46px) scale(${big ? 1.25 : 0.9})`, opacity: 0 },
      ],
      { duration: 650, easing: 'ease-out' },
    );
    a.onfinish = () => {
      el.style.display = 'none'; // kept for the next number: no element is created or removed per hit
      this.dmgFree.push(el);
      this.floaters--;
    };
  }
}
