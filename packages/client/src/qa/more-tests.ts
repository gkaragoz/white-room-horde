import * as THREE from 'three';
import { BALANCE, Buttons, FloorPhase, MISC, TeleEffect, TeleShape, ZoneKind, CARD_IDS, CARD_RARITY, ENEMY_TYPES, MAPS, TEAM_CARDS, WEAPON_IDS } from '@wrh/shared';
import { addPlayer, addTelegraph, addZone, createWorld, giveWeapon, spawnEnemy, step } from '@wrh/sim';
import { ACHIEVEMENTS } from '@wrh/shared';
import { achPage, runAchievementsHtml } from '../achUi';
import { applyRun, fmtNum, unreadCount } from '../achievements';
import { emptyStore } from '../profile';
import { AimSolver, TargetLock, pickTarget } from '../autoAim';
import { ACTIONS, DEFAULT_BINDINGS, Input } from '../input';
import { ACCESSORIES, WEAPON_UNLOCK, isUnlocked, loadProfile, recordGame, saveProfile } from '../profile';
import { ArenaView } from '../render/arena';
import { renderControlsSheet, renderSettingsPanel } from '../settingsPanel';
import { Fx } from '../render/fx';
import { GroundFx } from '../render/groundFx';
import { Cinematic } from '../render/cinematic';
import { AmmoRing } from '../render/ammoRing';
import { RagdollPool } from '../render/ragdoll';
import { PowerView, strengthOf } from '../render/power';
import { Character } from '../render/character';
import { Preview } from '../render/preview';
import { PlayerAnimator } from '../render/playerAnim';
import { asset } from '../assets';
import { BANK_FILES, MUSIC_FILES } from '../audio';
import { LANGS, Ui, UI_STRINGS, type Settings } from '../ui';
import { diffCount, grab } from './crowd-tests';
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
        if (view.group.children.length < MAPS[m]!.boxes.length + (MAPS[m]!.decks?.length ?? 0) + (MAPS[m]!.ramps?.length ?? 0)) problems.push(`map ${m}: only ${view.group.children.length} meshes for ${MAPS[m]!.boxes.length} boxes, ${MAPS[m]!.decks?.length ?? 0} decks and ${MAPS[m]!.ramps?.length ?? 0} ramps`);
        const first = view.group.children.find((c) => Array.isArray((c as THREE.Mesh).material)) as THREE.Mesh;
        colours.add((first.material as THREE.MeshStandardMaterial[])[0]!.color.getHexString());
      }
      if (colours.size < MAPS.length) problems.push('two arenas share the same cover colour');
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : `${MAPS.length} layouts, ${colours.size} colour themes` };
    },
  },
  {
    id: 'arena.z-fighting',
    title: 'No surface of a deck, ramp, block or ramp wall flickers: frames a hair apart look the same around every ramp',
    async run(ctx) {
      // Two surfaces in the same plane take turns winning the depth test; moving the camera by a few hundredths of a pixel makes them swap,
      // so the picture changes over whole patches. Normal edges move by less than a pixel and change only a thin line.
      const problems: string[] = [];
      const data: Record<string, number> = {};
      const view = new ArenaView();
      ctx.stage.scene.add(view.group);
      try {
        ctx.stage.setZoom(1);
        ctx.stage.setShadowQuality(0); // geometry first: shadows are judged separately
        for (let m = 0; m < MAPS.length; m++) {
          const def = MAPS[m]!;
          if (!def.ramps?.length) continue;
          view.setMap(m);
          for (const [ri, r] of def.ramps.entries()) {
            for (const [label, f, h] of [['foot', 0.15, 0.1], ['mid', 0.5, 0.5], ['top', 0.85, 0.9]] as const) {
              // camera on the ramp at fraction f of its climb
              const along = r.dir === 0 ? [r.x - r.w / 2 + f * r.w, r.y] : r.dir === 2 ? [r.x + r.w / 2 - f * r.w, r.y] : r.dir === 1 ? [r.x, r.y - r.h / 2 + f * r.h] : [r.x, r.y + r.h / 2 - f * r.h];
              const shots: Uint8Array[] = [];
              for (let k = 0; k < 6; k++) {
                ctx.stage.follow(along[0]! + k * 0.0004, -along[1]! + k * 0.0003, 0, r.z * h);
                ctx.stage.render();
                shots.push(grab(ctx, 420));
              }
              let worst = 0;
              for (let k = 1; k < shots.length; k++) worst = Math.max(worst, diffCount(shots[k - 1]!, shots[k]!, 60));
              data[`${def.id} ramp ${ri} ${label}`] = worst;
              if (worst > 120) problems.push(`${def.id} ramp ${ri} (${label}): ${worst} px flip between frames a hair apart`);
            }
          }
        }
      } finally {
        ctx.stage.scene.remove(view.group);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(String.fromCharCode(10)) : `stable around every ramp (worst frame-to-frame change ${Math.max(...Object.values(data))} px)`, data };
    },
  },
  {
    id: 'arena.layers',
    title: 'Vertical arenas draw their decks and ramps, the roof turns thin over a character walking underneath, and the minimap shows the levels',
    async run(ctx) {
      const problems: string[] = [];
      const view = new ArenaView();
      ctx.stage.scene.add(view.group);
      const empty = new ArenaView();
      empty.setMap(0);
      try {
        ctx.stage.setZoom(1);
        for (let m = 0; m < MAPS.length; m++) {
          const def = MAPS[m]!;
          if (!def.decks?.length) continue;
          view.setMap(m);
          // the camera looks at the deck: a ground character beneath it is hidden, one out in the open is not
          const d = def.decks[0]!;
          ctx.stage.follow(d.x, -d.y, 0, 0);
          ctx.stage.render();
          const under = view.hidesGround(ctx.stage.camera, d.x, d.y);
          const far = view.hidesGround(ctx.stage.camera, d.x, d.y - d.h / 2 - 12);
          if (!under) problems.push(`${def.id}: a character under the deck is not reported as hidden`);
          if (far) problems.push(`${def.id}: a character far from the deck is reported as hidden`);
          view.fadeRoof(0.2, 10);
          view.fadeRoof(0.2, 10);
          if (view.roofOpacity > 0.3) problems.push(`${def.id}: the roof does not fade (${view.roofOpacity})`);
          view.fadeRoof(1, 10);
          view.fadeRoof(1, 10);
          if (view.roofOpacity < 0.95) problems.push(`${def.id}: the roof does not come back (${view.roofOpacity})`);
          // pixels: the deck top is drawn above the ground (its colour differs from the plain floor)
          ctx.stage.follow(d.x, -d.y, 0, 0);
          ctx.stage.render();
          const withDeck = grab(ctx);
          view.setMap(0);
          ctx.stage.render();
          const flat = grab(ctx);
          if (diffCount(withDeck, flat) < 3000) problems.push(`${def.id}: the deck and ramps barely show (${diffCount(withDeck, flat)} px)`);
          view.setMap(m);
        }
      } finally {
        ctx.stage.scene.remove(view.group);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'decks, ramps, roof fade' };
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
      // the weapon is chosen by a click on the list only (queued once); the number keys and Q do nothing to it
      input.resetBindings();
      input.debugKeys([]);
      const press = (code: string, repeat = false): void => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat }));
      };
      input.queueWeapon(5);
      if (input.sample(0, 0).input.wsel !== 5) problems.push('a click on the list does not queue the weapon');
      if (input.sample(0, 0).input.wsel !== 0) problems.push('a weapon choice is sent more than once');
      press('Digit3');
      press('KeyQ');
      if (input.sample(0, 0).input.wsel !== 0) problems.push('a number key or Q still picks a weapon');
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit3' }));
      // auto-aim moves the shot direction but the cursor keeps steering grenades
      input.debugKeys(['Space']); // shooting: auto aim only turns the character while the fire button is down
      const aimed = input.sample(0, 0, () => 1.5, true).input;
      input.debugKeys([]);
      if (Math.abs(aimed.aim - Math.round((1.5 / (Math.PI * 2)) * 65536)) > 2) problems.push('auto aim angle is not sent as the shot direction');
      if (aimed.gAim === aimed.aim) problems.push('the grenade direction followed the auto aim');
      input.resetBindings();
      input.setBinding('reload', 'KeyT');
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
    pure: true,
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
  {
    id: 'ui.strings',
    pure: true,
    title: 'Both languages have every string: same keys, every card, weapon, map, mods and key action',
    async run() {
      const problems: string[] = [];
      const keys = (o: unknown, prefix = ''): string[] =>
        Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
      const en = keys(UI_STRINGS.en).sort();
      const tr = keys(UI_STRINGS.tr).sort();
      for (const k of en) if (!tr.includes(k)) problems.push(`tr is missing ${k}`);
      for (const k of tr) if (!en.includes(k)) problems.push(`en is missing ${k}`);
      const flat = (o: unknown, prefix = ''): Record<string, string> =>
        Object.fromEntries(Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(flat(v, `${prefix}${k}.`)) : [[`${prefix}${k}`, JSON.stringify(v)] as [string, string]])));
      const enFlat = flat(UI_STRINGS.en);
      for (const lang of ['tr', 'de', 'es', 'fr', 'ru'] as const) {
        const f = flat(UI_STRINGS[lang]);
        const missing = Object.keys(enFlat).filter((k) => !(k in f));
        if (missing.length) problems.push(`${lang}: missing ${missing.slice(0, 3).join(', ')}`);
        const translated = Object.keys(enFlat).filter((k) => f[k] !== enFlat[k]).length;
        if (translated < Object.keys(enFlat).length * 0.6) problems.push(`${lang}: only ${translated} of ${Object.keys(enFlat).length} strings differ from English`);
        const t2 = UI_STRINGS[lang] as unknown as Record<string, unknown[]>;
        for (const [k, n] of [['classNames', 9], ['classTips', 9], ['waveMods', 6], ['waveModTips', 6], ['elites', 12], ['powerups', 10], ['combos', 6], ['droneNames', 7], ['droneTips', 7]] as const) if (t2[k]!.length !== n) problems.push(`${lang}: ${k} needs ${n} entries`);
      }
      for (const lang of ['en', 'tr', 'de', 'es', 'fr', 'ru'] as const) {
        const t = UI_STRINGS[lang] as unknown as Record<string, Record<string, unknown>>;
        for (const c of CARD_IDS) if (!Array.isArray(t.cards![c]) || (t.cards![c] as string[]).length !== 2) problems.push(`${lang}: card ${c} has no title and text`);
        for (const wp of WEAPON_IDS) if (!t.weapons![wp]) problems.push(`${lang}: weapon ${wp} has no name`);
        for (const id of ['-1', ...MAPS.map((_, i) => String(i))]) if (!t.maps![id]) problems.push(`${lang}: map ${id} has no name`);
        for (const a of ['up', 'down', 'left', 'right', 'fire', 'grenade', 'revive', 'reload', 'dash', 'card1', 'card2', 'card3', 'pause']) if (!t.actions![a]) problems.push(`${lang}: action ${a} has no label`);
        if ((UI_STRINGS[lang].diffs as readonly string[]).length !== 3) problems.push(`${lang}: needs three mods names`);
        if ((UI_STRINGS[lang].accs as readonly string[]).length !== ACCESSORIES.length) problems.push(`${lang}: needs a name for each of the ${ACCESSORIES.length} accessories`);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.slice(0, 12).join(' | ') : `${en.length} strings in six languages` };
    },
  },
  {
    id: 'audio.formats',
    title: 'Every sound ships in both Vorbis and MP3 (Safari cannot decode Vorbis)',
    async run() {
      const problems: string[] = [];
      const names = [...BANK_FILES.map((n) => `sfx/${n}`), ...MUSIC_FILES.map((n) => `music/${n}`)];
      for (const base of names) {
        for (const ext of ['ogg', 'mp3']) {
          const res = await fetch(asset(`${base}.${ext}`), { method: 'HEAD' });
          if (!res.ok) problems.push(`${base}.${ext} is missing (${res.status})`);
        }
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.slice(0, 6).join(' | ') : `${names.length} sounds in two formats` };
    },
  },
  {
    id: 'player.xray-outline',
    title: 'A player hidden behind scenery shows an outline; a visible player is not tinted by it',
    async run(ctx) {
      const problems: string[] = [];
      const ch = await Character.createPlayer({ color: '#1FA2FF', weapon: 'weapon_ar', accessory: 'acc_cap' });
      ch.play('aim_idle');
      ch.update(0.2);
      
      ctx.stage.scene.add(ch.root);
      ctx.stage.follow(0, 0);
      // the camera sits to the +x/+z side: a wall between it and the player hides the player
      const toCam = new THREE.Vector3().subVectors(ctx.stage.camera.position, new THREE.Vector3(0, 0.6, 0));
      toCam.y = 0;
      toCam.normalize();
      const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), new THREE.MeshStandardMaterial({ color: '#c8b393' }));
      wall.position.set(toCam.x * 4.2, 2.5, toCam.z * 4.2);
      try {
        ch.setGhost(true);
        ctx.stage.render();
        const openOn = grab(ctx);
        ch.setGhost(false);
        ctx.stage.render();
        const openOff = grab(ctx);
        const tinted = diffCount(openOn, openOff);
        if (tinted > 80) problems.push(`the outline changes ${tinted} px of a player nothing hides`);
        ctx.stage.scene.add(wall);
        ch.setGhost(false);
        ctx.stage.render();
        const hiddenOff = grab(ctx);
        ch.setGhost(true);
        ctx.stage.render();
        const hiddenOn = grab(ctx);
        const outline = diffCount(hiddenOn, hiddenOff);
        if (outline < 300) problems.push(`only ${outline} outline pixels behind the wall`);
        return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : `${outline} outline px behind a wall, ${tinted} px change when visible` };
      } finally {
        ch.setGhost(true);
        if (!(window as unknown as { __keepScene?: boolean }).__keepScene) {
          ctx.stage.scene.remove(ch.root);
          ctx.stage.scene.remove(wall);
        }
      }
    },
  },
  {
    id: 'cards.art',
    title: 'All 25 cards have a 256 px illustration with a transparent background, each one different',
    async run() {
      const problems: string[] = [];
      const sigs: { id: string; sig: number[] }[] = [];
      for (const id of CARD_IDS) {
        const img = new Image();
        img.src = asset(`cards/${id}.png`);
        try {
          await img.decode();
        } catch {
          problems.push(`${id}: cards/${id}.png is missing or broken`);
          continue;
        }
        if (img.naturalWidth !== 256 || img.naturalHeight !== 256) problems.push(`${id}: ${img.naturalWidth}x${img.naturalHeight}, expected 256x256`);
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, 256, 256).data;
        let solid = 0;
        for (let i = 3; i < px.length; i += 4) if (px[i]! > 128) solid++;
        const cover = solid / (256 * 256);
        if (px[3]! > 10 || px[(255 * 256 + 255) * 4 + 3]! > 10) problems.push(`${id}: the corners are not transparent`);
        if (cover < 0.08 || cover > 0.9) problems.push(`${id}: covers ${f(cover * 100, 0)}% of the image`);
        // an 8x8 thumbnail as a fingerprint to catch duplicates
        const sig: number[] = [];
        for (let ty = 0; ty < 8; ty++) {
          for (let tx = 0; tx < 8; tx++) {
            let r = 0;
            let gr = 0;
            let b = 0;
            for (let y = 0; y < 32; y++) {
              for (let x = 0; x < 32; x++) {
                const k = ((ty * 32 + y) * 256 + tx * 32 + x) * 4;
                const a = px[k + 3]! / 255;
                r += px[k]! * a;
                gr += px[k + 1]! * a;
                b += px[k + 2]! * a;
              }
            }
            sig.push(r / 1024, gr / 1024, b / 1024);
          }
        }
        sigs.push({ id, sig });
      }
      let closest = 1e9;
      for (let a = 0; a < sigs.length; a++) {
        for (let b = a + 1; b < sigs.length; b++) {
          let d = 0;
          for (let k = 0; k < sigs[a]!.sig.length; k++) d += Math.abs(sigs[a]!.sig[k]! - sigs[b]!.sig[k]!);
          d /= sigs[a]!.sig.length;
          closest = Math.min(closest, d);
          if (d < 4) problems.push(`${sigs[a]!.id} and ${sigs[b]!.id} look almost identical (${f(d)})`);
        }
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.slice(0, 8).join(' | ') : `${CARD_IDS.length} illustrations, the two most alike differ by ${f(closest, 1)}` };
    },
  },
  {
    id: 'cards.ui',
    title: 'The card offer shows art, title, text and rarity for every card in both languages',
    async run() {
      const problems: string[] = [];
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:700px';
      document.body.appendChild(host);
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, time: 'day', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, autoAim: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: noop, onLook: noop, getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onSlot: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
      }, settings);
      const w = createWorld(1);
      addPlayer(w, 0, 0, 0);
      try {
        let clock = 1000;
        const bySet = (cards: string[]): void => {
          cards.forEach((c, i) => (w.pOffer[i] = CARD_IDS.indexOf(c as (typeof CARD_IDS)[number])));
        };
        for (const lang of ['en', 'tr'] as const) {
          ui.applySettings({ ...settings, lang });
          // walk through the whole pool three cards at a time
          for (let start = 0; start < CARD_IDS.length; start += 3) {
            const group = [0, 1, 2].map((k) => CARD_IDS[(start + k) % CARD_IDS.length]!);
            bySet(group);
            w.pCardTimer[0] = 100;
            clock += 200; // the HUD throttles on time, so keep it moving forward
            ui.update(w, 0, 0, clock, ['p']);
            const cards = [...host.querySelectorAll<HTMLElement>('.wrh-card')];
            if (cards.length !== 3) {
              problems.push(`${lang}: ${cards.length} cards shown for ${group.join(',')}`);
              continue;
            }
            for (const [k, el] of cards.entries()) {
              const id = group[k]!;
              const title = el.querySelector('b')?.textContent ?? '';
              const text = el.querySelector('span')?.textContent ?? '';
              const tag = el.querySelector('em')?.textContent ?? '';
              const img = el.querySelector('img');
              if (!title || !text) problems.push(`${lang}/${id}: empty title or text`);
              if (!img?.src.includes(`cards/${id}.png`)) problems.push(`${lang}/${id}: wrong image ${img?.src}`);
              if (!el.classList.contains(`r${CARD_RARITY[id]}`)) problems.push(`${lang}/${id}: wrong rarity class`);
              if (TEAM_CARDS.includes(id) !== /takım|team/i.test(tag)) problems.push(`${lang}/${id}: team tag mismatch ("${tag}")`);
              if (img) {
                try {
                  await img.decode();
                } catch {
                  problems.push(`${lang}/${id}: image failed to load`);
                }
              }
            }
          }
        }
      } finally {
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.slice(0, 8).join(' | ') : 'all 25 cards render with art, text and rarity in English and Turkish' };
    },
  },
  {
    id: 'ui.mods',
    title: 'The difficulty multipliers: a summary button opens the 20-card grid, toggles change the score multiplier, a guest can only look, the lobby follows the host',
    async run() {
      const problems: string[] = [];
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:700px';
      document.body.appendChild(host);
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, time: 'day', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, autoAim: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const sent: [number, number][] = [];
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: noop, onLook: noop, getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: (m, d) => sent.push([m, d]),
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onSlot: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
      }, settings);
      try {
        const p = (slot: number, name: string): { slot: number; name: string; host: boolean; connected: boolean; weapon: 'pistol'; acc: number; color: number } => ({ slot, name, host: slot === 0, connected: true, weapon: 'pistol', acc: 0, color: 0 });
        ui.showLobby('ABCD', [p(0, 'host')], true, { map: 0, mods: 0 }, false);
        host.querySelector<HTMLElement>('#wrh-mods-open')?.click();
        const grid = document.querySelectorAll<HTMLElement>('.wrh-modal .wrh-mod');
        if (grid.length !== 20) problems.push(`${grid.length} multipliers in the grid, expected 20`);
        grid[0]?.click();
        grid[3]?.click();
        const last = sent[sent.length - 1];
        if (!last || last[1] !== (1 | 8)) problems.push(`the host's choice did not reach the handler (${JSON.stringify(sent)})`);
        const mult = document.querySelector('#wrh-mods-mult')?.textContent ?? '';
        if (!/^×1\.2[0-9]$/.test(mult)) problems.push(`score multiplier shows ${mult}`);
        document.querySelector<HTMLElement>('#wrh-mods-close')?.click();
        if (document.querySelector('.wrh-modal')) problems.push('the grid did not close');
        if (!host.querySelector('#wrh-modsrow .strip img')) problems.push('the summary does not show the chosen icons');
        // a guest sees the host's choice and cannot change it
        ui.showLobby('ABCE', [p(0, 'host'), p(1, 'guest')], false, { map: 0, mods: 1 | 8 | 16 }, false);
        host.querySelector<HTMLElement>('#wrh-mods-open')?.click();
        const before = sent.length;
        document.querySelectorAll<HTMLElement>('.wrh-modal .wrh-mod')[5]?.click();
        if (sent.length !== before) problems.push('a guest changed the multipliers');
        if (document.querySelectorAll('.wrh-modal .wrh-mod.on').length !== 3) problems.push('the guest does not see the three chosen multipliers');
        document.querySelector<HTMLElement>('#wrh-mods-close')?.click();
      } finally {
        document.querySelector('.wrh-modal')?.remove();
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'grid, toggles, multiplier, guest view and summary are right' };
    },
  },
  {
    id: 'achievements',
    title: 'Achievements: 100 of them (10 hidden), totals add up, best runs keep the maximum, earned ones are listed, the page shows bars with numbers, hidden ones read ???, unread count',
    async run() {
      const problems: string[] = [];
      if (ACHIEVEMENTS.length !== 100) problems.push(`${ACHIEVEMENTS.length} achievements, expected 100`);
      if (ACHIEVEMENTS.filter((a) => a.hidden).length !== 10) problems.push('expected 10 hidden achievements');
      const store = emptyStore();
      const noFlags = Object.fromEntries(ACHIEVEMENTS.filter((a) => a.kind === 'flag').map((a) => [a.stat, false]));
      let earned = applyRun(store, { totals: { kills: 60, runKills: 60, floor: 3, games: 1 }, flags: noFlags }, 1000).map((a) => a.id);
      if (!earned.includes('games_1')) problems.push('the first game did not earn Welcome');
      if (earned.includes('kills_1')) problems.push('60 kills earned the 100-kill achievement');
      earned = applyRun(store, { totals: { kills: 60, runKills: 40, floor: 6, games: 1 }, flags: noFlags }, 2000).map((a) => a.id);
      if (store.life.kills !== 120 || store.best.runKills !== 60) problems.push(`totals ${store.life.kills}/${store.best.runKills}`);
      if (!earned.includes('kills_1') || !earned.includes('floor_1')) problems.push(`second run did not earn the 100 kills and floor 5 (${earned.join(',')})`);
      if (earned.includes('floor_1') && store.got.floor_1 !== 2000) problems.push('the time of earning is not kept');
      const again = applyRun(store, { totals: { kills: 5, games: 1 }, flags: noFlags }, 3000);
      if (again.length) problems.push('an earned achievement was earned twice');
      const flagged = applyRun(store, { totals: {}, flags: { ...noFlags, quickDeath: true } }, 4000).map((a) => a.id);
      if (!flagged.includes('speedrun_loss')) problems.push('a hidden flag achievement was not earned');
      if (unreadCount(store) !== Object.keys(store.got).length) problems.push('unread count is wrong before looking');
      // the page
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:700px';
      document.body.appendChild(host);
      try {
        host.innerHTML = achPage('en', store);
        const cards = host.querySelectorAll('.wrh-achc');
        if (cards.length !== 100) problems.push(`${cards.length} cards on the page`);
        const k = host.querySelector('.wrh-achc[data-id="kills_3"] .num')?.textContent ?? '';
        if (k !== '125 / 10,000') problems.push(`progress text "${k}"`);
        const hid = [...host.querySelectorAll('.wrh-achc')].filter((c) => c.querySelector('b')?.textContent === '???').length;
        if (hid !== 9) problems.push(`${hid} hidden cards read ???, expected 9 (one is earned)`);
        if (!host.querySelector('.wrh-achc[data-id="kills_1"] .tip')?.textContent?.includes('100 enemies')) problems.push('no how-to text on the card');
        if (fmtNum(533223, 'tr') !== '533.223') problems.push(`fmtNum tr ${fmtNum(533223, 'tr')}`);
        if (runAchievementsHtml('en', ACHIEVEMENTS.slice(0, 2)).split('class="one"').length !== 3) problems.push('the game over list does not show the earned achievements');
      } finally {
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : '100 achievements, totals, bests, flags, page and hidden cards are right' };
    },
  },
  {
    id: 'cards.queue',
    pure: true,
    title: 'Several levels at once open their card offers one after the other, a held key never skips one, queued clocks wait',
    async run() {
      const problems: string[] = [];
      const w = createWorld(7);
      w.waveTick = 1e9;
      w.countMul = 0;
      w.misc[MISC.Phase] = FloorPhase.Cleared; // offers open once the floor is cleared
      w.misc[MISC.PhaseEnd] = 1e9;
      addPlayer(w, 0, 0, 0);
      // three levels reached in one go
      w.pLevel[0] = 4;
      w.pPending[0] = 3;
      if (w.pPending[0]! < 1) problems.push(`expected queued levels, pending ${w.pPending[0]}`);
      const open = (): boolean => w.pOffer[0]! >= 0;
      const idle = { moveX: 0, moveY: 0, aim: 0, buttons: 0 };
      const picks: number[] = [];
      let timerWhileQueued = 0;
      for (let round = 0; round < 6 && (open() || w.pPending[0]! > 0); round++) {
        if (!open()) for (let t = 0; t < 30 && !open(); t++) step(w, [idle]);
        if (!open()) {
          problems.push('queued offer never opened');
          break;
        }
        if (round > 0 && w.pCardTimer[0]! < BALANCE.progression.cardSeconds * 30 - 5) problems.push(`offer ${round} opened with a running clock (${w.pCardTimer[0]})`);
        step(w, [{ ...idle, buttons: Buttons.Card1 }]);
        picks.push(w.pLevel[0]!);
        // the same key kept down for 10 ticks must not pick the next offer
        for (let t = 0; t < 10; t++) {
          step(w, [{ ...idle, buttons: Buttons.Card1 }]);
          if (open()) timerWhileQueued++;
        }
        step(w, [idle]);
      }
      if (timerWhileQueued > 0) problems.push(`next offer opened while the key was still held (${timerWhileQueued} ticks)`);
      if (w.pPending[0] !== 0 || open()) problems.push(`not all offers were taken one by one (pending ${w.pPending[0]})`);
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : `${picks.length} offers taken one by one` };
    },
  },
  {
    id: 'menu.preview',
    title: 'The menu shows a 3D preview: arrows change accessory and weapon, swatches the colour, and the choices reach the handlers',
    async run() {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:900px';
      document.body.appendChild(host);
      const looks: [number, number][] = [];
      const weapons: string[] = [];
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, time: 'day', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, autoAim: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: (w) => weapons.push(w), onLook: (a, c) => looks.push([a, c]), getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onSlot: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
      }, settings);
      const problems: string[] = [];
      try {
        saveProfile({ ...loadProfile(), acc: 0, color: -1 });
        ui.acc = 0;
        ui.color = -1;
        ui.showMenu();
        const q = <E extends HTMLElement>(sel: string): E => host.querySelector<E>(sel)!;
        const canvas = host.querySelector('canvas.wrh-prev-canvas');
        if (!canvas) return { status: 'warn', detail: 'no preview canvas (browser without a second WebGL context?)' };
        const before = q('#wrh-prev-name').textContent;
        q('[data-pdir="1"]').click();
        const after = q('#wrh-prev-name').textContent;
        if (before === after || !after) problems.push(`accessory name did not change (${before} -> ${after})`);
        if (looks.length !== 1 || looks[0]![0] !== 1) problems.push('onLook not called with the next accessory: ' + JSON.stringify(looks));
        q('[data-sw="3"]').click();
        if (looks[looks.length - 1]![1] !== 3) problems.push('colour swatch did not reach onLook');
        q('[data-ptab="weapon"]').click();
        const w0 = q('#wrh-prev-name').textContent;
        q('[data-pdir="1"]').click();
        if (weapons.length !== 1) problems.push('weapon arrow did not call onWeapon');
        if (q('#wrh-prev-name').textContent === w0) problems.push('weapon name did not change');
        if (!/\d/.test(q('#wrh-prev-stats').textContent ?? '')) problems.push('weapon stats missing');
        await new Promise((r) => setTimeout(r, 1500));
        const lockedBtn = host.querySelector<HTMLButtonElement>('.wrh-wp.locked[data-w]');
        if (lockedBtn) {
          const n = weapons.length;
          if (lockedBtn.disabled || lockedBtn.getAttribute('aria-disabled') !== 'true') problems.push('a locked weapon is natively disabled or lacks aria-disabled');
          lockedBtn.click();
          if (weapons.length !== n) problems.push('clicking a locked weapon picked it');
          lockedBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          const tip = host.querySelector<HTMLElement>('.wrh-tip');
          if (!tip || tip.style.display !== 'block' || !/\d/.test(tip.textContent ?? '')) problems.push('a locked weapon shows no hover tip with its floor');
        }
        const sw = host.querySelector('[data-sw].on');
        if (!sw) problems.push('selected swatch is not marked');
      } finally {
        ui.clearScreen();
        host.remove();
        saveProfile({ ...loadProfile(), acc: 0, color: -1 });
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'preview canvas, accessory/weapon arrows, colour swatches and stats work' };
    },
  },
  {
    id: 'menu.preview-aim',
    title: 'The lobby preview holds every weapon pointing the way the character faces, upright, while the turntable spins',
    async run() {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:300px;height:300px';
      document.body.appendChild(host);
      let pv: Preview;
      try {
        pv = new Preview(120);
      } catch {
        host.remove();
        return { status: 'warn', detail: 'no second WebGL context for the preview' };
      }
      host.appendChild(pv.canvas);
      const problems: string[] = [];
      const worst = { angle: 0, tilt: 0 };
      try {
        for (const wp of WEAPON_IDS) {
          await pv.set({ mode: 'char', accessory: ACCESSORIES[0]!, color: '#3aa0ff', weapon: wp });
          for (let i = 0; i < 100 && pv.busy; i++) await new Promise((r) => setTimeout(r, 20));
          // a few turns of the turntable: the aim has to follow the rotation
          for (let k = 0; k < 4; k++) {
            for (let i = 0; i < 20; i++) pv.tick(0.05);
            const a = pv.weaponAxes();
            if (!a) {
              problems.push(`${wp}: no weapon in the preview`);
              break;
            }
            const angle = (Math.acos(Math.max(-1, Math.min(1, a.barrel.dot(a.facing)))) * 180) / Math.PI;
            const tilt = (Math.acos(Math.max(-1, Math.min(1, a.up.y))) * 180) / Math.PI;
            worst.angle = Math.max(worst.angle, angle);
            worst.tilt = Math.max(worst.tilt, tilt);
            if (angle > 6) problems.push(`${wp}: barrel ${angle.toFixed(1)} deg off the facing`);
            if (tilt > 12) problems.push(`${wp}: weapon rolled ${tilt.toFixed(1)} deg off upright`);
            if (problems.length && problems[problems.length - 1]!.startsWith(wp)) break;
          }
        }
      } finally {
        pv.dispose();
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.slice(0, 6).join(' | ') : `${WEAPON_IDS.length} weapons aimed within ${worst.angle.toFixed(1)} deg of the facing, at most ${worst.tilt.toFixed(1)} deg off upright` };
    },
  },
  {
    id: 'ui.version-badge',
    title: 'A version badge with the package version and commit is always on screen',
    async run() {
      const el = document.getElementById('wrh-version');
      if (!el) return { status: 'fail', detail: 'no #wrh-version element' };
      const text = el.textContent ?? '';
      if (!/^v\d+\.\d+\.\d+/.test(text)) return { status: 'fail', detail: 'unexpected label ' + text };
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.right < 0 || r.bottom < 0 || r.left > innerWidth) return { status: 'fail', detail: 'badge is not visible' };
      return { status: 'pass', detail: text };
    },
  },
  {
    id: 'corpses.cleanup',
    title: 'Dead enemies do not pile up: ragdolls and death animations shrink away after a few seconds',
    async run(ctx) {
      const pool = await RagdollPool.create(4);
      await pool.preload(['grunt']);
      ctx.stage.scene.add(pool.group);
      try {
        pool.spawn('grunt', 0, 0, 0, 'z_walk', 0.3, { x: 0, z: 0 }, { x: 1, z: 0, power: 30 });
        if (pool.activeCount !== 1) return { status: 'fail', detail: 'the ragdoll did not spawn' };
        for (let i = 0; i < 60 * 2; i++) pool.update(1 / 60);
        const early: number = pool.activeCount;
        for (let i = 0; i < 60 * 12; i++) pool.update(1 / 60);
        const late: number = pool.activeCount;
        const problems: string[] = [];
        if (early !== 1) problems.push('the body vanished within two seconds');
        if (late !== 0) problems.push(`${late} bodies still lying around after 14 seconds`);
        return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'a ragdoll stays a few seconds, then shrinks away' };
      } finally {
        ctx.stage.scene.remove(pool.group);
      }
    },
  },
  {
    id: 'ui.settings-panel',
    title: 'The settings window has tabs, grouped rows, switches and sliders that report changes, and the controls sheet shows keycaps',
    async run() {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:800px';
      document.body.appendChild(host);
      const problems: string[] = [];
      const changes: [string, unknown][] = [];
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0.5, renderer: 'webgl', aa: 'off', bounce: false, time: 'day', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, autoAim: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0.6, shadows: 2, scale: 1, lang: 'en' };
      let tab = 'graphics';
      const draw = (): void =>
        renderSettingsPanel(host, {
          settings,
          lang: 'en',
          langs: LANGS,
          tab,
          scroll: 0,
          actionNames: UI_STRINGS.en.actions as Record<string, string>,
          actions: ACTIONS,
          bindings: Object.fromEntries(ACTIONS.map((a) => [a, [DEFAULT_BINDINGS[a][0]!]])),
          onSetting: (k, v) => changes.push([k, v]),
          onTab: (t) => {
            tab = t;
            draw();
          },
          onRebind: () => undefined,
          onResetKeys: () => undefined,
          onReset: () => changes.push(['reset', true]),
          onClose: () => changes.push(['close', true]),
          onReport: () => changes.push(['report', true]),
          needsReload: (k: string) => k === 'aa',
          onReload: () => changes.push(['reload', true]),
        });
      try {
        draw();
        const tabs = [...host.querySelectorAll<HTMLElement>('.wrh-set-tabs button')];
        if (tabs.length !== 5) problems.push(`${tabs.length} tabs, expected 5`);
        if (host.querySelectorAll('.wrh-set-group').length < 3) problems.push('the graphics tab has fewer than three groups');
        host.querySelector<HTMLElement>('.wrh-switch')!.click();
        host.querySelector<HTMLInputElement>('.wrh-range')!.value = '0.7';
        host.querySelector<HTMLInputElement>('.wrh-range')!.dispatchEvent(new Event('change'));
        host.querySelector<HTMLElement>('.wrh-seg button:not(.on)')!.click();
        if (changes.length !== 3) problems.push(`${changes.length} changes reported for a switch, a slider and a choice`);
        const reloadBtn = host.querySelector<HTMLElement>('.wrh-set-reload button');
        if (!reloadBtn) problems.push('a setting that needs a reload shows no note and button');
        else {
          reloadBtn.click();
          if (!changes.some((c) => c[0] === 'reload')) problems.push('the reload button does nothing');
        }
        const reportBtn = [...host.querySelectorAll<HTMLElement>('.wrh-set-row button')].find((b) => /report/i.test(b.textContent ?? ''));
        if (!reportBtn) problems.push('no problem-report button in the settings');
        else {
          reportBtn.click();
          if (!changes.some((c) => c[0] === 'report')) problems.push('the report button does nothing');
        }
        for (let i = 0; i < tabs.length; i++) {
          tab = ['graphics', 'audio', 'game', 'access', 'keys'][i]!;
          draw();
          if (!host.querySelector('.wrh-set-row, .wrh-set-keygrid')) problems.push(`tab ${tab} is empty`);
        }
        if (host.querySelectorAll('.wrh-set-keybtn .wrh-key').length < 10) problems.push('the keys tab does not draw keycaps');
        renderControlsSheet(host, { lang: 'en', bindings: Object.fromEntries(ACTIONS.map((a) => [a, [DEFAULT_BINDINGS[a][0]!]])), onClose: () => undefined, onSetting: () => undefined });
        const rows = host.querySelectorAll('.wrh-ctl-row').length;
        const caps = host.querySelectorAll('.wrh-key').length;
        if (rows < 10) problems.push(`controls sheet lists ${rows} controls`);
        if (caps < 15) problems.push(`controls sheet draws ${caps} keycaps`);
        if (!host.querySelector('.wrh-mouse')) problems.push('no mouse drawing on the controls sheet');
      } finally {
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'tabs, rows, switches, sliders, choices, keycaps and the controls sheet work' };
    },
  },
  {
    id: 'ammo.ring-3d',
    title: 'The ammo ring is a real object on the floor: it fills with the magazine, and a body in front of it hides the part behind',
    async run(ctx) {
      const ring = new AmmoRing();
      ctx.stage.scene.add(ring.group);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 1.1), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      body.position.set(0, 1.1, 0);
      body.visible = false;
      ctx.stage.scene.add(body);
      const problems: string[] = [];
      const greens = (): number => {
        const px = grab(ctx, 480);
        let n = 0;
        for (let i = 0; i < px.length; i += 4) if (px[i + 1]! > px[i + 2]! + 60 && px[i + 1]! >= px[i]! - 10) n++; // green to yellow
        return n;
      };
      try {
        ctx.stage.follow(0, 0);
        ring.update(0, 0, 1, false, 0, false);
        ctx.stage.render();
        const none = greens();
        ring.update(0, 0, 1, false, 0, true);
        ctx.stage.render();
        const full = greens();
        ring.update(0, 0, 0.5, false, 0, true);
        ctx.stage.render();
        const half = greens();
        body.visible = true;
        ring.update(0, 0, 1, false, 0, true);
        ctx.stage.render();
        const covered = greens();
        if (full < 150) problems.push(`a full ring shows only ${full} green pixels`);
        if (none > full * 0.1) problems.push('the ring is drawn while it should be hidden');
        if (!(half > full * 0.3 && half < full * 0.75)) problems.push(`half a magazine draws ${half} px against ${full} for a full one`);
        if (!(covered < full * 0.92)) problems.push(`a body in the middle hides nothing of the ring (${covered} of ${full} px)`);
      } finally {
        ctx.stage.scene.remove(ring.group);
        ctx.stage.scene.remove(body);
        ring.dispose();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'the ring fills with the magazine and passes behind a body' };
    },
  },
  {
    id: 'perf.budget',
    title: 'The scene stays within its budget: a fixed number of lights, bounded draw calls, triangles and particles',
    async run(ctx) {
      const problems: string[] = [];
      let lights = 0;
      let meshes = 0;
      ctx.stage.scene.traverse((o) => {
        if ((o as THREE.Light).isLight) lights++;
        if ((o as THREE.Mesh).isMesh) meshes++;
      });
      // sun, sky, bounce, 8 flash lights, 4 lamps, the player's own light and the flashlight are the fixed set
      if (lights > 20) problems.push(`${lights} lights in the scene (budget 20)`);
      const fx = new Fx(undefined, 0);
      ctx.stage.scene.add(fx.group);
      for (let i = 0; i < 400; i++) fx.sparkle(Math.random() * 20 - 10, Math.random() * 10 - 5, 0.5, '#ffd36a', 1, 3);
      fx.update(0.016);
      ctx.stage.render();
      const info = ctx.stage.renderer.info.render;
      if (info.calls > 90) problems.push(`${info.calls} draw calls (budget 90)`);
      if (info.triangles > 260000) problems.push(`${info.triangles} triangles (budget 260000)`);
      if (fx.particleCount > 3600) problems.push(`${fx.particleCount} particles (cap 3600)`);
      ctx.stage.scene.remove(fx.group);
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : `${lights} lights, ${meshes} meshes, ${info.calls} draw calls, ${info.triangles} triangles` };
    },
  },
  {
    id: 'power.visuals',
    title: 'Every upgrade shows on the character: a gem per upgrade, a shield for armour, thicker redder tracers, bigger bodies for health',
    async run() {
      const w = createWorld(3);
      addPlayer(w, 0, 0, 0);
      const view = new PowerView(() => undefined);
      const count = (): number => {
        view.begin();
        view.slot(w, 0, 0, 0, 1, 0.016, true);
        view.end();
        return (view.group.children[0] as THREE.InstancedMesh).count;
      };
      const problems: string[] = [];
      if (count() !== 0) problems.push('a gem shows with no upgrades');
      const steps: [string, () => void][] = [
        ['damage', () => (w.modDamage[0] = 1.3)],
        ['rate', () => (w.modRate[0] = 1.2)],
        ['pierce', () => (w.modPierce[0] = 2)],
        ['crit', () => (w.modCrit[0] = 0.1)],
        ['blast', () => (w.modBlast[0] = 1.3)],
        ['speed', () => (w.pModSpeed[0] = 1.2)],
        ['armor', () => (w.modArmor[0] = 0.8)],
        ['magnet', () => (w.modMagnet[0] = 1.5)],
        ['luck', () => (w.modLoot = 1.4)],
        ['scholar', () => (w.modXp[0] = 1.3)],
        ['medic', () => (w.modRevive[0] = 0.7)],
        ['quick', () => (w.modReload[0] = 0.8)],
        ['roll', () => (w.modDash[0] = 0.8)],
        ['vampire', () => (w.pLifesteal[0] = 2)],
      ];
      let n = 0;
      for (const [id, apply] of steps) {
        apply();
        const c = count();
        if (c !== n + 1) problems.push(`${id}: expected ${n + 1} gems, got ${c}`);
        n = c;
      }
      const shield = view.group.children.find((o) => (o as THREE.Mesh).geometry?.type === 'CylinderGeometry' && o.visible);
      if (!shield) problems.push('armour shows no shield');
      const st = strengthOf(w, 0);
      if (!(st.damage > 0.25 && st.pierce > 0.9 && st.crit > 0.2)) problems.push('strengthOf does not follow the upgrades ' + JSON.stringify(st));
      w.pMaxHp[0] = w.pMaxHp[0]! + 60;
      if (!(PowerView.bodyScale(w, 0) > 1.05)) problems.push('health upgrades do not grow the body');
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : `${n} upgrade kinds each add a gem, armour a shield, health a bigger body` };
    },
  },
  {
    id: 'ui.revive-and-arrows',
    title: 'The revive ring fills with progress and the off-screen teammate arrow points and shows the name',
    async run() {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:700px';
      document.body.appendChild(host);
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, time: 'day', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, autoAim: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: noop, onLook: noop, getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onSlot: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
      }, settings);
      const problems: string[] = [];
      try {
        ui.overlay.setRing(2, 0.8, 0.5, 100, 100, true, true);
        const ring = host.querySelector<HTMLElement>('.wrh-ring');
        if (!ring || ring.style.display !== 'block') problems.push('ring not shown');
        else {
          if (ring.style.getPropertyValue('--p') !== '50') problems.push('ring progress ' + ring.style.getPropertyValue('--p'));
          if (ring.style.getPropertyValue('--b') !== '80') problems.push('ring bleed ' + ring.style.getPropertyValue('--b'));
        }
        ui.overlay.setRing(2, 0, 0, 0, 0, false, false);
        if (host.querySelector<HTMLElement>('.wrh-ring')!.style.display !== 'none') problems.push('ring not hidden');
        ui.overlay.setArrow(1, 'Ayse', '#ff4f9a', 700, 300, Math.PI / 2, true, true);
        const arrow = host.querySelector<HTMLElement>('.wrh-arrow-off');
        if (!arrow || arrow.querySelector('span')?.textContent !== 'Ayse') problems.push('arrow label missing');
        if (!arrow?.firstElementChild?.getAttribute('style')?.includes('rotate(1.57')) problems.push('arrow not rotated');
        if (!arrow?.classList.contains('down')) problems.push('arrow does not blink for a downed teammate');
      } finally {
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'revive ring and teammate arrow behave' };
    },
  },
  {
    id: 'aim.auto',
    pure: true,
    title: 'Auto-aim picks the nearest enemy or barrel in reach, sticks to it, and keeps away from barrels at the shooter\'s feet',
    async run() {
      const problems: string[] = [];
      const w = createWorld(3);
      w.waveTick = 1e9;
      w.countMul = 0;
      addPlayer(w, 0, 0, 0, 'ar');
      w.brActive.fill(0);
      if (pickTarget(w, 0, null)) problems.push('a target appeared out of nothing');
      const g = ENEMY_TYPES.indexOf('grunt');
      const far = spawnEnemy(w, g, 12, 0, false);
      const near = spawnEnemy(w, g, 0, 5, false);
      let t = pickTarget(w, 0, null);
      if (!t || t.kind !== 0 || t.id !== near) problems.push('the nearest enemy was not chosen');
      else if (Math.abs(Math.atan2(t.y - w.pY[0]!, t.x - w.pX[0]!) - Math.PI / 2) > 1e-6) problems.push('wrong angle to the nearest enemy');
      // sticky: a rival only slightly nearer does not steal the lock
      const rival = spawnEnemy(w, g, 0, -4.8, false);
      const sticky = pickTarget(w, 0, t);
      if (!sticky || sticky.id !== near) problems.push('the lock flickered to a barely nearer enemy');
      // a clearly nearer one does
      w.eY[rival] = -2;
      t = pickTarget(w, 0, sticky);
      if (!t || t.id !== rival) problems.push('a clearly nearer enemy did not take over');
      // a barrel counts like an enemy, unless it is right next to the shooter
      w.eActive.fill(0);
      w.enemyCount = 0;
      w.brActive[0] = 1;
      w.brX[0] = 6;
      w.brY[0] = 0;
      t = pickTarget(w, 0, null);
      if (!t || t.kind !== 1) problems.push('a barrel in reach was ignored');
      w.brX[0] = 1;
      if (pickTarget(w, 0, null)) problems.push('a barrel at the shooter\'s feet was targeted');
      // far away is still a target (the weapon's range does not matter), and only an empty arena leaves it without one
      w.brX[0] = 200;
      w.brActive[0] = 1;
      const farOne = pickTarget(w, 0, null);
      if (!farOne) problems.push('a far target was not chosen: the character would stand there aimless');
      w.brActive[0] = 0;
      if (pickTarget(w, 0, null)) problems.push('a target appeared with nothing left on the floor');
      void far;
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'nearest, sticky, barrel-safe, never aimless' };
    },
  },
  {
    id: 'ui.inventory',
    title: 'The weapon list above the minimap: one clickable row per owned weapon, the magazine, a yellow outline on the selected weapon',
    async run() {
      const problems: string[] = [];
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:700px';
      document.body.appendChild(host);
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, time: 'day', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, autoAim: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: noop, onLook: noop, getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onSlot: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
      }, settings);
      const w = createWorld(4);
      w.waveTick = 1e9;
      w.countMul = 0;
      addPlayer(w, 0, 0, 0, 'ar');
      try {
        giveWeapon(w, 0, WEAPON_IDS.indexOf('sniper'));
        giveWeapon(w, 0, WEAPON_IDS.indexOf('minigun'));
        w.pInvMag[WEAPON_IDS.indexOf('sniper')] = 0;
        ui.update(w, 0, 0, 1000, ['p']);
        const rows = [...host.querySelectorAll<HTMLElement>('.wrh-inv .row')];
        const expected = ['pistol', 'ar', 'sniper', 'minigun'].length;
        if (rows.length !== expected) problems.push(`${rows.length} rows, expected ${expected}`);
        if (rows.some((r) => r.querySelector('kbd'))) problems.push('the rows still show key labels');
        const wsels = rows.map((r) => r.dataset.w);
        if (wsels.join(',') !== ['pistol', 'ar', 'sniper', 'minigun'].map((id) => String(WEAPON_IDS.indexOf(id as (typeof WEAPON_IDS)[number]) + 1)).join(',')) problems.push(`row targets ${wsels.join(',')} are not the weapon indices`);
        const cur = rows.filter((r) => r.classList.contains('cur'));
        if (cur.length !== 1 || !cur[0]!.textContent?.includes('Assault')) problems.push('the weapon in the hands is not the single outlined row');
        else if (!getComputedStyle(cur[0]!).borderTopColor.includes('255, 210, 31')) problems.push('the selected row has no yellow outline');
        const sniperRow = rows.find((r) => r.textContent?.includes('Sniper'));
        if (!sniperRow?.textContent?.includes('0/')) problems.push('the empty sniper magazine is not shown as 0/N');
        if (rows.some((r) => r.textContent?.includes('∞'))) problems.push('a gun still shows an infinite reserve');
      } finally {
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'list, targets, magazines and outline are right' };
    },
  },
  {
    id: 'aim.hits',
    pure: true,
    title: 'Auto-aimed shots hit: from the muzzle, leading a walking enemy, through the delay of the input, around cover',
    async run() {
      const problems: string[] = [];
      const solver = new AimSolver();
      const weapons = ['pistol', 'smg', 'ar', 'shotgun', 'sniper', 'revolver'] as const;
      const encode = (angle: number): number => Math.round((((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 65536) & 0xffff;
      let hits = 0;
      let total = 0;
      const missed: string[] = [];
      // inputs reach the simulation `delay` ticks after they were worked out, as they do online
      for (const delay of [1, 6]) {
        for (const weapon of weapons) {
          for (let k = 0; k < 8; k++) {
            for (const dist of [6, 13]) {
              const w = createWorld(100 + k);
              w.waveTick = 1e9;
              w.countMul = 0;
              addPlayer(w, 0, 0, 0, weapon);
              w.pHp[0] = w.pMaxHp[0] = 1e9;
              const th = (k / 8) * Math.PI * 2 + 0.2;
              const e = spawnEnemy(w, ENEMY_TYPES.indexOf('grunt'), Math.cos(th) * dist, Math.sin(th) * dist, false);
              w.eHp[e] = 14;
              let target: ReturnType<typeof pickTarget> = null;
              let killed = false;
              const queue: number[] = [];
              for (let t = 0; t < 140 && !killed; t++) {
                solver.track(w);
                target = pickTarget(w, 0, target, (x) => solver.shotClear(w, 0, x, delay));
                queue.push(target ? solver.angle(w, 0, target, delay) : 0);
                const aim = encode(queue.length > delay ? queue.shift()! : queue[0]!);
                step(w, [{ moveX: 0, moveY: 0, aim, buttons: Buttons.Fire }]);
                killed = !w.eActive[e] || w.kills > 0;
              }
              total++;
              if (killed) hits++;
              else missed.push(`${weapon} d${delay} ${f((th * 180) / Math.PI, 0)}deg ${dist}u`);
            }
          }
        }
      }
      if (hits / total < 0.97) problems.push(`only ${hits} of ${total} auto-aimed shots killed their target (${missed.slice(0, 6).join(', ')})`);
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : `${hits} of ${total} auto-aimed shots hit their walking target (inputs delayed by 1 and 6 ticks)` };
    },
  },
  {
    id: 'aim.cover',
    pure: true,
    title: 'Auto-aim prefers a target it can hit over one behind cover (also one hidden from the muzzle only), and falls back to the nearest when all are hidden',
    async run() {
      const problems: string[] = [];
      const solver = new AimSolver();
      // map 0 has a shelf at x 21..39, y 8..10; the pistol's muzzle sits 1.56 ahead and 0.29 to the right
      const w = createWorld(7);
      w.waveTick = 1e9;
      w.countMul = 0;
      addPlayer(w, 0, 19.8, 10.2, 'pistol');
      const e = spawnEnemy(w, ENEMY_TYPES.indexOf('grunt'), 44.5, 10.2, false);
      w.eCooldown[e] = 1e9;
      w.eFrost[e] = 100000; // frozen: it stays where it is
      const plain = pickTarget(w, 0, null);
      if (!plain) problems.push('the setup is wrong: the target is not visible from the middle of the player');
      const aimed = pickTarget(w, 0, null, (x) => solver.shotClear(w, 0, x, 1));
      // the only enemy is behind the corner: it is still the target (never aimless), the bullets just hit the cover
      if (!aimed || aimed.id !== e) problems.push('with only a hidden enemy left the character has no target');
      // and the simulation agrees: shooting straight at it never reaches it
      const hp = w.eHp[e]!;
      for (let t = 0; t < 40; t++) step(w, [{ moveX: 0, moveY: 0, aim: 0, buttons: Buttons.Fire }]);
      if (w.eHp[e] !== hp) problems.push('a bullet got through the corner, the setup is wrong');
      // a second target in the open is chosen instead of the hidden one
      const open = spawnEnemy(w, ENEMY_TYPES.indexOf('grunt'), 19.8, 21.5, false);
      w.eCooldown[open] = 1e9;
      w.eFrost[open] = 100000;
      const next = pickTarget(w, 0, null, (x) => solver.shotClear(w, 0, x, 1));
      if (!next || next.id !== open) problems.push('the visible enemy was not chosen over the hidden one');
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'visible targets preferred, nearest hidden one as the fallback' };

    },
  },
  {
    id: 'aim.idle-stable',
    title: 'Auto aim only turns the character while shooting: standing still it never asks for a target and the shot angle stays put; a lock holds against a near equal and lets go of a target that is out of reach',
    async run() {
      const problems: string[] = [];
      const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
      camera.position.set(0, 10, 0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      const input = new Input(document.createElement('div'), camera);
      input.resetBindings();
      input.debugKeys([]);
      let asked = 0;
      const lock = (): number => {
        asked++;
        return 2.2;
      };
      // not shooting: the lock is never asked, whatever the enemies do
      for (let i = 0; i < 20; i++) input.sample(0, 0, lock, true);
      if (asked) problems.push(`the lock was asked ${asked} times while standing still`);
      const idle = input.sample(0, 0, lock, true).aimAngle;
      // shooting: asked at once, and the angle follows it
      input.debugKeys(['Space']);
      const fired = input.sample(0, 0, lock, true);
      if (!asked) problems.push('the lock was not asked while shooting');
      if (Math.abs(fired.aimAngle - 2.2) > 1e-9) problems.push('the shot did not follow the lock');
      // let go: a short grace, then nothing more is asked and the angle stays where the last shot was
      input.debugKeys([]);
      await new Promise((r) => setTimeout(r, 450));
      asked = 0;
      const after = input.sample(0, 0, lock, true).aimAngle;
      if (asked) problems.push('the lock was still asked after the fire button had been let go');
      if (Math.abs(after - 2.2) > 1e-9) problems.push(`the character turned to ${after.toFixed(2)} on its own after shooting (idle was ${idle.toFixed(2)})`);
      // the target lock: nearest in reach, holds against an equal, drops an out-of-reach one
      const w = createWorld(3);
      w.waveTick = 1e9;
      w.countMul = 0;
      addPlayer(w, 0, 0, -12, 'pistol');
      const a = spawnEnemy(w, ENEMY_TYPES.indexOf('grunt'), 8, -12, false);
      const b = spawnEnemy(w, ENEMY_TYPES.indexOf('grunt'), 6, -12, false);
      for (const e of [a, b]) {
        w.eCooldown[e] = 1e9;
        w.eFrost[e] = 1e6;
      }
      const tl = new TargetLock();
      const all = (): boolean => true;
      let t = tl.update(w, 0, all, 26);
      if (!t || t.id !== b) problems.push('did not take the nearest');
      w.eX[a] = 5.7;
      w.eY[a] = -12;
      for (let k = 0; k < 3; k++) {
        w.tick++;
        t = tl.update(w, 0, all, 26);
      }
      if (!t || t.id !== b) problems.push('a near equal took the lock at once');
      const far = spawnEnemy(w, ENEMY_TYPES.indexOf('grunt'), 40, -12, false);
      w.eFrost[far] = 1e6;
      w.eActive[a] = 0;
      w.eActive[b] = 0;
      w.enemyCount -= 2;
      t = tl.update(w, 0, all, 26);
      if (t) problems.push('locked on a target that is out of reach (' + t.id + ')');
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'no lock without shooting, held against equals, out of reach is not a target' };
    },
  },
  {
    id: 'ui.toolbar',
    title: 'Language, controls and settings buttons are always top right (menu, lobby, game), and the language switch works anywhere',
    async run() {
      const problems: string[] = [];
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:700px';
      document.body.appendChild(host);
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, time: 'day', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, autoAim: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const picked: unknown[] = [];
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: noop, onLook: noop, getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onSlot: noop, onUiSound: noop, onSetting: (k, v) => picked.push([k, v]), onResetSettings: noop,
      }, settings);
      try {
        const check = (where: string): void => {
          for (const id of ['#tb-lang', '#tb-set']) {
            const b = host.querySelector<HTMLElement>(id);
            if (!b) problems.push(`${where}: ${id} is missing`);
            else if (getComputedStyle(b).display === 'none') problems.push(`${where}: ${id} is hidden`);
          }
        };
        ui.showMenu();
        check('menu');
        ui.showLobby('ABCD', [{ slot: 0, name: 'a', host: true, connected: true, weapon: 'pistol', acc: 0, color: 0 }], true, { map: 0, mods: 1 }, false);
        check('lobby');
        const w = createWorld(1);
        addPlayer(w, 0, 0, 0);
        ui.clearScreen();
        ui.update(w, 0, 0, 1000, ['p']);
        check('game');
        // the language list names every language and picking one reports it
        host.querySelector<HTMLElement>('#tb-lang')!.click();
        const items = [...host.querySelectorAll<HTMLElement>('#tb-pop [data-lang]')];
        if (items.length !== LANGS.length) problems.push(`${items.length} languages listed, expected ${LANGS.length}`);
        items.find((i) => i.getAttribute('data-lang') === 'tr')!.click();
        if (!picked.some((p) => JSON.stringify(p) === '["lang","tr"]')) problems.push('picking Turkish did not report the language');
        // settings open from the toolbar; the controls live inside them (no separate controls button any more)
        if (host.querySelector('#tb-ctl')) problems.push('the separate controls button is still there');
        host.querySelector<HTMLElement>('#tb-set')!.click();
        if (!host.querySelector('.wrh-set-tabs')) problems.push('the settings button does not open the settings');
        host.querySelector<HTMLElement>('.wrh-set-tabs button:last-child')!.click();
        if (!host.querySelector('.wrh-ctl-row')) problems.push('the Controls tab of the settings does not show the controls sheet');
        host.querySelector<HTMLElement>('#tb-set')!.click();
        // a language change redraws the menu in the new language and keeps what was typed
        ui.showMenu();
        const name = host.querySelector<HTMLInputElement>('#wrh-name');
        if (name) name.value = 'Zed';
        ui.applySettings({ ...settings, lang: 'tr' });
        const solo = host.querySelector('#wrh-solo')?.textContent ?? '';
        if (!/oyna/i.test(solo)) problems.push(`the menu was not redrawn in Turkish (${solo})`);
        if (host.querySelector<HTMLInputElement>('#wrh-name')?.value !== 'Zed') problems.push('the typed name was lost on a language change');
      } finally {
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'two buttons everywhere, language list, settings with the controls tab, redraw with typed text kept' };
    },
  },
  {
    id: 'ui.lobby-stable',
    title: 'Other players changing things in the lobby updates it in place: no new screen, no scroll reset, the preview and the arena rows stay',
    async run() {
      const problems: string[] = [];
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:500px';
      document.body.appendChild(host);
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, time: 'day', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, autoAim: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: noop, onLook: noop, getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onSlot: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
      }, settings);
      const p = (slot: number, name: string, weapon: (typeof WEAPON_IDS)[number] = 'pistol') => ({ slot, name, host: slot === 0, connected: true, weapon, acc: 0, color: slot });
      try {
        ui.showLobby('ABCD', [p(0, 'host')], false, { map: 0, mods: 1 }, false);
        const panel = host.querySelector<HTMLElement>('#wrh-lobby');
        const stage = host.querySelector('.wrh-prev');
        if (!panel || !stage) throw new Error('the lobby did not draw');
        panel.style.maxHeight = '200px';
        panel.style.overflow = 'auto';
        panel.scrollTop = 120;
        const before = panel.scrollTop;
        ui.showLobby('ABCD', [p(0, 'host'), p(1, 'guest', 'ar')], false, { map: 0, mods: 1 }, false);
        ui.showLobby('ABCD', [p(0, 'host'), p(1, 'guest', 'smg'), p(2, 'third')], false, { map: 2, mods: 2 }, false);
        if (host.querySelector('#wrh-lobby') !== panel) problems.push('the lobby panel was replaced by an update');
        if (host.querySelector('.wrh-prev') !== stage) problems.push('the preview was rebuilt by an update');
        if (panel.scrollTop !== before) problems.push(`the scroll position moved from ${before} to ${panel.scrollTop}`);
        if (host.querySelectorAll('#wrh-plist li').length !== 3) problems.push('the player list did not grow to three');
        if (!host.querySelector('#wrh-pcount')?.textContent?.includes('3/')) problems.push('the player count did not update');
        if (!host.querySelector('#wrh-arena-wrap')?.textContent?.includes(UI_STRINGS.en.maps[2]!)) problems.push('the arena the host picked did not show up');
      } catch (e) {
        problems.push(String(e));
      } finally {
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'lobby updates in place' };
    },
  },
  {
    id: 'ui.infobar',
    title: 'The info bar for team upgrades: slides in with the card name and who took it, one at a time, the next one queued behind it',
    async run() {
      const problems: string[] = [];
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:700px';
      document.body.appendChild(host);
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, time: 'day', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, autoAim: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: noop, onLook: noop, getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onSlot: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
      }, settings);
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
      try {
        ui.pushInfo('First aid', 'Everyone healed to full', 'Alice', '#1FA2FF');
        ui.pushInfo('Full magazines', 'Every weapon refilled', 'Bob', '#FF4F9A');
        await sleep(120);
        let items = [...host.querySelectorAll<HTMLElement>('.wrh-info .it')];
        if (items.length !== 1) problems.push(`${items.length} bars at once, expected 1 (the second waits)`);
        if (!items[0]?.classList.contains('in')) problems.push('the bar does not slide in');
        if (!items[0]?.textContent?.includes('Alice') || !items[0]?.textContent?.includes('First aid')) problems.push('the bar does not name the card and who took it');
        await sleep(4100);
        items = [...host.querySelectorAll<HTMLElement>('.wrh-info .it')];
        if (items.length !== 1 || !items[0]!.textContent?.includes('Bob')) problems.push('the queued bar did not follow the first one');
        await sleep(4100);
        if (host.querySelectorAll('.wrh-info .it').length !== 0) problems.push('the bar did not go away after its animation');
      } finally {
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'one at a time, queued, names the card and the player' };
    },
  },
  {
    id: 'ui.relics',
    title: 'The cards a character took sit bottom centre as icons (stacked with a count); hovering one outlines it in yellow and opens a text at the pointer',
    async run() {
      const problems: string[] = [];
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:700px';
      document.body.appendChild(host);
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, time: 'day', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, autoAim: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: noop, onLook: noop, getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onSlot: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
      }, settings);
      const w = createWorld(3);
      addPlayer(w, 0, 0, 0);
      try {
        ui.update(w, 0, 0, 1000, ['p']);
        if (host.querySelectorAll('.wrh-relic').length !== 0) problems.push('relics shown before any card was taken');
        const n = CARD_IDS.length;
        w.pCards[CARD_IDS.indexOf('damage')] = 2;
        w.pCards[CARD_IDS.indexOf('heal')] = 1;
        w.pCards[n + CARD_IDS.indexOf('crit')] = 3; // another character's: not shown
        ui.update(w, 0, 0, 1200, ['p']);
        const relics = [...host.querySelectorAll<HTMLElement>('.wrh-relic')];
        if (relics.length !== 2) problems.push(`${relics.length} relics, expected the 2 kinds this character took`);
        if (!relics.some((r) => r.textContent?.includes('x2'))) problems.push('the stack count (x2) is missing');
        if (!host.querySelector('.wrh-relics.on')) problems.push('the bar is not shown');
        const bar = host.querySelector<HTMLElement>('.wrh-relics')!;
        host.style.left = '0px';
        host.style.top = '0px';
        const r = relics[0]!;
        r.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 300, clientY: 400 }));
        const tip = host.querySelector<HTMLElement>('.wrh-tip');
        if (!tip || tip.style.display !== 'block') problems.push('no text opens on hover');
        else {
          if (!/damage/i.test(tip.textContent ?? '')) problems.push(`the hover text does not say what the card does (${tip.textContent})`);
          if (!/Common|Rare|Epic/.test(tip.textContent ?? '')) problems.push('the hover text has no rarity');
          if (parseFloat(tip.style.left) < 300) problems.push('the text is not at the pointer');
        }
        r.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
        if (tip && tip.style.display !== 'none') problems.push('the text stays after the pointer left');
        void bar;
        ui.clearHud();
        if (host.querySelector('.wrh-relics.on')) problems.push('the bar stays after the HUD is cleared');
      } finally {
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'icons, counts, hover text at the pointer' };
    },
  },
  {
    id: 'ui.squadstats',
    title: 'Squad cards show each character DPS and kills; hovering one opens its class, level, kills and damage',
    async run() {
      const problems: string[] = [];
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:700px';
      document.body.appendChild(host);
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, time: 'day', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, autoAim: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: noop, onLook: noop, getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onSlot: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
      }, settings);
      const w = createWorld(3);
      addPlayer(w, 0, 0, 0, 'pistol', 1);
      addPlayer(w, 1, 2, 0, 'pistol', 2);
      try {
        ui.update(w, 0, 0, 1000, ['Ann', 'Bob']);
        // slot 0 deals 100 damage per second for a while, slot 1 nothing
        for (let k = 1; k <= 20; k++) {
          w.pPerk[0 * 24 + 21] = k * 25;
          w.pPerk[0 * 24 + 17] = Math.floor(k / 4);
          ui.update(w, 0, 0, 1000 + k * 250, ['Ann', 'Bob']);
        }
        const cards = [...host.querySelectorAll<HTMLElement>('.wrh-pc')];
        if (cards.length !== 2) problems.push(`${cards.length} cards`);
        const dps = cards.map((c) => Number(c.querySelector('.stats b')?.textContent));
        if (!(dps[0]! > 80 && dps[0]! < 120)) problems.push(`DPS of the shooter is ${dps[0]}, expected about 100`);
        if (dps[1] !== 0) problems.push(`DPS of the idle character is ${dps[1]}`);
        if (!/5/.test(cards[0]!.querySelectorAll('.stats b')[1]?.textContent ?? '')) problems.push('kills missing');
        cards[0]!.querySelector('.top')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 120, clientY: 600 }));
        const tip = host.querySelector<HTMLElement>('.wrh-tip');
        if (!tip || tip.style.display !== 'block') problems.push('no text opens on hover');
        else if (!/Medic/.test(tip.textContent ?? '') || !/Kills: 5/.test(tip.textContent ?? '') || !/Damage dealt: 500/.test(tip.textContent ?? '')) problems.push(`hover text lacks class, kills or damage (${tip.textContent})`);
        cards[0]!.querySelector('.top')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
        if (tip && tip.style.display !== 'none') problems.push('the text stays after the pointer left');
      } finally {
        ui.clearHud();
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'dps, kills and the hover text' };
    },
  },
  {
    id: 'ground.telegraph',
    title: 'Telegraphed attacks paint their area (circle, rectangle) and spread the fill as the blow nears; acid and fire puddles show',
    async run(ctx) {
      const problems: string[] = [];
      const w = createWorld(5);
      w.waveTick = 1e9;
      w.countMul = 0;
      addPlayer(w, 0, 0, 0);
      const ground = new GroundFx();
      ctx.stage.scene.add(ground.group);
      const reddish = (px: Uint8Array): number => {
        let n = 0;
        for (let i = 0; i < px.length; i += 4) if (px[i]! > px[i + 1]! + 45 && px[i]! > px[i + 2]! + 35) n++;
        return n;
      };
      const greenish = (px: Uint8Array): number => {
        let n = 0;
        for (let i = 0; i < px.length; i += 4) if (px[i + 1]! > px[i]! + 25 && px[i + 1]! > px[i + 2]! + 60) n++;
        return n;
      };
      const shot = (): Uint8Array => {
        ground.update(w, 1, null, 0.016);
        ctx.stage.follow(0, 0);
        ctx.stage.render();
        return grab(ctx);
      };
      try {
        const empty = shot();
        // a circle of radius 6 charging for 2 seconds: early and late
        const t = addTelegraph(w, TeleShape.Circle, TeleEffect.Hurt, 0, 0, 0, 6, 0, 2, 20);
        w.tLeft[t] = Math.round(w.tTotal[t]! * 0.85);
        const early = shot();
        w.tLeft[t] = Math.round(w.tTotal[t]! * 0.1);
        const late = shot();
        const r0 = reddish(empty);
        const rE = reddish(early);
        const rL = reddish(late);
        if (rE < r0 + 400) problems.push(`early circle paints too little (${rE - r0} red px)`);
        if (rL < rE * 1.3) problems.push(`the fill does not spread (${rE} -> ${rL} red px)`);
        ground.colorblind = true;
        const blind = shot();
        if (reddish(blind) > rL * 0.5) problems.push('colour-blind mode still paints red');
        if (diffCount(blind, late) < 2000) problems.push('colour-blind mode looks the same as red');
        ground.colorblind = false;
        w.tActive[t] = 0;
        // a rectangle along the x axis, 10 long either way and 2 wide
        const q = addTelegraph(w, TeleShape.Rect, TeleEffect.Kill, 0, 0, 0, 2, 10, 2, 0);
        w.tLeft[q] = Math.round(w.tTotal[q]! * 0.2);
        const rect = shot();
        if (reddish(rect) < r0 + 300 && diffCount(rect, empty) < 1500) problems.push('the rectangle is not drawn');
        w.tActive[q] = 0;
        // acid and fire puddles
        const baseGreen = greenish(shot());
        addZone(w, -2, 0, 3, 5, ZoneKind.Acid);
        const acid = shot();
        if (greenish(acid) < baseGreen + 300) problems.push('the acid puddle is not green enough to see');
        w.zActive[0] = 0;
        addZone(w, 2, 0, 3, 5, ZoneKind.Fire);
        const fire = shot();
        if (reddish(fire) < r0 + 150) problems.push('the fire puddle is not drawn');
        w.zActive[0] = 0;
        const gone = shot();
        if (diffCount(gone, empty) > 300) problems.push('effects leave something behind');
      } finally {
        ctx.stage.scene.remove(ground.group);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'circle, rectangle, spreading fill, colour-blind palette, acid and fire' };
    },
  },
  {
    id: 'cine.finisher',
    title: 'The finisher pushes the camera in and slows effects, then returns to the normal view exactly',
    async run() {
      const problems: string[] = [];
      const c = new Cinematic();
      if (c.update(0, 2).zoom !== 1) problems.push('idle cinematic changes the view');
      c.start(10, 2.5, 3, 4, 1);
      let peakZoom = 1;
      let minScale = 1;
      let outSounds = 0;
      let last = null as null | ReturnType<Cinematic['update']>;
      for (let t = 10; t < 13; t += 1 / 60) {
        last = c.update(t, 1.8);
        peakZoom = Math.max(peakZoom, last.zoom);
        minScale = Math.min(minScale, c.timeScale());
        if (c.takeOutSound(t)) outSounds++;
      }
      if (peakZoom < 1.75) problems.push(`peak zoom ${peakZoom.toFixed(2)}, expected about 1.8`);
      if (minScale > 0.3) problems.push(`slow motion only reaches ${minScale.toFixed(2)}`);
      if (outSounds !== 1) problems.push(`${outSounds} pull-back sounds`);
      if (!last || last.zoom !== 1 || last.focus !== 0 || c.active) problems.push('the view does not return to normal');
      if (c.timeScale() !== 1) problems.push('effects stay slow after the finisher');
      // paused: the clock stands still
      c.start(20, 2.5, 0, 0, -1);
      c.update(20.5, 1.8);
      c.hold(5);
      if (!c.active || c.update(25.6, 1.8).zoom <= 1) problems.push('a pause lost the finisher');
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : `peak zoom ${peakZoom.toFixed(2)}, slowest ${minScale.toFixed(2)}` };
    },
  },
];
