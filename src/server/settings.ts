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

export async function getSettings(workspaceRoot: string): Promise<ProjectSettings> {
  const filePath = path.join(workspaceRoot, SETTINGS_FILENAME);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : DEFAULT_SETTINGS.baseUrl,
      seedTestPath: typeof parsed.seedTestPath === 'string' ? parsed.seedTestPath : DEFAULT_SETTINGS.seedTestPath,
      agentType: parsed.agentType === 'acp' ? 'acp' : 'mock',
      acpCommand: typeof parsed.acpCommand === 'string' ? parsed.acpCommand : DEFAULT_SETTINGS.acpCommand,
      acpArgs: Array.isArray(parsed.acpArgs) ? parsed.acpArgs.map(String) : DEFAULT_SETTINGS.acpArgs
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
  const updated: ProjectSettings = {
    baseUrl: typeof settings.baseUrl === 'string' ? settings.baseUrl : current.baseUrl,
    seedTestPath: typeof settings.seedTestPath === 'string' ? settings.seedTestPath : current.seedTestPath,
    agentType: settings.agentType === 'acp' ? 'acp' : (settings.agentType === 'mock' ? 'mock' : current.agentType),
    acpCommand: typeof settings.acpCommand === 'string' ? settings.acpCommand : current.acpCommand,
    acpArgs: Array.isArray(settings.acpArgs) ? settings.acpArgs.map(String) : current.acpArgs
  };

  const filePath = path.join(workspaceRoot, SETTINGS_FILENAME);
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}
