import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from '../../src/server/app.js';

describe('Planner Streaming API (Seam: HTTP Streaming API)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-planner-test-'));
    await fs.mkdir(path.join(tempDir, 'specs'), { recursive: true });
    app = await createServer({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('rejects requests with missing prompt with 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/planner/stream',
      payload: {}
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Prompt');
  });

  it('streams Markdown chunks via SSE when given a valid prompt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/planner/stream',
      payload: {
        prompt: 'User authentication with SSO',
        prdContext: 'Support Google and GitHub OAuth',
        chunkDelayMs: 1
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const lines = res.body.split('\n');
    const dataLines = lines.filter((l) => l.startsWith('data: '));
    expect(dataLines.length).toBeGreaterThan(1);

    const parsedChunks = dataLines.map((l) => JSON.parse(l.replace('data: ', '')));
    const text = parsedChunks
      .filter((p) => p.chunk)
      .map((p) => p.chunk)
      .join('');

    expect(text).toContain('---');
    expect(text).toContain('User authentication with SSO');
    expect(text).toContain('Google and GitHub OAuth');
    expect(parsedChunks.some((p) => p.done === true)).toBe(true);
  });

  it('allows accepting and persisting the generated plan as a new Test Spec file', async () => {
    // 1. Generate plan stream
    const streamRes = await app.inject({
      method: 'POST',
      url: '/api/planner/stream',
      payload: {
        prompt: 'Shopping Cart Checkout',
        prdContext: 'Must support credit card payment',
        chunkDelayMs: 0
      }
    });

    const lines = streamRes.body.split('\n');
    const dataLines = lines.filter((l) => l.startsWith('data: '));
    const parsedChunks = dataLines.map((l) => JSON.parse(l.replace('data: ', '')));
    const generatedMarkdown = parsedChunks
      .filter((p) => p.chunk)
      .map((p) => p.chunk)
      .join('');

    // 2. Accept plan: save via specs API
    const saveRes = await app.inject({
      method: 'POST',
      url: '/api/specs',
      payload: {
        slug: 'shopping-cart-checkout',
        content: generatedMarkdown
      }
    });

    expect(saveRes.statusCode).toBe(201);
    const savedSpec = JSON.parse(saveRes.body);
    expect(savedSpec.slug).toBe('shopping-cart-checkout');
    expect(savedSpec.frontmatter.title).toBe('Shopping Cart Checkout');

    // 3. Verify on disk
    const diskContent = await fs.readFile(
      path.join(tempDir, 'specs', 'shopping-cart-checkout.md'),
      'utf-8'
    );
    expect(diskContent).toBe(generatedMarkdown);
    expect(diskContent).toContain('Shopping Cart Checkout');
    expect(diskContent).toContain('Must support credit card payment');
  });

  it('serves the Planner Dialog modal and trigger button on root HTML page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/'
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('id="btn-open-planner"');
    expect(res.body).toContain('Plan New Test');
    expect(res.body).toContain('id="planner-modal"');
    expect(res.body).toContain('id="planner-prompt"');
    expect(res.body).toContain('id="planner-prd"');
    expect(res.body).toContain('id="btn-start-planning"');
    expect(res.body).toContain('id="btn-cancel-planner"');
    expect(res.body).toContain('id="btn-accept-plan"');
  });
});
