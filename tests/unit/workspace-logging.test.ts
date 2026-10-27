import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Writable } from 'node:stream';
import { scanWorkspace } from '../../src/server/workspace.js';
import { readSpec, writeSpec } from '../../src/server/specs.js';

describe('Workspace & Specs Domain Logging (Seam: Workspace & Specs Logging)', () => {
  let tempDir: string;
  let logEntries: any[];
  let logStream: Writable;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-ws-log-test-'));
    await fs.mkdir(path.join(tempDir, 'specs'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });

    logEntries = [];
    logStream = new Writable({
      write(chunk, _encoding, cb) {
        logEntries.push(JSON.parse(chunk.toString()));
        cb();
      }
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('logs workspace scan summaries with spec and script counts', async () => {
    await fs.writeFile(path.join(tempDir, 'specs', 'login.md'), '# Login Spec');
    await fs.writeFile(path.join(tempDir, 'tests', 'login.spec.ts'), '// test');

    const result = await scanWorkspace(tempDir, { stream: logStream, level: 'info' });
    expect(result.specs).toHaveLength(1);
    expect(result.scripts).toHaveLength(1);

    const scanLog = logEntries.find((l) => l.component === 'workspace' && l.specCount === 1);
    expect(scanLog).toBeDefined();
    expect(scanLog.scriptCount).toBe(1);
  });

  it('logs spec file reads and writes', async () => {
    await writeSpec(tempDir, 'checkout', '# Checkout', { stream: logStream, level: 'info' });
    const writeLog = logEntries.find((l) => l.component === 'workspace' && l.slug === 'checkout' && l.bytes);
    expect(writeLog).toBeDefined();

    await readSpec(tempDir, 'checkout', { stream: logStream, level: 'info' });
    const readLog = logEntries.find((l) => l.component === 'workspace' && l.slug === 'checkout' && !l.bytes);
    expect(readLog).toBeDefined();
  });

  it('logs frontmatter parsing warnings on malformed frontmatter', async () => {
    const malformedContent = '---\ntitle: [unclosed array\n---\n# Content';
    await fs.writeFile(path.join(tempDir, 'specs', 'broken.md'), malformedContent, 'utf-8');

    const spec = await readSpec(tempDir, 'broken', { stream: logStream, level: 'info' });
    expect(spec).toBeDefined();

    const warnLog = logEntries.find((l) => l.component === 'workspace' && l.slug === 'broken' && l.level === 40 /* WARN in pino */);
    expect(warnLog).toBeDefined();
  });
});
