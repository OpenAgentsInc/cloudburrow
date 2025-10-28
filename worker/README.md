Cloudburrow Worker (Cloudflare)

Overview
- Hono-based Worker that exposes:
  - `/mcp` — MCP server endpoint (mcp-lite, HTTP+SSE transport)
  - Broker stubs: `POST /tunnels`, `GET /tunnels/:id/status`, `DELETE /tunnels/:id`

Local Dev
- Install deps at repo root: `bun install`
- Use Wrangler for dev: `bun x wrangler dev --config worker/wrangler.jsonc`

Deploy (Cloudflare)
- Set `compatibility_date` and name in `worker/wrangler.jsonc`
- Configure secrets/vars (see root README for required keys)
- Deploy: `bun x wrangler deploy --config worker/wrangler.jsonc`

Test the MCP endpoint
- List tools via JSON-RPC:
  ```sh
  curl -s https://<your-worker-domain>/mcp \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":"1","method":"tools/list"}'
  ```
- Call `tunnel.announce_link`:
  ```sh
  curl -s https://<your-worker-domain>/mcp \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"tunnel.announce_link","arguments":{"hostname":"tunnel-demo.example.com"}}}'
  ```

Notes
- This repo uses Bun for scripts and `wrangler` for deploys.
- See the event docs for MCP client options (e.g., MCP Inspector) to try your server quickly.
- Defaults baked into `worker/wrangler.jsonc`:
  - `TUNNEL_HOST_PREFIX=cloudburrow-`
  - `TUNNEL_HOST_SUFFIX=openagents.com`
  - Route: `cloudburrow-broker.openagents.com/*` on zone `openagents.com`
