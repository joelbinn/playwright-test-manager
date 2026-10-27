import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import matter from 'gray-matter';
import { createDomainLogger } from './logger.js';

export interface SpecDetails {
  slug: string;
  name: string;
  content: string;
  frontmatter: Record<string, any>;
  markdown: string;
}

function resolveSpecPath(workspaceRoot: string, slug: string): string {
  const specsDir = path.resolve(workspaceRoot, 'specs');
  const safeSlug = path.basename(slug, '.md');
  const targetPath = path.resolve(specsDir, `${safeSlug}.md`);

  if (!targetPath.startsWith(specsDir)) {
    throw new Error('Access denied: path traversal detected');
  }

  return targetPath;
}

export async function readSpec(workspaceRoot: string, slug: string, logger?: any): Promise<SpecDetails | null> {
  const log = createDomainLogger('workspace', logger);
  const filePath = resolveSpecPath(workspaceRoot, slug);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    let frontmatter: Record<string, any> = {};
    let markdown = raw;
    try {
      const parsed = matter(raw);
      frontmatter = parsed.data;
      markdown = parsed.content;
    } catch (err: any) {
      log.warn(
        { slug, error: err.message },
        `Frontmatter parsing warning in spec "${slug}": ${err.message}`
      );
    }
    log.info({ slug, path: filePath }, `Read spec "${slug}"`);
    return {
      slug: path.basename(filePath, '.md'),
      name: path.basename(filePath),
      content: raw,
      frontmatter,
      markdown
    };
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeSpec(workspaceRoot: string, slug: string, rawContent: string, logger?: any): Promise<SpecDetails> {
  const log = createDomainLogger('workspace', logger);
  const filePath = resolveSpecPath(workspaceRoot, slug);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, rawContent, 'utf-8');

  let frontmatter: Record<string, any> = {};
  let markdown = rawContent;
  try {
    const parsed = matter(rawContent);
    frontmatter = parsed.data;
    markdown = parsed.content;
  } catch (err: any) {
    log.warn(
      { slug, error: err.message },
      `Frontmatter parsing warning when writing spec "${slug}": ${err.message}`
    );
  }

  log.info({ slug, path: filePath, bytes: rawContent.length }, `Wrote spec "${slug}"`);
  return {
    slug: path.basename(filePath, '.md'),
    name: path.basename(filePath),
    content: rawContent,
    frontmatter,
    markdown
  };
}

export async function createSpec(
  workspaceRoot: string,
  input: { slug: string; title?: string; markdown?: string; content?: string },
  logger?: any
): Promise<SpecDetails> {
  const filePath = resolveSpecPath(workspaceRoot, input.slug);

  try {
    await fs.access(filePath);
    const err: any = new Error(`Spec already exists: ${input.slug}`);
    err.code = 'EEXIST';
    throw err;
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }

  let fullContent = input.content;
  if (!fullContent) {
    const frontmatterLines = input.title ? `---\ntitle: ${input.title}\n---\n\n` : '';
    fullContent = `${frontmatterLines}${input.markdown || ''}`;
  }

  return await writeSpec(workspaceRoot, input.slug, fullContent, logger);
}
