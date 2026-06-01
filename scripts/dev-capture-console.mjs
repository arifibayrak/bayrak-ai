// DEV-ONLY: drive headless Chrome via CDP to capture console errors + uncaught
// exceptions (with stacks) for an authenticated dashboard page.
// Usage: node scripts/dev-capture-console.mjs <path> <sessionToken>
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const path = process.argv[2] || '/dashboard/analytics';
const token = process.argv[3];
const PORT = 9222;

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/cdp-profile', '--no-first-run', '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no CDP target');
}

let nextId = 1;
function send(ws, method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return id;
}

const errors = [];
const logs = [];

async function main() {
  const wsUrl = await getTarget();
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.on('open', r));

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      const desc = d.exception?.description || d.text;
      const frames = (d.stackTrace?.callFrames || [])
        .slice(0, 8)
        .map((f) => `    at ${f.functionName || '<anon>'} (${f.url}:${f.lineNumber}:${f.columnNumber})`)
        .join('\n');
      errors.push(`EXCEPTION: ${desc}\n${frames}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? a.unserializableValue ?? '').join(' ');
      logs.push(`[${msg.params.type}] ${text}`);
    }
  });

  send(ws, 'Runtime.enable');
  send(ws, 'Page.enable');
  send(ws, 'Network.enable');
  if (token) {
    send(ws, 'Network.setCookie', {
      name: 'authjs.session-token', value: token,
      domain: 'localhost', path: '/', httpOnly: true,
    });
  }
  await sleep(200);
  send(ws, 'Page.navigate', { url: `http://localhost:3000${path}` });
  await sleep(4000); // let it hydrate

  // Optional interaction: click every combobox/dialog trigger to surface
  // interaction-time throws (base-ui Select/Dialog).
  if (process.env.INTERACT === '1') {
    send(ws, 'Runtime.evaluate', {
      expression: `(async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const triggers = [...document.querySelectorAll('[role=combobox],[aria-haspopup],button')];
        for (const el of triggers) {
          try { el.click(); await sleep(300);
            const item = document.querySelector('[role=option]');
            if (item) { item.click(); await sleep(300); }
            document.body.click(); await sleep(150);
          } catch (e) { console.error('CLICKERR', e && e.message); }
        }
      })()`,
    });
    await sleep(4000);
  }

  // Inspect final DOM state
  const evalId = send(ws, 'Runtime.evaluate', {
    expression: `JSON.stringify({url: location.href, title: document.title, body: (document.body.innerText||'').slice(0,400)})`,
    returnByValue: true,
  });
  const domState = await new Promise((resolve) => {
    const h = (data) => {
      const m = JSON.parse(data.toString());
      if (m.id === evalId) { ws.off('message', h); resolve(m.result?.result?.value); }
    };
    ws.on('message', h);
    setTimeout(() => resolve('(timeout)'), 2000);
  });

  console.log(`\n===== ${path} =====`);
  console.log('DOM: ' + domState);
  console.log(`exceptions: ${errors.length}, console errors/warnings: ${logs.length}`);
  for (const e of errors) console.log(e);
  for (const l of logs.slice(0, 25)) console.log(l);
  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
