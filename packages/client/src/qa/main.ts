import { Stage } from '../render/stage';
import { measured, tests, type Ctx, type Result } from './tests';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = await Stage.create($('stage'));
stage.follow(0, 0);
stage.render();

interface Row extends Result {
  id: string;
  title: string;
  ms: number;
}
const report: Record<string, Row> = {};
const rows = new Map<string, HTMLElement>();

const ctx: Ctx = {
  stage,
  log: (m) => {
    $('label').textContent = m;
  },
  paint: () => new Promise((r) => requestAnimationFrame(() => r())),
};

function draw(id: string, state: 'run' | 'pass' | 'fail' | 'warn', detail: string, ms?: number, data?: unknown): void {
  let el = rows.get(id);
  const t = tests.find((x) => x.id === id)!;
  if (!el) {
    el = document.createElement('div');
    $('list').appendChild(el);
    rows.set(id, el);
  }
  el.className = 'row ' + state;
  el.innerHTML = `<div class="dot"></div><div><div class="title"></div><div class="detail"></div></div><div class="time"></div>`;
  el.querySelector('.title')!.textContent = t.title;
  el.querySelector('.detail')!.textContent = detail;
  el.querySelector('.time')!.textContent = ms === undefined ? '' : `${Math.round(ms)} ms`;
  if (data) {
    const b = document.createElement('button');
    b.textContent = 'data';
    b.style.marginTop = '4px';
    b.onclick = () => {
      const out = $('out');
      out.hidden = false;
      out.textContent = JSON.stringify(data, null, 2);
    };
    el.children[1]!.appendChild(b);
  }
}

async function runOne(id: string): Promise<Row> {
  const t = tests.find((x) => x.id === id)!;
  draw(id, 'run', 'running...');
  const t0 = performance.now();
  let res: Result;
  try {
    res = await t.run(ctx);
  } catch (e) {
    res = { status: 'fail', detail: 'exception: ' + (e instanceof Error ? e.stack ?? e.message : String(e)) };
  }
  const ms = performance.now() - t0;
  const row: Row = { id, title: t.title, ms, ...res };
  report[id] = row;
  draw(id, res.status, res.detail, ms, res.data);
  summarize();
  return row;
}

function summarize(): void {
  const all = Object.values(report);
  const p = all.filter((r) => r.status === 'pass').length;
  const fl = all.filter((r) => r.status === 'fail').length;
  const w = all.filter((r) => r.status === 'warn').length;
  $('summary').textContent = `${all.length}/${tests.length} run: ${p} passed, ${fl} failed, ${w} warnings`;
  $('summary').style.borderColor = fl ? 'var(--bad)' : all.length === tests.length ? 'var(--ok)' : 'var(--line)';
}

async function runAll(): Promise<Row[]> {
  $<HTMLButtonElement>('runAll').disabled = true;
  const out: Row[] = [];
  for (const t of tests) out.push(await runOne(t.id));
  $<HTMLButtonElement>('runAll').disabled = false;
  ctx.log('done');
  return out;
}

for (const t of tests) draw(t.id, 'warn', 'not run');
$('list').querySelectorAll('.row').forEach((e) => (e.className = 'row'));
$('runAll').onclick = () => void runAll();
$('copy').onclick = () => void navigator.clipboard.writeText(JSON.stringify(report, null, 2));
$('measured').onclick = () => void navigator.clipboard.writeText(JSON.stringify(measured, null, 2));

(window as unknown as Record<string, unknown>).__qa = { runAll, runOne, report, measured, tests: tests.map((t) => t.id) };
if (new URLSearchParams(location.search).get('auto') === '1') void runAll();
