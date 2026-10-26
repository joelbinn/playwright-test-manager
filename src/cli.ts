#!/usr/bin/env node
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { createServer } from './server/app.js';

export async function runCli(argv: string[] = process.argv.slice(2)) {
  let workspaceRoot = process.cwd();
  let port = 4321;
  let host = 'localhost';
  let shouldOpen = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && i + 1 < argv.length) {
      port = parseInt(argv[++i], 10);
    } else if (arg === '--host' && i + 1 < argv.length) {
      host = argv[++i];
    } else if (arg === '--no-open') {
      shouldOpen = false;
    } else if (!arg.startsWith('-')) {
      workspaceRoot = path.resolve(arg);
    }
  }

  const app = await createServer({ workspaceRoot });

  await app.listen({ port, host });
  const serverUrl = `http://${host}:${port}`;
  console.log(`Playwright Test Manager running at ${serverUrl}`);
  console.log(`Target workspace: ${workspaceRoot}`);

  if (shouldOpen) {
    const cmd = process.platform === 'darwin' ? `open ${serverUrl}` : process.platform === 'win32' ? `start ${serverUrl}` : `xdg-open ${serverUrl}`;
    exec(cmd, () => {});
  }

  return app;
}

// If executed directly
const isDirectRun = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('cli.ts') || process.argv[1]?.endsWith('cli.js');
if (isDirectRun) {
  runCli().catch((err) => {
    console.error('Fatal CLI error:', err);
    process.exit(1);
  });
}
