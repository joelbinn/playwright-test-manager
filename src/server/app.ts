import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { scanWorkspace } from './workspace.js';
import { readSpec, writeSpec, createSpec } from './specs.js';

export interface ServerOptions {
  workspaceRoot: string;
}

export async function createServer(options: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false
  });

  await app.register(cors, { origin: true });

  app.get('/api/workspace', async () => {
    return await scanWorkspace(options.workspaceRoot);
  });

  app.get('/api/specs/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const spec = await readSpec(options.workspaceRoot, slug);
    if (!spec) {
      return reply.code(404).send({ error: 'Spec not found' });
    }
    return spec;
  });

  app.post('/api/specs', async (req, reply) => {
    const body = req.body as { slug: string; title?: string; markdown?: string; content?: string };
    if (!body?.slug) {
      return reply.code(400).send({ error: 'Slug is required' });
    }
    try {
      const created = await createSpec(options.workspaceRoot, body);
      return reply.code(201).send(created);
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        return reply.code(409).send({ error: err.message });
      }
      throw err;
    }
  });

  app.put('/api/specs/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = req.body as { content: string };
    if (!body?.content) {
      return reply.code(400).send({ error: 'Content is required' });
    }
    const updated = await writeSpec(options.workspaceRoot, slug, body.content);
    return updated;
  });

  app.get('/', async (req, reply) => {
    reply.type('text/html');
    return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Playwright Test Manager</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.0/min/vs/loader.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    .prose h1 { font-size: 1.5rem; font-weight: bold; margin-bottom: 0.75rem; color: #f8fafc; }
    .prose h2 { font-size: 1.25rem; font-weight: 600; margin-top: 1rem; margin-bottom: 0.5rem; color: #f1f5f9; }
    .prose p { margin-bottom: 0.75rem; line-height: 1.6; color: #cbd5e1; }
    .prose ul, .prose ol { margin-left: 1.5rem; margin-bottom: 0.75rem; color: #cbd5e1; list-style-type: decimal; }
    .prose code { background: #1e293b; padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.875rem; color: #38bdf8; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 h-full flex flex-col font-sans">
  <div class="flex flex-1 overflow-hidden">
    <!-- Sidebar -->
    <aside class="w-72 border-r border-slate-800 bg-slate-900/60 flex flex-col">
      <div class="p-4 border-b border-slate-800 flex items-center justify-between">
        <h1 class="font-bold text-base text-emerald-400 flex items-center gap-2">
          <span>🎭</span> Playwright Test Manager
        </h1>
      </div>
      <div class="p-3 text-xs text-slate-400 border-b border-slate-800 flex items-center justify-between">
        <span class="truncate" title="${options.workspaceRoot}">📁 ${options.workspaceRoot}</span>
        <button id="btn-refresh" class="text-slate-400 hover:text-slate-200">🔄</button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Test Specs</h2>
            <button id="btn-new-spec" class="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 rounded font-medium flex items-center gap-1">
              + Ny Spec
            </button>
          </div>
          <ul id="specs-list" class="space-y-1 text-sm text-slate-300">
            <li class="text-slate-500 italic p-2">Laddar specar...</li>
          </ul>
        </div>

        <div>
          <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Test Scripts (.spec.ts)</h2>
          <ul id="scripts-list" class="space-y-1 text-sm text-slate-300">
            <li class="text-slate-500 italic p-2">Laddar skript...</li>
          </ul>
        </div>
      </div>
    </aside>

    <!-- Main Workspace -->
    <main class="flex-1 flex flex-col bg-slate-950 overflow-hidden">
      <!-- Toolbar -->
      <header class="h-14 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/30">
        <div class="flex items-center gap-3">
          <span id="active-badge" class="px-2 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded hidden">Spec</span>
          <h2 id="active-title" class="font-medium text-slate-200">Välj en Test Spec för att redigera eller generera kod</h2>
          <span id="save-status" class="text-xs text-slate-400 ml-2"></span>
        </div>
        <div id="actions-bar" class="flex items-center gap-2 hidden">
          <button id="btn-save" class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-1.5 rounded border border-slate-700 flex items-center gap-1.5 transition">
            💾 Spara (Cmd+S)
          </button>
          <button id="btn-generate" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-1.5 rounded flex items-center gap-1.5 shadow transition">
            ⚡ Generate Script
          </button>
        </div>
      </header>

      <!-- Frontmatter meta bar -->
      <div id="meta-bar" class="px-6 py-2 bg-slate-900/40 border-b border-slate-800 text-xs text-slate-300 flex items-center gap-4 hidden">
        <div id="meta-title" class="font-semibold text-slate-100"></div>
        <div id="meta-tags" class="flex items-center gap-1.5"></div>
      </div>

      <!-- Editor / Content View -->
      <div id="content-container" class="flex-1 flex overflow-hidden">
        <div id="empty-state" class="flex-1 flex items-center justify-center text-slate-500 p-8 text-center">
          <div>
            <div class="text-4xl mb-3">📝</div>
            <p class="text-base font-medium text-slate-400">Ingen Test Spec vald</p>
            <p class="text-sm mt-1">Välj en spec i sidopanelen eller klicka på "+ Ny Spec" för att börja.</p>
          </div>
        </div>

        <div id="split-view" class="flex-1 flex w-full h-full hidden">
          <!-- Monaco Editor Container -->
          <div class="flex-1 flex flex-col border-r border-slate-800 h-full">
            <div class="bg-slate-900/80 px-4 py-1.5 text-xs text-slate-400 border-b border-slate-800 font-mono">
              Markdown Editor
            </div>
            <div id="monaco-editor" class="flex-1 w-full h-full"></div>
          </div>
          <!-- Live Markdown Preview -->
          <div class="flex-1 flex flex-col h-full bg-slate-900/20">
            <div class="bg-slate-900/80 px-4 py-1.5 text-xs text-slate-400 border-b border-slate-800 font-mono">
              Live Preview
            </div>
            <div id="markdown-preview" class="flex-1 p-6 overflow-y-auto prose max-w-none text-slate-200"></div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <script>
    let activeSpec = null;
    let editorInstance = null;
    let monacoLoaded = false;

    // Configure Monaco
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
      monacoLoaded = true;
      initEditor();
    });

    function initEditor() {
      const container = document.getElementById('monaco-editor');
      if (!container || editorInstance) return;

      editorInstance = monaco.editor.create(container, {
        value: '',
        language: 'markdown',
        theme: 'vs-dark',
        automaticLayout: true,
        wordWrap: 'on',
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false
      });

      editorInstance.onDidChangeModelContent(() => {
        updatePreview();
        document.getElementById('save-status').textContent = '• Ej sparad';
      });

      // Shortcut: Cmd+S / Ctrl+S to save
      editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveActiveSpec();
      });
    }

    function updatePreview() {
      if (!editorInstance) return;
      const content = editorInstance.getValue();
      // Remove frontmatter before parsing markdown preview
      const markdownOnly = content.replace(/^---[\\s\\S]*?---\\n*/, '');
      const previewEl = document.getElementById('markdown-preview');
      previewEl.innerHTML = marked.parse(markdownOnly);
    }

    async function loadWorkspace() {
      try {
        const res = await fetch('/api/workspace');
        const data = await res.json();
        
        const specsList = document.getElementById('specs-list');
        if (data.specs.length === 0) {
          specsList.innerHTML = '<li class="text-slate-500 italic p-2">Inga specar funna</li>';
        } else {
          specsList.innerHTML = data.specs.map(s => \`
            <li onclick="selectSpec('\${s.slug}')" class="p-2 rounded hover:bg-slate-800/80 cursor-pointer flex items-center justify-between group transition \${activeSpec?.slug === s.slug ? 'bg-slate-800 text-white font-medium' : ''}">
              <div class="flex items-center gap-2 truncate">
                <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                <span class="truncate">\${s.name}</span>
              </div>
            </li>
          \`).join('');
        }

        const scriptsList = document.getElementById('scripts-list');
        if (data.scripts.length === 0) {
          scriptsList.innerHTML = '<li class="text-slate-500 italic p-2">Inga skript funna</li>';
        } else {
          scriptsList.innerHTML = data.scripts.map(s => \`
            <li class="p-2 rounded hover:bg-slate-800/80 cursor-pointer flex items-center gap-2 text-slate-400">
              <span class="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
              <span class="truncate">\${s.name}</span>
            </li>
          \`).join('');
        }
      } catch (err) {
        console.error('Failed to load workspace:', err);
      }
    }

    async function selectSpec(slug) {
      try {
        const res = await fetch('/api/specs/' + slug);
        if (!res.ok) throw new Error('Could not load spec');
        activeSpec = await res.json();

        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('split-view').classList.remove('hidden');
        document.getElementById('actions-bar').classList.remove('hidden');
        document.getElementById('active-badge').classList.remove('hidden');
        document.getElementById('active-title').textContent = activeSpec.name;
        document.getElementById('save-status').textContent = '';

        // Update metadata bar
        const metaBar = document.getElementById('meta-bar');
        const metaTitle = document.getElementById('meta-title');
        const metaTags = document.getElementById('meta-tags');
        if (activeSpec.frontmatter && (activeSpec.frontmatter.title || activeSpec.frontmatter.tags)) {
          metaBar.classList.remove('hidden');
          metaTitle.textContent = activeSpec.frontmatter.title || activeSpec.slug;
          metaTags.innerHTML = (activeSpec.frontmatter.tags || []).map(t => \`
            <span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-xs border border-slate-700">#\${t}</span>
          \`).join('');
        } else {
          metaBar.classList.add('hidden');
        }

        if (editorInstance) {
          editorInstance.setValue(activeSpec.content);
          updatePreview();
        }

        loadWorkspace();
      } catch (err) {
        alert('Kunde inte läsa spec: ' + err.message);
      }
    }

    async function saveActiveSpec() {
      if (!activeSpec || !editorInstance) return;
      const saveStatus = document.getElementById('save-status');
      saveStatus.textContent = 'Sparar...';
      try {
        const res = await fetch('/api/specs/' + activeSpec.slug, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editorInstance.getValue() })
        });
        if (!res.ok) throw new Error('Save failed');
        activeSpec = await res.json();
        saveStatus.textContent = '✓ Sparad';
        setTimeout(() => { if (saveStatus.textContent === '✓ Sparad') saveStatus.textContent = ''; }, 2000);
      } catch (err) {
        saveStatus.textContent = '❌ Fel vid sparning';
        alert('Kunde inte spara: ' + err.message);
      }
    }

    document.getElementById('btn-save').addEventListener('click', saveActiveSpec);
    document.getElementById('btn-refresh').addEventListener('click', loadWorkspace);

    document.getElementById('btn-new-spec').addEventListener('click', async () => {
      const title = prompt('Ange titel på det nya testfallet:');
      if (!title) return;
      const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!slug) return;

      try {
        const res = await fetch('/api/specs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            title,
            markdown: '# ' + title + '\\n\\n1. Beskriv första steget här.\\n'
          })
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create spec');
        }
        await loadWorkspace();
        selectSpec(slug);
      } catch (err) {
        alert('Kunde inte skapa spec: ' + err.message);
      }
    });

    window.selectSpec = selectSpec;
    loadWorkspace();
  </script>
</body>
</html>`;
  });

  return app;
}
