# Cloudburrow

Cloudburrow is a Bun/TypeScript project that enables secure, per‑device Cloudflare Tunnel connections between a desktop “bridge” and MCP‑enabled clients (e.g., a mobile app or other agents). It focuses on a one‑command pairing flow, stable `wss://` endpoints, and optional MCP tools exposed on a Cloudflare Worker for demos and observability — with no coupling to any specific client.

## What We’re Building

- Secure device pairing via named Cloudflare Tunnels (no Quick Tunnel).
- Per‑device, first‑level hostnames like `wss://tunnel-<rand>.openagents.com/ws` for the bridge.
- One‑command UX for any client: optionally auto‑install `cloudflared`, request credentials from a broker, run the connector, and print a pairing QR/deep link.
- WebSocket token gating on the desktop bridge (`/ws`) to enforce authenticated connections.
- Optional MCP tools hosted on the same Worker to manage tunnel lifecycle from the chat stream without exposing connector secrets.

## Components

- Cloudflare Tunnel Broker (Worker)
  - Mints named tunnels via Cloudflare Zero Trust API and assigns DNS: `tunnel-<rand>.openagents.com`.
  - Returns a connector token (for `cloudflared tunnel run --token …`) and the hostname to the desktop.
  - Endpoints: `POST /tunnels`, `GET /tunnels/:id/status`, `DELETE /tunnels/:id`.
  - Security: API token stored as a Worker secret; minimal auth for public endpoints; no token leakage in MCP.

- Client Integration (one‑command)
  - Auto‑install `cloudflared` to a user directory if missing.
  - Call the broker to mint a tunnel and persist `{ token, hostname, tunnelId }`.
  - Launch the connector and emit a pairing payload with `provider: "cloudflare"` and `bridge: wss://<hostname>/ws`.
  - Keep Convex local (e.g., `http://127.0.0.1:7788`).

- Desktop Bridge (Rust, `/ws`)
  - Requires a bridge token via `Authorization: Bearer` or `?token=`.
  - Rejects unauthenticated sockets; provisions/persists token on first run.

- MCP Tools on the Worker (optional)
  - Example tools: `tunnel.create_named`, `tunnel.status`, `tunnel.revoke`, `tunnel.announce_link`.
  - Provide visibility and control in demos; never return connector tokens.

## Current Status

- Broker online: `https://cloudburrow-broker.openagents.com` (custom domain bound to the Worker).
- Endpoints working:
  - `POST /tunnels` → returns `{ tunnelId, hostname, token }`
  - `GET /tunnels/:id/status`
  - `DELETE /tunnels/:id`
- MCP endpoint `/mcp` is enabled with tools: `tunnel.create_named`, `tunnel.status`, `tunnel.revoke`, `tunnel.announce_link`.
- DNS propagation for newly minted hostnames typically completes within ~5–10 seconds.
- Desktop helper available: `bun run tunnel` to mint + run a connector and print the public `wss://…/ws` URL.

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
