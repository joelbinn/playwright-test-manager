import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createDomainLogger } from './logger.js';

export interface WorkspaceFile {
  name: string;
  slug: string;
  path: string;
  relativePath: string;
}

export interface WorkspaceSnapshot {
  rootPath: string;
  specs: WorkspaceFile[];
  scripts: WorkspaceFile[];
}

export async function scanWorkspace(workspaceRoot: string, logger?: any): Promise<WorkspaceSnapshot> {
  const log = createDomainLogger('workspace', logger);
  const specsDir = path.join(workspaceRoot, 'specs');
  const testsDir = path.join(workspaceRoot, 'tests');

  const specs: WorkspaceFile[] = [];
  const scripts: WorkspaceFile[] = [];

  try {
    const specEntries = await fs.readdir(specsDir, { withFileTypes: true });
    for (const entry of specEntries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const slug = path.basename(entry.name, '.md');
        const absPath = path.join(specsDir, entry.name);
        const relPath = path.relative(workspaceRoot, absPath);
        specs.push({
          name: entry.name,
          slug,
          path: absPath,
          relativePath: relPath
        });
      }
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }

  try {
    const testEntries = await fs.readdir(testsDir, { withFileTypes: true });
    for (const entry of testEntries) {
      if (entry.isFile() && (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.spec.js'))) {
        const slug = entry.name.replace(/\.spec\.(ts|js)$/, '');
        const absPath = path.join(testsDir, entry.name);
        const relPath = path.relative(workspaceRoot, absPath);
        scripts.push({
          name: entry.name,
          slug,
          path: absPath,
          relativePath: relPath
        });
      }
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }

  log.info(
    { rootPath: workspaceRoot, specCount: specs.length, scriptCount: scripts.length },
    `Scanned workspace: found ${specs.length} specs and ${scripts.length} scripts`
  );

  return {
    rootPath: workspaceRoot,
    specs,
    scripts
  };
}
