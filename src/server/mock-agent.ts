export interface PlanSpecOptions {
  prompt: string;
  prdContext?: string;
  signal?: AbortSignal;
  chunkDelayMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function* planTestSpecStream(options: PlanSpecOptions): AsyncIterable<string> {
  const { prompt, prdContext, signal, chunkDelayMs = 25 } = options;

  const title = prompt.length > 50 ? prompt.slice(0, 47) + '...' : prompt;
  const slug = prompt
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'planned-test';

  const prdSection = prdContext
    ? `\n## Context from PRD\n\n> ${prdContext.replace(/\n/g, '\n> ')}\n`
    : '';

  const fullMarkdown = `---
title: ${JSON.stringify(title)}
description: ${JSON.stringify(`Automated test scenario planned by Mock Agent for: ${prompt}`)}
tags:
  - ${slug}
  - planned
---

# ${title}

## Objective
Verify functionality: ${prompt}.
${prdSection}
## Test Steps
1. Navigate to target application entrypoint.
2. Verify initial UI state and elements are visible.
3. Perform user interaction corresponding to: "${prompt}".
4. Observe application responses, state mutations, and network requests.
5. Assert expected outcome meets requirements.

## Assertions
- No unhandled console errors or network failures occurred.
- Required UI confirmations and state changes are visible.
`;

  // Split into realistic token-sized chunks (e.g. lines and word groups)
  const chunks = fullMarkdown.match(/[^\n]+\n|\n/g) || [fullMarkdown];

  for (const chunk of chunks) {
    if (signal?.aborted) {
      return;
    }
    if (chunkDelayMs > 0) {
      await delay(chunkDelayMs);
    }
    if (signal?.aborted) {
      return;
    }
    yield chunk;
  }
}
