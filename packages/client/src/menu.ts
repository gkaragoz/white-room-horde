/**
 * The full-screen main menu and the online room: markup and styles.
 *
 * The menu is a hub of big cards (Play, Weapons and Class, Difficulty, Achievements, Settings); each opens a full-screen page
 * with a Back button. All pages live in one DOM tree and `data-page` on `.wrh-home` picks the visible one, so every element
 * id the rest of the game and the QA scripts rely on (#wrh-solo, #wrh-host, #wrh-join, #wrh-code, #wrh-name, .wrh-class[data-cls],
 * ...) exists the whole time. The pieces that carry state (weapon buttons, the 3D preview block, the arena and difficulty rows)
 * are built by Ui and handed in. The online room reuses the same cards.
 */
import { icon } from './icons';

export interface MenuParts {
  title: string;
  tag: string;
  bestLabel: string;
  bestWave: number;
  bestKills: number;
  invite: string;
  nameLabel: string;
  savedName: string;
  weaponLabel: string;
  weaponsHtml: string;
  /** Tabs, turntable, arrows and the name of what is shown (moves between the Play and the Weapons pages). */
  stageHtml: string;
  /** Colour swatches. */
  lookHtml: string;
  /** Class picker with its tip. */
  classHtml: string;
  arenaHtml: string;
  /** The inline 20-multiplier grid of the Difficulty page. */
  modsHtml: string;
  soloLabel: string;
  hostLabel: string;
  joinLabel: string;
  onlineLabel: string;
  settingsLabel: string;
  achLabel: string;
  /** Earned achievements the player has not looked at yet (a red badge on the card). */
  achUnread: number;
  achSub: string;
  closeLabel: string;
  rejoinHtml: string;
  /** The meta progression: the level path above the cards, the Codex card and the Codex page (all empty while it is off). */
  meta?: { path: string; codexLabel: string; codexSub: string; codexPage: string };
  codeLabel: string;
  inviteCode: string;
  passLabel: string;
  serverLabel: string;
  defServer: string;
  error: string;
  words: {
    back: string;
    play: string;
    playSub: string;
    loadout: string;
    loadoutSub: string;
    loadoutIcon: string;
    difficulty: string;
    modsSub: string;
    modsIcon: string;
    settingsSub: string;
    change: string;
    achIcon: string;
  };
}

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const bubbles = (): string => Array.from({ length: 14 }, (_, i) => `<i style="--x:${(i * 73) % 100}%;--s:${40 + ((i * 29) % 90)}px;--d:${14 + ((i * 7) % 16)}s;--l:${-((i * 5) % 20)}s"></i>`).join('');

/** A sub-page header: Back button and title. */
export function subBar(back: string, title: string, go = 'hub', id = ''): string {
  return `<header class="wrh-subbar"><button type="button" class="wrh-back" data-go="${go}"${id ? ` id="${id}"` : ''}>&#8249; ${esc(back)}</button><h2>${title}</h2></header>`;
}

