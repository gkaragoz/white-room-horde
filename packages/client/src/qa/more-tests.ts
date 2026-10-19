import * as THREE from 'three';
import { Buttons, MAPS } from '@wrh/shared';
import { addPlayer, createWorld } from '@wrh/sim';
import { DEFAULT_BINDINGS, Input } from '../input';
import { WEAPON_UNLOCK, isUnlocked, loadProfile, recordGame, saveProfile } from '../profile';
import { ArenaView } from '../render/arena';
import { Character } from '../render/character';
import { PlayerAnimator } from '../render/playerAnim';
import type { QaTest } from './tests';

const f = (n: number, d = 2): number => +n.toFixed(d);

export const moreTests: QaTest[] = [
  {
    id: 'player.animations',
    title: 'Player animation states: reload, throw, downed, revive, get up and the aim clips resolve to real clips',
    async run() {
      const w = createWorld(2);
      w.waveTick = 1e9;
      w.countMul = 0;
      addPlayer(w, 0, 0, 0, 'ar');
      addPlayer(w, 1, 1, 0);
      const c = await Character.createPlayer({ color: '#1FA2FF', weapon: 'weapon_ar', accessory: 'acc_cap' });
      const anim = new PlayerAnimator();
      const problems: string[] = [];
      const opts = { firing: false, moveAngle: 0, facing: 0 };
      let now = 0;
      const expectClip = (label: string, want: string, aim: boolean | null = null): void => {
        const got = anim.apply(w, 0, c, now, opts);
        if (c.currentName !== want) problems.push(`${label}: played ${c.currentName}, expected ${want}`);
        if (aim !== null && got !== aim) problems.push(`${label}: aim IK ${got}, expected ${aim}`);
      };
      expectClip('idle', 'aim_idle', true);
      w.pMoving[0] = 1;
      expectClip('running', 'run_forward', true);
      w.pMoving[0] = 0;
      w.pReload[0] = 1;
      expectClip('reload standing', 'reload_stand', false);
      w.pMoving[0] = 1;
      expectClip('reload running', 'reload_run', false);
      w.pReload[0] = 0;
      w.pMoving[0] = 0;
      anim.trigger(0, 'throw', 0.8, now);
      expectClip('throw', 'throw', false);
      now = 1;
      expectClip('after the throw', 'aim_idle', true);
      anim.trigger(0, 'get_up', 1.2, now);
      expectClip('get up', 'get_up', false);
      now = 3;
      w.pState[0] = 1; // downed
      expectClip('downed', 'down_idle', false);
      w.pRevive[0] = 1;
      expectClip('being revived', 'revive_taker', false);
      w.pRevive[0] = 0;
      w.pState[0] = 0;
      w.pState[1] = 1; // the neighbour is downed and being revived
      w.pRevive[1] = 1;
      expectClip('reviving a teammate', 'revive_giver', false);
      w.pState[0] = 2;
      expectClip('dead', 'death');
      for (const clip of ['throw', 'throw_run', 'reload_stand', 'reload_run', 'revive_giver', 'revive_taker', 'get_up', 'hit_down', 'down_idle', 'death']) {
        if (!c.has(clip)) problems.push(`clip ${clip} missing from the player library`);
        else if (c.clipDuration(clip) < 0.3) problems.push(`clip ${clip} is only ${f(c.clipDuration(clip))} s long`);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'all player states pick the right Mixamo clip' };
    },
  },
  {
    id: 'arena.maps',
    title: 'Every arena layout builds its cover and has its own colour theme',
    async run() {
      const view = new ArenaView();
      const problems: string[] = [];
      const colours = new Set<string>();
      for (let m = 0; m < MAPS.length; m++) {
        view.setMap(m);
        if (view.boxCount !== MAPS[m]!.boxes.length) problems.push(`map ${m}: ${view.boxCount} boxes drawn, ${MAPS[m]!.boxes.length} defined`);
        const first = view.group.children[0] as THREE.Mesh;
        colours.add((first.material as THREE.MeshStandardMaterial[])[0]!.color.getHexString());
      }
      if (colours.size < MAPS.length) problems.push('two arenas share the same cover colour');
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : `${MAPS.length} layouts, ${colours.size} colour themes` };
    },
  },
  {
    id: 'input.devices',
    title: 'Controls: key rebinding, gamepad sticks and buttons and touch sticks all produce the right input',
    async run() {
      const problems: string[] = [];
      const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
      camera.position.set(0, 10, 0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      const input = new Input(document.createElement('div'), camera);
      input.resetBindings();
      input.debugKeys(['KeyW']);
      const up = input.sample(0, 0).input;
      if (!(Math.hypot(up.moveX, up.moveY) > 100)) problems.push(`W produced move ${up.moveX},${up.moveY}`);
      // rebinding: reload moves to T, R stops working
      input.setBinding('reload', 'KeyT');
      input.debugKeys(['KeyT']);
      if (!(input.sample(0, 0).input.buttons & Buttons.Reload)) problems.push('rebound reload key does nothing');
      input.debugKeys(['KeyR']);
      if (input.sample(0, 0).input.buttons & Buttons.Reload) problems.push('old reload key still works');
      input.setBinding('dash', 'KeyT'); // a key belongs to one action only
      if (input.bindings.reload.includes('KeyT')) problems.push('a key is bound to two actions');
      input.resetBindings();
      if (input.bindings.reload[0] !== DEFAULT_BINDINGS.reload[0]) problems.push('reset did not restore the defaults');
      // gamepad
      const realPads = navigator.getGamepads?.bind(navigator);
      const fake = (axes: number[], pressed: number[]): Gamepad =>
        ({ connected: true, mapping: 'standard', axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), touched: false, value: pressed.includes(i) ? 1 : 0 })) }) as unknown as Gamepad;
      const setPad = (pad: Gamepad): void => {
        Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
      };
      try {
        input.debugKeys([]);
        setPad(fake([0, 0, 1, 0], [7, 0, 1, 6]));
        const p = input.sample(0, 0);
        if (!(p.input.buttons & Buttons.Fire)) problems.push('gamepad RT does not fire');
        if (!(p.input.buttons & Buttons.Dash)) problems.push('gamepad A does not dash');
        if (!(p.input.buttons & Buttons.Reload)) problems.push('gamepad B does not reload');
        if (!(p.input.buttons & Buttons.Grenade)) problems.push('gamepad LT does not throw a grenade');
        // right stick pushed right on screen aims along screen right (30 deg in sim space)
        const err = Math.atan2(Math.sin(p.aimAngle - (30 * Math.PI) / 180), Math.cos(p.aimAngle - (30 * Math.PI) / 180));
        if (Math.abs(err) > 0.05) problems.push(`right stick aim ${f(p.aimAngle)} rad is not screen right`);
        setPad(fake([0, -1, 0, 0], []));
        const mv = input.sample(0, 0).input;
        if (!(Math.hypot(mv.moveX, mv.moveY) > 100)) problems.push('left stick up does not move');
        setPad(fake([0.1, 0.1, 0.05, 0], []));
        const idle = input.sample(0, 0).input;
        if (idle.moveX !== 0 || idle.moveY !== 0) problems.push('stick drift moves the player');
      } finally {
        Object.defineProperty(navigator, 'getGamepads', { value: realPads, configurable: true });
      }
      // touch sticks
      input.debugTouch({ x: 0, y: -1 }, { x: 1, y: 0 });
      const t = input.sample(0, 0);
      if (!(Math.hypot(t.input.moveX, t.input.moveY) > 100)) problems.push('touch move stick does nothing');
      if (!(t.input.buttons & Buttons.Fire)) problems.push('pulling the touch aim stick out does not fire');
      input.debugTouch(null, { x: 0.3, y: 0 });
      if (input.sample(0, 0).input.buttons & Buttons.Fire) problems.push('a short touch aim pull fires');
      input.debugTouch(null, null);
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'keyboard, rebinding, gamepad and touch all behave' };
    },
  },
  {
    id: 'profile.unlocks',
    title: 'Progress is remembered: best wave, record flags and weapon unlocks',
    async run() {
      const saved = loadProfile();
      const problems: string[] = [];
      try {
        saveProfile({ ...saved, bestWave: 1, bestKills: 0, games: 0, totalKills: 0 });
        if (isUnlocked('sniper')) problems.push('sniper is unlocked on a fresh profile');
        if (!isUnlocked('pistol')) problems.push('pistol is locked');
        const r1 = recordGame(8, 120);
        if (!r1.newWave || !r1.newKills) problems.push('first run should set both records');
        for (const w of ['shotgun', 'hmg', 'sniper'] as const) if (!r1.unlocked.includes(w)) problems.push(`wave 8 should unlock ${w}`);
        if (r1.unlocked.includes('minigun')) problems.push('minigun unlocked too early');
        const r2 = recordGame(5, 50);
        if (r2.newWave || r2.newKills || r2.unlocked.length) problems.push('a worse run changed the records');
        if (loadProfile().bestWave !== 8 || loadProfile().games !== 2) problems.push('profile did not persist');
        const r3 = recordGame(WEAPON_UNLOCK.minigun, 10);
        if (!r3.unlocked.includes('minigun')) problems.push('minigun did not unlock at its wave');
      } finally {
        saveProfile(saved);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'records and unlocks behave' };
    },
  },
];
