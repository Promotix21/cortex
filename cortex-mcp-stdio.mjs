#!/usr/bin/env node
/**
 * Cortex MCP Stdio Bridge
 *
 * Wraps the Cortex HTTP MCP server (localhost:4710) as a stdio MCP server
 * that Claude Code can spawn directly. Reads JSON-RPC from stdin, forwards
 * to the HTTP server, writes responses to stdout.
 */

import { createInterface } from 'readline';

const MCP_URL = `http://localhost:${process.env.CORTEX_MCP_PORT || 4710}`;
let pending = 0;
let stdinClosed = false;

const rl = createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  pending++;
  try {
    const request = JSON.parse(trimmed);

    // Handle initialize locally
    if (request.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'cortex-intelligence', version: '0.1.0' },
        },
      };
      process.stdout.write(JSON.stringify(response) + '\n');
      return;
    }

    // Handle notifications (no id)
    if (request.id === undefined && request.id !== 0) return;

    // Forward to HTTP MCP server
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    const body = await res.json();
    process.stdout.write(JSON.stringify(body) + '\n');
  } catch (err) {
    try {
      const request = JSON.parse(trimmed);
      if (request.id !== undefined) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32603, message: `Cortex MCP server unreachable: ${err.message}` },
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    } catch { /* ignore */ }
  } finally {
    pending--;
    if (stdinClosed && pending === 0) process.exit(0);
  }
});

rl.on('close', () => {
  stdinClosed = true;
  if (pending === 0) process.exit(0);
});
