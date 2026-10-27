import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createDomainLogger } from './logger.js';

export interface RunPlaywrightOptions {
  workspaceRoot: string;
  scriptSlug?: string;
  headed?: boolean;
  command?: string;
  logger?: any;
  onLog?: (chunk: string, stream: 'stdout' | 'stderr') => void;
  onStatus?: (status: 'running' | 'passed' | 'failed') => void;
}

export interface RunResult {
  runId: string;
  status: 'passed' | 'failed';
  exitCode: number | null;
  durationMs: number;
  error?: string;
  stack?: string;
  tracePath?: string;
}

async function findLatestTrace(workspaceRoot: string): Promise<string | undefined> {
  const resultsDir = path.join(workspaceRoot, 'test-results');
  try {
    const entries = await fs.readdir(resultsDir, { withFileTypes: true });
    // Look directly inside resultsDir and subdirectories for trace.zip
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(resultsDir, entry.name, 'trace.zip');
        try {
          await fs.access(subPath);
          return path.relative(workspaceRoot, subPath);
        } catch {}
      } else if (entry.name === 'trace.zip') {
        return path.relative(workspaceRoot, path.join(resultsDir, entry.name));
      }
    }
  } catch {}
  return undefined;
}

function extractErrorAndStack(logs: string[]): { error?: string; stack?: string } {
  const fullText = logs.join('\n');
  if (!fullText.trim()) return {};

  const lines = fullText.split('\n');
  const errorLines: string[] = [];
  const stackLines: string[] = [];

  for (const line of lines) {
    if (line.match(/^\s*at\s+/)) {
      stackLines.push(line.trim());
    } else if (line.toLowerCase().includes('error:') || line.toLowerCase().includes('failed:')) {
      errorLines.push(line.trim());
    }
  }

  const error = errorLines.length > 0 ? errorLines.join('\n') : lines.find(l => l.trim().length > 0)?.trim();
  const stack = stackLines.length > 0 ? stackLines.join('\n') : undefined;

  return { error, stack };
}

export async function runPlaywright(options: RunPlaywrightOptions): Promise<RunResult> {
  const logger = createDomainLogger('runner', options.logger);
  const runId = randomUUID();
  const startTime = Date.now();

  options.onStatus?.('running');
  logger.info({ runId, status: 'running' }, 'Test run started');

  const args: string[] = [];

  if (options.headed) {
    args.push('--headed');
  }

  // Ensure trace recording is enabled for test failures
  args.push('--trace');
  args.push('on');

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

  logger.info(
    {
      runId,
      command: cmd,
      args: cmdArgs,
      cwd: options.workspaceRoot,
      headed: Boolean(options.headed),
      scriptSlug: options.scriptSlug
    },
    `Dispatched test run: ${cmd} ${cmdArgs.join(' ')}`
  );

  const stderrChunks: string[] = [];
  const stdoutChunks: string[] = [];

  return new Promise<RunResult>((resolve) => {
    const proc = spawn(cmd, cmdArgs, {
      cwd: options.workspaceRoot,
      env: { ...process.env, FORCE_COLOR: '0' },
      shell: false
    });

    proc.stdout.on('data', (data: Buffer) => {
      const str = data.toString('utf-8');
      stdoutChunks.push(str);
      options.onLog?.(str, 'stdout');
    });

    proc.stderr.on('data', (data: Buffer) => {
      const str = data.toString('utf-8');
      stderrChunks.push(str);
      options.onLog?.(str, 'stderr');
    });

    proc.on('close', async (code) => {
      const durationMs = Date.now() - startTime;
      const status: 'passed' | 'failed' = code === 0 ? 'passed' : 'failed';
      options.onStatus?.(status);

      let error: string | undefined;
      let stack: string | undefined;
      let tracePath: string | undefined;

      if (status === 'failed') {
        const extracted = extractErrorAndStack(stderrChunks.length > 0 ? stderrChunks : stdoutChunks);
        error = extracted.error;
        stack = extracted.stack;
        tracePath = await findLatestTrace(options.workspaceRoot);
        logger.warn(
          { runId, status, exitCode: code, durationMs, error, tracePath },
          `Test run failed with exit code ${code} (${durationMs}ms)`
        );
      } else {
        logger.info(
          { runId, status, exitCode: code, durationMs },
          `Test run completed successfully (${durationMs}ms)`
        );
      }

      resolve({
        runId,
        status,
        exitCode: code,
        durationMs,
        error,
        stack,
        tracePath
      });
    });

    proc.on('error', async (err) => {
      options.onLog?.(err.message, 'stderr');
      const durationMs = Date.now() - startTime;
      options.onStatus?.('failed');

      logger.error(
        { runId, error: err.message, stack: err.stack, durationMs },
        `Failed to spawn test runner process: ${err.message}`
      );

      const tracePath = await findLatestTrace(options.workspaceRoot);

      resolve({
        runId,
        status: 'failed',
        exitCode: 1,
        durationMs,
        error: err.message,
        stack: err.stack,
        tracePath
      });
    });
  });
}