export function menuMarkup(p: MenuParts): string {
  const w = p.words;
  return `<div class="wrh-home wrh-scroll" data-page="hub">
    <div class="wrh-home-bg" aria-hidden="true">${bubbles()}</div>
    <div class="wrh-pg wrh-pg-hub" data-p="hub">
      <header class="wrh-hbar">
        <h1 class="wrh-logo">${p.title}</h1>
        <p class="wrh-hsub">${p.tag}<span class="wrh-best">${icon('hud_star', 18)} ${p.bestLabel}: <b>${p.bestWave}</b> / <b>${p.bestKills}</b></span></p>
      </header>
      ${p.invite}
      ${p.error ? `<p class="wrh-err">${esc(p.error)}</p>` : ''}
      ${p.meta?.path ?? ''}
      <main class="wrh-hubcards">
        <button type="button" class="wrh-hc wrh-hc-play" id="wrh-card-play" data-go="play">
          <span class="ico">${icon('hud_right', 88)}</span>
          <span class="txt"><b>${w.play}</b><small>${w.playSub}</small></span>
        </button>
        ${p.rejoinHtml}
        ${p.meta ? `<button type="button" class="wrh-hc" id="wrh-open-codex" data-go="codex"><span class="ico">${icon('hud_star', 64)}</span><span class="txt"><b>${p.meta.codexLabel}</b><small id="wrh-hc-codex">${p.meta.codexSub}</small></span></button>` : ''}
        <button type="button" class="wrh-hc" id="wrh-open-ach"><span class="ico"><img src="${w.achIcon}" width="64" height="64" alt="" draggable="false"></span><span class="txt"><b>${p.achLabel}</b><small id="wrh-hc-ach">${p.achSub}</small></span>${p.achUnread > 0 ? '<em class="wrh-badge" id="wrh-ach-badge">!</em>' : ''}</button>
        <button type="button" class="wrh-hc" id="wrh-open-loadout" data-go="loadout"><span class="ico" id="wrh-hc-wicon">${w.loadoutIcon}</span><span class="txt"><b>${w.loadout}</b><small id="wrh-hc-loadout">${w.loadoutSub}</small></span></button>
        <button type="button" class="wrh-hc" id="wrh-card-mods" data-go="mods"><span class="ico" id="wrh-hc-micon">${w.modsIcon}</span><span class="txt"><b>${w.difficulty}</b><small id="wrh-hc-mods">${w.modsSub}</small></span></button>
        <button type="button" class="wrh-hc" id="wrh-open-settings"><span class="ico">${icon('tb_set', 64)}</span><span class="txt"><b>${p.settingsLabel}</b><small>${w.settingsSub}</small></span></button>
      </main>
    </div>

    <section class="wrh-pg" data-p="play">
      ${subBar(w.back, w.play)}
      <div class="wrh-pcols">
        <div class="wrh-hcard wrh-pl-main">
          <label for="wrh-name">${p.nameLabel}</label>
          <input id="wrh-name" maxlength="16" value="${esc(p.savedName)}" placeholder="player" autocomplete="off">
          <div class="wrh-slot" data-slot="play"></div>
          <div class="wrh-loadline"><span id="wrh-loadline"></span><button type="button" class="wrh-linkbtn" data-go="loadout">${w.change}</button></div>
        </div>
        <div class="wrh-hcard wrh-pl-side">
          <div id="wrh-arena-menu">${p.arenaHtml}</div>
          <div class="wrh-startrow">
            <button id="wrh-solo" class="wrh-play">${icon('hud_right', 34)}<span>${p.soloLabel}</span></button>
            <button id="wrh-online" class="wrh-big alt">${icon('tb_lang', 30)}<span>${p.onlineLabel}</span></button>
          </div>
        </div>
      </div>
    </section>

    <section class="wrh-pg" data-p="loadout">
      ${subBar(w.back, w.loadout)}
      <div class="wrh-pcols">
        <div class="wrh-hcard wrh-pl-main">
          <div class="wrh-slot" data-slot="loadout"><div class="wrh-stagebox" id="wrh-stagebox">${p.stageHtml}</div></div>
          ${p.lookHtml}
        </div>
        <div class="wrh-hcard wrh-pl-side">
          <label>${p.weaponLabel}</label>
          <div class="wrh-weapons" id="wrh-weapons">${p.weaponsHtml}</div>
          ${p.classHtml}
        </div>
      </div>
    </section>

    ${p.meta ? `<section class="wrh-pg" data-p="codex">
      ${subBar(w.back, p.meta.codexLabel)}
      <div class="wrh-hcard wrh-codexpage" id="wrh-codex-page">${p.meta.codexPage}</div>
    </section>` : ''}

    <section class="wrh-pg" data-p="mods">
      ${subBar(w.back, w.difficulty)}
      <div class="wrh-hcard wrh-modspage" id="wrh-mods-page">${p.modsHtml}</div>
    </section>

    <div class="wrh-online" id="wrh-online-panel" role="dialog" aria-modal="true">
      <div class="wrh-online-box">
        <button type="button" class="wrh-online-x" id="wrh-online-x" aria-label="${esc(p.closeLabel)}">&times;</button>
        <h2>${icon('tb_lang', 34)} ${p.onlineLabel}</h2>
        <button id="wrh-host" class="wrh-big">${icon('hud_party', 28)}<span>${p.hostLabel}</span></button>
        <div class="wrh-row"><div style="flex:1"><label for="wrh-code">${p.codeLabel}</label><input id="wrh-code" maxlength="4" style="text-transform:uppercase" placeholder="ABCD" value="${esc(p.inviteCode)}"></div><button id="wrh-join" class="alt">${p.joinLabel}</button></div>
        <label for="wrh-pass">${p.passLabel}</label><input id="wrh-pass" maxlength="24" autocomplete="off">
        <label for="wrh-server">${p.serverLabel}</label><input id="wrh-server" value="${esc(p.defServer)}" placeholder="wss://your-tunnel.example.com/ws"><p class="sub" id="wrh-relay-note"></p>
      </div>
    </div>
  </div>`;
}

