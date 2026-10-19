import * as THREE from 'three';
import { Buttons, CARD_IDS, CARD_RARITY, MAPS, PERSONAL_CARDS, WEAPON_IDS } from '@wrh/shared';
import { addPlayer, createWorld } from '@wrh/sim';
import { DEFAULT_BINDINGS, Input } from '../input';
import { ACCESSORIES, WEAPON_UNLOCK, isUnlocked, loadProfile, recordGame, saveProfile } from '../profile';
import { ArenaView } from '../render/arena';
import { PowerView, strengthOf } from '../render/power';
import { Character } from '../render/character';
import { PlayerAnimator } from '../render/playerAnim';
import { asset } from '../assets';
import { BANK_FILES, MUSIC_FILES } from '../audio';
import { Ui, UI_STRINGS, type Settings } from '../ui';
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
      // weapon switch: Q takes the slot that is not in the hands, latched at the press so holding it does not flip back
      input.resetBindings();
      input.switchTarget = 1;
      input.debugKeys(['KeyQ']);
      if (!(input.sample(0, 0).input.buttons & Buttons.Card2)) problems.push('Q does not select the sidearm');
      input.switchTarget = 0; // the world changed under the held key
      if (!(input.sample(0, 0).input.buttons & Buttons.Card2) || input.sample(0, 0).input.buttons & Buttons.Card1) problems.push('a held Q flips back and forth');
      input.debugKeys([]);
      input.sample(0, 0);
      input.debugKeys(['KeyQ']);
      if (!(input.sample(0, 0).input.buttons & Buttons.Card1)) problems.push('a new Q press does not go back to the main weapon');
      input.debugKeys([]);
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
      for (const lang of ['en', 'tr'] as const) {
        const t = UI_STRINGS[lang] as unknown as Record<string, Record<string, unknown>>;
        for (const c of CARD_IDS) if (!Array.isArray(t.cards![c]) || (t.cards![c] as string[]).length !== 2) problems.push(`${lang}: card ${c} has no title and text`);
        for (const wp of WEAPON_IDS) if (!t.weapons![wp]) problems.push(`${lang}: weapon ${wp} has no name`);
        for (const id of ['-1', ...MAPS.map((_, i) => String(i))]) if (!t.maps![id]) problems.push(`${lang}: map ${id} has no name`);
        for (const a of ['up', 'down', 'left', 'right', 'fire', 'grenade', 'revive', 'reload', 'dash', 'card1', 'card2', 'card3', 'pause']) if (!t.actions![a]) problems.push(`${lang}: action ${a} has no label`);
        if ((UI_STRINGS[lang].diffs as readonly string[]).length !== 3) problems.push(`${lang}: needs three difficulty names`);
        if ((UI_STRINGS[lang].accs as readonly string[]).length !== ACCESSORIES.length) problems.push(`${lang}: needs a name for each of the ${ACCESSORIES.length} accessories`);
      }
      return { status: problems.length ? 'fail' : 'pass', detail: problems.length ? problems.slice(0, 12).join(' | ') : `${en.length} strings in two languages` };
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
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: noop, onLook: noop, getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onReplay: noop, onUiSound: noop, onSetting: noop,
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
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: (w) => weapons.push(w), onLook: (a, c) => looks.push([a, c]), getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onReplay: noop, onUiSound: noop, onSetting: noop,
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
      const settings: Settings = { fpsCap: 0, texture: 1, autoScale: true, music: 0, renderer: 'webgl', aa: 'off', bounce: false, volume: 0, shadows: 0, scale: 1, lang: 'en' };
      const noop = (): void => undefined;
      const ui = new Ui(host, {
        onSolo: noop, onHost: noop, onJoin: noop, onRejoin: noop, onWeapon: noop, onLook: noop, getBindings: () => ({}), onRebind: noop, onResetKeys: noop, onOptions: noop,
        onStart: noop, onLeave: noop, onCard: noop, onAgain: noop, onResume: noop, onReplay: noop, onUiSound: noop, onSetting: noop,
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
];
