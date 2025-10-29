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

## Current Status and References

- Docs reviewed: `~/code/openagents/docs/tunnel/` (Cloudflare named setup, broker notes, WS token auth guidance).
- Related work: Cloudflare Tunnel migration, broker patterns, and MCP tooling approaches discussed in the OpenAgentsInc/openagents repository.
- Status (2025‑10‑28):
  - Worker deployed at `https://cloudburrow-broker.openagents.com` (Custom Domain bound)
  - REST endpoints live: `POST /tunnels`, `GET /tunnels/:id/status`, `DELETE /tunnels/:id`
  - MCP tools wired to broker: `tunnel.create_named`, `tunnel.status`, `tunnel.revoke`, `tunnel.announce_link`
  - Verified E2E: minted tunnel, ran `cloudflared` on desktop, status=connected, WebSocket handshake to `wss://<hostname>/ws`
  - Desktop helper available: `bun run tunnel` to mint + run connector and print WSS URL
- Internal notes: `docs/chats/20251028-1700-initial.md` captures initial positioning, packaging, and MCP integration discussion.

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
