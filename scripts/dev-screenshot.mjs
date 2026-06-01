// DEV-ONLY: headless screenshot of an authenticated page at a given viewport.
// Usage: node scripts/dev-screenshot.mjs <path> <token> <width> <out.png>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import WebSocket from 'ws';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const path = process.argv[2];
const token = process.argv[3];
const width = parseInt(process.argv[4] || '1280', 10);
const out = process.argv[5] || '/tmp/shot.png';
const PORT = 9223;

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--window-size=${width},900`, '--user-data-dir=/tmp/cdp-shot',
  '--no-first-run', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json`);
      const l = await r.json();
      const p = l.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
let id = 1;
const reqs = new Map();
function call(ws, method, params = {}) {
  const i = id++;
  return new Promise((res) => { reqs.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
}
async function main() {
  const ws = new WebSocket(await target());
  await new Promise((r) => ws.on('open', r));
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && reqs.has(m.id)) { reqs.get(m.id)(m.result); reqs.delete(m.id); } });
  await call(ws, 'Page.enable');
  await call(ws, 'Network.enable');
  await call(ws, 'Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
  if (token) await call(ws, 'Network.setCookie', { name: 'authjs.session-token', value: token, domain: 'localhost', path: '/', httpOnly: true });
  await call(ws, 'Page.navigate', { url: `http://localhost:3000${path}` });
  await sleep(5000);
  const { data } = await call(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote ' + out);
  ws.close(); chrome.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
