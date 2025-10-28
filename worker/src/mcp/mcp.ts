import { McpServer, StreamableHttpTransport } from 'mcp-lite';

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
  description: 'Create a named Cloudflare Tunnel (placeholder)',
  inputSchema: {
    type: 'object',
    properties: { deviceHint: { type: 'string' } },
  },
  handler: async () => {
    return {
      content: [
        {
          type: 'text',
          text: 'Not implemented yet. Deploy broker endpoints to enable this tool.',
        },
      ],
    };
  },
});

server.tool('tunnel.status', {
  description: 'Get tunnel status by id or hostname (placeholder)',
  inputSchema: {
    type: 'object',
    properties: {
      tunnelId: { type: 'string' },
      hostname: { type: 'string' },
    },
  },
  handler: async () => ({
    content: [
      { type: 'text', text: 'Not implemented yet. Add status lookup in broker.' },
    ],
  }),
});

server.tool('tunnel.revoke', {
  description: 'Revoke a tunnel (placeholder)',
  inputSchema: {
    type: 'object',
    properties: { tunnelId: { type: 'string' } },
    required: ['tunnelId'],
  },
  handler: async () => ({
    content: [
      { type: 'text', text: 'Not implemented yet. Add revoke logic in broker.' },
    ],
  }),
});

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(server);

export { httpHandler };

