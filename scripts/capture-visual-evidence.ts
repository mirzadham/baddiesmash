import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';

const PORT = 4173;
const SCREENSHOT_DIR = 'C:/Users/ADMIN 2025/.gemini/antigravity/brain/cd91e4e8-bf3e-43b7-bffb-1ced414f11c6/screenshots';
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

async function waitForServer(port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/`, (res) => {
          if (res.statusCode && res.statusCode < 400) {
            resolve();
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`Server on port ${port} did not respond within ${timeoutMs}ms`);
}

async function main() {
  console.log('Rebuilding production dist...');
  execSync('npm run build', { stdio: 'inherit' });

  console.log('Starting preview server on port', PORT);
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: true,
  });

  await waitForServer(PORT);
  console.log('Preview server ready. Launching headless browser with CDP...');

  const edge = spawn(`"${EDGE_PATH}"`, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--hide-scrollbars',
    'about:blank',
  ], { shell: true });

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://localhost:9222/json/list');
    const list = (await listRes.json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>;
    const page = list.find((p) => p.type === 'page');
    if (!page || !page.webSocketDebuggerUrl) {
      throw new Error('Could not find inspectable page in Edge');
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    let msgId = 1;
    function send(method: string, params: Record<string, unknown> = {}): Promise<any> {
      return new Promise((resolve) => {
        const id = msgId++;
        const handler = (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          if (data.id === id) {
            ws.removeEventListener('message', handler as any);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', handler as any);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Network.enable');

    const captures = [
      {
        url: `http://localhost:${PORT}/?tab=leaderboard&theme=light`,
        file: 'leaderboard-light-mobile.png',
        width: 390,
        height: 1400,
        mobile: true,
      },
      {
        url: `http://localhost:${PORT}/?tab=leaderboard&theme=dark`,
        file: 'leaderboard-dark-mobile.png',
        width: 390,
        height: 1400,
        mobile: true,
      },
      {
        url: `http://localhost:${PORT}/?tab=leaderboard&theme=dark`,
        file: 'leaderboard-dark-narrow-320.png',
        width: 320,
        height: 1200,
        mobile: true,
      },
      {
        url: `http://localhost:${PORT}/?tab=leaderboard&theme=dark`,
        file: 'leaderboard-dark-tablet-768.png',
        width: 768,
        height: 1200,
        mobile: false,
      },
      {
        url: `http://localhost:${PORT}/?tab=leaderboard&theme=light`,
        file: 'leaderboard-light-desktop-1280.png',
        width: 1280,
        height: 1000,
        mobile: false,
      },
      {
        url: `http://localhost:${PORT}/?tab=leaderboard&theme=dark&scenario=long_name`,
        file: 'leaderboard-dark-long-name.png',
        width: 390,
        height: 1400,
        mobile: true,
      },
      {
        url: `http://localhost:${PORT}/?tab=leaderboard&theme=dark&scenario=two_players`,
        file: 'leaderboard-dark-two-players.png',
        width: 390,
        height: 1100,
        mobile: true,
      },
    ];

    for (const item of captures) {
      console.log(`Capturing: ${item.file} (${item.width}x${item.height})...`);
      await send('Emulation.setDeviceMetricsOverride', {
        width: item.width,
        height: item.height,
        deviceScaleFactor: 1,
        mobile: item.mobile,
      });

      await send('Page.navigate', { url: item.url });
      await new Promise((r) => setTimeout(r, 1200));

      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      const fullOut = `${SCREENSHOT_DIR}/${item.file}`;
      fs.writeFileSync(fullOut, Buffer.from(screenshot.data, 'base64'));
    }

    ws.close();
    console.log('All 7 visual regression screenshots captured successfully with CDP device emulation!');
  } finally {
    try {
      execSync(`taskkill /PID ${edge.pid} /T /F`, { stdio: 'ignore' });
    } catch {}
    try {
      execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' });
    } catch {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
