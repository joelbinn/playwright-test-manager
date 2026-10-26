import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from '../../src/server/app.js';

describe('Healer Stream API & Trace Endpoints (Seam: Fastify HTTP API)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-healer-api-test-'));
    await fs.mkdir(path.join(tempDir, 'specs'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'test-results', 'auth-flow'), { recursive: true });

    app = await createServer({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('serves trace file info via GET /api/traces/:slug', async () => {
    // 1. Without trace file -> 404
    const resEmpty = await app.inject({
      method: 'GET',
      url: '/api/traces/auth'
    });
    expect(resEmpty.statusCode).toBe(404);

    // 2. Put trace.zip in test-results
    const tracePath = path.join(tempDir, 'test-results', 'auth-flow', 'trace.zip');
    await fs.writeFile(tracePath, 'dummy-binary-trace-zip');

    const resFound = await app.inject({
      method: 'GET',
      url: '/api/traces/auth'
    });
    expect(resFound.statusCode).toBe(200);
    const body = JSON.parse(resFound.body);
    expect(body.tracePath).toContain('trace.zip');
    expect(body.traceUrl).toBeDefined();
  });

  it('streams repaired code via POST /api/healer/stream with failure artifacts', async () => {
    // 1. Create a script and spec in workspace
    const scriptCode = `import { test, expect } from '@playwright/test';

test('auth flow', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#broken-login-btn').click();
  await expect(page.locator('.welcome')).toBeVisible();
});
`;
    await fs.writeFile(path.join(tempDir, 'tests', 'auth.spec.ts'), scriptCode, 'utf-8');

    // 2. Post to /api/healer/stream
    const streamRes = await app.inject({
      method: 'POST',
      url: '/api/healer/stream',
      payload: {
        scriptSlug: 'auth',
        error: "Error: Timed out 5000ms waiting for locator('#broken-login-btn')",
        stack: "    at auth.spec.ts:5:20",
        tracePath: "test-results/auth-flow/trace.zip",
        chunkDelayMs: 1
      }
    });

    expect(streamRes.statusCode).toBe(200);
    expect(streamRes.headers['content-type']).toContain('text/event-stream');

    const raw = streamRes.body;
    const lines = raw.split('\n').filter((l: string) => l.startsWith('data: '));
    const events = lines.map((l: string) => JSON.parse(l.replace('data: ', '')));

    const chunks = events.filter((e: any) => e.chunk).map((e: any) => e.chunk);
    const fullRepaired = chunks.join('');

    expect(fullRepaired).toContain('@playwright/test');
    expect(fullRepaired).toContain('Repaired by Healer');
    expect(events.some((e: any) => e.done === true)).toBe(true);
  });
});
