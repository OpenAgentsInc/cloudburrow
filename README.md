# Cloudburrow
_Tunnels as a Primitive — Cloudflare + MCPs_

Cloudburrow enables secure, per‑device Cloudflare Tunnel connections between a desktop “bridge” and MCP‑enabled clients (e.g., a mobile app or other agents). It focuses on a one‑command pairing flow, stable `wss://` endpoints, and optional MCP tools exposed on a Cloudflare Worker for observability and remote control — with no coupling to any specific client.

In plain English, here’s what you can do right now:
- Turn your local app into a publicly reachable, secure `wss://` URL.
- Ask the MCP server to create a tunnel, tell you the public link, check if it’s connected, and revoke it when you’re done.
- Use these tools from any MCP‑compatible client without ever exposing connector tokens in chat.

## Why It Matters

- **Agent-native, device‑to‑device primitive**
  - **If bridges can operate without per‑device centralized accounts, tunnels become a reusable building block for agents to form on‑demand device‑to‑device links.** MCP acts as the control plane (create/status/revoke), while the tunnel is the data plane (`wss://…/ws`).
- No per-device signup flow
  - The person running the desktop app doesn’t need to create a tunnel provider account or share credentials. A single Cloudflare account (yours) powers everything behind the scenes via the Worker.
- Runs on Cloudflare’s global edge
  - Uses Cloudflare Tunnels + DNS on your zone for stable, first-class hostnames. No opaque URLs, no NAT trickery that breaks across networks.
- Remote control via MCP
  - Create, check, and revoke tunnels directly from any MCP-capable client (agents, apps, scripts) without exposing secrets. Tokens never leave the server.
- Named tunnels, not “quick” or transient links
  - You get predictable hostnames and can enforce policy and cleanup, instead of ad-hoc ephemeral URLs.
- Designed for automation
  - Scriptable with `bun` and JSON-RPC; easy to embed in workflows, CI, or agent runtimes.



## What We’re Building

- Secure device pairing via named Cloudflare Tunnels (no Quick Tunnel).
- Per‑device, first‑level hostnames like `wss://tunnel-<rand>.openagents.com/ws` for the bridge.
- One‑command UX for any client: optionally auto‑install `cloudflared`, request credentials from a broker, run the connector, and print a pairing QR/deep link.
- WebSocket token gating on the desktop bridge (`/ws`) to enforce authenticated connections.
- Optional MCP tools hosted on the same Worker to manage tunnel lifecycle from the chat stream without exposing connector secrets.

## Components (Plain Language)

- Worker (Broker + MCP)
  - Lives on Cloudflare. It’s the control plane that can create a named tunnel, tell you the public hostname, check status, and revoke it.
  - Exposes two interfaces: REST endpoints (for the desktop to fetch the connector token and run `cloudflared`) and MCP tools (for agents/apps to drive lifecycle without seeing secrets).
  - Keeps your Cloudflare API token safe; tokens never appear in MCP responses.

- Bridge (Desktop)
  - Runs on your machine. It asks the Worker’s REST API for a tunnel token and hostname, then starts `cloudflared` so the tunnel points to your local app (e.g., `http://127.0.0.1:8787`).
  - The result is a stable public URL `wss://<hostname>/ws` that forwards to your local service.
  - Can add auth on the `/ws` endpoint so only authorized clients connect.

- Client (Agent/App)
  - Anything that can talk MCP. It asks the Worker (via MCP) to create a tunnel, shows/uses the announced `wss://…/ws` link, checks status, and revokes when finished.
  - It never handles the tunnel token; the desktop bridge handles that via the Worker’s REST.

## Current Status

- Broker online: `https://cloudburrow-broker.openagents.com` (custom domain bound to the Worker).
- Endpoints working:
  - `POST /tunnels` → returns `{ tunnelId, hostname, token }`
  - `GET /tunnels/:id/status`
  - `DELETE /tunnels/:id`
- MCP endpoint `/mcp` is enabled with tools: `tunnel.create_named`, `tunnel.status`, `tunnel.revoke`, `tunnel.announce_link`.
- DNS propagation for newly minted hostnames typically completes within ~5–10 seconds.
- Desktop helper available: `bun run tunnel` to mint + run a connector and print the public `wss://…/ws` URL.

## MCP Tools

