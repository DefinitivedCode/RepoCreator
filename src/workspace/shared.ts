import { appError, displayPath } from '../validation';
import { normalizeTechnologies } from '../technologies';
import {
  commandText,
  type CommandCategory,
  type ProjectCommand,
  type ProjectLauncher,
  type RecentProject,
} from '../workspaceTypes';
export const categories: CommandCategory[] = [
  'setup',
  'development',
  'build',
  'test',
  'lint',
  'deploy',
  'custom',
];
export const emptyLauncher: ProjectLauncher = { terminal: 'auto', executables: {} };
export function gitLabel(status: string): string {
  return (
    (
      {
        clean: 'Working tree clean',
        changes: 'Uncommitted changes',
        missing: 'Folder missing',
        unavailable: 'Git status unavailable',
      } as Record<string, string>
    )[status] ??
    (status || 'Git status unavailable')
  );
}
export function presentedCommand(command: ProjectCommand): string {
  return commandText({
    ...command,
    executable: displayPath(command.executable),
    args: command.args.map(displayPath),
  });
}
export function message(error: unknown): string {
  const detail = appError(error);
  return [detail.message, detail.guidance].filter(Boolean).join(' ');
}
export function date(value: number): string {
  return value
    ? new Date(value < 1e12 ? value * 1000 : value).toLocaleDateString()
    : 'Not opened yet';
}
export function normalize(project: RecentProject): RecentProject {
  return {
    ...project,
    commands: project.commands ?? [],
    technologies: normalizeTechnologies(project.technologies, project.context.brief?.technologies),
    launcher: project.launcher ?? emptyLauncher,
  };
}
