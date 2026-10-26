import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from '../../src/server/app.js';

describe('Playwright Test Runner Dashboard UI (Seam: Web UI Contract & Console)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-ui-test-'));
    await fs.mkdir(path.join(tempDir, 'specs'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    app = await createServer({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('serves dashboard HTML with Run All, Run Test, Headed toggle, and live console pane', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/'
    });

    expect(res.statusCode).toBe(200);
    const html = res.body;

    // Must have "Run All" button in sidebar or header
    expect(html).toContain('id="btn-run-all"');

    // Must have "Run Test" action for individual test script execution
    expect(html).toContain('id="btn-run-test"');

    // Must have Headed Mode toggle checkbox / switch
    expect(html).toContain('id="toggle-headed"');

    // Must have live console output container and clear button
    expect(html).toContain('id="console-pane"');
    expect(html).toContain('id="console-output"');
    expect(html).toContain('id="btn-clear-console"');

    // Must connect to WebSocket endpoint for real-time live streaming
    expect(html).toContain('/ws/runs');
    expect(html).toContain('/api/runs');

    // Must render status badges for test execution
    expect(html).toContain('status-badge');
  });
});
