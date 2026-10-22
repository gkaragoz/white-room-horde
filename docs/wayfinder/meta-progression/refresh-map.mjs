// Rebuilds the "Tickets" section of map.md from the ticket files (status, blocked-by, assignee), so the frontier is
// always read off the tickets and never kept by hand:   node docs/wayfinder/meta-progression/refresh-map.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dir = join(root, 'tickets');
const meta = (text, key) => (text.match(new RegExp(`^${key}:[ \t]*(.*)$`, 'm'))?.[1] ?? '').trim();
const tickets = readdirSync(dir)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((file) => {
    const text = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n');
    return {
      file,
      title: meta(text, 'title'),
      type: meta(text, 'type').replace('wayfinder:', ''),
      status: meta(text, 'status'),
      assignee: meta(text, 'assignee'),
      blockedBy: meta(text, 'blocked-by').split(',').map((s) => s.trim()).filter(Boolean),
    };
  });
const byFile = new Map(tickets.map((t) => [t.file, t]));
const open = tickets.filter((t) => t.status !== 'closed');
const waiting = (t) => t.blockedBy.map((b) => byFile.get(b)).filter((b) => b && b.status !== 'closed');
const link = (t) => `[${t.title}](tickets/${t.file}) (${t.type})`;
const frontier = open.filter((t) => waiting(t).length === 0 && !t.assignee);
const claimed = open.filter((t) => waiting(t).length === 0 && t.assignee);
const blocked = open.filter((t) => waiting(t).length > 0);
const section = `## Tickets

Frontier (engeli kapalı, atanmamış):

${frontier.map((t) => `- ${link(t)}`).join('\n') || '- (yok)'}
${claimed.length ? `\nÜzerinde çalışılan (atanmış):\n\n${claimed.map((t) => `- ${link(t)}, ${t.assignee}`).join('\n')}\n` : ''}
Bloklu:

${blocked.map((t) => `- ${link(t)}, şunu bekler: ${waiting(t).map((b) => b.title).join('; ')}`).join('\n') || '- (yok)'}

Kapalı: ${tickets.filter((t) => t.status === 'closed').length} / ${tickets.length} (cevapları yukarıdaki Decisions so far)

`;
const mapPath = join(root, 'map.md');
let map = readFileSync(mapPath, 'utf8').replace(/\r\n/g, '\n');
map = map.replace(/## Tickets\n[\s\S]*?(?=## Not yet specified)/, section);
writeFileSync(mapPath, map);
console.log(`frontier: ${frontier.map((t) => t.title).join(' | ') || '-'}`);
