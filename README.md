# Cloudburrow

Cloudburrow is a Bun/TypeScript project that enables secure, per‑device Cloudflare Tunnel connections between a desktop “bridge” and MCP‑enabled clients (e.g., a mobile app or other agents). It focuses on a one‑command pairing flow, stable `wss://` endpoints, and optional MCP tools exposed on a Cloudflare Worker for demos and observability.

## What We’re Building

- Secure device pairing via named Cloudflare Tunnels (no Quick Tunnel).
- Per‑device, first‑level hostnames like `wss://tunnel-<rand>.openagents.com/ws` for the bridge.
- One‑command UX in Tricoder that auto‑installs `cloudflared`, requests credentials from a broker, runs the connector, and prints a pairing QR/deep link.
- WebSocket token gating on the desktop bridge (`/ws`) to enforce authenticated connections.
- Optional MCP tools hosted on the same Worker to manage tunnel lifecycle from the chat stream without exposing connector secrets.

## Components

- Cloudflare Tunnel Broker (Worker)
  - Mints named tunnels via Cloudflare Zero Trust API and assigns DNS: `tunnel-<rand>.openagents.com`.
  - Returns a connector token (for `cloudflared tunnel run --token …`) and the hostname to the desktop.
  - Endpoints: `POST /tunnels`, `GET /tunnels/:id/status`, `DELETE /tunnels/:id`.
  - Security: API token stored as a Worker secret; minimal auth for public endpoints; no token leakage in MCP.

- Tricoder Integration (one‑command)
  - Auto‑installs `cloudflared` to a user directory if missing.
  - Calls the broker to mint a tunnel and persists `{ token, hostname, tunnelId }`.
  - Launches the connector and emits a pairing payload with `provider: "cloudflare"` and `bridge: wss://<hostname>/ws`.
  - Keeps Convex local (e.g., `http://127.0.0.1:7788`).

- Desktop Bridge (Rust, `/ws`)
  - Requires a bridge token via `Authorization: Bearer` or `?token=`.
  - Rejects unauthenticated sockets; provisions/persists token on first run.

- MCP Tools on the Worker (optional)
  - Example tools: `tunnel.create_named`, `tunnel.status`, `tunnel.revoke`, `tunnel.announce_link`.
  - Provide visibility and control in demos; never return connector tokens.

## Current Status and References

- Docs reviewed: `~/code/openagents/docs/tunnel/` (Cloudflare named setup, broker notes, WS token auth guidance).
- Open issues (OpenAgentsInc/openagents):
  - Switch to Cloudflare named tunnels only (#1324)
  - Cloudflare Tunnel Broker Worker (#1325)
  - Tricoder integration with broker (#1326)
  - MCP tools on the Worker (#1327)
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

This repo currently scaffolds the project and documentation. Broker, Tricoder integration, and MCP endpoints will be added incrementally with Bun‑first tooling.
