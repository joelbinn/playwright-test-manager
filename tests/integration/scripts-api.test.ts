import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from '../../src/server/app.js';

describe('Scripts API & Apply Lifecycle (Seam: HTTP API)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-scripts-test-'));
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    app = await createServer({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns 404 when script does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/scripts/nonexistent'
    });

    expect(res.statusCode).toBe(404);
  });

  it('commits staged code to disk on POST /api/scripts/:slug (Apply action)', async () => {
    const scriptCode = `import { test, expect } from '@playwright/test';\n\ntest('login', async () => {});`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/scripts/login',
      payload: {
        content: scriptCode
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.slug).toBe('login');
    expect(body.name).toBe('login.spec.ts');
    expect(body.content).toBe(scriptCode);

    // Verify written to disk
    const onDisk = await fs.readFile(path.join(tempDir, 'tests', 'login.spec.ts'), 'utf-8');
    expect(onDisk).toBe(scriptCode);

    // Verify GET /api/scripts/:slug returns it
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/scripts/login'
    });
    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.body).content).toBe(scriptCode);
  });
});
