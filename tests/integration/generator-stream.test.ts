import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from '../../src/server/app.js';

describe('Generator Streaming API (Seam: HTTP Streaming API)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-generator-test-'));
    await fs.mkdir(path.join(tempDir, 'specs'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    app = await createServer({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('rejects requests with missing specSlug or markdown with 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/generator/stream',
      payload: {}
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it('streams Playwright code without writing anything to filesystem', async () => {
    // Set up a test spec
    const specContent = `---
title: "Cart Checkout Flow"
---

# Cart Checkout Flow

## Test Steps
1. Navigate to /cart
2. Click button "Checkout"
`;
    await fs.writeFile(path.join(tempDir, 'specs', 'cart-checkout.md'), specContent, 'utf-8');

    const res = await app.inject({
      method: 'POST',
      url: '/api/generator/stream',
      payload: {
        specSlug: 'cart-checkout',
        chunkDelayMs: 1
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const lines = res.body.split('\n');
    const dataLines = lines.filter((l) => l.startsWith('data: '));
    expect(dataLines.length).toBeGreaterThan(1);

    const parsed = dataLines.map((l) => JSON.parse(l.replace('data: ', '')));
    const fullCode = parsed
      .filter((p) => p.chunk)
      .map((p) => p.chunk)
      .join('');

    expect(fullCode).toContain("import { test, expect } from '@playwright/test';");
    expect(fullCode).toContain('Cart Checkout Flow');
    expect(parsed.some((p) => p.done)).toBe(true);

    // CRITICAL: Ensure NO test script was written to disk!
    const testsDirFiles = await fs.readdir(path.join(tempDir, 'tests'));
    expect(testsDirFiles).toEqual([]);
  });
});
