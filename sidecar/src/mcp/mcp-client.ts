/**
 * MCP Client — Connect to external MCP servers (e.g., console-bridge).
 * Sends JSON-RPC requests and receives tool results.
 */

interface MCPClientOptions {
  url: string;
  name?: string;
}

interface MCPToolResult {
  content: { type: string; text: string }[];
}

export class MCPClient {
  private url: string;
  private name: string;
  private connected = false;

  constructor(options: MCPClientOptions) {
    this.url = options.url;
    this.name = options.name || 'cortex-mcp-client';
  }

  /**
   * Initialize connection with the MCP server
   */
  async initialize(): Promise<boolean> {
    try {
      const response = await this.send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: this.name, version: '0.1.0' },
      });
      this.connected = !!response?.result;
      return this.connected;
    } catch {
      this.connected = false;
      return false;
    }
  }

  /**
   * List tools available on the MCP server
   */
  async listTools(): Promise<any[]> {
    const response = await this.send('tools/list', {});
    return response?.result?.tools || [];
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<MCPToolResult | null> {
    const response = await this.send('tools/call', { name, arguments: args });
    if (response?.error) {
      console.error(`[mcp-client] Tool call error: ${response.error.message}`);
      return null;
    }
    return response?.result || null;
  }

  /**
   * Send a JSON-RPC request
   */
  private async send(method: string, params: Record<string, unknown>): Promise<any> {
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
      });
      return await res.json();
    } catch (err) {
      console.error(`[mcp-client] Connection to ${this.url} failed:`, err);
      return null;
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Create a client for the console-bridge MCP server
 */
export function createConsoleBridgeClient(port = 9877): MCPClient {
  return new MCPClient({
    url: `http://127.0.0.1:${port}/mcp`,
    name: 'cortex-console-bridge',
  });
}
