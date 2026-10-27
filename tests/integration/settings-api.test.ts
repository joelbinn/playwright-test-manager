import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from '../../src/server/app.js';

describe('Project Settings API (Seam: Fastify HTTP API)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-settings-test-'));
    app = await createServer({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('GET /api/settings returns default configuration when .playwright-manager.json does not exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/settings'
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({
      baseUrl: 'http://localhost:3000',
      seedTestPath: 'tests/seed.spec.ts',
      agentType: 'mock',
      acpCommand: '',
      acpArgs: []
    });
  });

  it('POST /api/settings updates configuration and persists to .playwright-manager.json', async () => {
    const updated = {
      baseUrl: 'https://staging.example.com',
      seedTestPath: 'e2e/bootstrap.spec.ts',
      agentType: 'acp',
      acpCommand: 'claude-code',
      acpArgs: ['--acp']
    };

    const postResponse = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: updated
    });

    expect(postResponse.statusCode).toBe(200);
    expect(postResponse.json()).toEqual(updated);

    // Verify written to disk in .playwright-manager.json
    const configOnDisk = JSON.parse(
      await fs.readFile(path.join(tempDir, '.playwright-manager.json'), 'utf-8')
    );
    expect(configOnDisk).toEqual(updated);

    // Verify GET returns the saved settings
    const getResponse = await app.inject({
      method: 'GET',
      url: '/api/settings'
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual(updated);
  });

  it('strips surrounding single and double quotes from acpArgs', async () => {
    const postResponse = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: {
        agentType: 'acp',
        acpCommand: 'npx',
        acpArgs: ['-y', 'agy-acp', 'start', '--mode', 'stdio', '--model', "'gemini-3.8-flash'"]
      }
    });

    expect(postResponse.statusCode).toBe(200);
    const body = postResponse.json();
    expect(body.acpArgs).toEqual([
      '-y',
      'agy-acp',
      'start',
      '--mode',
      'stdio',
      '--model',
      'gemini-3.8-flash'
    ]);
  });

  it('POST /api/settings/test-acp probes ACP agent connection with configured or provided parameters', async () => {
    // Write a mock ACP agent
    const mockAgentScript = path.join(tempDir, 'test-acp-agent.js');
    await fs.writeFile(
      mockAgentScript,
      `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.method === 'initialize') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        serverInfo: { name: 'claude-code', version: '1.2.0' }
      }
    }) + '\\n');
  } else if (msg.method === 'notifications/initialized') {
  } else if (msg.method === 'session/new' || msg.method === 'session/create') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 'test-session' } }) + '\\n');
  } else if (msg.method === 'session/close') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { closed: true } }) + '\\n');
    process.exit(0);
  }
});
`,
      'utf-8'
    );

    const testResponse = await app.inject({
      method: 'POST',
      url: '/api/settings/test-acp',
      payload: {
        acpCommand: 'node',
        acpArgs: [mockAgentScript, '--model', 'claude-3-7-sonnet']
      }
    });

    expect(testResponse.statusCode).toBe(200);
    const body = testResponse.json();
    expect(body.ok).toBe(true);
    expect(body.agent).toEqual({ name: 'claude-code', version: '1.2.0' });
    expect(body.model).toBe('claude-3-7-sonnet');
  });

  it('POST /api/settings/test-acp returns failure report when connection fails', async () => {
    const testResponse = await app.inject({
      method: 'POST',
      url: '/api/settings/test-acp',
      payload: {
        acpCommand: 'non-existent-binary-xyz-12345',
        acpArgs: []
      }
    });

    expect(testResponse.statusCode).toBe(200);
    const body = testResponse.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBeDefined();
  });
});
