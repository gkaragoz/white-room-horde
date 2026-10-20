import * as THREE from 'three';
import { Buttons, type PlayerInput } from '@wrh/shared';
import { SCREEN_RIGHT, SCREEN_UP, encodeAim, keysToMove } from './controls';

export type Action = 'up' | 'down' | 'left' | 'right' | 'fire' | 'grenade' | 'revive' | 'reload' | 'dash' | 'special' | 'card1' | 'card2' | 'card3' | 'switch' | 'hostpause' | 'pause';
export const ACTIONS: readonly Action[] = ['up', 'down', 'left', 'right', 'fire', 'grenade', 'revive', 'reload', 'dash', 'special', 'switch', 'hostpause', 'card1', 'card2', 'card3', 'pause'];

export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  fire: ['Space'],
  grenade: ['KeyG'],
  revive: ['KeyE'],
  reload: ['KeyR'],
  dash: ['ShiftLeft', 'ShiftRight'],
  special: ['KeyF'],
  switch: ['KeyQ'],
  card1: ['Digit1'],
  card2: ['Digit2'],
  card3: ['Digit3'],
  hostpause: ['KeyP'],
  pause: ['Escape'],
};

const KEY_STORE = 'wrh.keys';

export function loadBindings(): Bindings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY_STORE) ?? '{}') as Partial<Bindings>;
    const out = {} as Bindings;
    for (const a of ACTIONS) out[a] = Array.isArray(saved[a]) && saved[a]!.length ? saved[a]!.slice(0, 3) : [...DEFAULT_BINDINGS[a]];
    return out;
  } catch {
    return structuredClone(DEFAULT_BINDINGS);
  }
}

/** "KeyW" -> "W", "ArrowUp" -> "Up", "ShiftLeft" -> "Left Shift". */
export function keyLabel(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace(/^(Shift|Control|Alt)(Left|Right)$/, '$2 $1').replace('Space', 'Space');
}

const DEADZONE = 0.22;

/** Pads report y down; the game wants screen-up positive. Returns the deadzone-scaled stick or null when idle. */
function stick(x: number, y: number): { x: number; y: number } | null {
  const len = Math.hypot(x, y);
  if (len < DEADZONE) return null;
  const k = Math.min(1, (len - DEADZONE) / (1 - DEADZONE)) / len;
  return { x: x * k, y: -y * k };
}

/** Screen-space (right, up) vector to sim space. */
function screenToSim(x: number, y: number): { x: number; y: number } {
  return { x: x * SCREEN_RIGHT.x + y * SCREEN_UP.x, y: x * SCREEN_RIGHT.y + y * SCREEN_UP.y };
}

interface TouchStick {
  id: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

/**
 * Keyboard + mouse, gamepad and touch sampling, quantised to the wire format used by the sim (PlayerInput).
 * The newest device wins for aiming, so swapping between mouse and pad just works.
 */
export class Input {
  private readonly keys = new Set<string>();
  private mouse = new THREE.Vector2(0, 0);
  private mouseDown = false;
  private rightDown = false;
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  private queued = 0;
  private lastAim = 0;
  private aimDevice: 'mouse' | 'pad' | 'touch' = 'mouse';
  private padPause = false;
  private padPausePrev = false;
  bindings: Bindings = loadBindings();
  /** Disabled while a menu is open so typing does not move the character. */
  enabled = true;
  private capture: { action: Action; done: (code: string | null) => void } | null = null;
  private touchMove: TouchStick | null = null;
  private touchAim: TouchStick | null = null;
  private touchButtons = 0;
  private touchSwitch = false;
  /** Weapon choice of the last key press (1-9 = rank, 14 = next), sent once with the next sample. */
  private queuedWeapon = 0;
  /** Select a weapon by the key number it has in the list (1-9), or 14 for the next one (the in-game list is clickable). */
  queueWeapon(rank: number): void {
    if (this.enabled) this.queuedWeapon = rank;
  }
  /** The shot direction of the last sample, and whether a stick (pad, phone) is aiming. */
  lastShot = 0;
  stickAiming = false;
  private padSwitchHeld = false;
  private touchSwitchHeld = false;
  private touchLayer: HTMLElement | null = null;

