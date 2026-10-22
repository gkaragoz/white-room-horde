import { ACH_CSS } from './achUi';
import { MENU_CSS } from './menu';
import { MODS_CSS } from './modsUi';
import { META_CSS } from './metaUi';

const CSS_BASE = `
.wrh-ui{position:fixed;inset:0;pointer-events:none;font-family:system-ui,sans-serif;color:#3a352d}
.wrh-ui *{box-sizing:border-box}
.wrh-panel,.wrh-top,.wrh-me,.wrh-squad,.wrh-inv{zoom:var(--wrh-zoom,1)}
.wrh-panel{pointer-events:auto;background:rgba(250,244,232,.95);border:2px solid #cdbfa5;border-radius:14px;padding:18px 22px;box-shadow:0 8px 30px rgba(60,45,20,.25)}
.wrh-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:300px;max-width:92vw}
.wrh-ui h1{margin:0 0 2px;font-size:28px;letter-spacing:.5px}
.wrh-ui .sub{margin:0 0 14px;opacity:.7;font-size:13px}
.wrh-ui input{width:100%;padding:8px 10px;margin:4px 0 10px;border:2px solid #cdbfa5;border-radius:8px;font-size:15px;background:#fffdf8;color:#3a352d}
.wrh-ui label{font-size:12px;opacity:.75;display:block}
.wrh-ui button{pointer-events:auto;cursor:pointer;border:0;border-radius:9px;padding:10px 14px;font-size:15px;font-weight:600;background:#1fa2ff;color:#fff;margin:3px 4px 3px 0}
.wrh-ui button.alt{background:#8e9aaf}
.wrh-ui button.warn{background:#e0524a}
.wrh-ui button:hover{filter:brightness(1.08)}
.wrh-weapons{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 10px}
.wrh-ui button.wrh-wp.dim{opacity:.35}
.wrh-ui button.wrh-wp{background:#e6dcc8;color:#3a352d;font-size:12px;padding:6px 9px;margin:0;border:2px solid transparent}
.wrh-ui button.wrh-wp.on{background:#fff;border-color:#1fa2ff}
.wrh-prev{display:flex;flex-direction:column;align-items:center;margin:2px 0 8px}
.wrh-tabs{display:flex;gap:4px;margin-bottom:6px}
.wrh-stage{display:flex;align-items:center;gap:4px}
.wrh-canvas{width:230px;height:230px;border-radius:12px;background:radial-gradient(circle at 50% 38%,#fffdf8,#e9e0cd);border:2px solid #cdbfa5;overflow:hidden}
.wrh-canvas canvas{display:block;touch-action:none;cursor:grab}
.wrh-ui button.wrh-arrow{width:38px;height:56px;padding:0;margin:0;font-size:18px;background:#e6dcc8;color:#3a352d}
.wrh-prev-name{font-weight:800;font-size:16px;margin-top:6px}
.wrh-prev-stats{font-size:12px;min-height:16px;width:100%;max-width:300px}
.wrh-stat{display:flex;align-items:center;gap:6px;margin:2px 0}
.wrh-stat .ic{width:20px;text-align:center}
.wrh-skull.off{opacity:.28;filter:grayscale(1)}
.wrh-drone{position:absolute;left:12px;top:44px;width:250px;z-index:5;zoom:var(--wrh-zoom,1);pointer-events:none;display:flex;flex-direction:column;gap:6px}
.wrh-drone .dr-card,.wrh-drone .dr-list{pointer-events:auto}
.wrh-drone .dr-card{display:flex;align-items:center;gap:8px;padding:5px 9px 5px 5px;border-radius:14px;background:rgba(251,246,234,.9);border:2px solid rgba(43,58,82,.2);box-shadow:0 2px 8px rgba(20,28,44,.2);cursor:pointer;color:#2b3a52;transition:transform .1s,border-color .2s}
.wrh-drone .dr-card:hover{transform:translateX(2px)}
.wrh-drone .dr-card.open{border-color:#1fa2ff}
.wrh-drone .dr-card.up{border-color:#ffd21f;box-shadow:0 0 0 2px rgba(255,210,31,.5),0 0 18px rgba(255,210,31,.7);animation:wrh-dr-up 1.4s ease-out}
.wrh-drone .dr-card.warm .dr-ic{opacity:.55}
@keyframes wrh-dr-up{0%{transform:scale(1.12)}100%{transform:scale(1)}}
.wrh-drone .dr-ic{position:relative;flex:none;width:40px;height:40px}
.wrh-drone .dr-ic em{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:900 18px/1 system-ui,sans-serif;color:#fff;text-shadow:0 0 4px #000,0 0 4px #000;font-style:normal}
.wrh-drone .dr-main,.wrh-drone .dr-row>span{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.wrh-drone b{font-size:13px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wrh-drone small{font-size:10.5px;font-weight:700;opacity:.75;letter-spacing:.02em}
.wrh-drone .bar{display:block;height:6px;border-radius:4px;background:rgba(60,45,20,.18);overflow:hidden}
.wrh-drone .bar s{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#46c9a0,#9ef0cf);text-decoration:none}
.wrh-drone .dr-sw{font-size:11px;opacity:.6}
.wrh-drone .dr-list{display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:14px;background:rgba(251,246,234,.96);border:2px solid #cdbfa5;box-shadow:0 6px 18px rgba(20,28,44,.28)}
.wrh-drone .dr-list p{margin:0 0 2px;font-size:11px;font-weight:800;opacity:.65}
.wrh-drone .dr-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:10px;border:2px solid transparent;cursor:pointer;color:#2b3a52;background:rgba(255,255,255,.55)}
.wrh-drone .dr-row:hover{background:#fff;border-color:#1fa2ff}
.wrh-drone .dr-row.cur{border-color:#ffd21f}
.wrh-pc .dr-chip{display:inline-flex;align-items:center;gap:2px;margin-left:4px;font-size:10px;font-weight:800;opacity:.85}
.wrh-ico{display:inline-block;vertical-align:middle;object-fit:contain;pointer-events:none;user-select:none}
.wrh-stat .nm{width:68px;font-weight:600;opacity:.8}
.wrh-stat .bar{flex:1;height:8px;border-radius:5px;background:rgba(60,45,20,.18);overflow:hidden}
.wrh-stat .bar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#1fa2ff,#6fd0ff)}
.wrh-stat b{width:54px;text-align:right}
.wrh-swatches{display:flex;flex-wrap:wrap;justify-content:center;gap:5px;margin-top:6px;max-width:300px}
.wrh-ui button.wrh-sw{width:24px;height:24px;padding:0;margin:0;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px #8888}
.wrh-ui button.wrh-sw.on{box-shadow:0 0 0 3px #1fa2ff}
.wrh-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.wrh-plist{margin:8px 0;padding:0;list-style:none}
.wrh-plist li{display:flex;align-items:center;gap:8px;padding:3px 0}
.wrh-dot{width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #8888}
.wrh-top{position:absolute;left:50%;top:10px;transform:translateX(-50%);text-align:center;font-weight:700;text-shadow:0 1px 0 rgba(255,255,255,.7)}
.wrh-top .big{font-size:22px}
.wrh-bar{height:10px;border-radius:6px;background:rgba(60,45,20,.2);overflow:hidden;margin:4px auto 0;width:260px}
.wrh-bar>i{display:block;height:100%;background:#1fa2ff;width:0}
.wrh-bar.boss{width:420px;height:14px}
.wrh-bar.boss>i{background:#d8362e}
.wrh-squad{position:absolute;left:12px;bottom:12px;display:flex;flex-direction:column;gap:7px;max-width:260px}
.wrh-pc{width:196px;padding:6px 9px 7px;border-radius:12px;background:rgba(251,246,234,.82);border:1.5px solid rgba(43,58,82,.18);border-left:4px solid var(--pc);box-shadow:0 2px 8px rgba(20,28,44,.18);backdrop-filter:blur(2px);font-size:12px;font-weight:600;color:#2b3a52}
.wrh-pc.me{width:230px;padding:8px 11px 9px;font-size:13px;background:rgba(255,255,255,.93);box-shadow:0 0 0 2px #fff,0 0 0 4px #1b2433,0 0 16px 4px rgba(255,255,255,.8)}
.wrh-pc.me .top b{flex:0 1 auto;padding:3px 9px;border-radius:7px;background:#1b2433;color:#fff}
.wrh-pc.me .top .you{font-style:normal;font-size:10px;font-weight:900;letter-spacing:.05em;padding:3px 7px;border-radius:6px;background:#fff;color:#1b2433;box-shadow:inset 0 0 0 1.5px #1b2433}.wrh-pc.me .top .lv{margin-left:auto}
.wrh-pc .top{display:flex;align-items:center;gap:5px;margin-bottom:4px}
.wrh-pc .top b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800}
.wrh-pc .top .lv{font-size:.9em;font-weight:800;padding:3px 7px;border-radius:7px;background:rgba(43,58,82,.12)}
.wrh-pc .top .pick{font-style:normal;color:#ffb000;animation:wrh-lowhp .5s ease-in-out infinite alternate}
.wrh-pc .top em{font-style:normal;font-variant-numeric:tabular-nums;font-weight:800;font-size:1.12em}
.wrh-pc .top em small{font-size:.78em;font-weight:600;opacity:.6}
.wrh-pc .bar{position:relative;height:11px;border-radius:6px;background:rgba(30,40,58,.3);box-shadow:inset 0 1px 2px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.35);overflow:hidden}
.wrh-pc.me .bar{height:14px;border-radius:7px}
.wrh-pc .bar i{position:absolute;left:0;top:0;bottom:0;border-radius:inherit;transition:width .18s ease-out;box-shadow:inset 0 -3px 4px rgba(0,0,0,.18),inset 0 2px 2px rgba(255,255,255,.4)}
.wrh-pc .bar s{position:absolute;left:0;top:0;height:35%;border-radius:inherit;background:linear-gradient(180deg,#bfe4ff,#5aa6ff);box-shadow:0 0 0 .5px rgba(20,60,120,.5);transition:width .18s}
.wrh-pc.low .bar i{animation:wrh-lowhp .7s ease-in-out infinite alternate}
@keyframes wrh-lowhp{to{filter:brightness(1.35)}}
.wrh-squad{pointer-events:auto}
.wrh-pc .stats{display:flex;gap:10px;margin-top:4px;font-size:.88em;font-weight:700;opacity:.85}
.wrh-pc .stats b{font-variant-numeric:tabular-nums}
.wrh-pc .top,.wrh-pc .stats,.wrh-pc .chip{cursor:help}
.wrh-pc .chips{display:flex;flex-wrap:wrap;gap:3px;margin-top:6px}
.wrh-pc .chip{display:inline-flex;align-items:center;gap:3px;padding:3px 7px 3px 3px;border-radius:9px;background:rgba(43,58,82,.1);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 55%,transparent);font-size:10.5px;font-weight:800;font-variant-numeric:tabular-nums;line-height:15px}
.wrh-pc .chip i{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;font-style:normal}
.wrh-pc .chip.timed{animation:wrh-lowhp .5s ease-in-out infinite alternate}
.wrh-pc:not(.me) .chips{margin-top:4px}
.wrh-pc:not(.me) .chip{font-size:10px}
.wrh-me{position:absolute;right:14px;bottom:12px;text-align:right;font-weight:700;font-size:15px;text-shadow:0 1px 0 rgba(255,255,255,.7)}
.wrh-hurt{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(200,20,30,0) 45%,rgba(200,20,30,.55) 100%);opacity:0}
.wrh-banner{position:absolute;left:50%;top:26%;transform:translateX(-50%);text-align:center;font-weight:800;font-size:30px;color:#c8242c;text-shadow:0 2px 0 #fff,0 0 18px rgba(255,255,255,.8)}
.wrh-banner small{display:block;font-size:14px;color:#3a352d;font-weight:600}
.wrh-cards{position:absolute;left:50%;bottom:84px;transform:translateX(-50%);text-align:center;pointer-events:none;width:max-content;max-width:98vw;white-space:nowrap}
@media (max-width:640px){.wrh-card{width:29vw!important;margin:0 3px!important}.wrh-card .art{height:70px!important}.wrh-card span{font-size:10px!important}}
.wrh-cards h3{margin:0 0 8px;text-shadow:0 1px 0 #fff}
.wrh-ui.cine-on .wrh-cards,.wrh-ui.cine-on .wrh-hint,.wrh-ui.cine-on .wrh-warn,.wrh-ui.cine-on .wrh-inv,.wrh-ui.cine-on .wrh-relics{opacity:0;transition:opacity .2s}
.wrh-cine{position:absolute;inset:0;pointer-events:none;z-index:6;display:none;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(10,6,20,calc(.55*var(--k))) 100%)}
.wrh-cine i{position:absolute;left:0;right:0;height:calc(9vh*var(--k));background:#07060c}
.wrh-cine i.top{top:0}.wrh-cine i.bot{bottom:0}
.wrh-cine b{position:absolute;left:0;right:0;bottom:calc(9vh*var(--k) + 18px);text-align:center;font-size:clamp(18px,3.2vw,38px);letter-spacing:.14em;text-transform:uppercase;color:#fff;text-shadow:0 0 12px var(--who,#fff),0 3px 0 rgba(0,0,0,.6);opacity:calc(var(--k)*var(--k));transform:translateY(calc((1 - var(--k))*14px))}
.wrh-lvl{position:absolute;left:50%;top:58px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;pointer-events:none;z-index:6;animation:wrhlvl 1.4s ease-in-out infinite alternate}
.wrh-lvl img{height:46px;width:auto;filter:drop-shadow(0 3px 5px rgba(20,28,44,.35))}
.wrh-lvl .fb{display:none;font:900 22px system-ui,sans-serif;letter-spacing:.06em;color:#3a2a00;background:#ffd54a;border-radius:12px;padding:4px 14px}
.wrh-lvl.noimg img{display:none}.wrh-lvl.noimg .fb{display:block}
.wrh-lvl b{font:900 26px system-ui,sans-serif;color:#fff;text-shadow:0 2px 0 #3a2a00,0 0 8px rgba(255,213,74,.8)}
@keyframes wrhlvl{from{transform:translateX(-50%) scale(1)}to{transform:translateX(-50%) scale(1.07)}}
.wrh-more{display:inline-block;margin-left:6px;padding:0 8px;border-radius:10px;background:#ffd54a;color:#3a2a00;font-size:.8em;vertical-align:middle}
.wrh-cards .wrh-card{animation:wrh-cardin .28s cubic-bezier(.2,1.4,.4,1) both}
.wrh-cards .wrh-card:nth-child(3){animation-delay:.05s}.wrh-cards .wrh-card:nth-child(4){animation-delay:.1s}
@keyframes wrh-cardin{from{opacity:0;transform:translateY(24px) scale(.9)}to{opacity:1;transform:none}}
.wrh-card{white-space:normal;pointer-events:auto;cursor:pointer;display:inline-block;position:relative;width:176px;vertical-align:top;margin:0 6px;padding:8px 10px 10px;background:#fffaf0;border:3px solid #8aa0b6;border-radius:14px;box-shadow:0 6px 18px rgba(60,45,20,.3);text-align:left;transition:transform .12s}
.wrh-card:hover{transform:translateY(-6px) scale(1.03)}
.wrh-card .art{height:104px;margin:0 -2px 6px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#fdf6e6,#dfe6ee)}
.wrh-card .art img{max-height:100px;max-width:100%;filter:drop-shadow(0 3px 2px rgba(60,45,20,.3))}
.wrh-card b{display:block;font-size:15px;margin-top:2px}
.wrh-card span{display:block;font-size:12px;opacity:.85;min-height:30px}
.wrh-card em{display:block;margin-top:5px;font-size:10px;font-style:normal;font-weight:800;letter-spacing:.6px;text-transform:uppercase;opacity:.75}
.wrh-card.r1{border-color:#9a63ff}
.wrh-card.r1 .art{background:radial-gradient(circle at 50% 40%,#f6efff,#d9c8f5)}
.wrh-card.r2{border-color:#ff9a1f;box-shadow:0 0 0 2px #ffd97a,0 8px 22px rgba(255,150,30,.45)}
.wrh-card.r2 .art{background:radial-gradient(circle at 50% 40%,#fff5d6,#ffd48a)}
.wrh-card kbd{position:absolute;right:8px;top:8px;z-index:1;background:#1fa2ff;color:#fff;border-radius:5px;padding:0 6px;font-size:12px}
.wrh-cardtime{width:200px;height:6px;background:rgba(60,45,20,.2);border-radius:4px;margin:8px auto 0;overflow:hidden}
.wrh-cardtime>i{display:block;height:100%;background:#ff9a3a}
.wrh-hostpause{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);display:none;text-align:center;font-size:30px;font-weight:900;color:#fff;background:rgba(25,30,42,.72);padding:14px 30px;border-radius:16px;pointer-events:none;text-shadow:0 2px 0 #000}
.wrh-hostpause small{display:block;font-size:14px;font-weight:600;opacity:.85;margin-top:4px}
.wrh-ui.no-minimap .wrh-mini{display:none}
/* layers: labels that follow things in the world sit under the HUD, the HUD under menus, menus under settings */
.wrh-plabel,.wrh-ammo,.wrh-tag,.wrh-ring,.wrh-arrow-off,.wrh-dmg,.wrh-combo{z-index:1}
.wrh-top,.wrh-me,.wrh-squad,.wrh-mini,.wrh-inv,.wrh-cards,.wrh-banner,.wrh-gear,.wrh-warn,.wrh-hint{z-index:5}
.wrh-hostpause{z-index:8}
.wrh-center{z-index:20}
.wrh-ui.no-tags .wrh-tag{display:none}
.wrh-set{position:absolute;inset:0;z-index:40;pointer-events:auto;display:flex;align-items:center;justify-content:center;background:rgba(20,26,38,.45);backdrop-filter:blur(2px)}
.wrh-set-panel{width:min(640px,94vw);max-height:90vh;display:flex;flex-direction:column;background:#faf4e8;border:2px solid #cdbfa5;border-radius:16px;box-shadow:0 14px 50px rgba(30,24,10,.4);color:#3a352d;overflow:hidden}
.wrh-set-panel.wide{width:min(760px,95vw)}
.wrh-set-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px 6px}
.wrh-set-head h2{margin:0;font-size:22px}
.wrh-ui .wrh-set-back{display:none}
.wrh-set-sub{margin:14px 0 2px;font-size:13px;font-weight:800;color:#6b6252}
/* in the main menu the settings are a page of their own: full screen, Back at the top left, tabs in a column on wide screens */
[data-menu="1"] .wrh-set{background:radial-gradient(1300px 760px at 72% 12%,rgba(255,255,255,.95),transparent 62%),linear-gradient(180deg,#eef2f6,#d5dde6);backdrop-filter:none;align-items:stretch;padding:clamp(14px,2.6vh,36px) clamp(14px,3.6vw,76px) clamp(14px,2.4vh,30px);zoom:var(--wrh-zoom,1)}
[data-menu="1"] .wrh-set-panel,[data-menu="1"] .wrh-set-panel.wide{width:100%;max-width:1100px;height:100%;max-height:none;margin:0 auto;border-radius:24px;background:rgba(255,253,248,.86);box-shadow:0 10px 40px rgba(60,45,20,.14)}
[data-menu="1"] .wrh-set-head{justify-content:flex-start;gap:18px;padding:16px 22px 8px}
[data-menu="1"] .wrh-set-head h2{font-size:clamp(24px,3vw,34px)}
[data-menu="1"] .wrh-set-x{display:none!important}
[data-menu="1"] .wrh-ui .wrh-set-back{display:inline-flex;align-items:center;margin:0;padding:10px 20px;border-radius:14px;font-size:17px;font-weight:800;background:#fffdf8;color:#2b3a52;border:2px solid #cdbfa5;box-shadow:0 3px 0 #cdbfa5;cursor:pointer}
[data-menu="1"] .wrh-set-tabs{padding:0 22px;gap:6px}
[data-menu="1"] .wrh-ui .wrh-set-tabs button{font-size:16px;padding:10px 16px}
[data-menu="1"] .wrh-set-body{padding:6px 24px 14px;flex:1;min-height:0}
[data-menu="1"] .wrh-set-foot{padding:12px 22px 16px}
@media (max-width:700px){[data-menu="1"] .wrh-set{padding:10px;padding-top:54px}[data-menu="1"] .wrh-set-body{padding:4px 12px 12px}}
.wrh-set-x{background:none!important;color:#3a352d!important;font-size:30px!important;line-height:26px;padding:0 6px!important;margin:0!important}
.wrh-set-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:0 14px;border-bottom:2px solid #e6dcc8}
.wrh-ui .wrh-set-tabs button{background:none;color:#7a7060;border:0;border-bottom:3px solid transparent;border-radius:0;margin:0 0 -2px;padding:8px 12px;font-size:14px;font-weight:700}
.wrh-ui .wrh-set-tabs button.on{color:#1488e6;border-bottom-color:#1fa2ff}
.wrh-set-body{padding:6px 18px 12px;overflow-y:auto;min-height:min(220px,26vh)}
.wrh-set-group{margin:14px 0 4px;padding-bottom:3px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8a7f6a;border-bottom:1px solid #e6dcc8}
.wrh-set-row{display:grid;grid-template-columns:1fr 1.25fr;gap:10px;align-items:center;padding:7px 0;border-bottom:1px dashed rgba(205,191,165,.45)}
.wrh-set-row label{font-size:14px;font-weight:600}
.wrh-set-row label small{opacity:.6;font-weight:700}
.wrh-set-val{min-width:44px;text-align:right;font-size:13px;opacity:.75}
.wrh-set-row:has(.wrh-range){grid-template-columns:1fr 1.25fr 48px}
.wrh-range{width:100%;accent-color:#1fa2ff}
.wrh-seg{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}
.wrh-ui .wrh-seg button{background:#efe7d6;color:#3a352d;font-size:12px;font-weight:700;padding:5px 10px;margin:0;border:2px solid transparent;border-radius:8px}
.wrh-ui .wrh-seg button.on{background:#fff;border-color:#1fa2ff;color:#0e6fba}
.wrh-ui .wrh-switch{justify-self:end;position:relative;width:46px;height:26px;padding:0;margin:0;border-radius:13px;background:#cdbfa5;transition:background .15s}
.wrh-ui .wrh-switch i{position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .15s}
.wrh-ui .wrh-switch.on{background:#1fa2ff}
.wrh-ui .wrh-switch.on i{left:23px}
.wrh-set-foot{display:flex;gap:8px;justify-content:flex-end;padding:10px 18px 14px;border-top:2px solid #e6dcc8}
.wrh-ui .wrh-set-foot button{background:#efe7d6;color:#3a352d;margin:0}
.wrh-ui .wrh-set-foot button.primary{background:#1fa2ff;color:#fff}
.wrh-set-note{margin:8px 0;font-size:13px;opacity:.75}
.wrh-set-reload{display:flex;gap:10px;align-items:center;justify-content:space-between;margin:-2px 0 4px;padding:4px 8px;font-size:12px;font-weight:700;color:#8a5a00;background:rgba(255,190,80,.18);border-radius:6px}
.wrh-set-reload .wrh-set-small{margin:0}
.wrh-set-keygrid{display:grid;grid-template-columns:1fr auto;gap:6px 14px;align-items:center;font-size:14px;font-weight:600}
.wrh-ui .wrh-set-keybtn{background:#efe7d6;color:#3a352d;margin:0;padding:4px 8px;border-radius:9px}
.wrh-ui .wrh-set-small{background:#efe7d6;color:#3a352d;font-size:12px;margin:10px 0 0}
.wrh-ui .wrh-set-row .wrh-set-small{margin:0;justify-self:end}
.wrh-key{display:inline-block;min-width:30px;height:30px;line-height:26px;padding:0 8px;text-align:center;font:700 14px system-ui,sans-serif;color:#3a352d;background:linear-gradient(#fffdf8,#ece3cf);border:2px solid #b9ab8e;border-bottom-width:5px;border-radius:8px;box-shadow:0 2px 0 rgba(60,45,20,.25)}
.wrh-key.wide{padding:0 12px}
.wrh-key.pad{border-radius:50%;min-width:34px;background:linear-gradient(#f4f8ff,#dbe6f6);border-color:#8fa3bf;color:#25324a}
.wrh-keys-row{display:inline-flex;gap:4px;align-items:center}
.wrh-keys-row em,.wrh-ctl-mouse em{font-style:normal;opacity:.5;margin:0 4px}
.wrh-ctl-row{display:grid;grid-template-columns:minmax(200px,1fr) 1.3fr;gap:14px;align-items:center;padding:8px 0;border-bottom:1px dashed rgba(205,191,165,.5)}
.wrh-ctl-keys{display:flex;align-items:center;flex-wrap:wrap;gap:4px}
.wrh-ctl-desc b{display:block;font-size:15px}
.wrh-ctl-desc span{font-size:13px;opacity:.75}
.wrh-ctl-mouse{display:inline-flex;align-items:center;gap:6px}
.wrh-ctl-mouse small{font-size:11px;opacity:.7}
.wrh-padgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 16px;padding:6px 0}
.wrh-padcell{display:flex;align-items:center;gap:10px;font-size:14px}
@media (max-width:560px){.wrh-set-row,.wrh-ctl-row{grid-template-columns:1fr}.wrh-set-row:has(.wrh-range){grid-template-columns:1fr 48px}.wrh-set-row:has(.wrh-range) label{grid-column:1/-1}}
.wrh-gear{position:absolute;right:12px;top:10px;pointer-events:auto;cursor:pointer;width:34px;height:34px;border-radius:50%;background:rgba(250,244,232,.9);border:2px solid #cdbfa5;text-align:center;line-height:30px;font-size:18px}
.wrh-hint{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);font-size:12px;opacity:.7;text-shadow:0 1px 0 #fff}
.wrh-count{position:absolute;left:50%;top:92px;transform:translateX(-50%);z-index:6;display:none;flex-direction:column;align-items:center;pointer-events:none;color:#fff;text-shadow:0 2px 0 rgba(20,28,44,.55),0 0 22px rgba(31,162,255,.7)}
.wrh-count b{font-size:26px;letter-spacing:.12em;font-weight:900}
.wrh-count i{font-style:normal;font-size:72px;line-height:1;font-weight:900;font-variant-numeric:tabular-nums}
.wrh-count i.pop{animation:wrh-countpop .5s cubic-bezier(.2,1.6,.4,1)}
.wrh-count small{font-size:14px;font-weight:700;opacity:.9;letter-spacing:.06em;text-transform:uppercase}
@keyframes wrh-countpop{from{transform:scale(1.7);opacity:.2}to{transform:scale(1);opacity:1}}
.wrh-loading{position:absolute;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(10,14,22,.55);backdrop-filter:blur(3px);pointer-events:none}
.wrh-loading .box{display:flex;flex-direction:column;align-items:center;gap:12px;min-width:240px;padding:22px 30px;border-radius:16px;background:rgba(251,246,234,.96);color:#2b3a52;box-shadow:0 10px 40px rgba(0,0,0,.35)}
.wrh-loading i{width:38px;height:38px;border-radius:50%;border:4px solid rgba(43,58,82,.18);border-top-color:#1fa2ff;animation:wrh-spin .8s linear infinite}
.wrh-loading b{font-size:16px;letter-spacing:.02em}
.wrh-loading u{display:block;width:100%;height:8px;border-radius:5px;background:rgba(43,58,82,.15);overflow:hidden;text-decoration:none}
.wrh-loading s{display:block;height:100%;width:0;background:linear-gradient(90deg,#1fa2ff,#3ddc6a);transition:width .2s}
@keyframes wrh-spin{to{transform:rotate(360deg)}}
.wrh-warn{position:absolute;left:50%;top:60px;transform:translateX(-50%);color:#fff;background:#d8362e;padding:4px 12px;border-radius:8px;font-weight:700}
.wrh-mini{position:absolute;right:14px;bottom:52px;width:180px;height:120px;border:2px solid #cdbfa5;border-radius:8px;background:rgba(250,244,232,.78);box-shadow:0 3px 10px rgba(60,45,20,.25)}
.wrh-dmg{position:absolute;font-weight:800;font-size:15px;color:#fff;text-shadow:0 0 3px #7d0d14,0 0 3px #7d0d14,0 1px 0 #7d0d14;pointer-events:none;will-change:transform,opacity}
.wrh-menu{width:min(900px,94vw)}
.wrh-cols{display:grid;grid-template-columns:1fr 1fr;gap:6px 26px;align-items:start}
@media (max-width:820px){.wrh-cols{grid-template-columns:1fr}}
.wrh-logo{font-size:38px!important;letter-spacing:1px;text-align:center;background:linear-gradient(180deg,#2b3a52,#1fa2ff);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:0!important}
.wrh-menu .sub{text-align:center}
.wrh-arenas{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;margin:4px 0 12px}
.wrh-ui button.wrh-arena{display:flex;flex-direction:column;gap:4px;align-items:center;padding:5px;margin:0;border-radius:11px;background:#efe7d6;color:#3a352d;border:3px solid transparent;font-size:12px;box-shadow:0 2px 5px rgba(60,45,20,.15);transition:transform .12s}
.wrh-ui button.wrh-arena:hover{transform:translateY(-2px)}
.wrh-ui button.wrh-arena.on{background:#fff;border-color:#1fa2ff;box-shadow:0 0 0 2px rgba(31,162,255,.25),0 4px 10px rgba(60,45,20,.2)}
.wrh-arena img,.wrh-arena .wrh-dice{width:100%;aspect-ratio:3/2;border-radius:7px;object-fit:cover;display:block}
.wrh-dice{display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(45deg,#dfe4ea,#dfe4ea 8px,#d3dae2 8px,#d3dae2 16px);font-size:clamp(20px,2.6vw,34px);line-height:1;font-weight:800;color:#7d8896}
.wrh-diffs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0 12px}
.wrh-ui button.wrh-diff{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;margin:0;border-radius:11px;background:#efe7d6;color:#3a352d;border:3px solid transparent;font-size:13px;box-shadow:0 2px 5px rgba(60,45,20,.15)}
.wrh-ui button.wrh-diff.on{background:#fff;border-color:#d8362e;box-shadow:0 0 0 2px rgba(216,54,46,.2)}
.wrh-sk-row{display:inline-flex;gap:2px;align-items:center}
${MODS_CSS}
${META_CSS}
${ACH_CSS}
.wrh-skull{display:block}
.wrh-ro{display:flex;gap:10px;align-items:center;margin:6px 0 10px;font-size:13px}
.wrh-thumb-s{width:84px;aspect-ratio:3/2;border-radius:7px;object-fit:cover}
.wrh-ui button.wrh-play{width:100%;font-size:19px;padding:13px;margin:6px 0 4px;background:linear-gradient(180deg,#38b6ff,#1488e6);box-shadow:0 3px 0 #0e6fba}
.wrh-classes{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:4px 0 2px;width:100%;max-width:340px}
.wrh-ui button.wrh-class{display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 2px;margin:0;border-radius:10px;background:#efe7d6;color:#3a352d;border:3px solid transparent;font-size:11px;box-shadow:0 2px 4px rgba(60,45,20,.15)}
.wrh-ui button.wrh-class b{display:block;max-width:100%;overflow-wrap:anywhere;hyphens:auto;line-height:1.15}
.wrh-ui button.wrh-class .ci{font-size:20px;line-height:1.1;display:block;height:40px}
.wrh-ui button.wrh-class.on{background:#fff;border-color:#1fa2ff}
.wrh-class-tip{font-size:12px;opacity:.8;min-height:30px;text-align:center;max-width:340px}
.wrh-combo{position:absolute;right:16px;top:90px;text-align:right;font-weight:900;color:#d8362e;text-shadow:0 2px 0 #fff,0 0 14px rgba(255,255,255,.8);pointer-events:none;transition:transform .08s}
.wrh-combo b{font-size:42px;display:block;line-height:1}
.wrh-combo small{font-size:13px;color:#3a352d;font-weight:700}
.wrh-ui.night .wrh-combo small{color:#e9effa}
.wrh-statrow{display:flex;gap:8px;align-items:center;justify-content:center;font-size:14px;margin:2px 0}
.wrh-statrow .wrh-dot{flex:none}
.wrh-invite{background:#e7f6e9;border:2px solid #7ccf8a;border-radius:9px;padding:6px 10px;margin:0 0 10px;font-size:13px}
.wrh-ui.night .wrh-top,.wrh-ui.night .wrh-me,.wrh-ui.night .wrh-hint,.wrh-ui.night .wrh-squad div{text-shadow:none}
.wrh-ui.night .wrh-bar{background:rgba(255,255,255,.18)}
.wrh-relics{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:65;display:none;flex-wrap:wrap;justify-content:center;gap:6px;max-width:min(62vw,720px);pointer-events:none}
.wrh-relics.on{display:flex}
.wrh-relic{position:relative;width:42px;height:42px;border-radius:10px;border:2px solid var(--rc,#9aa5b4);background:#fffaf0;box-shadow:0 2px 6px rgba(20,28,44,.28);cursor:help;pointer-events:auto;transition:transform .12s,outline-color .12s;outline:3px solid transparent}
.wrh-relic img{display:block;width:100%;height:100%;object-fit:cover;border-radius:7px}
.wrh-relic:hover{transform:translateY(-5px);outline-color:#ffd21f}
.wrh-relic b{position:absolute;right:-5px;bottom:-6px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#2b3a52;color:#fff;font:800 11px/17px system-ui,sans-serif;text-align:center}
.wrh-tip{position:fixed;left:0;top:0;z-index:90;max-width:260px;padding:9px 12px;border-radius:11px;background:rgba(27,36,54,.96);color:#fff;pointer-events:none;display:none;box-shadow:0 8px 22px rgba(0,0,0,.4);border:2px solid var(--rc,#ffd21f)}
.wrh-tip b{display:block;font-size:15px;margin-bottom:2px}
.wrh-tip span{display:block;font-size:13px;line-height:1.35;opacity:.92}
.wrh-tip em{display:block;margin-top:5px;font-style:normal;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.75}
.wrh-ui.has-relics .wrh-hint{bottom:62px}
.wrh-info{position:absolute;left:12px;top:30px;z-index:8;max-width:300px;pointer-events:none;display:flex;flex-direction:column;gap:6px}
.wrh-info .it{display:flex;align-items:center;gap:10px;padding:8px 14px 8px 10px;border-radius:12px;border-left:5px solid var(--c,#1fa2ff);background:rgba(251,246,234,.96);box-shadow:0 4px 14px rgba(20,28,44,.28);color:#2b3a52;transform:translateX(-120%);opacity:0}
.wrh-info .it.in{animation:wrh-info-in .42s cubic-bezier(.2,1.5,.4,1) forwards}
.wrh-info .it.out{animation:wrh-info-out .32s ease-in forwards}
.wrh-info .ic{width:34px;height:34px;border-radius:9px;background:var(--c,#1fa2ff);color:#fff;font:800 17px/34px system-ui,sans-serif;text-align:center;flex:none}
.wrh-info b{display:block;font-size:14px;font-weight:800}
.wrh-info span{display:block;font-size:12px;font-weight:600;opacity:.85}
.wrh-info small{display:block;margin-top:2px;font-size:11px;font-weight:700;opacity:.75}
@keyframes wrh-info-in{from{transform:translateX(-120%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes wrh-info-out{from{transform:translateX(0);opacity:1}to{transform:translateX(-120%);opacity:0}}
.wrh-tb{position:absolute;right:12px;top:10px;z-index:70;display:flex;gap:8px;align-items:flex-start;pointer-events:none}
.wrh-tb>*{pointer-events:auto}
.wrh-ui .wrh-tbtn{position:relative;display:block;width:36px;min-width:0;height:36px;border-radius:50%;padding:0;margin:0;cursor:pointer;background:rgba(250,244,232,.94);border:2px solid #cdbfa5;color:#3a352d;font-size:18px;line-height:32px;text-align:center;box-shadow:0 2px 8px rgba(20,28,44,.2);transition:transform .12s,background .12s}
.wrh-ui .wrh-tbtn:hover{transform:scale(1.08);background:#fff}
.wrh-ui .wrh-tbtn small{position:absolute;right:-4px;bottom:-5px;padding:3px 6px;border-radius:8px;background:#2b3a52;color:#fff;font:800 10.5px/14px system-ui,sans-serif;letter-spacing:.03em}
.wrh-langpop{position:absolute;right:88px;top:44px;min-width:150px;padding:6px;border-radius:12px;background:rgba(251,246,234,.98);border:2px solid #cdbfa5;box-shadow:0 8px 24px rgba(20,28,44,.3);display:none}
.wrh-langpop.open{display:block}
.wrh-ui .wrh-langpop button{display:block;width:100%;margin:2px 0;padding:7px 10px;border-radius:8px;border:0;background:transparent;color:#2b3a52;font-size:14px;font-weight:700;text-align:left;cursor:pointer;box-shadow:none}
.wrh-ui .wrh-langpop button:hover{background:#efe7d6}
.wrh-ui .wrh-langpop button.on{background:#1fa2ff;color:#fff}
.wrh-inv{position:absolute;right:14px;bottom:182px;width:236px;display:flex;flex-direction:column;gap:3px;z-index:5;pointer-events:none}
.wrh-inv .row{display:flex;align-items:center;gap:6px;height:26px;padding:0 8px 0 4px;border-radius:9px;border:2px solid transparent;background:rgba(251,246,234,.82);box-shadow:0 1px 4px rgba(20,28,44,.14);font-size:12px;font-weight:700;color:#2b3a52}
.wrh-inv img{width:46px;height:22px;object-fit:contain;flex:none}
.wrh-inv .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wrh-inv b{font-variant-numeric:tabular-nums;font-size:11px}
.wrh-inv .row.cur{border-color:#ffd21f;background:rgba(255,248,214,.97);box-shadow:0 0 0 1px rgba(255,210,31,.55),0 0 10px rgba(255,210,31,.5)}
.wrh-inv .row.reload{opacity:.6}
.wrh-go{width:min(860px,94vw);max-height:92vh;overflow:auto}
.wrh-go-title{margin:12px 0 6px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:13px;opacity:.7}
.wrh-go-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;text-align:left}
.wrh-go-card{display:grid;grid-template-columns:34px 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center;padding:9px 12px;border-radius:12px;background:#fffaf0;border:2px solid #e4d9c3;box-shadow:0 2px 6px rgba(20,28,44,.12);opacity:0;transform:translateY(14px) scale(.9)}
.wrh-go-card.in{opacity:1;transform:none;animation:wrh-go-pop .38s cubic-bezier(.2,1.5,.4,1)}
.wrh-go-card i{grid-row:1 / 3;width:34px;height:34px;border-radius:10px;background:none;display:flex;align-items:center;justify-content:center}
.wrh-go-card i .wrh-ico{width:30px;height:30px}
.wrh-go-card b{font-size:11px;font-weight:700;letter-spacing:.03em;opacity:.7;line-height:1.15}
.wrh-go-card .v{font-size:21px;font-weight:900;font-variant-numeric:tabular-nums;color:#2b3a52;line-height:1.1}
.wrh-go-card.hot{border-color:#ffb000;background:#fff6d6;box-shadow:0 0 0 1px #ffb00066,0 2px 10px #ffb00055}
.wrh-go-card.hot .v{color:#c77700}
@keyframes wrh-go-pop{0%{transform:scale(.7) translateY(10px);opacity:0}60%{transform:scale(1.07)}100%{transform:none;opacity:1}}
.wrh-go-tabs{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:8px 0 2px}
.wrh-go-tab{border:2px solid var(--c);background:#fffaf0;color:#2b3a52;border-radius:999px;padding:4px 12px;font-weight:700;font-size:13px;cursor:pointer}
.wrh-go-tab.on{background:var(--c);color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.4)}
.wrh-go-taunt{margin-top:10px;font-style:italic;opacity:.65;font-size:13px}
.wrh-go-skip{margin-top:4px;font-size:11px;opacity:.5;transition:opacity .3s}.wrh-go-skip.gone{opacity:0}
.wrh-inv{pointer-events:none}.wrh-inv .row{pointer-events:auto;cursor:pointer;transition:transform .08s,box-shadow .08s}
.wrh-inv .row:hover{transform:translateX(-3px);box-shadow:0 2px 8px rgba(20,28,44,.28)}
.wrh-ui .wrh-me{display:flex;gap:6px;right:14px;bottom:8px;width:256px;padding:0;background:none;border:0;box-shadow:none;text-align:left;pointer-events:none}
.wrh-me .g{pointer-events:auto;flex:0 0 auto;display:flex;align-items:center;gap:5px;min-width:0;height:36px;padding:0 8px;border-radius:10px;background:rgba(251,246,234,.86);border:1.5px solid rgba(43,58,82,.18);box-shadow:0 1px 4px rgba(20,28,44,.14);font-size:13px;font-weight:800;color:#2b3a52}
.wrh-me .g i{font-style:normal;font-size:16px}
.wrh-me .g span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
.wrh-me .g b{font-variant-numeric:tabular-nums}
.wrh-me .g.cd{opacity:.55}
.wrh-me .g.on{border-color:rgba(255,210,31,.8)}
.wrh-me .g:last-child{flex:1 1 0}
.wrh-me .g:nth-child(1){width:54px}.wrh-me .g:nth-child(2){width:60px}
.wrh-ui .wrh-reload{bottom:46px}
.wrh-plabel{position:absolute;left:0;top:0;pointer-events:none;display:none;white-space:nowrap;font:700 12px/1.25 system-ui,sans-serif;color:#fff;background:rgba(20,26,38,.62);padding:4px 9px;border-radius:10px;border:1.5px solid #fff;text-shadow:0 1px 1px rgba(0,0,0,.5)}
.wrh-ammo{position:absolute;transform:translate(-50%,-50%);pointer-events:none;display:none}
/* the ring itself is a 3D object on the floor (render/ammoRing.ts); this element only carries the count */
.wrh-ammo i{display:none;position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,var(--c) calc(var(--f)*1%),rgba(30,36,48,.28) 0);-webkit-mask:radial-gradient(closest-side,transparent 76%,#000 79%);mask:radial-gradient(closest-side,transparent 76%,#000 79%);filter:drop-shadow(0 0 3px rgba(0,0,0,.35))}
.wrh-ammo b{position:absolute;left:100%;top:50%;transform:translate(8px,-50%);font-size:14px;font-weight:800;color:#fff;white-space:nowrap;padding:3px 11px;border-radius:11px;background:rgba(25,30,42,.62);text-shadow:0 1px 0 rgba(0,0,0,.6)}
.wrh-ammo.low b{background:rgba(190,30,30,.8);animation:wrhblink .4s infinite alternate}
.wrh-ammo.reload i{animation:wrhspin 0.9s linear infinite}
@keyframes wrhspin{from{filter:drop-shadow(0 0 3px rgba(0,0,0,.35)) brightness(1)}to{filter:drop-shadow(0 0 5px rgba(255,255,255,.7)) brightness(1.4)}}
.wrh-arrow-off{position:absolute;pointer-events:none;display:none;transform:translate(-50%,-50%)}
.wrh-arrow-off i{display:block;width:0;height:0;border-left:18px solid var(--c);border-top:10px solid transparent;border-bottom:10px solid transparent;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
.wrh-arrow-off span{position:absolute;left:50%;top:18px;transform:translateX(-50%);font-size:11px;font-weight:700;padding:3px 9px;border-radius:9px;background:rgba(250,244,232,.85);white-space:nowrap}
.wrh-arrow-off.down i{animation:wrhblink .6s infinite alternate}
@keyframes wrhblink{from{opacity:1}to{opacity:.35}}
.wrh-ring{position:absolute;width:64px;height:64px;transform:translate(-50%,-50%);pointer-events:none;display:none}
.wrh-ring i{position:absolute;inset:0;border-radius:50%}
.wrh-ring .bleed{background:conic-gradient(#e0524a calc(var(--b)*1%),rgba(60,45,20,.25) 0);-webkit-mask:radial-gradient(circle,transparent 58%,#000 60%);mask:radial-gradient(circle,transparent 58%,#000 60%)}
.wrh-ring .prog{inset:7px;background:conic-gradient(#3dd66a calc(var(--p)*1%),rgba(60,45,20,.22) 0);-webkit-mask:radial-gradient(circle,transparent 52%,#000 54%);mask:radial-gradient(circle,transparent 52%,#000 54%)}
.wrh-ring b{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:15px;text-shadow:0 1px 0 #fff}
.wrh-ring.live .prog{filter:drop-shadow(0 0 4px rgba(61,214,106,.9))}
.wrh-tag{position:absolute;transform:translate(-50%,-100%);font-size:11px;font-weight:700;padding:3px 8px;border-radius:9px;background:rgba(250,244,232,.85);border:2px solid;white-space:nowrap;pointer-events:none}
.wrh-reload{position:absolute;right:14px;bottom:36px;width:180px;height:6px;border-radius:4px;background:rgba(60,45,20,.25);overflow:hidden;display:none}
.wrh-reload>i{display:block;height:100%;background:#ff9a3a;width:0}
/* polish: soft cards, smooth anti-aliased bars, steady text rendering */
.wrh-ui{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.wrh-top{padding:6px 18px 9px;border-radius:14px;background:rgba(251,246,234,.74);box-shadow:0 2px 10px rgba(20,28,44,.16);backdrop-filter:blur(2px);border:1.5px solid rgba(43,58,82,.14)}
.wrh-top .big{font-size:21px;letter-spacing:.01em;text-shadow:none;color:#2b3a52}
.wrh-top small{text-shadow:none}
.wrh-bar{position:relative;height:11px;border-radius:6px;background:rgba(30,40,58,.28);box-shadow:inset 0 1px 2px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.35)}
.wrh-bar>i{border-radius:inherit;background:linear-gradient(180deg,#5cc4ff,#1587e6);box-shadow:inset 0 2px 2px rgba(255,255,255,.45),inset 0 -2px 3px rgba(0,40,100,.25);transition:width .25s ease-out}
.wrh-bar.boss>i{background:linear-gradient(180deg,#f2665b,#c0281f)}
.wrh-me{padding:7px 12px;border-radius:12px;background:rgba(251,246,234,.78);box-shadow:0 2px 8px rgba(20,28,44,.16);border:1.5px solid rgba(43,58,82,.14);text-shadow:none;color:#2b3a52}
.wrh-me small{text-shadow:none}
.wrh-hint{padding:3px 12px;border-radius:10px;background:rgba(251,246,234,.6);opacity:.85;text-shadow:none;color:#2b3a52}
.wrh-gear{box-shadow:0 2px 8px rgba(20,28,44,.2);transition:transform .12s,background .12s}
.wrh-gear:hover{transform:scale(1.08);background:#fff}
.wrh-warn{border-radius:10px;padding:5px 14px;box-shadow:0 3px 12px rgba(120,20,16,.35);animation:wrh-lowhp .6s ease-in-out infinite alternate}
.wrh-mini{border-radius:12px;box-shadow:0 3px 12px rgba(20,28,44,.22)}
.wrh-reload{height:8px;border-radius:5px;background:rgba(30,40,58,.3);box-shadow:inset 0 1px 2px rgba(0,0,0,.3)}
.wrh-reload>i{border-radius:inherit;background:linear-gradient(180deg,#ffb561,#ff8a1f);box-shadow:inset 0 1px 1px rgba(255,255,255,.5)}
.wrh-ui.night .wrh-top,.wrh-ui.night .wrh-me,.wrh-ui.night .wrh-hint{color:#2b3a52;text-shadow:none}

.wrh-scroll{max-height:92vh;overflow:auto}
.wrh-ui button.wrh-wp:disabled,.wrh-ui button.wrh-wp.locked{opacity:.45;cursor:not-allowed}
.wrh-keys{display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;margin:4px 0 8px;font-size:12px}
.wrh-keys button{margin:0;padding:3px 8px;font-size:12px;background:#e6dcc8;color:#3a352d}
.wrh-low{color:#d8362e}
.wrh-hud-dev{position:absolute;left:12px;top:26px;font-size:12px;line-height:1.5}
/* short screens (a phone on its side): the squad shows one compact line per teammate and the page never outgrows the window */
@media (max-height:560px){
.wrh-squad{gap:4px;max-height:calc(100vh - 24px)}
.wrh-pc:not(.me){padding:3px 8px 4px}
.wrh-pc:not(.me) .chips,.wrh-pc:not(.me) .stats{display:none}
.wrh-pc.me{padding:5px 10px 6px}
.wrh-pc .top{margin-bottom:2px}
}
/* touch-sized screens: controls a finger can hit */
@media (pointer:coarse),(max-width:800px),(max-height:560px){
.wrh-ui .wrh-seg button{min-height:36px}
.wrh-ui .wrh-switch{width:54px;height:32px;border-radius:16px}
.wrh-ui .wrh-switch i{width:26px;height:26px}
.wrh-ui .wrh-switch.on i{left:25px}
}
`;
export const CSS = CSS_BASE + MENU_CSS;
