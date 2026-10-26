import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from '../../src/server/app.js';

describe('Trace Viewer & Healer Loop UI (Seam: Web UI Contract & Diagnostics)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-healer-ui-test-'));
    await fs.mkdir(path.join(tempDir, 'specs'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    app = await createServer({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('serves dashboard HTML with Failure Diagnostics, Trace Viewer tab, and Heal with Agent button', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/'
    });

    expect(res.statusCode).toBe(200);
    const html = res.body;

    // Must have failure diagnostics / error stack container
    expect(html).toContain('id="failure-diagnostics"');
    expect(html).toContain('id="error-stack"');

    // Must have "Heal with Agent" button
    expect(html).toContain('id="btn-heal"');

    // Must have embedded Trace Viewer tab & iframe
    expect(html).toContain('id="tab-trace"');
    expect(html).toContain('id="trace-viewer-frame"');

    // Must have wiring to /api/healer/stream
    expect(html).toContain('/api/healer/stream');
  });

  it('verifies the full failure -> heal -> stage diff -> apply -> re-run verification loop', async () => {
    // 1. Create a spec and broken test script
    const specMarkdown = `---
title: "Checkout Flow"
---
# Checkout Flow
1. Navigate to /checkout
2. Click button "Submit"
`;
    await fs.writeFile(path.join(tempDir, 'specs', 'checkout.md'), specMarkdown, 'utf-8');

    const brokenScript = `import { test, expect } from '@playwright/test';

test('Checkout Flow', async ({ page }) => {
  await page.goto('/checkout');
  await page.locator('#broken-login-btn').click();
});
`;
    await fs.writeFile(path.join(tempDir, 'tests', 'checkout.spec.ts'), brokenScript, 'utf-8');

    // 2. Simulate initial failed test run creating trace.zip
    const traceDir = path.join(tempDir, 'test-results', 'checkout');
    await fs.mkdir(traceDir, { recursive: true });
    await fs.writeFile(path.join(traceDir, 'trace.zip'), 'dummy-trace-data');

    const fakeFailingRunner = path.join(tempDir, 'fake-fail.js');
    await fs.writeFile(
      fakeFailingRunner,
      `console.error("Error: Timed out 5000ms waiting for locator('#broken-login-btn')");
console.error("    at checkout.spec.ts:5:20");
process.exit(1);`
    );

    // Run the broken test
    const initialRunRes = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: { slug: 'checkout', command: `node ${fakeFailingRunner}` }
    });
    expect(initialRunRes.statusCode).toBe(200);

    // Wait a brief moment for runner to finish
    await new Promise((r) => setTimeout(r, 100));

    // 3. Trigger Healer agent stream with the captured failure artifacts
    const healRes = await app.inject({
      method: 'POST',
      url: '/api/healer/stream',
      payload: {
        scriptSlug: 'checkout',
        specSlug: 'checkout',
        error: "Error: Timed out 5000ms waiting for locator('#broken-login-btn')",
        stack: "    at checkout.spec.ts:5:20",
        tracePath: "test-results/checkout/trace.zip",
        chunkDelayMs: 1
      }
    });

    expect(healRes.statusCode).toBe(200);
    const dataLines = healRes.body.split('\n').filter((l: string) => l.startsWith('data: '));
    const healedCode = dataLines
      .map((l: string) => JSON.parse(l.replace('data: ', '')))
      .filter((p: any) => p.chunk)
      .map((p: any) => p.chunk)
      .join('');

    expect(healedCode).toContain('@playwright/test');
    expect(healedCode).not.toContain('#broken-login-btn');

    // 4. Staging isolation: file on disk must NOT have changed yet!
    const diskBeforeApply = await fs.readFile(path.join(tempDir, 'tests', 'checkout.spec.ts'), 'utf-8');
    expect(diskBeforeApply).toBe(brokenScript);

    // 5. User reviews and applies the staged diff
    const applyRes = await app.inject({
      method: 'POST',
      url: '/api/scripts/checkout',
      payload: { content: healedCode }
    });
    expect(applyRes.statusCode).toBe(200);

    // File on disk is now the repaired code
    const diskAfterApply = await fs.readFile(path.join(tempDir, 'tests', 'checkout.spec.ts'), 'utf-8');
    expect(diskAfterApply).toBe(healedCode);

    // 6. User re-runs the test to verify the fix passes
    const fakePassingRunner = path.join(tempDir, 'fake-pass.js');
    await fs.writeFile(
      fakePassingRunner,
      `console.log("1 passed (120ms)");
process.exit(0);`
    );

    const reRunRes = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: { slug: 'checkout', command: `node ${fakePassingRunner}` }
    });
    expect(reRunRes.statusCode).toBe(200);

    await new Promise((r) => setTimeout(r, 100));

    // Verify status is now passed
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/runs/status'
    });
    const statuses = JSON.parse(statusRes.body);
    expect(statuses.checkout).toBe('passed');
  });
});
