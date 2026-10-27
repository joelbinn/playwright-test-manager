import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { Writable } from 'node:stream';
import { WebSocket } from 'ws';
import { createServer } from '../../src/server/app.js';
import type { FastifyInstance } from 'fastify';

describe('HTTP Request Logging (Seam: HTTP Server Request Logging)', () => {
  let tempDir: string;
  let app: FastifyInstance;
  let logLines: any[];
  let logStream: Writable;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-logging-test-'));
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

  it('logs HTTP requests with reqId, method, url, status code, and response time', async () => {
    app = await createServer({
      workspaceRoot: tempDir,
      logger: {
        level: 'info',
        stream: logStream
      }
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/workspace'
    });

    expect(res.statusCode).toBe(200);

    const requestLog = logLines.find((entry) => entry.url === '/api/workspace');
    expect(requestLog).toBeDefined();
    expect(requestLog.method).toBe('GET');
    expect(requestLog.statusCode).toBe(200);
    expect(requestLog.reqId).toBeDefined();
    expect(typeof requestLog.responseTime).toBe('number');
  });

  it('suppresses logging for static assets and favicon', async () => {
    app = await createServer({
      workspaceRoot: tempDir,
      logger: {
        level: 'info',
        stream: logStream
      }
    });

    await app.inject({
      method: 'GET',
      url: '/dist/bundle.js'
    });

    await app.inject({
      method: 'GET',
      url: '/favicon.ico'
    });

    const distLog = logLines.find((entry) => entry.url?.includes('/dist/'));
    const faviconLog = logLines.find((entry) => entry.url?.includes('favicon'));
    expect(distLog).toBeUndefined();
    expect(faviconLog).toBeUndefined();
  });

  it('does not emit noisy request logs for WebSocket ping/pong traffic', async () => {
    app = await createServer({
      workspaceRoot: tempDir,
      logger: {
        level: 'info',
        stream: logStream
      }
    });

    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as any).port;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/runs`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    // Send protocol ping
    ws.ping();
    await new Promise((resolve) => setTimeout(resolve, 50));
    ws.close();

    const pingLogs = logLines.filter((entry) =>
      entry.url?.includes('ping') || (entry.msg && typeof entry.msg === 'string' && entry.msg.toLowerCase().includes('ping'))
    );
    expect(pingLogs).toHaveLength(0);
  });
});
