import { describe, it, expect } from 'vitest';
import { planTestSpecStream } from '../../src/server/mock-agent.js';

describe('Mock Agent Planner (Seam: Domain Generator)', () => {
  it('streams chunks of Markdown containing frontmatter and test scenario steps', async () => {
    const chunks: string[] = [];
    const stream = planTestSpecStream({
      prompt: 'User login with valid credentials',
      prdContext: 'Must support 2FA and remember-me checkbox',
      chunkDelayMs: 1
    });

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const fullText = chunks.join('');
    expect(chunks.length).toBeGreaterThan(1);
    expect(fullText).toContain('---');
    expect(fullText).toContain('title:');
    expect(fullText).toContain('User login with valid credentials');
    expect(fullText).toContain('2FA');
    expect(fullText).toContain('1.');
  });

  it('stops streaming when aborted via AbortSignal', async () => {
    const controller = new AbortController();
    const chunks: string[] = [];
    const stream = planTestSpecStream({
      prompt: 'Long planning task',
      signal: controller.signal,
      chunkDelayMs: 20
    });

    let count = 0;
    for await (const chunk of stream) {
      chunks.push(chunk);
      count++;
      if (count === 2) {
        controller.abort();
      }
    }

    // Should stop shortly after abort without producing the complete full stream
    expect(chunks.length).toBe(2);
  });
});
