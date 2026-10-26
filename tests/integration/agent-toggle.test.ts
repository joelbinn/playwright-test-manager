import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from '../../src/server/app.js';
import { saveSettings } from '../../src/server/settings.js';

describe('Agent Toggle & Dynamic Dispatch API (Seam: Fastify SSE API)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-agent-toggle-test-'));
    await fs.mkdir(path.join(tempDir, 'specs'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    app = await createServer({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('uses Mock Agent by default or when agentType is "mock"', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/planner/stream',
      payload: {
        prompt: 'User checkout test',
        chunkDelayMs: 1
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body).toContain('data: {"chunk":"---');
    expect(body).toContain('"done":true');
  });

  it('routes to external ACP client when agentType is "acp" and command is set', async () => {
    // Create a mock ACP agent script
    const mockAgentScript = path.join(tempDir, 'test-acp-planner.js');
    await fs.writeFile(
      mockAgentScript,
      `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }) + '\\n');
  } else if (msg.method === 'session/create') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 's-acp' } }) + '\\n');
  } else if (msg.method === 'session/prompt') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { chunk: '# Streamed From External ACP Agent\\n' }
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: { status: 'completed' }
    }) + '\\n');
  } else if (msg.method === 'session/close') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { closed: true } }) + '\\n');
    process.exit(0);
  }
});
`,
      'utf-8'
    );

    // Save settings with agentType = 'acp'
    await saveSettings(tempDir, {
      agentType: 'acp',
      acpCommand: 'node',
      acpArgs: [mockAgentScript]
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/planner/stream',
      payload: {
        prompt: 'Test external acp prompt'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;
    expect(body).toContain('# Streamed From External ACP Agent');
    expect(body).toContain('"done":true');
  });

  it('routes generator and healer streams to ACP client when enabled', async () => {
    const mockAgentScript = path.join(tempDir, 'test-acp-gen-heal.js');
    await fs.writeFile(
      mockAgentScript,
      `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }) + '\\n');
  } else if (msg.method === 'session/create') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 's-' + msg.params.role } }) + '\\n');
  } else if (msg.method === 'session/prompt') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'session/update',
      params: { chunk: '// ACP ' + msg.params.role + ' output\\n' }
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: { status: 'completed' }
    }) + '\\n');
  } else if (msg.method === 'session/close') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { closed: true } }) + '\\n');
    process.exit(0);
  }
});
`,
      'utf-8'
    );

    await saveSettings(tempDir, {
      agentType: 'acp',
      acpCommand: 'node',
      acpArgs: [mockAgentScript]
    });

    // Test generator stream
    const genRes = await app.inject({
      method: 'POST',
      url: '/api/generator/stream',
      payload: {
        markdown: '# Test Spec\nDo something'
      }
    });
    expect(genRes.statusCode).toBe(200);
    expect(genRes.body).toContain('// ACP generator output');

    // Test healer stream
    const healRes = await app.inject({
      method: 'POST',
      url: '/api/healer/stream',
      payload: {
        scriptContent: 'test("foo", () => {});',
        error: 'Element not found'
      }
    });
    expect(healRes.statusCode).toBe(200);
    expect(healRes.body).toContain('// ACP healer output');
  });
});
