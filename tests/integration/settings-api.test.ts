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
});
