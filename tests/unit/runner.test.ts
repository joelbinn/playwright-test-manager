import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { runPlaywright } from '../../src/server/runner.js';

describe('Playwright Test Runner Engine (Seam: Runner Process)', () => {
  it('executes a test script, streams logs, and reports passed status', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-runner-test-'));
    const logs: Array<{ chunk: string; stream: 'stdout' | 'stderr' }> = [];
    const statuses: string[] = [];

    // Helper script that simulates a successful test run with stdout output
    const fakeScript = path.join(tempDir, 'fake-runner.js');
    await fs.writeFile(
      fakeScript,
      `console.log("Running 1 test using 1 worker");
console.log("✓ tests/auth.spec.ts:5:3 › user can login (120ms)");
console.log("1 passed (250ms)");
process.exit(0);`
    );

    const result = await runPlaywright({
      workspaceRoot: tempDir,
      scriptSlug: 'auth',
      headed: false,
      command: `node ${fakeScript}`,
      onLog: (chunk, stream) => logs.push({ chunk, stream }),
      onStatus: (status) => statuses.push(status)
    });

    expect(statuses).toEqual(['running', 'passed']);
    expect(result.status).toBe('passed');
    expect(result.exitCode).toBe(0);
    expect(logs.some(l => l.chunk.includes('1 passed'))).toBe(true);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('reports failed status and captures stderr when exit code is non-zero', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-runner-test-'));
    const logs: Array<{ chunk: string; stream: 'stdout' | 'stderr' }> = [];
    const statuses: string[] = [];

    const fakeScript = path.join(tempDir, 'fake-fail-runner.js');
    await fs.writeFile(
      fakeScript,
      `console.error("Error: Timed out 5000ms waiting for expect(locator).toBeVisible()");
process.exit(1);`
    );

    const result = await runPlaywright({
      workspaceRoot: tempDir,
      scriptSlug: 'checkout',
      headed: false,
      command: `node ${fakeScript}`,
      onLog: (chunk, stream) => logs.push({ chunk, stream }),
      onStatus: (status) => statuses.push(status)
    });

    expect(statuses).toEqual(['running', 'failed']);
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
    expect(logs.some(l => l.stream === 'stderr' && l.chunk.includes('Timed out'))).toBe(true);

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('builds the default arguments with --headed when headed is true and targets script path', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-runner-test-'));
    const logs: Array<{ chunk: string; stream: 'stdout' | 'stderr' }> = [];

    // Script that prints process.argv so we can assert the flags passed
    const fakeScript = path.join(tempDir, 'fake-args-runner.js');
    await fs.writeFile(
      fakeScript,
      `console.log(JSON.stringify(process.argv.slice(2)));
process.exit(0);`
    );

    await runPlaywright({
      workspaceRoot: tempDir,
      scriptSlug: 'login',
      headed: true,
      command: `node ${fakeScript}`,
      onLog: (chunk, stream) => logs.push({ chunk, stream })
    });

    const outputLog = logs.map(l => l.chunk).join('');
    const args = JSON.parse(outputLog.trim().split('\n')[0]);

    expect(args).toContain('--headed');
    expect(args).toContain(path.join('tests', 'login.spec.ts'));

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('runs all tests when scriptSlug is omitted', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-runner-test-'));
    const logs: Array<{ chunk: string; stream: 'stdout' | 'stderr' }> = [];

    const fakeScript = path.join(tempDir, 'fake-all-runner.js');
    await fs.writeFile(
      fakeScript,
      `console.log(JSON.stringify(process.argv.slice(2)));
process.exit(0);`
    );

    await runPlaywright({
      workspaceRoot: tempDir,
      headed: false,
      command: `node ${fakeScript}`,
      onLog: (chunk, stream) => logs.push({ chunk, stream })
    });

    const outputLog = logs.map(l => l.chunk).join('');
    const args = JSON.parse(outputLog.trim().split('\n')[0]);

    // Should not contain a specific test file argument
    expect(args.some(a => a.endsWith('.spec.ts'))).toBe(false);
    expect(args).not.toContain('--headed');

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('captures failure artifacts including error message, stack trace, and trace file path when test fails', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-runner-artifacts-'));
    const testResultsDir = path.join(tempDir, 'test-results', 'checkout-test');
    await fs.mkdir(testResultsDir, { recursive: true });
    const dummyTrace = path.join(testResultsDir, 'trace.zip');
    await fs.writeFile(dummyTrace, 'dummy-trace-content');

    const fakeScript = path.join(tempDir, 'fake-fail-with-artifacts.js');
    await fs.writeFile(
      fakeScript,
      `console.error("Error: Timed out 5000ms waiting for locator('#submit-btn') to be visible");
console.error("    at checkout.spec.ts:18:24");
process.exit(1);`
    );

    const result = await runPlaywright({
      workspaceRoot: tempDir,
      scriptSlug: 'checkout',
      headed: false,
      command: `node ${fakeScript}`
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain("Timed out 5000ms waiting for locator('#submit-btn') to be visible");
    expect(result.stack).toContain('at checkout.spec.ts:18:24');
    expect(result.tracePath).toBeDefined();
    expect(result.tracePath).toContain('trace.zip');

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
