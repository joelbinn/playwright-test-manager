import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from '../../src/server/app.js';

describe('Project Settings UI Contract (Seam: Web UI Contract & Settings Modal)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-settings-ui-test-'));
    await fs.mkdir(path.join(tempDir, 'specs'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    app = await createServer({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('serves the Project Settings button, modal, form inputs, and agent toggle controls', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/'
    });

    expect(response.statusCode).toBe(200);
    const html = response.body;

    // Button to open settings
    expect(html).toContain('id="btn-settings"');

    // Settings modal/view container
    expect(html).toContain('id="settings-modal"');

    // Base URL input
    expect(html).toContain('id="settings-base-url"');

    // Seed test path input
    expect(html).toContain('id="settings-seed-test"');

    // Agent type selector/toggle (Mock Agent vs ACP Agent)
    expect(html).toContain('id="settings-agent-type"');

    // ACP command and arguments inputs
    expect(html).toContain('id="settings-acp-command"');
    expect(html).toContain('id="settings-acp-args"');

    // Settings save button
    expect(html).toContain('id="settings-save-btn"');

    // Active agent badge or status in header / sidebar
    expect(html).toContain('id="active-agent-badge"');
  });

  it('serves valid JavaScript in the client script tag without syntax errors', async () => {
    const vm = await import('node:vm');
    const response = await app.inject({
      method: 'GET',
      url: '/'
    });

    const html = response.body;
    const scripts = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
    expect(scripts.length).toBeGreaterThan(0);

    for (const scriptTag of scripts) {
      const code = scriptTag.replace(/^<script>/, '').replace(/<\/script>$/, '');
      expect(() => new vm.Script(code)).not.toThrow();
    }
  });
});
