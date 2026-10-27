import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export interface ProjectSettings {
  baseUrl: string;
  seedTestPath: string;
  agentType: 'mock' | 'acp';
  acpCommand: string;
  acpArgs: string[];
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  baseUrl: 'http://localhost:3000',
  seedTestPath: 'tests/seed.spec.ts',
  agentType: 'mock',
  acpCommand: '',
  acpArgs: []
};

const SETTINGS_FILENAME = '.playwright-manager.json';

export function parseCommandLineArgs(input: string): string[] {
  const args: string[] = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    if (match[1] !== undefined) {
      args.push(match[1]);
    } else if (match[2] !== undefined) {
      args.push(match[2]);
    } else {
      args.push(match[0]);
    }
  }
  return args;
}

export function sanitizeArg(arg: any): string {
  const str = String(arg).trim();
  if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
    return str.slice(1, -1);
  }
  return str;
}

export async function getSettings(workspaceRoot: string): Promise<ProjectSettings> {
  const filePath = path.join(workspaceRoot, SETTINGS_FILENAME);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    let acpArgs: string[] = DEFAULT_SETTINGS.acpArgs;
    if (Array.isArray(parsed.acpArgs)) {
      acpArgs = parsed.acpArgs.map(sanitizeArg);
    } else if (typeof parsed.acpArgs === 'string') {
      acpArgs = parseCommandLineArgs(parsed.acpArgs);
    }

    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : DEFAULT_SETTINGS.baseUrl,
      seedTestPath: typeof parsed.seedTestPath === 'string' ? parsed.seedTestPath : DEFAULT_SETTINGS.seedTestPath,
      agentType: parsed.agentType === 'acp' ? 'acp' : 'mock',
      acpCommand: typeof parsed.acpCommand === 'string' ? parsed.acpCommand.trim() : DEFAULT_SETTINGS.acpCommand,
      acpArgs
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(
  workspaceRoot: string,
  settings: Partial<ProjectSettings>
): Promise<ProjectSettings> {
  const current = await getSettings(workspaceRoot);
  let acpArgs = current.acpArgs;
  if (Array.isArray(settings.acpArgs)) {
    acpArgs = settings.acpArgs.map(sanitizeArg);
  } else if (typeof settings.acpArgs === 'string') {
    acpArgs = parseCommandLineArgs(settings.acpArgs);
  }

  const updated: ProjectSettings = {
    baseUrl: typeof settings.baseUrl === 'string' ? settings.baseUrl : current.baseUrl,
    seedTestPath: typeof settings.seedTestPath === 'string' ? settings.seedTestPath : current.seedTestPath,
    agentType: settings.agentType === 'acp' ? 'acp' : (settings.agentType === 'mock' ? 'mock' : current.agentType),
    acpCommand: typeof settings.acpCommand === 'string' ? settings.acpCommand.trim() : current.acpCommand,
    acpArgs
  };

  const filePath = path.join(workspaceRoot, SETTINGS_FILENAME);
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}
