// Publish the address of the public relay so the GitHub Pages build (and anyone's browser) finds the game server.
//
//   node tools/relay.mjs                 start a cloudflared quick tunnel to the local server (port 8787), publish its address and keep running
//   node tools/relay.mjs https://x.trycloudflare.com    publish an address you already have
//
// The address goes into relay.json on the main branch; the client reads it from raw.githubusercontent.com (see packages/client/src/relay.ts).
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = process.env.PORT ?? '8787';
const git = (...a) => execFileSync('git', a, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

function publish(httpsUrl) {
  const host = new URL(httpsUrl).host;
  const json = { url: `wss://${host}/ws`, updated: new Date().toISOString() };
  writeFileSync(resolve(root, 'relay.json'), JSON.stringify(json, null, 2) + '\n');
  git('add', 'relay.json');
  if (git('status', '--porcelain', 'relay.json')) {
    git('commit', '-m', `relay: ${host}`);
    git('push');
  }
  console.log(`published ${json.url}`);
}

const given = process.argv[2];
if (given) {
  publish(given);
} else {
  const child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'inherit', 'pipe'] });
  let done = false;
  child.stderr.on('data', (d) => {
    const text = d.toString();
    process.stderr.write(text);
    const m = !done && text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      done = true;
      publish(m[0]);
    }
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