- Plain-language overview
  - A “tunnel” is the secure pipe Cloudflare creates from a public hostname to your local machine (the pipe comes alive when your `cloudflared` connector runs).
  - The `wss://<hostname>/ws` “link” is just the URL clients use to connect through that tunnel to your app.
  - You use create/status/revoke to manage the pipe, and announce_link to print the exact URL you’ll share or dial.

- `tunnel.announce_link`
  - Input: `{ hostname: string }`
  - Returns: `wss://<hostname>/ws` as a structured link for clients to display or use.
  - Notes: No tunnel is created; this only formats the public WebSocket URL for a host.
  - Reason: So UIs/agents can show or store the precise URL without guessing paths or protocols.

- `tunnel.create_named`
  - Input: `{ deviceHint?: string }`
  - Creates a named Cloudflare Tunnel and DNS CNAME (proxied) for a unique hostname.
  - Returns: `{ tunnelId: string, hostname: string, createdAt: string }`
  - Notes: The connector `token` is never returned by MCP (by design). Use broker REST to run a connector.
  - Reason: Allocate a fresh, unique public pipe + name you control for a device/session.

- `tunnel.status`
  - Input: `{ tunnelId: string }`
  - Checks whether a connector is currently attached to the tunnel.
  - Returns: `{ connected: boolean, lastSeen?: string }`
  - Reason: Tell if your local connector is online yet; great for readiness checks and health.

- `tunnel.revoke`
  - Input: `{ tunnelId: string, hostname?: string }`
  - Deletes the Cloudflare Tunnel and attempts best‑effort DNS cleanup if `hostname` provided.
  - Returns: `{ ok: true }` on success.
  - Reason: Cleanly shut down and remove public exposure when you’re done, or when rotating.

### Verification Details (what we tested)

- Tunnel mint + DNS
  - `curl -s -X POST https://cloudburrow-broker.openagents.com/tunnels -H 'content-type: application/json' -d '{}' | jq`
  - Confirms JSON shape `{ tunnelId, hostname, token }`.
  - `dig +short <hostname>` resolves to Cloudflare edge IPs (e.g., `104.18.14.36`, `104.18.15.36`) typically within ~5–10s.

- Connector registration (HTTP/2)
  - Start connector: `cloudflared tunnel --no-autoupdate run --protocol http2 --proxy-keepalive-connections 1 --token "<TOKEN>" --url http://127.0.0.1:8787`
  - Look for log: `Registered tunnel connection ... protocol=http2` (edge registered). Transient QUIC/UDP warnings are OK.

- Public HTTP reachability
  - With any local server on `127.0.0.1:8787` (e.g., `bun -e "Bun.serve({port:8787, fetch(){return new Response('ok\n')}}); await new Promise(()=>{})"`),
  - `curl -i https://<HOSTNAME>/` returns an HTTP response from your local service (2xx/4xx depending on path).

- WebSocket handshake to `/ws`
  - Local WS server: `bun -e "Bun.serve({port:8787, fetch(r,s){ if(new URL(r.url).pathname==='\/ws') return s.upgrade(r); return new Response('ok');}, websocket:{ open(ws){ws.send('hello');}, message(ws,msg){ws.send('echo:'+msg)} } }); await new Promise(()=>{})"`
  - Connect: `bun -e "let u='wss://'+process.argv[2]+'/ws'; const ws=new WebSocket(u); ws.addEventListener('open',()=>{console.log('OPEN'); ws.send('ping')}); ws.addEventListener('message',ev=>{console.log('MSG '+ev.data); ws.close();}); ws.addEventListener('close',()=>process.exit(0));" <HOSTNAME>`
  - Expect: `OPEN` then `MSG echo:ping`.

## Quickstart (Bun)

- Install dependencies:
  ```bash
  bun install
  ```

- Run locally (placeholder):
  ```bash
  bun run index.ts
  ```

This repo currently scaffolds the project and documentation. Broker, client integration, and MCP endpoints will be added incrementally with Bun‑first tooling.

## MCP Tools Test Script

Use the included script to exercise the MCP server running on the Cloudflare Worker.

- Worker MCP URL: `https://cloudburrow-broker.openagents.com/mcp`
- Script: `scripts/test-mcp.ts`

Run with Bun:

