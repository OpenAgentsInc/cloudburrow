// Desktop helper: mint a Cloudflare Tunnel via the broker and run cloudflared
// Usage:
//   bun desktop-helper.ts [--broker <url>] [--device <hint>] [--local-url <origin>] [--no-preflight]
// Env:
//   BROKER_URL, BROKER_KEY

type CreateOut = { tunnelId: string; hostname: string; token: string; createdAt: string };

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const v = process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] == null ? 'true' : process.argv[++i];
    args.set(k, v);
  }
}

const broker = args.get('broker') || process.env.BROKER_URL || 'https://cloudburrow-broker.openagents.com';
const deviceHint = args.get('device') || '';
const localUrl = args.get('local-url') || 'http://localhost:8787';
const doPreflight = args.get('no-preflight') !== 'true';
const brokerKey = process.env.BROKER_KEY;

const home = process.env.HOME || process.env.USERPROFILE || '.';
const stateDir = `${home}/.cloudburrow`;
const stateFile = `${stateDir}/tunnel.json`;

function log(msg: string) {
  console.log(`[desktop] ${msg}`);
}

async function ensureDir(path: string) {
  try {
    await Bun.write(path + '/.keep', '');
    await Bun.write(path + '/.keep', '');
  } catch {}
}

async function postJSON(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST ${url} failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as any;
}

async function preflight(hostname: string, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  const url = `https://${hostname}/`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.status >= 200) return true; // 2xx/3xx/4xx are fine
    } catch {}
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
}

async function main() {
  log(`Broker: ${broker}`);
  const headers: Record<string, string> = {};
  if (brokerKey) headers['Authorization'] = `Bearer ${brokerKey}`;

  log('Requesting tunnel credentials from broker...');
  const out = (await postJSON(`${broker.replace(/\/$/, '')}/tunnels`, deviceHint ? { deviceHint } : {}, headers)) as CreateOut;
  if (!out?.token || !out?.hostname || !out?.tunnelId) {
    throw new Error('Broker did not return token/hostname/tunnelId');
  }
  await ensureDir(stateDir);
  await Bun.write(stateFile, JSON.stringify(out, null, 2));
  log(`Tunnel minted: ${out.tunnelId} (${out.hostname})`);

  // Optionally wait for DNS to resolve at the edge
  if (doPreflight) {
    const ok = await preflight(out.hostname, 20000);
    log(ok ? 'Edge preflight OK' : 'Edge preflight timed out (continuing)');
  }

  // Launch cloudflared connector
  // IMPORTANT: do not pass --url when using a token with remotely managed ingress.
  // The Worker sets ingress so that:
  //   - https://<hostname>/convex -> http://127.0.0.1:7788
  //   - https://<hostname>/*      -> http://127.0.0.1:8787
  const args = ['tunnel', 'run', '--no-autoupdate', '--protocol', 'http2', '--proxy-keepalive-connections', '1', '--token', out.token];
  log(`Starting cloudflared: cloudflared ${args.join(' ')}`);
  const env = { ...process.env } as Record<string,string>;
  delete env.HTTP_PROXY; delete env.HTTPS_PROXY; delete env.ALL_PROXY;
  delete (env as any).http_proxy; delete (env as any).https_proxy; delete (env as any).all_proxy;
  const child = Bun.spawn(['cloudflared', ...args], { stdout: 'inherit', stderr: 'inherit', env });

  const wss = `wss://${out.hostname}/ws`;
  const convexUrl = `https://${out.hostname}/convex`;
  log('Connector started (press Ctrl+C to stop)');
  log(`Public bridge: ${wss}`);
  log(`Public convex: ${convexUrl}`);

  const onSig = () => {
    log('Shutting down...');
    try {
      child.kill('SIGINT');
    } catch {}
  };
  process.on('SIGINT', onSig);
  process.on('SIGTERM', onSig);

  const code = await child.exited;
  process.exit(code ?? 0);
}

main().catch((err) => {
  console.error('[desktop] error:', err?.message || err);
  process.exit(1);
});