export interface LobbyParts {
  back: string;
  codeLabel: string;
  code: string;
  locked: string;
  waiting: string;
  playersLabel: string;
  playersHtml: string;
  weaponLabel: string;
  weaponsHtml: string;
  previewHtml: string;
  arenaHtml: string;
  startHtml: string;
  inviteHtml: string;
  leaveLabel: string;
}

/** The online room: players on the left, preview and loadout in the middle, arena, difficulty and the buttons on the right. */
export function lobbyMarkup(p: LobbyParts): string {
  return `<div class="wrh-home wrh-scroll wrh-lobby" id="wrh-lobby" data-page="lobby">
    <div class="wrh-home-bg" aria-hidden="true">${bubbles()}</div>
    <div class="wrh-pg wrh-pg-lobby">
      <header class="wrh-subbar"><button type="button" class="wrh-back" id="wrh-leave">&#8249; ${esc(p.leaveLabel)}</button><h2>${esc(p.codeLabel)}: <span class="wrh-roomcode">${esc(p.code)}</span>${p.locked}</h2>${p.waiting ? `<p class="wrh-hsub">${p.waiting}</p>` : ''}</header>
      <main class="wrh-lgrid">
        <section class="wrh-hcard wrh-lleft">
          <label id="wrh-pcount">${p.playersLabel}</label>
          <ul class="wrh-plist" id="wrh-plist">${p.playersHtml}</ul>
          <label>${p.weaponLabel}</label>
          <div class="wrh-weapons">${p.weaponsHtml}</div>
        </section>
        <section class="wrh-hcard wrh-lmid">
          ${p.previewHtml}
        </section>
        <section class="wrh-hcard wrh-lright">
          <div id="wrh-arena-wrap">${p.arenaHtml}</div>
        </section>
      </main>
      <footer class="wrh-lbar">${p.inviteHtml}${p.startHtml}</footer>
    </div>
  </div>`;
}

