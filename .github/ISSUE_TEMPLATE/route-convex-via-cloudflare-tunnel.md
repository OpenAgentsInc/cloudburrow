---
name: Route Convex via Cloudflare Tunnel (/convex)
about: Make Convex reachable over the same tunnel hostname as the bridge
title: "Route Convex via Cloudflare Tunnel (/convex)"
labels: enhancement, networking
assignees: ''
---

Summary
- Route Convex HTTP+WebSocket through the same Cloudflare Tunnel hostname used for the bridge, under path prefix `/convex`.
- Avoid LAN-IP hacks and make the mobile client work on any network.

Scope
- Worker broker should configure tunnel remote ingress:
  - `https://<hostname>/convex` → `http://127.0.0.1:7788` (Convex)
  - `https://<hostname>/*` → `http://127.0.0.1:8787` (Bridge `/ws`)
- Desktop launcher must not pass `--url` to `cloudflared tunnel run --token` (so the remote ingress applies).
- Pairing payload on the desktop side should set `convex` to `https://<hostname>/convex`.

Acceptance Criteria
- Cloudflared connects with token; no `--url` flag.
- `GET https://<hostname>/convex` reaches local Convex (HTTP).
- `WS https://<hostname>/convex/_ws` (or Convex WS path) upgrades successfully.
- Bridge `/ws` remains reachable at `wss://<hostname>/ws`.
- Mobile app connects to Convex via the tunnel on any network (no LAN dependency).

Implementation Notes
- Worker: use `accounts/:id/cfd_tunnel/:tunnelId/configurations` API `PUT` with ingress rules including `{ hostname, path: '/convex', service: 'http://127.0.0.1:7788' }` and the default `{ hostname, service: 'http://127.0.0.1:8787' }`.
- Desktop: remove `--url` from cloudflared args when using a token; print both `Public bridge` and `Public convex` URLs for clarity.
- Client pairing: update generator to point `convex` to `https://<hostname>/convex`.

Risks
- If a prior version passed `--url`, it overrides remote ingress; ensure the desktop script is updated in lockstep.
- Convex WS path may differ; confirm the correct WS endpoint prefix.

Follow-ups
- Update README and onboarding docs to recommend the `/convex` path.
- Add health checks that verify HTTP 2xx/3xx/4xx on `/convex` and `/` separately; `/` can be 400 while `/ws` is healthy.

