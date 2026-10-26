import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from '../../src/server/app.js';

describe('Monaco Staged Diff & Lifecycle (Seam: Web UI & Staging Lifecycle)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-diff-test-'));
    await fs.mkdir(path.join(tempDir, 'specs'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    app = await createServer({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('serves HTML containing Monaco diff container, Apply and Reject controls', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/'
    });

    expect(res.statusCode).toBe(200);
    const html = res.body;

    // Must have the generate button
    expect(html).toContain('id="btn-generate"');

    // Must have Staged Diff view container and Monaco diff editor target
    expect(html).toContain('id="diff-view"');
    expect(html).toContain('id="monaco-diff-editor"');

    // Must have Apply and Reject controls
    expect(html).toContain('id="btn-apply-diff"');
    expect(html).toContain('id="btn-reject-diff"');

    // Must reference createDiffEditor and diff lifecycle
    expect(html).toContain('createDiffEditor');
    expect(html).toContain('applyStagedDiff');
    expect(html).toContain('rejectStagedDiff');
  });

  it('verifies the full generation -> diff staging -> apply lifecycle', async () => {
    // 1. Given a Test Spec
    const specMarkdown = `---
title: "User Registration"
---

# User Registration
1. Navigate to /register
2. Fill in registration form
`;
    await fs.writeFile(path.join(tempDir, 'specs', 'user-registration.md'), specMarkdown, 'utf-8');

    // Verify script does not exist initially
    const scriptFile = path.join(tempDir, 'tests', 'user-registration.spec.ts');
    await expect(fs.access(scriptFile)).rejects.toThrow();

    // 2. Trigger Generator stream (simulating "Generate Script" button action)
    const streamRes = await app.inject({
      method: 'POST',
      url: '/api/generator/stream',
      payload: { specSlug: 'user-registration', chunkDelayMs: 1 }
    });
    expect(streamRes.statusCode).toBe(200);

    const dataLines = streamRes.body.split('\n').filter((l) => l.startsWith('data: '));
    const stagedCode = dataLines
      .map((l) => JSON.parse(l.replace('data: ', '')))
      .filter((p) => p.chunk)
      .map((p) => p.chunk)
      .join('');

    expect(stagedCode).toContain('@playwright/test');
    expect(stagedCode).toContain('User Registration');

    // 3. Staging isolation: file must STILL NOT exist on disk!
    await expect(fs.access(scriptFile)).rejects.toThrow();

    // 4. Simulate "Apply" action: commits staged code to disk
    const applyRes = await app.inject({
      method: 'POST',
      url: '/api/scripts/user-registration',
      payload: { content: stagedCode }
    });
    expect(applyRes.statusCode).toBe(200);

    // 5. File is now committed to disk
    const onDisk = await fs.readFile(scriptFile, 'utf-8');
    expect(onDisk).toBe(stagedCode);
  });

  it('verifies the rejection lifecycle leaves filesystem untouched', async () => {
    // 1. Given a Test Spec
    const specMarkdown = `---
title: "Discard Me"
---

# Discard Me
1. Step 1
`;
    await fs.writeFile(path.join(tempDir, 'specs', 'discard-test.md'), specMarkdown, 'utf-8');
    const scriptFile = path.join(tempDir, 'tests', 'discard-test.spec.ts');

    // 2. Stream generation
    const streamRes = await app.inject({
      method: 'POST',
      url: '/api/generator/stream',
      payload: { specSlug: 'discard-test', chunkDelayMs: 1 }
    });
    expect(streamRes.statusCode).toBe(200);

    // 3. Simulate "Reject": discarded in UI state, no POST /api/scripts/:slug is called
    // File must NOT exist on disk
    await expect(fs.access(scriptFile)).rejects.toThrow();
  });
});
