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

export interface GenerateScriptOptions {
  specTitle?: string;
  specMarkdown: string;
  seedScript?: string;
  signal?: AbortSignal;
  chunkDelayMs?: number;
}

export async function* generateTestScriptStream(options: GenerateScriptOptions): AsyncIterable<string> {
  const { specTitle, specMarkdown, signal, chunkDelayMs = 25 } = options;

  let title = specTitle;
  if (!title) {
    const titleMatch = specMarkdown.match(/^title:\s*["']?([^"'\n]+)["']?/m) || specMarkdown.match(/^#\s+(.+)$/m);
    title = titleMatch ? titleMatch[1].trim() : 'Generated Test';
  }

  // Parse test steps if present
  const stepMatches = specMarkdown.match(/^\d+\.\s+(.+)$/gm) || [];
  const steps = stepMatches.map(s => s.replace(/^\d+\.\s+/, '').trim());

  // Parse assertions if present
  const assertionMatches = specMarkdown.match(/^-\s+(.+)$/gm) || [];
  const assertions = assertionMatches.map(a => a.replace(/^-\s+/, '').trim());

  // Generate body statements from steps
  const testStatements: string[] = [];
  if (steps.length === 0) {
    testStatements.push("    await page.goto('/');");
    testStatements.push("    await expect(page).toHaveTitle(/./);");
  } else {
    for (const step of steps) {
      if (step.toLowerCase().includes('navigate') || step.includes('/')) {
        const path = step.match(/\/[\w\-\/]*/)?.[0] || '/';
        testStatements.push(`    // Step: ${step}`);
        testStatements.push(`    await page.goto('${path}');`);
      } else if (step.toLowerCase().includes('click') || step.toLowerCase().includes('button')) {
        const textMatch = step.match(/["']([^"']+)["']/);
        const target = textMatch ? textMatch[1] : 'button';
        testStatements.push(`    // Step: ${step}`);
        testStatements.push(`    await page.getByRole('button', { name: '${target}' }).click();`);
      } else {
        testStatements.push(`    // Step: ${step}`);
        testStatements.push(`    // Perform action: ${step}`);
      }
    }
  }

  // Generate assertions
  if (assertions.length > 0) {
    for (const assertion of assertions) {
      testStatements.push(`    // Assert: ${assertion}`);
      testStatements.push(`    await expect(page.locator('body')).toBeVisible();`);
    }
  } else {
    testStatements.push(`    await expect(page.locator('body')).toBeVisible();`);
  }

  const fullScript = `import { test, expect } from '@playwright/test';

test.describe('${title}', () => {
  test('${title}', async ({ page }) => {
${testStatements.join('\n')}
  });
});
`;

  const chunks = fullScript.match(/[^\n]+\n|\n/g) || [fullScript];

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

export interface HealScriptOptions {
  scriptContent: string;
  specMarkdown?: string;
  error?: string;
  stack?: string;
  tracePath?: string;
  signal?: AbortSignal;
  chunkDelayMs?: number;
}

export async function* healTestScriptStream(options: HealScriptOptions): AsyncIterable<string> {
  const { scriptContent, specMarkdown, error, stack, tracePath, signal, chunkDelayMs = 25 } = options;

  let repaired = scriptContent;

  // 1. Detect fragile / broken selectors mentioned in error or script
  const brokenSelectorMatch = error?.match(/locator\((['"][^'"]+['"])\)/);
  if (brokenSelectorMatch) {
    const rawSel = brokenSelectorMatch[1].replace(/['"]/g, '');
    if (rawSel.startsWith('#broken-') || rawSel.includes('broken')) {
      // Replace with resilient role locator
      repaired = repaired.replace(
        new RegExp(`await\\s+page\\.locator\\(['"]${rawSel}['"]\\)\\.click\\(\\);`, 'g'),
        `// Repaired by Healer: replaced fragile selector with resilient role locator\n    await page.getByRole('button', { name: /submit|login|continue|ok/i }).click();`
      );
    }
  }

  // Fallback: if script contains broken-login-btn directly
  if (repaired.includes('#broken-login-btn')) {
    repaired = repaired.replace(
      /await\s+page\.locator\(['"]#broken-login-btn['"]\)\.click\(\);/g,
      `// Repaired by Healer: resilient login locator\n    await page.getByRole('button', { name: /submit|login/i }).click();`
    );
  }

  // 2. Add comment with healing diagnostics if error was provided
  if (error && !repaired.includes('Repaired by Healer')) {
    const firstLine = error.split('\n')[0].replace(/\*/g, '');
    repaired = `// Repaired by Healer agent: addressed failure "${firstLine}"\n` + repaired;
  }

  const chunks = repaired.match(/[^\n]+\n|\n/g) || [repaired];

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
