import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import matter from 'gray-matter';

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

export async function readSpec(workspaceRoot: string, slug: string): Promise<SpecDetails | null> {
  const filePath = resolveSpecPath(workspaceRoot, slug);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(raw);
    return {
      slug: path.basename(filePath, '.md'),
      name: path.basename(filePath),
      content: raw,
      frontmatter: parsed.data,
      markdown: parsed.content
    };
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeSpec(workspaceRoot: string, slug: string, rawContent: string): Promise<SpecDetails> {
  const filePath = resolveSpecPath(workspaceRoot, slug);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, rawContent, 'utf-8');

  const parsed = matter(rawContent);
  return {
    slug: path.basename(filePath, '.md'),
    name: path.basename(filePath),
    content: rawContent,
    frontmatter: parsed.data,
    markdown: parsed.content
  };
}

export async function createSpec(
  workspaceRoot: string,
  input: { slug: string; title?: string; markdown?: string; content?: string }
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

  return await writeSpec(workspaceRoot, input.slug, fullContent);
}
