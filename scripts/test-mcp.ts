/**
 * Basic MCP HTTP test script for the Cloudburrow Worker.
 *
 * Usage:
 *   bun scripts/test-mcp.ts --url https://cloudburrow-broker.openagents.com/mcp \
 *     [--hostname tunnel-demo.example.com] [--create] [--revoke]
 *
 * Defaults:
 *   --url      -> https://cloudburrow-broker.openagents.com/mcp
 *   --hostname -> cloudburrow-broker.openagents.com
 *
 * Notes:
 * - This script uses JSON-RPC 2.0 over HTTP to call MCP methods.
 * - It lists tools, calls `tunnel.announce_link`, and optionally
 *   creates and revokes a tunnel if `--create` or `--revoke` are provided.
 */

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
      // Match mcp-lite supported protocol to avoid mismatch warnings
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
      if (val === undefined || val.startsWith('--')) {
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
    // If a base without path is provided, append /mcp
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

  // 1) Initialize (optional but good practice)
  const init = await rpc(url, 'initialize', {
    protocolVersion: '2025-06-18',
    clientInfo: { name: 'cloudburrow-mcp-test', version: '0.0.1' },
  });
  console.log('initialize.ok');

  // 2) List tools
  const tools = await rpc<{ tools: Array<{ name: string; description?: string }> }>(url, 'tools/list');
  console.log('tools:', tools.tools.map((t) => t.name).join(', '));

  // 3) Call announce_link
  const announce = await rpc(url, 'tools/call', {
    name: 'tunnel.announce_link',
    arguments: { hostname },
  });
  console.log('tunnel.announce_link:', JSON.stringify(announce));

  // 4) Optionally create a tunnel (mutative)
  let created: { tunnelId: string; hostname: string; createdAt: string } | undefined;
  if (doCreate) {
    const createRes = await rpc(url, 'tools/call', {
      name: 'tunnel.create_named',
      arguments: { deviceHint: 'mcp-test' },
    });
    console.log('tunnel.create_named:', JSON.stringify(createRes));
    const sc =
      (createRes as any).structuredContent ||
      (createRes as any).result?.structuredContent ||
      (createRes as any).result ||
      createRes;
    if (sc?.tunnelId && sc?.hostname) {
      created = { tunnelId: sc.tunnelId, hostname: sc.hostname, createdAt: sc.createdAt };
    }
  }

  // 5) Optionally query status
  const statusTunnelId = args.tunnelId || created?.tunnelId;
  if (statusTunnelId) {
    const statusRes = await rpc(url, 'tools/call', {
      name: 'tunnel.status',
      arguments: { tunnelId: statusTunnelId },
    });
    console.log('tunnel.status:', JSON.stringify(statusRes));
  }

  // 6) Optionally revoke
  if (doRevoke && created?.tunnelId) {
    const revokeRes = await rpc(url, 'tools/call', {
      name: 'tunnel.revoke',
      arguments: { tunnelId: created.tunnelId, hostname: created.hostname },
    });
    console.log('tunnel.revoke:', JSON.stringify(revokeRes));
  }
}

main().catch((err) => {
  console.error('MCP test failed:', err?.message || err);
  process.exit(1);
});
