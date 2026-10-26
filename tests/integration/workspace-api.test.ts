import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from '../../src/server/app.js';

describe('Workspace Explorer API (Seam: HTTP API)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    // Create temporary workspace
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-test-workspace-'));
    await fs.mkdir(path.join(tempDir, 'specs'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });

    // Seed test files
    await fs.writeFile(
      path.join(tempDir, 'specs', 'auth-flow.md'),
      '# Auth Flow Spec\n\nVerify user can login.'
    );
    await fs.writeFile(
      path.join(tempDir, 'tests', 'auth-flow.spec.ts'),
      "import { test } from '@playwright/test';\ntest('auth flow', () => {});"
    );

    // Initialize server pointing to tempDir
    app = await createServer({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('scans and lists existing Test Specs and Test Scripts in the workspace', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/workspace'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.rootPath).toBe(tempDir);
    expect(body.specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'auth-flow.md',
          slug: 'auth-flow',
          relativePath: 'specs/auth-flow.md'
        })
      ])
    );
    expect(body.scripts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'auth-flow.spec.ts',
          slug: 'auth-flow',
          relativePath: 'tests/auth-flow.spec.ts'
        })
      ])
    );
  });

  it('serves the dashboard HTML at root URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/'
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Playwright Test Manager');
  });
});
