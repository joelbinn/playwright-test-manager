import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

describe('CLI Entrypoint (Seam: Process CLI)', () => {
  it('starts server on assigned port and targets specified workspace directory', { timeout: 15000 }, async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-cli-test-'));
    await fs.mkdir(path.join(tempDir, 'specs'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'specs', 'cli-spec.md'), '# CLI Spec');

    const port = 43210;
    const cliPath = path.resolve('src/cli.ts');

    const proc = spawn('pnpm', ['tsx', cliPath, tempDir, '--port', String(port), '--no-open'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    const serverReady = new Promise<void>((resolve, reject) => {
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        if (stdout.includes(`http://localhost:${port}`)) {
          resolve();
        }
      });
      proc.on('error', reject);
    });

    try {
      await Promise.race([
        serverReady,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for CLI server')), 8000))
      ]);

      const res = await fetch(`http://localhost:${port}/api/workspace`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.rootPath).toBe(tempDir);
      expect(data.specs[0].name).toBe('cli-spec.md');
    } finally {
      proc.kill();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
