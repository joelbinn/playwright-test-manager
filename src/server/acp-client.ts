import { spawn, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as readline from 'node:readline';

export function isPathWithinWorkspace(workspaceRoot: string, targetPath: string): boolean {
  if (!targetPath) return false;
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const resolvedTarget = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(workspaceRoot, targetPath);

  // Must equal or start with workspace path + separator
  if (resolvedTarget === resolvedWorkspace) return true;
  return resolvedTarget.startsWith(resolvedWorkspace + path.sep);
}

export interface AcpClientOptions {
  command: string;
  args?: string[];
  workspaceRoot: string;
}

export interface StreamTaskParams {
  role: 'planner' | 'generator' | 'healer';
  prompt: string;
  context?: Record<string, any>;
  signal?: AbortSignal;
}

function extractChunkText(params: any): string | undefined {
  if (!params) return undefined;
  if (typeof params.chunk === 'string') return params.chunk;
  if (typeof params.text === 'string') return params.text;
  if (params.update) {
    if (typeof params.update.text === 'string') return params.update.text;
    if (typeof params.update.delta === 'string') return params.update.delta;
    if (typeof params.update.chunk === 'string') return params.update.chunk;
    if (params.update.type === 'agent_message_chunk' && typeof params.update.text === 'string') {
      return params.update.text;
    }
    if (params.update.content) {
      if (typeof params.update.content.text === 'string') return params.update.content.text;
      if (typeof params.update.content === 'string') return params.update.content;
      if (Array.isArray(params.update.content)) {
        return params.update.content.map((c: any) => c.text || '').join('');
      }
    }
  }
  return undefined;
}

export class AcpClient {
  private command: string;
  private args: string[];
  private workspaceRoot: string;
  private process: ChildProcess | null = null;
  private nextRequestId = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

  constructor(options: AcpClientOptions) {
    this.command = options.command;
    this.args = options.args || [];
    this.workspaceRoot = options.workspaceRoot;
  }

  public isAlive(): boolean {
    return this.process !== null && !this.process.killed && this.process.exitCode === null;
  }

  private send(message: Record<string, any>) {
    if (!this.process || !this.process.stdin || this.process.stdin.destroyed) {
      throw new Error('ACP agent process stdin is not writable');
    }
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  private request(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      try {
        this.send({
          jsonrpc: '2.0',
          id,
          method,
          params
        });
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  private notify(method: string, params: Record<string, any> = {}) {
    this.send({
      jsonrpc: '2.0',
      method,
      params
    });
  }

  private closeProcess() {
    if (this.process) {
      try {
        if (!this.process.killed && this.process.exitCode === null) {
          this.process.kill('SIGTERM');
        }
      } catch {}
      this.process = null;
    }
    for (const [, req] of this.pendingRequests) {
      req.reject(new Error('ACP client process closed'));
    }
    this.pendingRequests.clear();
  }

  public async *streamTask(params: StreamTaskParams): AsyncGenerator<string> {
    const queue: string[] = [];
    let taskCompleted = false;
    let taskError: Error | null = null;
    let notifyResolver: (() => void) | null = null;

    const pushChunk = (chunk: string) => {
      queue.push(chunk);
      if (notifyResolver) {
        notifyResolver();
        notifyResolver = null;
      }
    };

    const finishTask = (err?: Error) => {
      taskCompleted = true;
      if (err) taskError = err;
      if (notifyResolver) {
        notifyResolver();
        notifyResolver = null;
      }
    };

    // Spawn process
    const child = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.workspaceRoot
    });
    this.process = child;

    const rl = readline.createInterface({
      input: child.stdout!,
      terminal: false
    });

    rl.on('line', async (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);

        // Check if response to a request we sent
        if (typeof msg.id === 'number' && this.pendingRequests.has(msg.id)) {
          const { resolve, reject } = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || 'JSON-RPC Error'));
          } else {
            resolve(msg.result);
          }
          return;
        }

        // Handle agent-initiated requests (e.g. permissions or fs operations)
        if (typeof msg.id === 'number' && msg.method) {
          if (
            msg.method === 'permission/request' ||
            msg.method === 'permissions/request' ||
            msg.method === 'session/request_permission'
          ) {
            const reqPath =
              msg.params?.path ||
              msg.params?.request?.path ||
              msg.params?.input?.path ||
              msg.params?.toolCall?.input?.path;
            const approved = isPathWithinWorkspace(this.workspaceRoot, reqPath);
            this.send({
              jsonrpc: '2.0',
              id: msg.id,
              result: {
                approved,
                granted: approved,
                response: { decision: approved ? 'allow' : 'deny' }
              }
            });
            return;
          }

          if (msg.method === 'fs/readTextFile') {
            const filePath = msg.params?.path;
            if (!isPathWithinWorkspace(this.workspaceRoot, filePath)) {
              this.send({
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: -32000, message: 'Access denied: path outside workspace' }
              });
              return;
            }
            try {
              const content = await fs.readFile(path.resolve(this.workspaceRoot, filePath), 'utf-8');
              this.send({
                jsonrpc: '2.0',
                id: msg.id,
                result: { content }
              });
            } catch (err: any) {
              this.send({
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: -32000, message: err.message }
              });
            }
            return;
          }

          if (msg.method === 'fs/writeTextFile') {
            const filePath = msg.params?.path;
            if (!isPathWithinWorkspace(this.workspaceRoot, filePath)) {
              this.send({
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: -32000, message: 'Access denied: path outside workspace' }
              });
              return;
            }
            try {
              const fullPath = path.resolve(this.workspaceRoot, filePath);
              await fs.mkdir(path.dirname(fullPath), { recursive: true });
              await fs.writeFile(fullPath, msg.params?.content || '', 'utf-8');
              this.send({
                jsonrpc: '2.0',
                id: msg.id,
                result: { success: true }
              });
            } catch (err: any) {
              this.send({
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: -32000, message: err.message }
              });
            }
            return;
          }

          // Unknown agent request: default to method not found
          this.send({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32601, message: 'Method not found' }
          });
          return;
        }

        // Handle agent notifications (e.g. streaming update)
        if (msg.method === 'session/update' || msg.method === 'notifications/update') {
          const chunk = extractChunkText(msg.params);
          if (chunk) {
            pushChunk(chunk);
          }
        }
      } catch (err: any) {
        // Ignore unparseable lines or handle error
      }
    });

    child.on('error', (err) => {
      finishTask(err);
    });

    child.on('exit', () => {
      finishTask();
    });

    // Handle abort signal
    if (params.signal) {
      params.signal.addEventListener('abort', () => {
        finishTask(new Error('Operation aborted'));
        this.closeProcess();
      });
    }

    let sessionId: string | undefined;

    try {
      // 1. Handshake according to ACP specification
      await this.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: {
          fs: {
            readTextFile: true,
            writeTextFile: true
          },
          terminal: true
        },
        clientInfo: { name: 'playwright-test-manager', version: '0.1.0' },
        workspaceRoot: this.workspaceRoot
      });
      this.notify('notifications/initialized');

      // 2. Ephemeral session create (standard ACP is session/new, with fallback to session/create)
      try {
        const sessionResult = await this.request('session/new', {
          cwd: this.workspaceRoot,
          mcpServers: []
        });
        sessionId = sessionResult?.sessionId;
      } catch {
        const sessionResult = await this.request('session/create', {
          role: params.role,
          cwd: this.workspaceRoot,
          workspaceRoot: this.workspaceRoot
        });
        sessionId = sessionResult?.sessionId;
      }
      sessionId = sessionId || 'ephemeral-session';

      // 3. Issue prompt (standard ACP requires prompt: [{ type: 'text', text: ... }])
      const promptBlocks = [
        {
          type: 'text',
          text: params.prompt
        }
      ];

      const promptPromise = this.request('session/prompt', {
        sessionId,
        prompt: promptBlocks,
        role: params.role,
        context: params.context
      });

      promptPromise
        .then(() => {
          finishTask();
        })
        .catch((err) => {
          finishTask(err);
        });

      // 4. Yield chunks as they arrive
      while (true) {
        if (params.signal?.aborted) {
          throw new Error('Operation aborted');
        }

        while (queue.length > 0) {
          yield queue.shift()!;
        }

        if (taskCompleted) {
          if (taskError) {
            throw taskError;
          }
          break;
        }

        // Wait for next chunk or completion
        await new Promise<void>((resolve) => {
          notifyResolver = resolve;
        });
      }

      // 5. Close session cleanly
      if (sessionId && this.isAlive()) {
        try {
          await this.request('session/close', { sessionId });
        } catch {}
      }
    } finally {
      this.closeProcess();
    }
  }
}
