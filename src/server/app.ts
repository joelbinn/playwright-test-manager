import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { scanWorkspace } from './workspace.js';

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

  app.get('/', async (req, reply) => {
    reply.type('text/html');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Playwright Test Manager</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
  <div id="root">
    <div class="flex h-screen">
      <!-- Sidebar -->
      <aside class="w-72 border-r border-slate-800 bg-slate-900/50 flex flex-col">
        <div class="p-4 border-b border-slate-800 flex items-center justify-between">
          <h1 class="font-bold text-lg text-emerald-400">Playwright Test Manager</h1>
        </div>
        <div id="workspace-summary" class="p-4 text-xs text-slate-400 border-b border-slate-800 truncate">
          ${options.workspaceRoot}
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Test Specs (.md)</h2>
            <ul id="specs-list" class="space-y-1 text-sm text-slate-300">
              <li class="text-slate-500 italic">Laddar specar...</li>
            </ul>
          </div>
          <div>
            <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Test Scripts (.spec.ts)</h2>
            <ul id="scripts-list" class="space-y-1 text-sm text-slate-300">
              <li class="text-slate-500 italic">Laddar skript...</li>
            </ul>
          </div>
        </div>
      </aside>
      <!-- Main Content -->
      <main class="flex-1 flex flex-col bg-slate-950">
        <header class="h-14 border-b border-slate-800 px-6 flex items-center justify-between">
          <div id="active-item-title" class="font-medium text-slate-200">Välj en Test Spec för att redigera eller generera kod</div>
        </header>
        <section id="content-area" class="flex-1 p-6 overflow-auto">
          <p class="text-slate-500">Välj ett testfall i sidopanelen eller klicka på "Plan New Test".</p>
        </section>
      </main>
    </div>
  </div>
  <script>
    async function loadWorkspace() {
      try {
        const res = await fetch('/api/workspace');
        const data = await res.json();
        
        const specsList = document.getElementById('specs-list');
        if (data.specs.length === 0) {
          specsList.innerHTML = '<li class="text-slate-500 italic">Inga specar funna</li>';
        } else {
          specsList.innerHTML = data.specs.map(s => \`
            <li class="p-2 rounded hover:bg-slate-800 cursor-pointer flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              \${s.name}
            </li>
          \`).join('');
        }

        const scriptsList = document.getElementById('scripts-list');
        if (data.scripts.length === 0) {
          scriptsList.innerHTML = '<li class="text-slate-500 italic">Inga skript funna</li>';
        } else {
          scriptsList.innerHTML = data.scripts.map(s => \`
            <li class="p-2 rounded hover:bg-slate-800 cursor-pointer flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-blue-500"></span>
              \${s.name}
            </li>
          \`).join('');
        }
      } catch (err) {
        console.error('Failed to load workspace:', err);
      }
    }
    loadWorkspace();
  </script>
</body>
</html>`;
  });

  return app;
}
