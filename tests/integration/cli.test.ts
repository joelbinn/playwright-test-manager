import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { runCli } from '../../src/cli.js';

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

  it('outputs request logs to stdout when --verbose flag is enabled', { timeout: 15000 }, async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-cli-verbose-'));
    const port = 43211;
    const cliPath = path.resolve('src/cli.ts');

    const proc = spawn('pnpm', ['tsx', cliPath, tempDir, '--port', String(port), '--no-open', '--verbose'], {
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

      // Give stdout stream a moment to flush pretty transport
      await new Promise<void>((resolve) => {
        const check = () => {
          if (stdout.includes('/api/workspace') && stdout.includes('200')) {
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
        setTimeout(resolve, 1500);
      });

      expect(stdout).toContain('/api/workspace');
      expect(stdout).toContain('200');
    } finally {
      proc.kill();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('configures server log level based on CLI flags and LOG_LEVEL environment', async () => {
    const prevEnv = process.env.LOG_LEVEL;
    try {
      delete process.env.LOG_LEVEL;
      const appDefault = await runCli(['--no-open', '--port', '0']);
      expect(appDefault.log.level).toBe('info');
      await appDefault.close();

      const appDebug = await runCli(['--no-open', '--port', '0', '--debug']);
      expect(appDebug.log.level).toBe('debug');
      await appDebug.close();

      const appVerbose = await runCli(['--no-open', '--port', '0', '--verbose']);
      expect(appVerbose.log.level).toBe('debug');
      await appVerbose.close();

      process.env.LOG_LEVEL = 'warn';
      const appEnv = await runCli(['--no-open', '--port', '0']);
      expect(appEnv.log.level).toBe('warn');
      await appEnv.close();
    } finally {
      if (prevEnv !== undefined) {
        process.env.LOG_LEVEL = prevEnv;
      } else {
        delete process.env.LOG_LEVEL;
      }
    }
  });
});
