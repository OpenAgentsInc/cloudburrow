/* Cloudflare API helper for creating/deleting named tunnels and DNS.
 * Uses account/zone bindings and API token from Worker environment.
 */
import { env } from 'cloudflare:workers';

const API_BASE = 'https://api.cloudflare.com/client/v4';

type CfApiResult<T> = {
  success: boolean;
  result?: T;
  errors?: Array<{ code: number; message: string } & Record<string, unknown>>;
};

function authHeaders() {
  const token = env.CF_API_TOKEN as string | undefined;
  if (!token) throw new Error('Missing CF_API_TOKEN secret');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  } as Record<string, string>;
}

function randId(len = 10) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function b64RandomSecret(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  // Standard base64
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export type CreateTunnelResponse = {
  tunnelId: string;
  hostname: string;
  token: string;
  createdAt: string;
};

export async function createNamedTunnel(deviceHint?: string): Promise<CreateTunnelResponse> {
  const accountId = env.CF_ACCOUNT_ID as string | undefined;
  const zoneId = env.CF_ZONE_ID as string | undefined;
  const prefix = (env.TUNNEL_HOST_PREFIX as string | undefined) ?? 'cloudburrow-';
  const suffix = env.TUNNEL_HOST_SUFFIX as string | undefined;
  if (!accountId) throw new Error('Missing CF_ACCOUNT_ID secret');
  if (!zoneId) throw new Error('Missing CF_ZONE_ID secret');
  if (!suffix) throw new Error('Missing TUNNEL_HOST_SUFFIX var (e.g., openagents.com)');

  const label = randId(12);
  const name = [prefix.replace(/\.$/, ''), deviceHint?.slice(0, 16)?.toLowerCase(), label]
    .filter(Boolean)
    .join('-');
  const hostname = `${prefix}${label}.${suffix}`;

  // 1) Create Tunnel
  const secret = b64RandomSecret(32);
  const createRes = await fetch(`${API_BASE}/accounts/${accountId}/cfd_tunnel`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, tunnel_secret: secret }),
  });
  const createJson = (await createRes.json()) as CfApiResult<{ id: string; name: string }>;
  if (!createRes.ok || !createJson.success || !createJson.result) {
    throw new Error(
      `Failed to create tunnel: ${createRes.status} ${(createJson.errors || [])
        .map((e) => e.message)
        .join(', ')}`,
    );
  }
  const tunnelId = createJson.result.id;

  // 2) Mint connector token (try GET then POST for compatibility)
  let token = '';
  for (const method of ['GET', 'POST'] as const) {
    const tokenRes = await fetch(
      `${API_BASE}/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`,
      { method, headers: authHeaders() },
    );
    if (tokenRes.ok) {
      const tjson = (await tokenRes.json()) as any;
      token = tjson?.result || tjson?.result?.token || tjson?.token || '';
      if (token) break;
    }
  }
  if (!token) throw new Error('Failed to mint connector token');

  // 3) Create DNS CNAME: <hostname> -> <tunnelId>.cfargotunnel.com
  const cnameTarget = `${tunnelId}.cfargotunnel.com`;
  const dnsRes = await fetch(`${API_BASE}/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ type: 'CNAME', name: hostname, content: cnameTarget, proxied: true, ttl: 1 }),
  });
  const dnsJson = (await dnsRes.json()) as CfApiResult<{ id: string }>;
  if (!dnsRes.ok || !dnsJson.success) {
    throw new Error(
      `Failed to create DNS CNAME: ${dnsRes.status} ${(dnsJson.errors || [])
        .map((e) => e.message)
        .join(', ')}`,
    );
  }

  // 4) Configure remote ingress so the token-based connector forwards:
  //    - https://<hostname>/convex  -> http://127.0.0.1:7788 (Convex)
  //    - https://<hostname>/*       -> http://127.0.0.1:8787 (Bridge, incl /ws)
  const cfgRes = await fetch(`${API_BASE}/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({
      config_src: 'cloudflare',
      ingress: [
        { hostname, path: '/convex', service: 'http://127.0.0.1:7788' },
        { hostname, service: 'http://127.0.0.1:8787' },
        { service: 'http_status:404' },
      ],
    }),
  });
  if (!cfgRes.ok) {
    const body = await cfgRes.text();
    // Non-fatal: continue, but connector may rely on local --url
  }

  return { tunnelId, hostname, token, createdAt: new Date().toISOString() };
}

export async function getTunnelStatus(tunnelId: string) {
  const accountId = env.CF_ACCOUNT_ID as string | undefined;
  if (!accountId) throw new Error('Missing CF_ACCOUNT_ID secret');

  let connected = false;
  let lastSeen: string | undefined;
  const detailsRes = await fetch(`${API_BASE}/accounts/${accountId}/cfd_tunnel/${tunnelId}`, {
    headers: authHeaders(),
  });
  if (detailsRes.ok) {
    const djson = (await detailsRes.json()) as any;
    const status = djson?.result?.status;
    if (status && typeof status === 'string') connected = status.toLowerCase() === 'active';
  }
  // connections endpoint (best-effort)
  const connRes = await fetch(`${API_BASE}/accounts/${accountId}/cfd_tunnel/${tunnelId}/connections`, {
    headers: authHeaders(),
  });
  if (connRes.ok) {
    const cjson = (await connRes.json()) as any;
    const arr = cjson?.result || [];
    if (Array.isArray(arr) && arr.length > 0) {
      connected = true;
      lastSeen = arr[0]?.opened_at || arr[0]?.started_at || lastSeen;
    }
  }
  return { connected, lastSeen };
}

export async function revokeTunnel(tunnelId: string, hostname?: string) {
  const accountId = env.CF_ACCOUNT_ID as string | undefined;
  const zoneId = env.CF_ZONE_ID as string | undefined;
  if (!accountId) throw new Error('Missing CF_ACCOUNT_ID secret');
  if (!zoneId) throw new Error('Missing CF_ZONE_ID secret');

  // Best-effort DNS cleanup
  if (hostname) {
    const searchUrl = new URL(`${API_BASE}/zones/${zoneId}/dns_records`);
    searchUrl.searchParams.set('type', 'CNAME');
    searchUrl.searchParams.set('name', hostname);
    const listRes = await fetch(searchUrl, { headers: authHeaders() });
    if (listRes.ok) {
      const ljson = (await listRes.json()) as any;
      const rec = ljson?.result?.[0];
      if (rec?.id) {
        await fetch(`${API_BASE}/zones/${zoneId}/dns_records/${rec.id}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
      }
    }
  }

  const delRes = await fetch(`${API_BASE}/accounts/${accountId}/cfd_tunnel/${tunnelId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!delRes.ok) {
    const body = await delRes.text();
    throw new Error(`Failed to delete tunnel: ${delRes.status} ${body}`);
  }
  return { ok: true } as const;
}
