import * as THREE from 'three';
import { Buttons, CARD_IDS, CARD_RARITY, ENEMY_TYPES, MAPS, PERSONAL_CARDS, WEAPON_IDS, WEAPON_RANK } from '@wrh/shared';
import { addPlayer, createWorld, giveWeapon, spawnEnemy } from '@wrh/sim';
import { angleTo, pickTarget } from '../autoAim';
import { ACTIONS, DEFAULT_BINDINGS, Input } from '../input';
import { ACCESSORIES, WEAPON_UNLOCK, isUnlocked, loadProfile, recordGame, saveProfile } from '../profile';
import { ArenaView } from '../render/arena';
import { renderControlsSheet, renderSettingsPanel } from '../settingsPanel';
import { Fx } from '../render/fx';
import { AmmoRing } from '../render/ammoRing';
import { RagdollPool } from '../render/ragdoll';
import { PowerView, strengthOf } from '../render/power';
import { Character } from '../render/character';
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
      // weapon keys are one-shot presses: a digit picks that rank, Q the next weapon, holding repeats nothing
      input.resetBindings();
      input.debugKeys([]);
      const press = (code: string, repeat = false): void => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat }));
      };
      press('Digit3');
      if (input.sample(0, 0).input.wsel !== 3) problems.push('digit 3 does not queue weapon rank 3');
      if (input.sample(0, 0).input.wsel !== 0) problems.push('a weapon key press is sent more than once');
      press('KeyQ');
      if (input.sample(0, 0).input.wsel !== 14) problems.push('Q does not queue the next weapon');
      press('KeyQ', true);
      if (input.sample(0, 0).input.wsel !== 0) problems.push('a held Q keeps cycling weapons');
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit3' }));
      // auto-aim moves the shot direction but the cursor keeps steering grenades
      const aimed = input.sample(0, 0, 1.5).input;
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
    title: 'Both languages have every string: same keys, every card, weapon, map, difficulty and key action',
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
        for (const [k, n] of [['classNames', 7], ['classTips', 7], ['waveMods', 6], ['waveModTips', 6], ['elites', 7], ['powerups', 9], ['combos', 6]] as const) if (t2[k]!.length !== n) problems.push(`${lang}: ${k} needs ${n} entries`);
      }
      for (const lang of ['en', 'tr', 'de', 'es', 'fr', 'ru'] as const) {
        const t = UI_STRINGS[lang] as unknown as Record<string, Record<string, unknown>>;
        for (const c of CARD_IDS) if (!Array.isArray(t.cards![c]) || (t.cards![c] as string[]).length !== 2) problems.push(`${lang}: card ${c} has no title and text`);
        for (const wp of WEAPON_IDS) if (!t.weapons![wp]) problems.push(`${lang}: weapon ${wp} has no name`);
        for (const id of ['-1', ...MAPS.map((_, i) => String(i))]) if (!t.maps![id]) problems.push(`${lang}: map ${id} has no name`);
        for (const a of ['up', 'down', 'left', 'right', 'fire', 'grenade', 'revive', 'reload', 'dash', 'card1', 'card2', 'card3', 'pause']) if (!t.actions![a]) problems.push(`${lang}: action ${a} has no label`);
        if ((UI_STRINGS[lang].diffs as readonly string[]).length !== 3) problems.push(`${lang}: needs three difficulty names`);
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
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onReplay: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
      }, settings);
      const w = createWorld(1);
      addPlayer(w, 0, 0, 0);
      try {
        let clock = 1000;
        const bySet = (cards: string[]): void => {
          cards.forEach((c, i) => (w.cardOffer[i] = CARD_IDS.indexOf(c as (typeof CARD_IDS)[number])));
        };
        for (const lang of ['en', 'tr'] as const) {
          ui.applySettings({ ...settings, lang });
          // walk through the whole pool three cards at a time
          for (let start = 0; start < CARD_IDS.length; start += 3) {
            const group = [0, 1, 2].map((k) => CARD_IDS[(start + k) % CARD_IDS.length]!);
            bySet(group);
            w.cardTimer = 100;
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
              if (PERSONAL_CARDS.includes(id) !== /sen|you/i.test(tag)) problems.push(`${lang}/${id}: personal tag mismatch ("${tag}")`);
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
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onReplay: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
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
          onControls: () => changes.push(['controls', true]),
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
        ['damage', () => (w.modDamage = 1.3)],
        ['rate', () => (w.modRate = 1.2)],
        ['pierce', () => (w.modPierce = 2)],
        ['crit', () => (w.modCrit = 0.1)],
        ['blast', () => (w.modBlast = 1.3)],
        ['speed', () => (w.pModSpeed[0] = 1.2)],
        ['armor', () => (w.modArmor = 0.8)],
        ['magnet', () => (w.modMagnet = 1.5)],
        ['luck', () => (w.modLoot = 1.4)],
        ['scholar', () => (w.modXp = 1.3)],
        ['medic', () => (w.modRevive = 0.7)],
        ['quick', () => (w.modReload = 0.8)],
        ['roll', () => (w.modDash = 0.8)],
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
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onReplay: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
      }, settings);
      const problems: string[] = [];
      try {
        ui.setRing(2, 0.8, 0.5, 100, 100, true, true);
        const ring = host.querySelector<HTMLElement>('.wrh-ring');
        if (!ring || ring.style.display !== 'block') problems.push('ring not shown');
        else {
          if (ring.style.getPropertyValue('--p') !== '50') problems.push('ring progress ' + ring.style.getPropertyValue('--p'));
          if (ring.style.getPropertyValue('--b') !== '80') problems.push('ring bleed ' + ring.style.getPropertyValue('--b'));
        }
        ui.setRing(2, 0, 0, 0, 0, false, false);
        if (host.querySelector<HTMLElement>('.wrh-ring')!.style.display !== 'none') problems.push('ring not hidden');
        ui.setArrow(1, 'Ayse', '#ff4f9a', 700, 300, Math.PI / 2, true, true);
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
      else if (Math.abs(angleTo(w, 0, t) - Math.PI / 2) > 1e-6) problems.push('wrong angle to the nearest enemy');
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
      // out of reach
      w.brX[0] = 200;
      w.brActive[0] = 0;
      if (pickTarget(w, 0, null)) problems.push('a target far out of reach was chosen');
      void far;
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'nearest, sticky, barrel-safe and range-limited' };
    },
  },
  {
    id: 'ui.inventory',
    title: 'The weapon list above the minimap: key labels, ammo, a yellow outline on the selected weapon, faded empty weapons',
    async run() {
      const problems: string[] = [];
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1000px;height:700px';
      document.body.appendChild(host);
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, time: 'day', dynLights: true, weather: true, colorblind: false, textSize: 0, shake: 1, hitStop: true, damageNumbers: true, announcer: true, autoAim: true, ammoRing: true, nameTags: true, minimap: true, showFps: false, particles: 1, gore: 1, corpseTime: 1, sfxVolume: 1, voiceVolume: 1, uiSounds: true, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: noop, onLook: noop, getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onReplay: noop, onUiSound: noop, onSetting: noop, onResetSettings: noop,
      }, settings);
      const w = createWorld(4);
      w.waveTick = 1e9;
      w.countMul = 0;
      addPlayer(w, 0, 0, 0, 'ar');
      try {
        giveWeapon(w, 0, WEAPON_IDS.indexOf('sniper'));
        giveWeapon(w, 0, WEAPON_IDS.indexOf('minigun'));
        w.pInvMag[WEAPON_IDS.indexOf('sniper')] = 0;
        w.pInvAmmo[WEAPON_IDS.indexOf('sniper')] = 0;
        ui.update(w, 0, 0, 1000, ['p']);
        const rows = [...host.querySelectorAll<HTMLElement>('.wrh-inv .row')];
        const expected = ['pistol', 'ar', 'sniper', 'minigun'].length;
        if (rows.length !== expected) problems.push(`${rows.length} rows, expected ${expected}`);
        const keys = rows.map((r) => r.querySelector('kbd')?.textContent);
        const rankKey = (id: (typeof WEAPON_RANK)[number]): string => (WEAPON_RANK.indexOf(id) < 9 ? String(WEAPON_RANK.indexOf(id) + 1) : 'Q');
        if (keys.join(',') !== ['pistol', 'ar', 'sniper', 'minigun'].map((id) => rankKey(id as (typeof WEAPON_RANK)[number])).join(',')) problems.push(`keys ${keys.join(',')} are not the fixed ranks`);
        const cur = rows.filter((r) => r.classList.contains('cur'));
        if (cur.length !== 1 || !cur[0]!.textContent?.includes('Assault')) problems.push('the weapon in the hands is not the single outlined row');
        else if (!getComputedStyle(cur[0]!).borderTopColor.includes('255, 210, 31')) problems.push('the selected row has no yellow outline');
        const dry = rows.filter((r) => r.classList.contains('dry'));
        if (dry.length !== 1 || !dry[0]!.textContent?.includes('Sniper')) problems.push('the empty sniper is not the one faded row');
        else if (Number(getComputedStyle(dry[0]!).opacity) > 0.6) problems.push('the empty weapon is not see-through');
        if (!rows[0]!.textContent?.includes('\u221e')) problems.push('the pistol does not show an infinite reserve');
      } finally {
        host.remove();
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.join(' | ') : 'list, keys, outline and faded empty rows are right' };
    },
  },
];