  constructor(
    private readonly dom: HTMLElement,
    private readonly camera: THREE.Camera,
  ) {
    window.addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        e.stopImmediatePropagation(); // the pause key listener must not also see this press
        const cap = this.capture;
        this.capture = null;
        cap.done(e.code === 'Escape' ? null : e.code);
        return;
      }
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return; // typing in a text box
      if (!e.repeat && this.enabled) {
        const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (digit) this.queuedWeapon = Number(digit[1]);
        else if (this.bindings.switch.includes(e.code)) this.queuedWeapon = 14;
      }
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.aimDevice = 'mouse';
      const r = dom.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    });
    dom.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.aimDevice = 'mouse';
      if (e.button === 2) this.rightDown = true;
      else this.mouseDown = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 2) this.rightDown = false;
      else this.mouseDown = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    const params = new URLSearchParams(location.search);
    if (params.get('touch') === '1' || (window.matchMedia?.('(pointer: coarse)').matches && params.get('touch') !== '0')) this.buildTouchControls();
  }

  /** A one-shot button press (card click) sent with the next sample. */
  queueButton(mask: number): void {
    this.queued |= mask;
  }

  /** Wait for the next key press and report it (Escape cancels with null). Used by the key rebinding screen. */
  captureKey(action: Action, done: (code: string | null) => void): void {
    this.capture = { action, done };
  }

  setBinding(action: Action, code: string): void {
    // a key belongs to one action: take it away from any other
    for (const a of ACTIONS) if (a !== action) this.bindings[a] = this.bindings[a].filter((c) => c !== code);
    for (const a of ACTIONS) if (this.bindings[a].length === 0 && a !== action) this.bindings[a] = [...DEFAULT_BINDINGS[a]].filter((c) => !this.isBound(c, a));
    this.bindings[action] = [code];
    this.persistBindings();
  }

  private isBound(code: string, except: Action): boolean {
    return ACTIONS.some((a) => a !== except && this.bindings[a].includes(code));
  }

  resetBindings(): void {
    this.bindings = structuredClone(DEFAULT_BINDINGS);
    this.persistBindings();
  }

  private persistBindings(): void {
    try {
      localStorage.setItem(KEY_STORE, JSON.stringify(this.bindings));
    } catch {
      /* ignore */
    }
  }

  private held(action: Action): boolean {
    return this.bindings[action].some((c) => this.keys.has(c));
  }

  private hostPausePrev = false;

  /** True once per press of the host-pause key (P). */
  consumeHostPause(): boolean {
    const now = this.held('hostpause');
    const hit = now && !this.hostPausePrev;
    this.hostPausePrev = now;
    return hit;
  }

  /** True once per press of the pause key or the pad's Start button. */
  consumePause(): boolean {
    const pad = this.padPause && !this.padPausePrev;
    this.padPausePrev = this.padPause;
    return pad;
  }

  /** Distance (sim units) a grenade thrown now would fly: to the cursor with the mouse, the normal range otherwise. */
  grenadeDistance(playerX: number, playerY: number, normal: number, min: number, max: number): number {
    if (this.aimDevice !== 'mouse' || this.touchAim) return normal;
    const a = this.aimPoint();
    return Math.max(min, Math.min(max, Math.hypot(a.x - playerX, a.y - playerY)));
  }

  /** The cursor points at the floor of the level the character stands on (a deck is above the ground). */
  setPlaneHeight(h: number): void {
    this.plane.constant = -h;
  }

  /** Aim point on the floor in sim coordinates. */
  aimPoint(): { x: number; y: number } {
    this.ray.setFromCamera(this.mouse, this.camera);
    this.ray.ray.intersectPlane(this.plane, this.hit);
    return { x: this.hit.x, y: -this.hit.z };
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    return null;
  }

  sample(playerX: number, playerY: number, autoAim: number | null = null, autoMode = false): { input: PlayerInput; moveAngle: number; aimAngle: number } {
    const dx = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    const dy = (this.held('up') ? 1 : 0) - (this.held('down') ? 1 : 0);
    let m = keysToMove(dx, dy);
    let buttons = 0;
    if (this.enabled && (this.mouseDown || this.held('fire'))) buttons |= Buttons.Fire;
    if (this.enabled && (this.rightDown || this.held('grenade'))) buttons |= Buttons.Grenade;
    if (this.held('revive')) buttons |= Buttons.Revive;
    if (this.held('reload')) buttons |= Buttons.Reload;
    if (this.held('dash')) buttons |= Buttons.Dash;
    if (this.held('special')) buttons |= Buttons.Special;
    // weapon choice: 1-9 and Q (next) are one-shot presses queued by the key handler; the pad's Y and the touch button too
    const padSwitch = !!this.pad()?.buttons[3]?.pressed;
    if (padSwitch && !this.padSwitchHeld) this.queuedWeapon = 14;
    this.padSwitchHeld = padSwitch;
    if (this.touchSwitch && !this.touchSwitchHeld) this.queuedWeapon = 14;
    this.touchSwitchHeld = this.touchSwitch;
    if (this.held('card1')) buttons |= Buttons.Card1;
    if (this.held('card2')) buttons |= Buttons.Card2;
    if (this.held('card3')) buttons |= Buttons.Card3;

    // gamepad
    const pad = this.pad();
    let padAim: { x: number; y: number } | null = null;
    if (pad) {
      const left = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
      if (left) {
        const s = screenToSim(left.x, left.y);
        const len = Math.hypot(s.x, s.y);
        m = len > 1 ? { x: s.x / len, y: s.y / len } : s;
      }
      const right = stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
      if (right) {
        padAim = screenToSim(right.x, right.y);
        this.aimDevice = 'pad';
      }
      const b = (i: number): boolean => !!pad.buttons[i]?.pressed;
      if (this.enabled && (b(7) || b(5))) {
        buttons |= Buttons.Fire;
        this.aimDevice = this.aimDevice === 'mouse' ? 'pad' : this.aimDevice;
      }
      if (this.enabled && (b(6) || b(4))) buttons |= Buttons.Grenade;
      if (b(2)) buttons |= Buttons.Revive;
      if (b(1)) buttons |= Buttons.Reload;
      if (b(0)) buttons |= Buttons.Dash;
      if (b(11)) buttons |= Buttons.Special;
      if (b(14)) buttons |= Buttons.Card1;
      if (b(12)) buttons |= Buttons.Card2;
      if (b(15)) buttons |= Buttons.Card3;
      this.padPause = b(9);
    } else {
      this.padPause = false;
    }

    // touch sticks: the left one moves, the right one aims and fires when pulled out
    let touchAim: { x: number; y: number } | null = null;
    if (this.touchMove) {
      const s = screenToSim(this.touchMove.x, -this.touchMove.y);
      const len = Math.hypot(s.x, s.y);
      m = len > 1 ? { x: s.x / len, y: s.y / len } : s;
    }
    if (this.touchAim) {
      const len = Math.hypot(this.touchAim.x, this.touchAim.y);
      if (len > 0.15) {
        touchAim = screenToSim(this.touchAim.x, -this.touchAim.y);
        this.aimDevice = 'touch';
        if (this.enabled && len > 0.55) buttons |= Buttons.Fire;
      }
    }
    buttons |= this.touchButtons;

    let aimAngle: number;
    let aimDist = 0;
    if (touchAim) aimAngle = Math.atan2(touchAim.y, touchAim.x);
    else if (padAim) aimAngle = Math.atan2(padAim.y, padAim.x);
    else if (this.aimDevice === 'mouse') {
      const aim = this.aimPoint();
      aimAngle = Math.atan2(aim.y - playerY, aim.x - playerX);
      aimDist = Math.min(255, Math.round(Math.hypot(aim.x - playerX, aim.y - playerY) * 4));
    } else aimAngle = this.lastAim;
    this.lastAim = aimAngle;

    // Auto aim: the character and the bullets follow the target the caller found (`autoAim`); with nothing to shoot at they
    // follow the way the character walks, or stay as they were. The cursor never turns the character: it only steers the
    // grenades (gAim, aimDist). A stick on a pad or a phone is an explicit aim and wins.
    this.stickAiming = !!(touchAim || padAim);
    let shotAngle = aimAngle;
    if (autoMode && !this.stickAiming) {
      if (autoAim !== null) shotAngle = autoAim;
      else if (Math.hypot(m.x, m.y) > 0.2) shotAngle = Math.atan2(m.y, m.x);
      else shotAngle = this.lastShot;
    }
    this.lastShot = shotAngle;
    const input: PlayerInput = {
      moveX: Math.round(m.x * 127),
      moveY: Math.round(m.y * 127),
      aim: encodeAim(shotAngle),
      buttons: buttons | this.queued,
      aimDist,
      wsel: this.queuedWeapon,
      gAim: encodeAim(aimAngle),
    };
    this.queued = 0;
    this.queuedWeapon = 0;
    return { input, moveAngle: Math.atan2(m.y, m.x), aimAngle: shotAngle };
  }

  /** Two virtual sticks and four round buttons for phones and tablets. */
  private buildTouchControls(): void {
    const layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;z-index:5;touch-action:none;pointer-events:none;-webkit-user-select:none;user-select:none';
    document.body.appendChild(layer);
    this.touchLayer = layer;
    const zone = (side: 'left' | 'right'): HTMLElement => {
      const z = document.createElement('div');
      z.style.cssText = `position:absolute;${side}:0;bottom:0;width:46%;height:70%;pointer-events:auto;touch-action:none`;
      layer.appendChild(z);
      return z;
    };
    const knob = (): HTMLElement => {
      const k = document.createElement('div');
      k.style.cssText = 'position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;border:3px solid rgba(60,45,20,.45);background:rgba(250,244,232,.35);display:none;pointer-events:none';
      const dot = document.createElement('div');
      dot.style.cssText = 'position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(31,162,255,.8)';
      k.appendChild(dot);
      layer.appendChild(k);
      return k;
    };
    const attach = (z: HTMLElement, k: HTMLElement, set: (s: TouchStick | null) => void, get: () => TouchStick | null): void => {
      const R = 55;
      const place = (cx: number, cy: number, x: number, y: number): void => {
        k.style.left = `${cx}px`;
        k.style.top = `${cy}px`;
        (k.firstElementChild as HTMLElement).style.transform = `translate(${x * R}px, ${y * R}px)`;
      };
      z.addEventListener('pointerdown', (e) => {
        if (get()) return;
        z.setPointerCapture(e.pointerId);
        set({ id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
        k.style.display = 'block';
        place(e.clientX, e.clientY, 0, 0);
        this.aimDevice = 'touch';
      });
      z.addEventListener('pointermove', (e) => {
        const s = get();
        if (!s || s.id !== e.pointerId) return;
        let x = (e.clientX - s.ox) / R;
        let y = (e.clientY - s.oy) / R;
        const len = Math.hypot(x, y);
        if (len > 1) {
          x /= len;
          y /= len;
        }
        s.x = x;
        s.y = y;
        place(s.ox, s.oy, x, y);
      });
      const end = (e: PointerEvent): void => {
        const s = get();
        if (!s || s.id !== e.pointerId) return;
        set(null);
        k.style.display = 'none';
      };
      z.addEventListener('pointerup', end);
      z.addEventListener('pointercancel', end);
    };
    attach(zone('left'), knob(), (s) => (this.touchMove = s), () => this.touchMove);
    attach(zone('right'), knob(), (s) => (this.touchAim = s), () => this.touchAim);
    const button = (label: string, bit: number, right: number, bottom: number): void => {
      const b = document.createElement('div');
      b.textContent = label;
      b.style.cssText = `position:absolute;right:${right}px;bottom:${bottom}px;width:58px;height:58px;border-radius:50%;background:rgba(250,244,232,.75);border:3px solid #cdbfa5;font:700 24px system-ui;display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none`;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.touchButtons |= bit;
        b.style.background = 'rgba(31,162,255,.6)';
      });
      const up = (): void => {
        this.touchButtons &= ~bit;
        b.style.background = 'rgba(250,244,232,.75)';
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      layer.appendChild(b);
    };
    button('\u{1F4A3}', Buttons.Grenade, 18, 200);
    button('⚡', Buttons.Dash, 90, 200);
    button('★', Buttons.Special, 162, 200);
    button('↻', Buttons.Reload, 18, 130);
    button('+', Buttons.Revive, 90, 130);
    const sw = document.createElement('div');
    sw.textContent = '\u21C4';
    sw.style.cssText = 'position:absolute;right:162px;bottom:130px;width:60px;height:60px;border-radius:50%;background:rgba(250,244,232,.75);border:2px solid #cdbfa5;display:flex;align-items:center;justify-content:center;font-size:26px;color:#3a352d;touch-action:none;user-select:none';
    sw.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touchSwitch = true;
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) sw.addEventListener(ev, () => (this.touchSwitch = false));
    layer.appendChild(sw);
  }

  get hasTouchControls(): boolean {
    return this.touchLayer !== null;
  }

  /** QA: drive the touch sticks without a touchscreen. */
  debugTouch(move: { x: number; y: number } | null, aim: { x: number; y: number } | null): void {
    this.touchMove = move ? { id: 1, ox: 0, oy: 0, x: move.x, y: move.y } : null;
    this.touchAim = aim ? { id: 2, ox: 0, oy: 0, x: aim.x, y: aim.y } : null;
  }

  /** QA: pretend these keys are held. */
  debugKeys(codes: string[]): void {
    this.keys.clear();
    for (const c of codes) this.keys.add(c);
  }
}
