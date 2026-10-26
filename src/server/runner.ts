import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface RunPlaywrightOptions {
  workspaceRoot: string;
  scriptSlug?: string;
  headed?: boolean;
  command?: string;
  onLog?: (chunk: string, stream: 'stdout' | 'stderr') => void;
  onStatus?: (status: 'running' | 'passed' | 'failed') => void;
}

export interface RunResult {
  runId: string;
  status: 'passed' | 'failed';
  exitCode: number | null;
  durationMs: number;
}

export async function runPlaywright(options: RunPlaywrightOptions): Promise<RunResult> {
  const runId = randomUUID();
  const startTime = Date.now();

  options.onStatus?.('running');

  const args: string[] = [];

  if (options.headed) {
    args.push('--headed');
  }

  if (options.scriptSlug) {
    const slug = options.scriptSlug.endsWith('.spec.ts') || options.scriptSlug.endsWith('.spec.js')
      ? options.scriptSlug
      : `${options.scriptSlug}.spec.ts`;
    args.push(path.join('tests', slug));
  }

  let cmd: string;
  let cmdArgs: string[];

  if (options.command) {
    const parts = options.command.split(' ');
    cmd = parts[0];
    cmdArgs = [...parts.slice(1), ...args];
  } else {
    cmd = 'npx';
    cmdArgs = ['playwright', 'test', ...args];
  }

  return new Promise<RunResult>((resolve) => {
    const proc = spawn(cmd, cmdArgs, {
      cwd: options.workspaceRoot,
      env: { ...process.env, FORCE_COLOR: '0' },
      shell: false
    });

    proc.stdout.on('data', (data: Buffer) => {
      options.onLog?.(data.toString('utf-8'), 'stdout');
    });

    proc.stderr.on('data', (data: Buffer) => {
      options.onLog?.(data.toString('utf-8'), 'stderr');
    });

    proc.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      const status: 'passed' | 'failed' = code === 0 ? 'passed' : 'failed';
      options.onStatus?.(status);

      resolve({
        runId,
        status,
        exitCode: code,
        durationMs
      });
    });

    proc.on('error', (err) => {
      options.onLog?.(err.message, 'stderr');
      const durationMs = Date.now() - startTime;
      options.onStatus?.('failed');

      resolve({
        runId,
        status: 'failed',
        exitCode: 1,
        durationMs
      });
    });
  });
}
