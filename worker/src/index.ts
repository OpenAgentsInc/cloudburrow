import { Hono } from 'hono';
import { httpHandler as mcpHandler } from './mcp/mcp';

// Cloudflare Worker entrypoint with Hono
const app = new Hono();

// MCP endpoint
app.all('/mcp', async (c) => {
  const res = await mcpHandler(c.req.raw);
  return res as Response;
});

// Broker endpoints (stubs) — implement in src/broker/*
app.post('/tunnels', (c) => c.json({ error: 'Not implemented' }, 501));
app.get('/tunnels/:id/status', (c) => c.json({ error: 'Not implemented' }, 501));
app.delete('/tunnels/:id', (c) => c.json({ error: 'Not implemented' }, 501));

// Root
app.get('/', (c) =>
  c.text(
    'Cloudburrow Worker online.\n\n- MCP endpoint: /mcp\n- Broker endpoints: POST /tunnels, GET /tunnels/:id/status, DELETE /tunnels/:id',
  ),
);

export default app;