export const MENU_CSS = `
.wrh-home{position:absolute;inset:0;z-index:20;pointer-events:auto;overflow:auto;display:flex;flex-direction:column;padding:clamp(14px,2.6vh,36px) clamp(14px,3.6vw,76px) clamp(18px,3vh,40px);max-height:none;zoom:var(--wrh-zoom,1);
 background:radial-gradient(1300px 760px at 72% 12%,rgba(255,255,255,.95),transparent 62%),radial-gradient(1000px 640px at 6% 96%,rgba(31,162,255,.2),transparent 62%),linear-gradient(180deg,#eef2f6,#d5dde6)}
.wrh-home-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.wrh-home-bg i{position:absolute;left:var(--x);bottom:-120px;width:var(--s);height:var(--s);border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.95),rgba(180,214,240,.35) 62%,transparent 70%);opacity:.55;animation:wrh-float var(--d) linear var(--l) infinite}
@keyframes wrh-float{to{transform:translateY(-120vh) translateX(40px)}}
@media (prefers-reduced-motion:reduce){.wrh-home-bg i{animation:none;bottom:20%}}
.wrh-pg{position:relative;display:none;flex:1;min-height:0;flex-direction:column;width:100%;max-width:1240px;margin:0 auto}
.wrh-home[data-page="hub"] [data-p="hub"],.wrh-home[data-page="play"] [data-p="play"],.wrh-home[data-page="loadout"] [data-p="loadout"],.wrh-home[data-page="mods"] [data-p="mods"],.wrh-home[data-page="codex"] [data-p="codex"],.wrh-pg-lobby{display:flex}
.wrh-hbar{position:relative;display:flex;align-items:baseline;gap:clamp(14px,2vw,32px);flex-wrap:wrap;margin:0 0 clamp(10px,2.4vh,24px);padding-right:110px}
.wrh-home .wrh-logo{font-size:clamp(34px,4.2vw,62px)!important;line-height:1;text-align:left;margin:0!important;letter-spacing:1px}
.wrh-hsub{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:0;font-size:clamp(13px,1.2vw,18px);opacity:.78}
.wrh-best{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:99px;background:rgba(255,253,248,.8);border:2px solid #cdbfa5}
.wrh-err{color:#c8242c;font-weight:700;margin:0 0 10px}
.wrh-invite{position:relative;margin:0 0 12px}

/* the hub: one wide Play card and a row of section cards */
.wrh-hubcards{position:relative;flex:1;min-height:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(190px,1.7fr) minmax(150px,1fr);gap:clamp(12px,1.6vw,24px)}
.wrh-hubcards:has(.wrh-hc-rejoin){grid-template-rows:minmax(170px,1.7fr) auto minmax(150px,1fr)}
.wrh-hubcards>.wrh-hc-play{grid-column:1 / -1}
.wrh-hubcards>.wrh-hc-rejoin{grid-column:1 / -1;min-height:0}
.wrh-ui .wrh-home button.wrh-hc{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(8px,1.4vh,16px);width:100%;min-height:0;margin:0;padding:clamp(12px,2vh,22px) 12px;border-radius:26px;text-align:center;color:#2b3a52;background:rgba(255,253,248,.82);border:2px solid rgba(205,191,165,.85);box-shadow:0 5px 0 #cdbfa5,0 14px 34px rgba(60,45,20,.14);transition:transform .12s,box-shadow .12s;font-weight:700}
.wrh-ui .wrh-home button.wrh-hc:hover{transform:translateY(-3px);background:#fff;filter:none}
.wrh-ui .wrh-home button.wrh-hc:focus-visible{outline:4px solid #1fa2ff;outline-offset:3px}
.wrh-hc .ico{display:flex;align-items:center;justify-content:center;height:clamp(48px,9vh,76px)}
.wrh-hc .ico{max-width:100%;min-width:0}
.wrh-hc .ico img{max-height:100%;max-width:100%;width:auto;height:100%;object-fit:contain}
.wrh-hc .ico .strip{display:flex;gap:4px;height:100%}
.wrh-hc .txt{display:flex;flex-direction:column;gap:4px;align-items:center;min-width:0;max-width:100%}
.wrh-hc .txt b{font-size:clamp(18px,1.9vw,26px);line-height:1.1}
.wrh-hc .txt small{font-size:clamp(12px,1.05vw,15px);opacity:.72;font-weight:600;line-height:1.25}
.wrh-ui .wrh-home button.wrh-hc.wrh-hc-play{flex-direction:row;gap:clamp(18px,3vw,48px);color:#fff;background:linear-gradient(180deg,#58cc78,#2f9a52);border-color:#2a8a49;box-shadow:0 8px 0 #1f6e39,0 20px 44px rgba(30,120,60,.34)}
.wrh-ui .wrh-home button.wrh-hc.wrh-hc-play:hover{background:linear-gradient(180deg,#68da86,#37a85b)}
.wrh-hc-play .ico{height:clamp(70px,16vh,130px)}
.wrh-hc-play .txt{align-items:flex-start}
.wrh-hc-play .txt b{font-size:clamp(40px,6vw,84px);letter-spacing:.04em;text-transform:uppercase;text-shadow:0 3px 0 rgba(20,90,45,.55)}
.wrh-hc-play .txt small{font-size:clamp(14px,1.6vw,22px);opacity:.92}
.wrh-ui .wrh-home button.wrh-hc.wrh-hc-rejoin{flex-direction:row;gap:14px;background:#fff8dc;border-color:#e9b92f;box-shadow:0 4px 0 #e0c46a;padding:10px 16px}
.wrh-hc-rejoin .ico{height:34px}
.wrh-hc-rejoin .txt b{font-size:clamp(15px,1.5vw,20px)}
.wrh-hc .wrh-badge{top:12px;right:14px}

/* sub-pages */
.wrh-subbar{position:relative;display:flex;align-items:center;gap:clamp(12px,2vw,24px);flex-wrap:wrap;margin:0 0 clamp(10px,2vh,20px);padding-right:110px;min-height:46px}
.wrh-subbar h2{margin:0;font-size:clamp(24px,3vw,38px);line-height:1.1}
.wrh-ui .wrh-home button.wrh-back{display:inline-flex;align-items:center;gap:6px;margin:0;padding:10px 20px;border-radius:14px;font-size:clamp(15px,1.3vw,18px);font-weight:800;background:#fffdf8;color:#2b3a52;border:2px solid #cdbfa5;box-shadow:0 3px 0 #cdbfa5}
.wrh-ui .wrh-home button.wrh-back:hover{background:#fff}
.wrh-roomcode{letter-spacing:5px;color:#1fa2ff}
.wrh-pcols{position:relative;flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:clamp(14px,2vw,32px);align-items:stretch}
.wrh-hcard{display:flex;flex-direction:column;min-width:0;padding:clamp(16px,1.8vw,28px);border-radius:24px;background:rgba(255,253,248,.74);border:2px solid rgba(205,191,165,.75);box-shadow:0 10px 40px rgba(60,45,20,.14);backdrop-filter:blur(8px)}
.wrh-home label{font-size:13px;font-weight:700;opacity:.7;margin-top:8px}
.wrh-home input{font-size:17px;padding:12px 14px;border-radius:12px}
.wrh-home .wrh-pl-main input{margin:2px 0 6px}
.wrh-ui .wrh-home button.wrh-play{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:clamp(60px,9vh,84px);font-size:clamp(20px,2vw,28px);margin:6px 0;border-radius:20px;background:linear-gradient(180deg,#58cc78,#2f9a52);box-shadow:0 5px 0 #1f6e39,0 14px 30px rgba(30,120,60,.3);transition:transform .12s}
.wrh-ui .wrh-home button.wrh-play:hover{transform:translateY(-2px)}
.wrh-ui .wrh-home button.wrh-big{display:flex;align-items:center;gap:12px;width:100%;min-height:clamp(52px,7.4vh,68px);font-size:clamp(16px,1.5vw,20px);margin:4px 0;border-radius:16px;justify-content:flex-start;padding:8px 18px}
.wrh-ui .wrh-home button.wrh-big.alt{background:#fffdf8;color:#2b3a52;border:2px solid #cdbfa5;box-shadow:0 3px 0 #cdbfa5}
.wrh-startrow{margin-top:auto;padding-top:12px}
.wrh-loadline{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:8px;font-weight:700}
.wrh-ui .wrh-home button.wrh-linkbtn{margin:0;padding:6px 14px;border-radius:99px;font-size:14px;background:#efe7d6;color:#2b3a52;border:2px solid #cdbfa5}
.wrh-slot{display:flex;flex-direction:column;align-items:center;min-height:0}
.wrh-slot:empty{display:none}

/* the turntable and the loadout pieces (Play page, Weapons page, room) */
.wrh-home .wrh-prev,.wrh-home .wrh-stagebox{margin:0;width:100%}
.wrh-home .wrh-stagebox .wrh-prev{margin:0}
.wrh-home .wrh-canvas{width:auto;height:auto;max-width:100%;border-radius:20px;background:radial-gradient(circle at 50% 38%,#fffdf8,#e6dcc8)}
.wrh-home .wrh-canvas canvas{max-width:100%;height:auto!important}
.wrh-home .wrh-stage{gap:clamp(6px,1vw,16px);width:100%;justify-content:center}
.wrh-home .wrh-prev-name{font-size:clamp(18px,1.8vw,26px);margin-top:10px}
.wrh-home .wrh-prev-stats{max-width:min(100%,460px)}
.wrh-home .wrh-swatches{max-width:100%;margin-top:10px;justify-content:center}
.wrh-ui .wrh-home button.wrh-sw{width:clamp(30px,2.2vw,34px);height:clamp(30px,2.2vw,34px)}
.wrh-home .wrh-tabs{margin-bottom:10px}
.wrh-home .wrh-classes{grid-template-columns:repeat(auto-fill,minmax(88px,1fr));max-width:100%;gap:clamp(4px,.6vw,10px);margin-top:6px}
.wrh-ui .wrh-home button.wrh-class{padding:8px 2px;border-radius:14px}
.wrh-home .wrh-class .ci{height:clamp(36px,3.6vw,52px)!important}
.wrh-home .wrh-class .ci img{width:100%;height:100%}
.wrh-home .wrh-class b{font-size:clamp(11px,.95vw,13px)}
.wrh-home .wrh-class-tip{max-width:100%;font-size:clamp(12px,1vw,15px);min-height:44px;margin-top:6px}
.wrh-home .wrh-arenas{grid-template-columns:repeat(auto-fill,minmax(clamp(96px,9vw,130px),1fr));gap:clamp(6px,.7vw,10px)}
[data-menu="1"] .wrh-touch{display:none!important}
.wrh-home .wrh-weapons{display:grid;grid-template-columns:repeat(auto-fill,minmax(clamp(78px,7vw,104px),1fr));gap:6px}
.wrh-ui .wrh-home button.wrh-wp{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:clamp(52px,7vh,70px);font-size:clamp(10px,.85vw,12px);padding:5px 4px;border-radius:10px;line-height:1.1;text-align:center;min-width:0;overflow-wrap:anywhere;hyphens:auto}
.wrh-home .wrh-wp .wp-i{height:clamp(20px,3vh,30px);max-width:100%}
.wrh-ui .wrh-home .wrh-tabs button.wrh-wp{flex-direction:row;min-height:0;padding:8px 16px;font-size:13px}
.wrh-wp .wp-i{width:auto;object-fit:contain}
.wrh-ui .wrh-home .wrh-modsbtn{margin:4px 0 8px;background:#efe7d6;color:#3a352d;min-height:52px}
.wrh-ui .wrh-home .wrh-modsbtn:hover{background:#fff}

/* difficulty page */
.wrh-modspage{flex:1;overflow-y:auto;overflow-x:hidden}
.wrh-ui .wrh-modspage .wrh-mod{background:#efe7d6;color:#3a352d;border:3px solid #d9cdb4;box-shadow:none;padding:10px 6px 8px;margin:0;font-size:13px;font-weight:800}
.wrh-ui .wrh-modspage .wrh-mod:hover{background:#fff;filter:none}
.wrh-ui .wrh-modspage .wrh-mod.on{background:#fff;border-color:#d8362e;box-shadow:0 0 0 3px rgba(216,54,46,.22)}
.wrh-modspage .wrh-modfoot{margin-top:18px}
.wrh-ui .wrh-modspage .wrh-modfoot button{margin:0;background:#8b97ab;color:#fff}
.wrh-modspage .wrh-modpanel{width:auto;max-height:none;padding:0;background:none;box-shadow:none}
.wrh-modspage .wrh-modgrid{grid-template-columns:repeat(auto-fill,minmax(clamp(120px,11vw,168px),1fr))}

/* online dialog */
.wrh-online{position:fixed;inset:0;z-index:25;display:none;align-items:center;justify-content:center;background:rgba(30,40,58,.38);backdrop-filter:blur(5px)}
.wrh-online.open{display:flex}
.wrh-online-box{position:relative;width:min(520px,92vw);max-height:min(92vh,calc(100vh - 72px));overflow:auto;padding:26px 28px;border-radius:24px;background:rgba(250,244,232,.97);border:2px solid #cdbfa5;box-shadow:0 20px 60px rgba(20,28,44,.45)}
.wrh-online-box h2{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:26px}
.wrh-ui .wrh-online-x{position:absolute;right:14px;top:10px;width:40px;height:40px;padding:0;margin:0;border-radius:50%;background:#e6dcc8;color:#3a352d;font-size:24px;line-height:36px}
.wrh-online .wrh-row{display:flex;gap:8px;align-items:flex-end}
.wrh-online .sub{margin:-4px 0 0;font-size:12px}

/* the online room: on a wide screen the cards line up in three columns (Start and Invite under the right one) and scroll on their own */
.wrh-lobby{overflow:hidden}
.wrh-lgrid{position:relative;flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(14px,2vw,32px);align-items:stretch}
.wrh-lleft .wrh-plist{margin:6px 0 0;font-size:clamp(15px,1.3vw,19px)}
.wrh-lleft .wrh-plist li{padding:8px 4px;border-bottom:1px dashed rgba(205,191,165,.6);flex-wrap:wrap}
.wrh-lleft .wrh-dot{flex:none;width:18px;height:18px}
.wrh-lmid{align-items:center}
.wrh-lmid>label{align-self:flex-start}
.wrh-lobby .wrh-lleft .wrh-weapons{width:100%;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
.wrh-ui .wrh-lobby .wrh-lleft button.wrh-wp{min-height:44px;padding:3px 1px}
.wrh-lobby .wrh-lmid .wrh-classes{grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:5px}
.wrh-ui .wrh-lobby .wrh-lmid button.wrh-class{padding:5px 1px}
.wrh-lobby .wrh-lmid .wrh-class .ci{height:clamp(30px,3vw,42px)!important}
.wrh-lobby .wrh-lmid .wrh-class b{font-size:clamp(9px,.8vw,12px)}
.wrh-lobby .wrh-lmid .wrh-class-tip{min-height:34px;margin-top:2px}
.wrh-lright .wrh-arenas{grid-template-columns:repeat(auto-fill,minmax(88px,1fr))}
.wrh-lbar{display:flex;justify-content:flex-end;align-items:center;gap:14px;padding-top:clamp(10px,1.6vh,18px)}
.wrh-ui .wrh-lobby .wrh-lbar button{margin:0;border-radius:16px}
.wrh-ui .wrh-lobby button#wrh-start{flex:1;min-height:clamp(56px,8vh,72px);padding:0 14px;font-size:clamp(18px,1.6vw,24px);white-space:nowrap;border-radius:18px;background:linear-gradient(180deg,#58cc78,#2f9a52);box-shadow:0 5px 0 #1f6e39}
.wrh-ui .wrh-lobby button#wrh-invite{min-height:clamp(48px,6.5vh,60px);font-size:15px;background:#fffdf8;color:#2b3a52;border:2px solid #cdbfa5;box-shadow:0 3px 0 #cdbfa5}
@media (min-width:1101px){
 .wrh-pg-lobby{display:grid;grid-template-columns:minmax(250px,.85fr) minmax(0,1.5fr) minmax(290px,1fr);grid-template-rows:auto minmax(0,1fr) auto;column-gap:clamp(14px,2vw,32px)}
 .wrh-pg-lobby>.wrh-subbar{grid-column:1 / -1}
 .wrh-lgrid{display:contents}
 .wrh-lgrid>.wrh-hcard{overflow-y:auto}
 .wrh-lleft{grid-column:1;grid-row:2 / 4}
 .wrh-lmid{grid-column:2;grid-row:2 / 4}
 .wrh-lright{grid-column:3;grid-row:2}
 .wrh-lbar{grid-column:3;grid-row:3}
}

@media (max-width:1100px){
 .wrh-lobby{overflow:auto}
 .wrh-pg-lobby{flex:none;min-height:100%}
 .wrh-lgrid{flex:none;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:none}
 .wrh-lgrid>.wrh-hcard{overflow:visible}
 .wrh-lmid{grid-column:1 / -1;order:3}
 .wrh-lbar{position:sticky;bottom:0;z-index:3;padding-bottom:4px;margin-top:auto}
 .wrh-ui .wrh-lobby .wrh-lbar button#wrh-start{flex:none;min-width:200px}
}
@media (max-width:860px){
 .wrh-pcols{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:700px){
 .wrh-home{padding:12px}
 .wrh-hbar{padding-right:0;margin-top:44px}
 .wrh-subbar{padding-right:0;margin-top:44px}
 .wrh-hubcards,.wrh-hubcards:has(.wrh-hc-rejoin){grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:none;grid-auto-rows:minmax(130px,auto);flex:none}
 .wrh-hubcards>.wrh-hc-play{min-height:150px}
 .wrh-ui .wrh-home button.wrh-hc.wrh-hc-play{flex-direction:column;gap:6px}
 .wrh-hc-play .txt{align-items:center}
 .wrh-hc-play .txt b{font-size:44px}
 .wrh-hc-play .ico{height:64px}
 .wrh-lgrid{grid-template-columns:minmax(0,1fr)}
 .wrh-lmid{order:0;grid-column:auto}
 .wrh-lbar{position:sticky;bottom:0;margin:8px -12px -12px;padding:10px 12px;background:linear-gradient(180deg,rgba(238,242,246,0),rgba(238,242,246,.96) 25%)}
 .wrh-ui .wrh-lobby .wrh-lbar button{flex:1;min-width:0}
 .wrh-ui .wrh-lobby button#wrh-start{padding:0 12px}
 .wrh-ui .wrh-home button:not(.wrh-sw),.wrh-ui .wrh-home .wrh-class,.wrh-ui .wrh-home .wrh-arena{min-height:44px}
 .wrh-ui .wrh-home button.wrh-sw{width:34px;height:34px;min-height:0}
 .wrh-startrow{position:sticky;bottom:0;z-index:2;margin:0 -8px -8px;padding:10px 8px 8px;border-radius:0 0 22px 22px;background:linear-gradient(180deg,rgba(255,253,248,0),rgba(255,253,248,.96) 22%)}
 .wrh-home .wrh-logo{font-size:40px!important}
 .wrh-home .wrh-classes{grid-template-columns:repeat(3,1fr)}
}
`;
