import type { HandoffContext } from './handoff';
import type { ProjectTechnologies } from './types';

export type CommandCategory =
  'setup' | 'development' | 'build' | 'test' | 'lint' | 'deploy' | 'custom';
export interface ProjectCommand {
  id: string;
  name: string;
  category: CommandCategory;
  mode: 'executable' | 'shell';
  executable: string;
  args: string[];
  shellCommand: string;
  workingDirectory: string;
  environment: Record<string, string>;
  description: string;
  enabled: boolean;
  imported: boolean;
}
export interface ProjectLauncher {
  terminal: 'auto' | 'windows-terminal' | 'powershell' | 'terminal';
  executables: Record<string, string>;
}
export interface RecentProject {
  id: string;
  createdAt: number;
  lastOpenedAt: number;
  pinned: boolean;
  context: HandoffContext;
  handoffTemplate?: string;
  technologies: ProjectTechnologies;
  commands: ProjectCommand[];
  launcher: ProjectLauncher;
}
export interface ProjectWorkspaceState {
  project: RecentProject;
  exists: boolean;
  gitStatus: string;
  branch: string;
  platform?: 'windows' | 'macos' | 'other';
}
export interface ProjectTool {
  id: string;
  name: string;
  available: boolean;
  path: string | null;
  documentation: string;
  status?: 'available' | 'missing' | 'invalid' | 'unknown';
  detail?: string;
  platform?: 'windows' | 'macos' | 'other';
}
export interface CommandRun {
  id: string;
  projectId: string;
  commandId: string;
  name: string;
  status: 'running' | 'succeeded' | 'failed' | 'stopped';
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  output: string;
}

export function commandText(command: ProjectCommand): string {
  return command.mode === 'shell'
    ? command.shellCommand
    : [command.executable, ...command.args]
        .map((part) => (/\s|["']/.test(part) ? JSON.stringify(part) : part))
        .join(' ');
}
export function commandDirectory(projectPath: string, directory: string): string {
  if (!directory || directory === '.') return projectPath;
  if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(directory)) return directory;
  const separator = projectPath.includes('\\') ? '\\' : '/';
  return `${projectPath.replace(/[\\/]$/, '')}${separator}${directory}`;
}
