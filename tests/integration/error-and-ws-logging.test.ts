import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { Writable } from 'node:stream';
import { WebSocket } from 'ws';
import { createServer } from '../../src/server/app.js';
import type { FastifyInstance } from 'fastify';

describe('Error Tracing & WebSocket Subsystem Logging (Seam: Error Tracing & WS Logging)', () => {
  let tempDir: string;
  let app: FastifyInstance;
  let logLines: any[];
  let logStream: Writable;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-err-ws-test-'));
    logLines = [];
    logStream = new Writable({
      write(chunk, _encoding, callback) {
        const text = chunk.toString();
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          try {
            logLines.push(JSON.parse(line));
          } catch {
            logLines.push({ msg: line });
          }
        }
        callback();
      }
    });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('logs WebSocket client connect and disconnect events with active count', async () => {
    app = await createServer({
      workspaceRoot: tempDir,
      logger: {
        level: 'info',
        stream: logStream
      }
    });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as any).port;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/runs`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    // Verify connect log
    const connectLog = logLines.find((l) => l.component === 'websocket' && l.activeConnections === 1);
    expect(connectLog).toBeDefined();

    // Close socket and wait for disconnect event
    ws.close();
    await new Promise((r) => setTimeout(r, 60));

    const disconnectLog = logLines.find((l) => l.component === 'websocket' && l.activeConnections === 0);
    expect(disconnectLog).toBeDefined();
  });

  it('logs full stack trace and error context correlated with reqId on unexpected errors', async () => {
    app = await createServer({
      workspaceRoot: tempDir,
      logger: {
        level: 'info',
        stream: logStream
      }
    });

    // Add a test endpoint that throws an unhandled error
    app.get('/test/boom', async () => {
      const err = new Error('Database connection broke unexpectedly');
      err.stack = 'Error: Database connection broke unexpectedly\n    at boom.ts:42:10';
      throw err;
    });

    const res = await app.inject({
      method: 'GET',
      url: '/test/boom'
    });

    expect(res.statusCode).toBe(500);

    const errorLog = logLines.find((l) => l.level === 50 /* pino error level */ && l.error?.includes('Database connection broke'));
    expect(errorLog).toBeDefined();
    expect(errorLog.reqId).toBeDefined();
    expect(errorLog.stack).toContain('at boom.ts:42:10');
    expect(errorLog.statusCode).toBe(500);
  });
});
