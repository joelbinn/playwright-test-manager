import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServer } from '../../src/server/app.js';

describe('Test Specs API (Seam: HTTP API)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ptm-specs-test-'));
    await fs.mkdir(path.join(tempDir, 'specs'), { recursive: true });

    // Seed a spec with YAML frontmatter
    const initialContent = `---
title: Checkout Flow
description: Verify cart checkout with credit card
tags:
  - checkout
  - payment
---

# Checkout Test Spec

1. Add item to cart
2. Proceed to checkout
3. Enter payment details
`;
    await fs.writeFile(path.join(tempDir, 'specs', 'checkout.md'), initialContent);

    app = await createServer({ workspaceRoot: tempDir });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('GET /api/specs/:slug reads spec content and parses frontmatter metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/specs/checkout'
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.slug).toBe('checkout');
    expect(body.name).toBe('checkout.md');
    expect(body.frontmatter.title).toBe('Checkout Flow');
    expect(body.frontmatter.tags).toEqual(['checkout', 'payment']);
    expect(body.markdown).toContain('# Checkout Test Spec');
    expect(body.content).toContain('title: Checkout Flow');
  });

  it('GET /api/specs/:slug returns 404 for non-existent spec', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/specs/non-existent'
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /api/specs creates a new Test Spec file', async () => {
    const newSpec = {
      slug: 'user-profile',
      title: 'User Profile Spec',
      markdown: '# User Profile\n\nVerify avatar upload.'
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/specs',
      payload: newSpec
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.slug).toBe('user-profile');
    expect(body.frontmatter.title).toBe('User Profile Spec');

    // Verify written to disk
    const onDisk = await fs.readFile(path.join(tempDir, 'specs', 'user-profile.md'), 'utf-8');
    expect(onDisk).toContain('User Profile Spec');
    expect(onDisk).toContain('# User Profile');
  });

  it('PUT /api/specs/:slug updates existing Test Spec on disk', async () => {
    const updatedContent = `---
title: Updated Checkout Flow
---

# Updated Steps

1. Fast checkout
`;

    const res = await app.inject({
      method: 'PUT',
      url: '/api/specs/checkout',
      payload: { content: updatedContent }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.frontmatter.title).toBe('Updated Checkout Flow');

    // Verify on disk
    const onDisk = await fs.readFile(path.join(tempDir, 'specs', 'checkout.md'), 'utf-8');
    expect(onDisk).toBe(updatedContent);
  });
});
