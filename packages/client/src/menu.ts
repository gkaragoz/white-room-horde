/**
 * The full-screen main menu: markup and styles. The pieces that carry state (weapon buttons, the 3D preview block, the arena
 * and difficulty rows) are built by Ui and handed in, so the element ids the rest of the game and the QA scripts rely on stay
 * exactly where they were (#wrh-solo, #wrh-host, #wrh-join, #wrh-code, #wrh-name, .wrh-class[data-cls], ...).
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
  previewHtml: string;
  arenaHtml: string;
  soloLabel: string;
  hostLabel: string;
  joinLabel: string;
  onlineLabel: string;
  settingsLabel: string;
  achLabel: string;
  /** Earned achievements the player has not looked at yet (a red badge on the button). */
  achUnread: number;
  closeLabel: string;
  rejoinHtml: string;
  codeLabel: string;
  inviteCode: string;
  passLabel: string;
  serverLabel: string;
  defServer: string;
  controls: string;
  error: string;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function menuMarkup(p: MenuParts): string {
  const dots = Array.from({ length: 14 }, (_, i) => `<i style="--x:${(i * 73) % 100}%;--s:${40 + ((i * 29) % 90)}px;--d:${14 + ((i * 7) % 16)}s;--l:${-((i * 5) % 20)}s"></i>`).join('');
  return `<div class="wrh-home wrh-scroll">
    <div class="wrh-home-bg" aria-hidden="true">${dots}</div>
    <header class="wrh-hbar">
      <h1 class="wrh-logo">${p.title}</h1>
      <p class="wrh-hsub">${p.tag}<span class="wrh-best">${icon('hud_star', 18)} ${p.bestLabel}: <b>${p.bestWave}</b> / <b>${p.bestKills}</b></span></p>
    </header>
    ${p.invite}
    <main class="wrh-hgrid">
      <section class="wrh-hcard wrh-hleft">
        <label for="wrh-name">${p.nameLabel}</label>
        <input id="wrh-name" maxlength="16" value="${esc(p.savedName)}" placeholder="player" autocomplete="off">
        <button id="wrh-solo" class="wrh-play">${icon('hud_right', 34)}<span>${p.soloLabel}</span></button>
        <button id="wrh-online" class="wrh-big alt">${icon('tb_lang', 30)}<span>${p.onlineLabel}</span></button>
        ${p.rejoinHtml}
        <button id="wrh-open-ach" class="wrh-big alt">${icon('hud_star', 30)}<span>${p.achLabel}</span>${p.achUnread > 0 ? '<em class="wrh-badge" id="wrh-ach-badge">!</em>' : ''}</button>
        <button id="wrh-open-settings" class="wrh-big alt">${icon('tb_set', 30)}<span>${p.settingsLabel}</span></button>
        <label>${p.weaponLabel}</label>
        <div class="wrh-weapons" id="wrh-weapons">${p.weaponsHtml}</div>
        <p class="wrh-hhint">${p.controls}</p>
        ${p.error ? `<p class="wrh-err">${esc(p.error)}</p>` : ''}
      </section>
      <section class="wrh-hcard wrh-hcenter">${p.previewHtml}</section>
      <section class="wrh-hcard wrh-hright">
        ${p.arenaHtml}
      </section>
    </main>
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

export const MENU_CSS = `
.wrh-home{position:absolute;inset:0;z-index:20;pointer-events:auto;overflow:auto;display:flex;flex-direction:column;padding:clamp(14px,3.2vh,44px) clamp(14px,3.6vw,76px) clamp(18px,3vh,40px);max-height:none;zoom:var(--wrh-zoom,1);
 background:radial-gradient(1300px 760px at 72% 12%,rgba(255,255,255,.95),transparent 62%),radial-gradient(1000px 640px at 6% 96%,rgba(31,162,255,.2),transparent 62%),linear-gradient(180deg,#eef2f6,#d5dde6)}
.wrh-home-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.wrh-home-bg i{position:absolute;left:var(--x);bottom:-120px;width:var(--s);height:var(--s);border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.95),rgba(180,214,240,.35) 62%,transparent 70%);opacity:.55;animation:wrh-float var(--d) linear var(--l) infinite}
@keyframes wrh-float{to{transform:translateY(-120vh) translateX(40px)}}
@media (prefers-reduced-motion:reduce){.wrh-home-bg i{animation:none;bottom:20%}}
.wrh-hbar{position:relative;display:flex;align-items:baseline;gap:clamp(14px,2vw,32px);flex-wrap:wrap;margin:0 0 clamp(10px,2.4vh,26px)}
.wrh-home .wrh-logo{font-size:clamp(38px,5vw,76px)!important;line-height:1;text-align:left;margin:0!important;letter-spacing:1px}
.wrh-hsub{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:0;font-size:clamp(13px,1.2vw,18px);opacity:.78}
.wrh-best{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:99px;background:rgba(255,253,248,.8);border:2px solid #cdbfa5}
.wrh-hgrid{position:relative;display:grid;grid-template-columns:minmax(280px,.8fr) minmax(380px,1.5fr) minmax(300px,1fr);gap:clamp(14px,2.2vw,36px);flex:1;min-height:0;align-items:stretch}
.wrh-hcard{display:flex;flex-direction:column;min-width:0;padding:clamp(16px,1.8vw,28px);border-radius:24px;background:rgba(255,253,248,.74);border:2px solid rgba(205,191,165,.75);box-shadow:0 10px 40px rgba(60,45,20,.14);backdrop-filter:blur(8px)}
.wrh-hleft{gap:10px}
.wrh-home label{font-size:13px;font-weight:700;opacity:.7;margin-top:6px}
.wrh-home input{font-size:17px;padding:12px 14px;border-radius:12px}
.wrh-home .wrh-hleft input{margin:2px 0 8px}
.wrh-ui .wrh-home button.wrh-play{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:clamp(64px,10vh,96px);font-size:clamp(22px,2.2vw,32px);margin:6px 0;border-radius:20px;box-shadow:0 5px 0 #0e6fba,0 14px 30px rgba(20,120,200,.3);transition:transform .12s}
.wrh-ui .wrh-home button.wrh-play:hover{transform:translateY(-2px)}
.wrh-ui .wrh-home button.wrh-big{display:flex;align-items:center;gap:12px;width:100%;min-height:clamp(52px,7.4vh,68px);font-size:clamp(16px,1.5vw,20px);margin:4px 0;border-radius:16px;justify-content:flex-start;padding:8px 18px}
.wrh-ui .wrh-home button.wrh-big.alt{background:#fffdf8;color:#2b3a52;border:2px solid #cdbfa5;box-shadow:0 3px 0 #cdbfa5}
.wrh-hhint{margin:auto 0 0;font-size:12px;opacity:.65;line-height:1.5}
.wrh-err{color:#c8242c;font-weight:700;margin:6px 0 0}
.wrh-hcenter .wrh-prev{flex:1;justify-content:center;margin:0}
.wrh-hcenter .wrh-canvas{width:auto;height:auto;border-radius:20px;background:radial-gradient(circle at 50% 38%,#fffdf8,#e6dcc8)}
.wrh-hcenter .wrh-stage{gap:clamp(6px,1vw,16px);width:100%;justify-content:center}
.wrh-hcenter .wrh-prev-name{font-size:clamp(18px,1.8vw,26px);margin-top:10px}
.wrh-hcenter .wrh-prev-stats{max-width:min(100%,460px)}
.wrh-hcenter .wrh-swatches{max-width:100%;margin-top:10px}
.wrh-ui .wrh-hcenter button.wrh-sw{width:clamp(26px,2.2vw,34px);height:clamp(26px,2.2vw,34px)}
.wrh-hcenter .wrh-classes{grid-template-columns:repeat(9,1fr);max-width:100%;gap:clamp(4px,.6vw,10px);margin-top:6px}
.wrh-ui .wrh-hcenter button.wrh-class{padding:8px 2px;border-radius:14px}
.wrh-hcenter .wrh-class .ci{height:clamp(36px,3.6vw,52px)!important}
.wrh-hcenter .wrh-class .ci img{width:100%;height:100%}
.wrh-hcenter .wrh-class b{font-size:clamp(10px,.9vw,13px)}
.wrh-hcenter .wrh-class-tip{max-width:100%;font-size:clamp(12px,1vw,15px);min-height:44px;margin-top:6px}
.wrh-hcenter .wrh-tabs{margin-bottom:10px}
.wrh-hright .wrh-arenas{grid-template-columns:repeat(3,1fr);gap:clamp(6px,.7vw,10px)}
[data-menu="1"] .wrh-touch{display:none!important}
.wrh-hleft .wrh-weapons{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:6px}
.wrh-ui .wrh-hleft button.wrh-wp{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:clamp(46px,6vh,60px);font-size:clamp(9px,.78vw,11px);padding:4px 2px;border-radius:10px;line-height:1.1;text-align:center}
.wrh-hleft .wrh-wp .wp-i{height:clamp(18px,2.6vh,26px);max-width:100%}
.wrh-wp .wp-i{width:auto;object-fit:contain}
.wrh-invite{position:relative;margin:0 0 12px}
.wrh-online{position:absolute;inset:0;z-index:5;display:none;align-items:center;justify-content:center;background:rgba(30,40,58,.38);backdrop-filter:blur(5px)}
.wrh-online.open{display:flex}
.wrh-online-box{position:relative;width:min(520px,92vw);max-height:92vh;overflow:auto;padding:26px 28px;border-radius:24px;background:rgba(250,244,232,.97);border:2px solid #cdbfa5;box-shadow:0 20px 60px rgba(20,28,44,.45)}
.wrh-online-box h2{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:26px}
.wrh-ui .wrh-online-x{position:absolute;right:14px;top:10px;width:40px;height:40px;padding:0;margin:0;border-radius:50%;background:#e6dcc8;color:#3a352d;font-size:24px;line-height:36px}
.wrh-online .wrh-row{display:flex;gap:8px;align-items:flex-end}
.wrh-online .sub{margin:-4px 0 0;font-size:12px}
@media (max-width:1100px){
 .wrh-hgrid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
 .wrh-hcenter{grid-column:1 / -1;order:3}
 .wrh-hcenter .wrh-classes{grid-template-columns:repeat(5,1fr)}
}
@media (max-width:700px){
 .wrh-home{padding:12px}
 .wrh-hgrid{grid-template-columns:minmax(0,1fr);gap:12px}
 .wrh-hcenter{order:2}
 .wrh-hright{order:3}
 .wrh-hcenter .wrh-classes{grid-template-columns:repeat(3,1fr)}
 .wrh-ui .wrh-home button,.wrh-ui .wrh-home .wrh-class,.wrh-ui .wrh-home .wrh-arena{min-height:44px}
 .wrh-home .wrh-logo{font-size:44px!important}
}
`;
