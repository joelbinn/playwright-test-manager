import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WebSocket } from 'ws';
import { createServer } from '../../src/server/app.js';

describe('HTTP & WebSocket Test Runs API (Seam: Fastify API & WebSocket Streaming)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;
  let serverPort: number;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-runs-api-test-'));
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });

    app = await createServer({ workspaceRoot: tempDir });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const portStr = address.split(':').pop();
    serverPort = Number(portStr);
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('triggers a run via POST /api/runs and streams logs and status over /ws/runs', async () => {
    // 1. Create a fake runner script in temp workspace
    const fakeScript = path.join(tempDir, 'fake-stream-runner.js');
    await fs.writeFile(
      fakeScript,
      `console.log("Running 1 test using 1 worker");
console.log("✓ tests/login.spec.ts:10:5 › login flow works");
console.log("1 passed (180ms)");
process.exit(0);`
    );

    // 2. Connect WebSocket to /ws/runs
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws/runs`);
    const receivedMessages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    ws.on('message', (raw) => {
      try {
        receivedMessages.push(JSON.parse(raw.toString()));
      } catch (e) {
        // ignore non-json
      }
    });

    // 3. Post to trigger run
    const triggerRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'login',
        headed: false,
        command: `node ${fakeScript}`
      })
    });

    expect(triggerRes.status).toBe(200);
    const triggerBody = await triggerRes.json();
    expect(triggerBody.runId).toBeDefined();
    expect(triggerBody.status).toBe('running');

    // 4. Wait for WebSocket stream to receive completion status
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const hasFinished = receivedMessages.some(
          (m) => m.type === 'status' && (m.status === 'passed' || m.status === 'failed')
        );
        if (hasFinished) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    ws.close();

    // Verify received events
    const logEvents = receivedMessages.filter((m) => m.type === 'log');
    expect(logEvents.length).toBeGreaterThan(0);
    expect(logEvents.some((m) => m.chunk.includes('1 passed'))).toBe(true);

    const finishStatus = receivedMessages.find(
      (m) => m.type === 'status' && m.status === 'passed'
    );
    expect(finishStatus).toBeDefined();
    expect(finishStatus.slug).toBe('login');

    // 5. Query GET /api/runs/status to verify persistent status lookup
    const statusRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs/status`);
    expect(statusRes.status).toBe(200);
    const statuses = await statusRes.json();
    expect(statuses.login).toBe('passed');
  });

  it('handles "Run All" execution when slug is omitted', async () => {
    const fakeScript = path.join(tempDir, 'fake-run-all.js');
    await fs.writeFile(
      fakeScript,
      `console.log("Running 3 tests using 2 workers");
console.log("3 passed (500ms)");
process.exit(0);`
    );

    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws/runs`);
    const receivedMessages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    ws.on('message', (raw) => {
      try {
        receivedMessages.push(JSON.parse(raw.toString()));
      } catch (e) {}
    });

    const triggerRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        headed: false,
        command: `node ${fakeScript}`
      })
    });

    expect(triggerRes.status).toBe(200);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (receivedMessages.some((m) => m.type === 'status' && m.status === 'passed')) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    ws.close();

    const finishStatus = receivedMessages.find(
      (m) => m.type === 'status' && m.status === 'passed'
    );
    expect(finishStatus).toBeDefined();
    expect(finishStatus.slug).toBe('all');
  });

  it('broadcasts error, stack, and trace artifacts on failed runs over WebSocket and updates status', async () => {
    const fakeScript = path.join(tempDir, 'fake-fail-stream.js');
    await fs.writeFile(
      fakeScript,
      `console.error("Error: Timed out 5000ms waiting for locator('#checkout')");
console.error("    at checkout.spec.ts:12:15");
process.exit(1);`
    );

    // Place dummy trace.zip
    const traceDir = path.join(tempDir, 'test-results', 'checkout-run');
    await fs.mkdir(traceDir, { recursive: true });
    await fs.writeFile(path.join(traceDir, 'trace.zip'), 'dummy-trace-zip');

    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws/runs`);
    const receivedMessages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    ws.on('message', (raw) => {
      try {
        receivedMessages.push(JSON.parse(raw.toString()));
      } catch (e) {}
    });

    const triggerRes = await fetch(`http://127.0.0.1:${serverPort}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'checkout',
        headed: false,
        command: `node ${fakeScript}`
      })
    });

    expect(triggerRes.status).toBe(200);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (receivedMessages.some((m) => m.type === 'status' && m.status === 'failed')) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    ws.close();

    const failStatus = receivedMessages.find(
      (m) => m.type === 'status' && m.status === 'failed'
    );
    expect(failStatus).toBeDefined();
    expect(failStatus.slug).toBe('checkout');
    expect(failStatus.error).toContain("Timed out 5000ms waiting for locator('#checkout')");
    expect(failStatus.stack).toContain('at checkout.spec.ts:12:15');
    expect(failStatus.tracePath).toContain('trace.zip');
  });
});
