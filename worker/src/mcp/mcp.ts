import { McpServer, StreamableHttpTransport } from 'mcp-lite';
import { createNamedTunnel, getTunnelStatus, revokeTunnel } from '../broker/cloudflare';

// Minimal MCP server with placeholder tunnel tools. These will call into
// broker helpers once implemented under worker/src/broker/*.
const server = new McpServer({
  name: 'cloudburrow-mcp',
  version: '0.1.0',
});

server.tool('tunnel.announce_link', {
  description: 'Return a public WSS URL for the given hostname',
  inputSchema: {
    type: 'object',
    properties: { hostname: { type: 'string' } },
    required: ['hostname'],
  },
  outputSchema: {
    type: 'object',
    properties: { wss: { type: 'string' } },
    required: ['wss'],
  },
  handler: (args: { hostname: string }) => ({
    content: [{ type: 'text', text: `wss://${args.hostname}/ws` }],
    structuredContent: { wss: `wss://${args.hostname}/ws` },
  }),
});

server.tool('tunnel.create_named', {
  description: 'Create a named Cloudflare Tunnel (no token returned in MCP)',
  inputSchema: {
    type: 'object',
    properties: { deviceHint: { type: 'string' } },
  },
  outputSchema: {
    type: 'object',
    properties: {
      tunnelId: { type: 'string' },
      hostname: { type: 'string' },
      createdAt: { type: 'string' },
    },
    required: ['tunnelId', 'hostname', 'createdAt'],
  },
  handler: async (args: { deviceHint?: string }) => {
    const { tunnelId, hostname, createdAt } = await createNamedTunnel(args?.deviceHint);
    return {
      content: [
        { type: 'text', text: `Tunnel created: ${tunnelId} (${hostname})` },
      ],
      structuredContent: { tunnelId, hostname, createdAt },
    };
  },
});

server.tool('tunnel.status', {
  description: 'Get tunnel status by id',
  inputSchema: {
    type: 'object',
    properties: { tunnelId: { type: 'string' } },
    required: ['tunnelId'],
  },
  outputSchema: {
    type: 'object',
    properties: { connected: { type: 'boolean' }, lastSeen: { type: 'string' } },
  },
  handler: async (args: { tunnelId: string }) => {
    const out = await getTunnelStatus(args.tunnelId);
    return {
      content: [
        { type: 'text', text: `connected=${out.connected} lastSeen=${out.lastSeen ?? 'n/a'}` },
      ],
      structuredContent: out,
    };
  },
});

server.tool('tunnel.revoke', {
  description: 'Revoke a tunnel (no token exposure)',
  inputSchema: {
    type: 'object',
    properties: { tunnelId: { type: 'string' }, hostname: { type: 'string' } },
    required: ['tunnelId'],
  },
  outputSchema: {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'],
  },
  handler: async (args: { tunnelId: string; hostname?: string }) => {
    const out = await revokeTunnel(args.tunnelId, args.hostname);
    return { content: [{ type: 'text', text: 'Tunnel revoked' }], structuredContent: out };
  },
});

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(server);

export { httpHandler };
