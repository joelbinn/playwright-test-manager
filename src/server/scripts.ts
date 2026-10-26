import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface ScriptDetails {
  slug: string;
  name: string;
  path: string;
  content: string;
}

export function resolveScriptPath(workspaceRoot: string, slug: string): string {
  const testsDir = path.resolve(workspaceRoot, 'tests');
  const safeSlug = path.basename(slug).replace(/\.spec\.(ts|js)$/, '');
  const targetPath = path.resolve(testsDir, `${safeSlug}.spec.ts`);

  if (!targetPath.startsWith(testsDir)) {
    throw new Error('Access denied: path traversal detected');
  }

  return targetPath;
}

export async function readScript(workspaceRoot: string, slug: string): Promise<ScriptDetails | null> {
  const filePath = resolveScriptPath(workspaceRoot, slug);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      slug: path.basename(filePath).replace(/\.spec\.(ts|js)$/, ''),
      name: path.basename(filePath),
      path: filePath,
      content
    };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // Also check if .spec.js exists as fallback
      const jsPath = filePath.replace(/\.spec\.ts$/, '.spec.js');
      try {
        const content = await fs.readFile(jsPath, 'utf-8');
        return {
          slug: path.basename(jsPath).replace(/\.spec\.(ts|js)$/, ''),
          name: path.basename(jsPath),
          path: jsPath,
          content
        };
      } catch (jsErr: any) {
        if (jsErr.code === 'ENOENT') return null;
        throw jsErr;
      }
    }
    throw err;
  }
}

export async function writeScript(workspaceRoot: string, slug: string, content: string): Promise<ScriptDetails> {
  const filePath = resolveScriptPath(workspaceRoot, slug);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');

  return {
    slug: path.basename(filePath).replace(/\.spec\.(ts|js)$/, ''),
    name: path.basename(filePath),
    path: filePath,
    content
  };
}
