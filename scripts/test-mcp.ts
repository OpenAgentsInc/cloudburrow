/**
 * Basic MCP HTTP test script for the Cloudburrow Worker.
 *
 * Usage:
 *   bun scripts/test-mcp.ts --url https://cloudburrow-broker.openagents.com/mcp \
 *     [--hostname cloudburrow-broker.openagents.com] [--create] [--revoke] [--tunnelId <id>]
 *
 * Defaults:
 *   --url      -> https://cloudburrow-broker.openagents.com/mcp
 *   --hostname -> cloudburrow-broker.openagents.com
 *
 * What it does:
 * - Step 1: initialize MCP session
 * - Step 2: list available tools
 * - Step 3: announce a wss:// link for the provided hostname
 * - Optional: create a tunnel, check its status, and revoke it
 */

import chalk from 'chalk';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
};

type JsonRpcSuccess<T = unknown> = {
  jsonrpc: '2.0';
  id: string | number | null;
  result: T;
};

type JsonRpcError = {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
};

async function rpc<T = unknown>(
  url: string,
  method: string,
  params?: unknown,
  id: string | number = Date.now(),
): Promise<T> {
  const body: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  let json: JsonRpcSuccess<T> | JsonRpcError;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON response: ${(err as Error).message}\n${text}`);
  }
  if ('error' in json) {
    throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
  }
  return (json as JsonRpcSuccess<T>).result;
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [key, val] = a.includes('=') ? a.split('=') : [a, argv[i + 1]];
      const name = key.replace(/^--/, '');
      if (val === undefined || (typeof val === 'string' && val.startsWith('--'))) {
        out[name] = true;
      } else {
        out[name] = val;
        i++;
      }
    }
  }
  return out as {
    url?: string;
    hostname?: string;
    create?: boolean | string;
    revoke?: boolean | string;
    tunnelId?: string;
  };
}

function ensureMcpUrl(input?: string): string {
  const fallback = 'https://cloudburrow-broker.openagents.com/mcp';
  if (!input) return fallback;
  try {
    const u = new URL(input);
    return u.href;
  } catch {
    try {
      const base = new URL(input.includes('://') ? input : `https://${input}`);
      if (!base.pathname || base.pathname === '/') base.pathname = '/mcp';
      return base.href;
    } catch {
      return fallback;
    }
  }
}

function pickHostname(defaultHost = 'cloudburrow-broker.openagents.com', override?: string): string {
  return override || defaultHost;
}

async function main() {
  const args = parseArgs(Bun.argv);
  const url = ensureMcpUrl(args.url);
  const hostname = pickHostname('cloudburrow-broker.openagents.com', args.hostname);
  const doCreate = args.create === true || args.create === 'true';
  const doRevoke = args.revoke === true || args.revoke === 'true';

  // Header
  console.log(chalk.bold.cyan('\nCloudburrow MCP Server Test'));
  console.log(chalk.dim('Target URL: ') + chalk.dim.underline(url));
  console.log(chalk.dim('Hostname  : ') + chalk.dim(hostname));
  console.log('');

  // Step 1: Initialize
  console.log(chalk.bold('Step 1: Initialize MCP'));
  console.log(chalk.dim('- negotiates protocol and fetches server info'));
  await rpc(url, 'initialize', {
    protocolVersion: '2025-06-18',
    clientInfo: { name: 'cloudburrow-mcp-test', version: '0.0.1' },
  });
  console.log(chalk.green('✓ initialize ok'));
  console.log('');

  // Step 2: List tools
  console.log(chalk.bold('Step 2: List tools'));
  console.log(chalk.dim('- discover available actions'));
  const tools = await rpc<{ tools: Array<{ name: string; description?: string }> }>(url, 'tools/list');
  console.log(chalk.green('✓ tools listed'));
  console.log('  ' + tools.tools.map((t) => chalk.yellow(t.name)).join(chalk.dim(', ')));
  console.log('');

  // Step 3: Announce link
  console.log(chalk.bold('Step 3: Announce link'));
  console.log(chalk.dim('- get the public wss:// URL for this host'));
  const announce = await rpc(url, 'tools/call', {
    name: 'tunnel.announce_link',
    arguments: { hostname },
  });
  const wss = (announce as any)?.structuredContent?.wss;
  if (wss) {
    console.log(chalk.green('✓ announce_link ok'));
    console.log('  link: ' + chalk.bold(wss));
  } else {
    console.log(chalk.yellow('! announce_link returned without structured link'));
    console.log('  raw:  ' + JSON.stringify(announce));
  }
  console.log('');

  // Step 4: Create tunnel (optional)
  let created: { tunnelId: string; hostname: string; createdAt: string } | undefined;
  if (doCreate) {
    console.log(chalk.bold('Step 4: Create tunnel'));
    console.log(chalk.dim('- mint a named tunnel and DNS (token is not returned by MCP)'));
    const createRes = await rpc(url, 'tools/call', {
      name: 'tunnel.create_named',
      arguments: { deviceHint: 'mcp-test' },
    });
    console.log(chalk.green('✓ create_named ok'));
    const sc =
      (createRes as any).structuredContent ||
      (createRes as any).result?.structuredContent ||
      (createRes as any).result ||
      createRes;
    if (sc?.tunnelId && sc?.hostname) {
      created = { tunnelId: sc.tunnelId, hostname: sc.hostname, createdAt: sc.createdAt };
      console.log('  id:       ' + chalk.bold(created.tunnelId));
      console.log('  hostname: ' + chalk.bold(created.hostname));
      console.log('  created:  ' + chalk.dim(created.createdAt));
    }
    console.log('');
  }

  // Step 5: Status (optional)
  const statusTunnelId = args.tunnelId || created?.tunnelId;
  if (statusTunnelId) {
    console.log(chalk.bold('Step 5: Check status'));
    console.log(chalk.dim('- see if a connector is attached'));
    const statusRes = await rpc(url, 'tools/call', {
      name: 'tunnel.status',
      arguments: { tunnelId: statusTunnelId },
    });
    const sc = (statusRes as any).structuredContent || (statusRes as any).result || statusRes;
    const connected = !!sc?.connected;
    const lastSeen = sc?.lastSeen ?? 'n/a';
    console.log((connected ? chalk.green('✓ connected') : chalk.yellow('• not connected')) + chalk.dim(` (lastSeen: ${lastSeen})`));
    if (!connected) {
      console.log('  ' + chalk.dim('Tip: run ') + chalk.dim.bold('bun run tunnel') + chalk.dim(' to start a local connector, then re-check status.'));
    }
    console.log('');
  }

  // Step 6: Revoke (optional)
  if (doRevoke && created?.tunnelId) {
    console.log(chalk.bold('Step 6: Revoke tunnel'));
    console.log(chalk.dim('- delete the tunnel and clean up DNS (best-effort)'));
    const revokeRes = await rpc(url, 'tools/call', {
      name: 'tunnel.revoke',
      arguments: { tunnelId: created.tunnelId, hostname: created.hostname },
    });
    const sc = (revokeRes as any).structuredContent || (revokeRes as any).result || revokeRes;
    console.log(sc?.ok ? chalk.green('✓ revoke ok') : chalk.yellow('! revoke response unclear'));
    console.log('');
  }

  console.log(chalk.dim('Done.'));
}

main().catch((err) => {
  console.error(chalk.red('MCP test failed:'), err?.message || err);
  process.exit(1);
});

