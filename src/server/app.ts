import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { Readable } from 'node:stream';
import { scanWorkspace } from './workspace.js';
import { readSpec, writeSpec, createSpec } from './specs.js';
import { readScript, writeScript } from './scripts.js';
import { planTestSpecStream, generateTestScriptStream } from './mock-agent.js';
import { runPlaywright } from './runner.js';

export interface ServerOptions {
  workspaceRoot: string;
}

export async function createServer(options: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false
  });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  const scriptStatuses: Record<string, 'passed' | 'failed' | 'running'> = {};
  const activeSockets = new Set<any>();

  function broadcast(message: any) {
    const data = JSON.stringify(message);
    for (const socket of activeSockets) {
      if (socket.readyState === 1 /* WebSocket.OPEN */) {
        try {
          socket.send(data);
        } catch (e) {}
      }
    }
  }

  app.get('/ws/runs', { websocket: true }, (socket) => {
    activeSockets.add(socket);
    socket.on('close', () => {
      activeSockets.delete(socket);
    });
  });

  app.get('/api/runs/status', async () => {
    return scriptStatuses;
  });

  app.post('/api/runs', async (req, reply) => {
    const body = (req.body || {}) as { slug?: string; headed?: boolean; command?: string };
    const targetSlug = body.slug || 'all';

    scriptStatuses[targetSlug] = 'running';
    broadcast({
      type: 'status',
      slug: targetSlug,
      status: 'running'
    });

    const runPromise = runPlaywright({
      workspaceRoot: options.workspaceRoot,
      scriptSlug: body.slug,
      headed: body.headed,
      command: body.command,
      onLog: (chunk, stream) => {
        broadcast({
          type: 'log',
          slug: targetSlug,
          chunk,
          stream
        });
      },
      onStatus: (status) => {
        scriptStatuses[targetSlug] = status;
        broadcast({
          type: 'status',
          slug: targetSlug,
          status
        });
      }
    });

    runPromise.catch((err) => {
      scriptStatuses[targetSlug] = 'failed';
      broadcast({
        type: 'status',
        slug: targetSlug,
        status: 'failed',
        error: err.message
      });
    });

    return {
      runId: 'run-' + Date.now(),
      slug: targetSlug,
      status: 'running'
    };
  });

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

  app.get('/api/scripts/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const script = await readScript(options.workspaceRoot, slug);
    if (!script) {
      return reply.code(404).send({ error: 'Script not found' });
    }
    return script;
  });

  app.post('/api/scripts/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = (req.body || {}) as { content?: string };
    if (typeof body.content !== 'string') {
      return reply.code(400).send({ error: 'Content is required' });
    }
    const saved = await writeScript(options.workspaceRoot, slug, body.content);
    return saved;
  });

  app.post('/api/planner/stream', async (req, reply) => {
    const body = (req.body || {}) as { prompt?: string; prdContext?: string; chunkDelayMs?: number };
    if (!body.prompt || !body.prompt.trim()) {
      return reply.code(400).send({ error: 'Prompt is required' });
    }

    const abortController = new AbortController();
    req.raw.on('close', () => {
      abortController.abort();
    });

    const readable = Readable.from((async function* () {
      try {
        for await (const chunk of planTestSpecStream({
          prompt: body.prompt!.trim(),
          prdContext: body.prdContext?.trim(),
          signal: abortController.signal,
          chunkDelayMs: body.chunkDelayMs ?? 15
        })) {
          yield `data: ${JSON.stringify({ chunk })}\n\n`;
        }
        yield `data: ${JSON.stringify({ done: true })}\n\n`;
      } catch (err: any) {
        yield `data: ${JSON.stringify({ error: err.message })}\n\n`;
      }
    })());

    reply.type('text/event-stream; charset=utf-8');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    return reply.send(readable);
  });

  app.post('/api/generator/stream', async (req, reply) => {
    const body = (req.body || {}) as { specSlug?: string; markdown?: string; chunkDelayMs?: number };
    let markdown = body.markdown;
    let title: string | undefined;

    if (!markdown && body.specSlug) {
      const spec = await readSpec(options.workspaceRoot, body.specSlug);
      if (!spec) {
        return reply.code(404).send({ error: 'Spec not found' });
      }
      markdown = spec.content;
      title = spec.frontmatter.title || spec.name;
    }

    if (!markdown || !markdown.trim()) {
      return reply.code(400).send({ error: 'specSlug or markdown is required' });
    }

    const abortController = new AbortController();
    req.raw.on('close', () => {
      abortController.abort();
    });

    const readable = Readable.from((async function* () {
      try {
        for await (const chunk of generateTestScriptStream({
          specTitle: title,
          specMarkdown: markdown!.trim(),
          signal: abortController.signal,
          chunkDelayMs: body.chunkDelayMs ?? 15
        })) {
          yield `data: ${JSON.stringify({ chunk })}\n\n`;
        }
        yield `data: ${JSON.stringify({ done: true })}\n\n`;
      } catch (err: any) {
        yield `data: ${JSON.stringify({ error: err.message })}\n\n`;
      }
    })());

    reply.type('text/event-stream; charset=utf-8');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    return reply.send(readable);
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
          <button id="btn-open-planner" class="w-full mb-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-3 rounded flex items-center justify-center gap-1.5 shadow transition">
            <span>✨ Plan New Test</span>
          </button>
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Test Specs</h2>
            <button id="btn-new-spec" class="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-2 py-0.5 rounded font-medium flex items-center gap-1">
              + Ny
            </button>
          </div>
          <ul id="specs-list" class="space-y-1 text-sm text-slate-300">
            <li class="text-slate-500 italic p-2">Laddar specar...</li>
          </ul>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Test Scripts (.spec.ts)</h2>
            <button id="btn-run-all" class="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-medium flex items-center gap-1 transition">
              ▶ Run All
            </button>
          </div>
          <div class="mb-2">
            <label class="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
              <input type="checkbox" id="toggle-headed" class="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0">
              <span>Headed Mode</span>
            </label>
          </div>
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
          <button id="btn-run-test" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded flex items-center gap-1.5 shadow transition">
            ▶ Run Test
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

        <!-- Monaco Staged Diff View -->
        <div id="diff-view" class="flex-1 flex flex-col w-full h-full hidden">
          <!-- Diff Toolbar Banner -->
          <div class="h-10 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-3 text-xs">
              <span class="font-semibold text-emerald-400 flex items-center gap-1.5">
                <span>⚡</span> Staged Diff Preview
              </span>
              <span class="text-slate-400">|</span>
              <span class="text-slate-400 font-mono" id="diff-filenames">Original (Disk) &harr; Proposed (In-Memory Staged)</span>
              <span id="diff-stream-status" class="text-emerald-400 flex items-center gap-1.5 hidden">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Generating code...</span>
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-reject-diff" class="bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 text-xs font-medium px-3 py-1 rounded transition flex items-center gap-1">
                ✕ Reject
              </button>
              <button id="btn-apply-diff" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-1 rounded shadow transition flex items-center gap-1">
                ✓ Apply (Commit to Disk)
              </button>
            </div>
          </div>
          <!-- Monaco Diff Editor target -->
          <div id="monaco-diff-editor" class="flex-1 w-full h-full"></div>
        </div>
      </div>

      <!-- Live Console Streaming Pane -->
      <div id="console-pane" class="h-48 border-t border-slate-800 bg-slate-950 flex flex-col">
        <div class="h-8 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
          <div class="flex items-center gap-2">
            <span class="text-slate-400 font-mono">📟 Console Stream</span>
            <span id="console-run-status" class="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-800 text-slate-400 hidden status-badge">Idle</span>
          </div>
          <button id="btn-clear-console" class="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5 rounded hover:bg-slate-800">
            Clear
          </button>
        </div>
        <pre id="console-output" class="flex-1 p-3 font-mono text-xs text-slate-300 overflow-y-auto whitespace-pre-wrap select-text bg-black/40"></pre>
      </div>
    </main>
  </div>

  <!-- Planner Modal -->
  <div id="planner-modal" class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
    <div class="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
      <!-- Modal Header -->
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
        <div class="flex items-center gap-2">
          <span class="text-lg">✨</span>
          <h3 class="font-semibold text-slate-100 text-base">Plan New Test</h3>
          <span class="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">Mock Agent</span>
        </div>
        <button id="btn-close-planner" class="text-slate-400 hover:text-slate-200 text-xl leading-none p-1">&times;</button>
      </div>

      <!-- Modal Body -->
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Prompt / Vad vill du testa? <span class="text-emerald-400">*</span>
          </label>
          <textarea id="planner-prompt" rows="3" placeholder="T.ex: Användaren loggar in med giltiga kontouppgifter och navigerar till instrumentpanelen..." class="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"></textarea>
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              PRD / Kravspecifikation (valfritt)
            </label>
            <span class="text-xs text-slate-500">Klistra in eller bifoga kontext</span>
          </div>
          <textarea id="planner-prd" rows="3" placeholder="Klistra in relevanta delar av din PRD, acceptanskriterier eller användarberättelse här..." class="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"></textarea>
        </div>

        <!-- Live Streaming Preview Area -->
        <div id="planner-output-container" class="border border-slate-800 rounded-lg bg-slate-950 overflow-hidden hidden flex flex-col">
          <div class="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
            <span id="planner-status" class="text-slate-300 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Planner genererar testspecifikation...</span>
            </span>
            <button id="btn-cancel-planner" class="text-rose-400 hover:text-rose-300 font-medium">
              Avbryt generering
            </button>
          </div>
          <div id="planner-preview" class="p-4 max-h-72 overflow-y-auto prose max-w-none text-slate-200 text-sm"></div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-end gap-2">
        <button id="btn-start-planning" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded shadow transition">
          Generera Test Spec
        </button>
        <button id="btn-accept-plan" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded shadow transition hidden">
          ✓ Acceptera & Spara som Test Spec
        </button>
      </div>
    </div>
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
          scriptsList.innerHTML = data.scripts.map(s => {
            const st = runStatuses[s.slug];
            const badgeClass = st === 'passed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                               st === 'failed' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                               st === 'running' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse' :
                               'hidden';
            return \`
            <li class="p-2 rounded hover:bg-slate-800/80 cursor-pointer flex items-center justify-between text-slate-300 group transition">
              <div class="flex items-center gap-2 truncate">
                <span class="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                <span class="truncate">\${s.name}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span id="status-badge-\${s.slug}" class="status-badge text-[10px] px-1.5 py-0.5 rounded font-semibold \${badgeClass}">
                  \${(st || '').toUpperCase()}
                </span>
                <button onclick="event.stopPropagation(); triggerRun('\${s.slug}')" class="opacity-0 group-hover:opacity-100 text-[10px] bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">
                  ▶
                </button>
              </div>
            </li>
          \`;
          }).join('');
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
        document.getElementById('diff-view').classList.add('hidden');
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

    // Planner Dialog handling
    let plannerAbortController = null;
    let currentPlannedMarkdown = '';

    function openPlannerModal() {
      document.getElementById('planner-modal').classList.remove('hidden');
      document.getElementById('planner-prompt').focus();
    }

    function closePlannerModal() {
      if (plannerAbortController) {
        plannerAbortController.abort();
        plannerAbortController = null;
      }
      document.getElementById('planner-modal').classList.add('hidden');
    }

    async function startPlanning() {
      const promptEl = document.getElementById('planner-prompt');
      const prdEl = document.getElementById('planner-prd');
      const prompt = promptEl.value.trim();
      const prd = prdEl.value.trim();
      if (!prompt) {
        alert('Vänligen ange en prompt.');
        return;
      }

      const outputContainer = document.getElementById('planner-output-container');
      const preview = document.getElementById('planner-preview');
      const status = document.getElementById('planner-status');
      const cancelBtn = document.getElementById('btn-cancel-planner');
      const startBtn = document.getElementById('btn-start-planning');
      const acceptBtn = document.getElementById('btn-accept-plan');

      outputContainer.classList.remove('hidden');
      cancelBtn.classList.remove('hidden');
      startBtn.classList.add('hidden');
      acceptBtn.classList.add('hidden');
      status.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span>Planner genererar testspecifikation...</span>';
      preview.innerHTML = '';
      currentPlannedMarkdown = '';

      plannerAbortController = new AbortController();

      try {
        const res = await fetch('/api/planner/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, prdContext: prd }),
          signal: plannerAbortController.signal
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Generering misslyckades');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const payload = JSON.parse(line.slice(6));
              if (payload.chunk) {
                currentPlannedMarkdown += payload.chunk;
                const stripped = currentPlannedMarkdown.replace(/^---[\\s\\S]*?---\\n*/, '');
                preview.innerHTML = marked.parse(stripped || currentPlannedMarkdown);
                preview.scrollTop = preview.scrollHeight;
              }
              if (payload.done) {
                status.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-emerald-400 font-medium">Planering klar!</span>';
                cancelBtn.classList.add('hidden');
                acceptBtn.classList.remove('hidden');
                startBtn.classList.remove('hidden');
                startBtn.textContent = '🔄 Generera om';
              }
              if (payload.error) {
                status.innerHTML = '<span class="text-rose-400">Fel: ' + payload.error + '</span>';
                cancelBtn.classList.add('hidden');
                startBtn.classList.remove('hidden');
              }
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          status.innerHTML = '<span class="text-amber-400">Generering avbruten</span>';
        } else {
          status.innerHTML = '<span class="text-rose-400">Fel: ' + err.message + '</span>';
        }
        cancelBtn.classList.add('hidden');
        startBtn.classList.remove('hidden');
      } finally {
        plannerAbortController = null;
      }
    }

    async function acceptPlan() {
      if (!currentPlannedMarkdown) return;
      const prompt = document.getElementById('planner-prompt').value.trim();
      const slug = prompt
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || 'new-spec';

      try {
        const res = await fetch('/api/specs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            content: currentPlannedMarkdown
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Kunde inte spara spec');
        }
        closePlannerModal();
        await loadWorkspace();
        selectSpec(slug);
      } catch (err) {
        alert('Kunde inte spara Test Spec: ' + err.message);
      }
    }

    document.getElementById('btn-open-planner').addEventListener('click', openPlannerModal);
    document.getElementById('btn-close-planner').addEventListener('click', closePlannerModal);
    document.getElementById('btn-start-planning').addEventListener('click', startPlanning);
    document.getElementById('btn-cancel-planner').addEventListener('click', () => {
      if (plannerAbortController) plannerAbortController.abort();
    });
    document.getElementById('btn-accept-plan').addEventListener('click', acceptPlan);

    // Generator & Monaco Staged Diff Viewer
    let diffEditorInstance = null;
    let stagedScriptCode = '';
    let originalScriptCode = '';
    let generatorAbortController = null;

    function initDiffEditor() {
      const container = document.getElementById('monaco-diff-editor');
      if (!container || diffEditorInstance) return;

      diffEditorInstance = monaco.editor.createDiffEditor(container, {
        originalEditable: false,
        readOnly: true,
        theme: 'vs-dark',
        automaticLayout: true,
        renderSideBySide: true,
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false
      });
    }

    async function generateScript() {
      if (!activeSpec) return;
      initDiffEditor();

      let existingContent = '// No existing test script on disk for: ' + activeSpec.slug + '\n';
      try {
        const res = await fetch('/api/scripts/' + activeSpec.slug);
        if (res.ok) {
          const data = await res.json();
          existingContent = data.content || '';
        }
      } catch (e) {}

      originalScriptCode = existingContent;
      stagedScriptCode = '';

      document.getElementById('split-view').classList.add('hidden');
      document.getElementById('empty-state').classList.add('hidden');
      document.getElementById('diff-view').classList.remove('hidden');

      const statusEl = document.getElementById('diff-stream-status');
      statusEl.classList.remove('hidden');

      const origModel = monaco.editor.createModel(originalScriptCode, 'typescript');
      const modModel = monaco.editor.createModel('// Generator agent assembling Playwright test script...\n', 'typescript');
      diffEditorInstance.setModel({
        original: origModel,
        modified: modModel
      });

      generatorAbortController = new AbortController();

      try {
        const res = await fetch('/api/generator/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specSlug: activeSpec.slug }),
          signal: generatorAbortController.signal
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to generate script');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const payload = JSON.parse(line.slice(6));
              if (payload.chunk) {
                stagedScriptCode += payload.chunk;
                diffEditorInstance.getModel().modified.setValue(stagedScriptCode);
              }
              if (payload.done) {
                statusEl.classList.add('hidden');
              }
              if (payload.error) {
                alert('Generator error: ' + payload.error);
                statusEl.classList.add('hidden');
              }
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          alert('Generator error: ' + err.message);
        }
        statusEl.classList.add('hidden');
      } finally {
        generatorAbortController = null;
      }
    }

    async function applyStagedDiff() {
      if (!activeSpec || !stagedScriptCode) return;
      try {
        const res = await fetch('/api/scripts/' + activeSpec.slug, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: stagedScriptCode })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to apply test script');
        }
        document.getElementById('diff-view').classList.add('hidden');
        document.getElementById('split-view').classList.remove('hidden');
        stagedScriptCode = '';
        await loadWorkspace();
      } catch (err) {
        alert('Failed to apply script: ' + err.message);
      }
    }

    function rejectStagedDiff() {
      if (generatorAbortController) {
        generatorAbortController.abort();
        generatorAbortController = null;
      }
      stagedScriptCode = '';
      document.getElementById('diff-view').classList.add('hidden');
      document.getElementById('split-view').classList.remove('hidden');
    }

    document.getElementById('btn-generate').addEventListener('click', generateScript);
    document.getElementById('btn-apply-diff').addEventListener('click', applyStagedDiff);
    document.getElementById('btn-reject-diff').addEventListener('click', rejectStagedDiff);

    // Test Runner & WebSocket Streaming
    let runStatuses = {};

    async function loadRunStatuses() {
      try {
        const res = await fetch('/api/runs/status');
        if (res.ok) {
          runStatuses = await res.json();
          renderScriptStatuses();
        }
      } catch (e) {}
    }

    function renderScriptStatuses() {
      for (const [slug, status] of Object.entries(runStatuses)) {
        const badge = document.getElementById('status-badge-' + slug);
        if (badge) {
          badge.className = 'status-badge text-[10px] px-1.5 py-0.5 rounded font-semibold ' +
            (status === 'passed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
             status === 'failed' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
             status === 'running' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse' :
             'hidden');
          badge.textContent = status.toUpperCase();
        }
      }
    }

    function appendConsoleLog(chunk, stream) {
      const consoleEl = document.getElementById('console-output');
      if (!consoleEl) return;
      const span = document.createElement('span');
      if (stream === 'stderr') {
        span.className = 'text-rose-400';
      }
      span.textContent = chunk;
      consoleEl.appendChild(span);
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    function initRunWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = \`\${protocol}//\${window.location.host}/ws/runs\`;
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'log') {
            appendConsoleLog(msg.chunk, msg.stream);
          } else if (msg.type === 'status') {
            runStatuses[msg.slug] = msg.status;
            renderScriptStatuses();
            const consoleStatus = document.getElementById('console-run-status');
            if (consoleStatus) {
              consoleStatus.classList.remove('hidden');
              consoleStatus.textContent = \`\${msg.slug}: \${msg.status.toUpperCase()}\`;
              consoleStatus.className = 'status-badge px-2 py-0.5 text-[10px] font-semibold rounded ' +
                (msg.status === 'passed' ? 'bg-emerald-500/20 text-emerald-300' :
                 msg.status === 'failed' ? 'bg-rose-500/20 text-rose-300' :
                 'bg-amber-500/20 text-amber-300 animate-pulse');
            }
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        setTimeout(initRunWebSocket, 3000);
      };
    }

    async function triggerRun(slug) {
      const headed = document.getElementById('toggle-headed')?.checked || false;
      const consoleEl = document.getElementById('console-output');
      if (consoleEl) {
        appendConsoleLog(\`\\n[PTM] Starting test run (\${slug || 'all'}, headed: \${headed})...\\n\`, 'stdout');
      }
      try {
        await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, headed })
        });
      } catch (err) {
        appendConsoleLog(\`[PTM Error] Failed to trigger run: \${err.message}\\n\`, 'stderr');
      }
    }

    window.triggerRun = triggerRun;
    document.getElementById('btn-run-all')?.addEventListener('click', () => triggerRun());
    document.getElementById('btn-run-test')?.addEventListener('click', () => {
      if (activeSpec) triggerRun(activeSpec.slug);
    });
    document.getElementById('btn-clear-console')?.addEventListener('click', () => {
      const consoleEl = document.getElementById('console-output');
      if (consoleEl) consoleEl.textContent = '';
    });

    initRunWebSocket();
    loadRunStatuses();
  </script>
</body>
</html>`;
  });

  return app;
}