```bash
# List tools and announce a link (no mutations)
bun scripts/test-mcp.ts --url https://cloudburrow-broker.openagents.com/mcp \
  --hostname cloudburrow-broker.openagents.com

# Full lifecycle: create → status → revoke (mutates Cloudflare via the Worker)
bun scripts/test-mcp.ts --url https://cloudburrow-broker.openagents.com/mcp \
  --hostname cloudburrow-broker.openagents.com --create --revoke
```

What we tested and how it performed:

- initialize: Handshake succeeded using MCP protocol `2025-06-18`.
- tools/list: Reported four tools — `tunnel.announce_link`, `tunnel.create_named`, `tunnel.status`, `tunnel.revoke`.
- tunnel.announce_link: Returned the expected `wss://<hostname>/ws` link.
- tunnel.create_named: Successfully minted a named tunnel and DNS hostname; connector token is not returned by MCP (by design).
- tunnel.status: Returned `connected=false` immediately after creation (expected until a connector attaches), with `lastSeen` absent or `n/a`.
- tunnel.revoke: Successfully revoked the created tunnel and cleaned up DNS best‑effort.

Notes:

- The test script uses JSON‑RPC 2.0 over HTTP with the `MCP-Protocol-Version` header set to the server’s supported version.
- `--create` and `--revoke` trigger real Cloudflare API calls via the Worker; ensure the Worker has `CF_API_TOKEN`, `CF_ACCOUNT_ID`, and `CF_ZONE_ID` configured.
- You can pass `--tunnelId <id>` to check status for an existing tunnel without creating a new one.

## Cloudflare Worker (Broker)

- Deploy/dev commands (Wrangler via Bun):
  - Dev: `bun run dev:worker`
  - Deploy: `bun run deploy:worker`

- Required secrets on the Worker:
  - `CF_API_TOKEN` — API Token with Tunnel + DNS write for the account/zone
  - `CF_ACCOUNT_ID` — Cloudflare account id
  - `CF_ZONE_ID` — Zone id for your domain (e.g., `openagents.com`)
  - Optional `BROKER_KEY` — if set, broker endpoints require `Authorization: Bearer <BROKER_KEY>`

- One‑liners to set secrets (no need to pass `--name`):
  - `bun run cf:secret:api-token`
  - `bun run cf:secret:account-id`
  - `bun run cf:secret:zone-id`
  - `bun run cf:secret:broker-key`

Notes:
- The Worker config lives at `worker/wrangler.jsonc`. Scripts pass `--config worker/wrangler.jsonc` so you don’t have to.
- Custom domain is bound for `cloudburrow-broker.openagents.com` → the Worker.

## Usage Examples

- Mint a tunnel (returns token + hostname):
  - `curl -s -X POST https://cloudburrow-broker.openagents.com/tunnels -H 'content-type: application/json' -d '{}' | jq`

- Run a connector locally (HTTP/2 + minimal keepalive):
  - `env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \`
    `cloudflared tunnel --no-autoupdate run --protocol http2 --proxy-keepalive-connections 1 --token "<TOKEN>" --url http://127.0.0.1:8787`

- Probe public host:
  - `curl -i https://<HOSTNAME>/`

## Troubleshooting

- QUIC/UDP warnings are expected on restricted networks. We force HTTP/2; look for “Registered tunnel connection … protocol=http2”.
- If you see “Unable to reach the origin service … 127.0.0.1:8787”, ensure your local service is listening and only one `cloudflared` is running.
- If DNS hasn’t propagated yet for the hostname, wait a few seconds and retry.

## Future Work

What works today
- MCP server on Cloudflare Worker: initialize, list tools, and call tools end‑to‑end.
- Tunnel lifecycle via Worker: create, status, revoke (Cloudflare API‑backed).
- Local helper to run a connector: `bun run tunnel` (requires `cloudflared` installed).

Planned enhancements
- Packaged library and CLI binary for easy drop‑in to apps (embed the broker/MCP client utilities with minimal setup).
- Desktop bridge service with token‑gated WebSocket endpoint and hardened auth flows.
- Client SDKs for TypeScript to orchestrate tunnel lifecycle and parse MCP responses.
- Observability: structured logs, metrics, traces; improved diagnostics in MCP outputs.
- Retry/backoff policies and DNS readiness checks; graceful cleanup and recovery.
- Security hardening for broker endpoints (fine‑grained auth, signed handoffs, optional mTLS).
- Additional MCP tools (list/describe tunnels, rotate hostnames, emit health summaries).
- Automated tests via `bun test` covering MCP flows and broker edge cases.
