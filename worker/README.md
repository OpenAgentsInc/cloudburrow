Cloudburrow Worker (Cloudflare)

Overview
- Hono-based Worker that exposes:
  - `/mcp` — MCP server endpoint (mcp-lite, HTTP+SSE transport)
  - Broker stubs: `POST /tunnels`, `GET /tunnels/:id/status`, `DELETE /tunnels/:id`

Local Dev
- Install deps at repo root: `bun install`
- Use Wrangler for dev/deploy (installed via Bun): `bun x wrangler dev --config worker/wrangler.jsonc`

Deploy (Cloudflare)
- Set `compatibility_date` and name in `worker/wrangler.jsonc`
- Configure secrets/vars (see root README for required keys)
- Deploy: `bun x wrangler deploy --config worker/wrangler.jsonc`

