import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import { httpHandler as mcpHandler } from './mcp/mcp';
import { createNamedTunnel, getTunnelStatus, revokeTunnel } from './broker/cloudflare';

// Cloudflare Worker entrypoint with Hono
const app = new Hono();

// MCP endpoint
app.all('/mcp', async (c) => {
  const res = await mcpHandler(c.req.raw);
  return res as Response;
});

// Optional auth using a shared BROKER_KEY secret.
function requireAuth(c: any): Response | null {
  const key = (env as any).BROKER_KEY as string | undefined;
  if (!key) return null; // no auth required when not set
  const header = c.req.header('authorization') || '';
  const ok = header === `Bearer ${key}`;
  return ok ? null : c.json({ error: 'Unauthorized' }, 401);
}

app.post('/tunnels', async (c) => {
  const maybe = requireAuth(c);
  if (maybe) return maybe;
  try {
    const body = (await c.req.json().catch(() => ({}))) as { deviceHint?: string };
    const out = await createNamedTunnel(body.deviceHint);
    return c.json(out, 200);
  } catch (err: any) {
    return c.json({ error: String(err?.message || err) }, 500);
  }
});

app.get('/tunnels/:id/status', async (c) => {
  const maybe = requireAuth(c);
  if (maybe) return maybe;
  try {
    const id = c.req.param('id');
    const out = await getTunnelStatus(id);
    return c.json(out, 200);
  } catch (err: any) {
    return c.json({ error: String(err?.message || err) }, 500);
  }
});

app.delete('/tunnels/:id', async (c) => {
  const maybe = requireAuth(c);
  if (maybe) return maybe;
  try {
    const id = c.req.param('id');
    const hostname = c.req.query('hostname') || undefined;
    const out = await revokeTunnel(id, hostname);
    return c.json(out, 200);
  } catch (err: any) {
    return c.json({ error: String(err?.message || err) }, 500);
  }
});

// Root
app.get('/', (c) =>
  c.text(
    'Cloudburrow Worker online.\n\n- MCP endpoint: /mcp\n- Broker endpoints: POST /tunnels, GET /tunnels/:id/status, DELETE /tunnels/:id',
  ),
);

export default app;
