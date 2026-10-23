import { appError } from './validation';
import type { CommandRun, ProjectCommand, ProjectWorkspaceState } from './workspaceTypes';

export type ReadinessStatus = 'ready' | 'attention' | 'notChecked' | 'couldNotCheck';
export type ReadinessGroup =
  | 'project'
  | 'tools'
  | 'requirements'
  | 'configuration'
  | 'dependencies'
  | 'commands'
  | 'remote'
  | 'git';
export interface ReadinessCheck {
  id: string;
  group: ReadinessGroup;
  title: string;
  status: ReadinessStatus;
  detail: string;
  /** Copyable guidance. Repo Creator never runs a suggested fix. */
  fix: string | null;
  /** Based on files being present rather than a verified state. */
  inferred: boolean;
  network: boolean;
  /** Set on results produced by the explicit full check. */
  fullCheck?: boolean;
}
export interface ReadinessProbe {
  id: string;
  label: string;
  network: boolean;
}
export interface ReadinessReport {
  checks: ReadinessCheck[];
}
/** The exact programs a full check will run; the token confirms this plan only. */
export interface ReadinessPlan {
  token: string;
  probes: ReadinessProbe[];
}
export interface FullReadinessReport {
  checks: ReadinessCheck[];
  cancelled: boolean;
}

export const statusLabels: Record<ReadinessStatus, string> = {
  ready: 'Ready',
  attention: 'Needs attention',
  notChecked: 'Not checked',
  couldNotCheck: 'Could not check',
};
export const groupLabels: Record<ReadinessGroup, string> = {
  project: 'Project',
  tools: 'Development tools',
  requirements: 'Versions and toolchains',
  configuration: 'Configuration files',
  dependencies: 'Dependencies',
  commands: 'Saved commands',
  git: 'Git',
  remote: 'Remote access',
};
const groupOrder = Object.keys(groupLabels) as ReadinessGroup[];
const statuses = Object.keys(statusLabels) as ReadinessStatus[];

/** "1 needs attention", "2 need attention", "3 ready". */
export function countLabel(status: ReadinessStatus, count: number): string {
  if (status === 'attention') return `${count} ${count === 1 ? 'needs' : 'need'} attention`;
  return `${count} ${statusLabels[status].toLowerCase()}`;
}
export function errorText(error: unknown): string {
  const detail = appError(error);
  return [detail.message, detail.guidance].filter(Boolean).join(' ');
}
export function isReport(value: unknown): value is ReadinessReport {
  return (
    typeof value === 'object' && value !== null && Array.isArray((value as ReadinessReport).checks)
  );
}
export function isPlan(value: unknown): value is ReadinessPlan {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ReadinessPlan).token === 'string' &&
    Array.isArray((value as ReadinessPlan).probes)
  );
}

/** The workspace already computes Git state; readiness presents it without another Git call. */
export function gitCheck(workspace: Pick<ProjectWorkspaceState, 'gitStatus' | 'branch'>) {
  const branch = workspace.branch || 'the current branch';
  const base = {
    id: 'git',
    group: 'git',
    title: 'Working tree',
    fix: null,
    inferred: false,
    network: false,
  } as const;
  switch (workspace.gitStatus) {
    case 'clean':
      return {
        ...base,
        status: 'ready',
        detail: `Working tree clean on ${branch}.`,
      } as ReadinessCheck;
    case 'changes':
      return {
        ...base,
        status: 'ready',
        detail: `Uncommitted changes on ${branch}. They don't block building; review them before publishing.`,
      } as ReadinessCheck;
    case 'missing':
      return {
        ...base,
        status: 'attention',
        detail: 'The project folder is missing.',
      } as ReadinessCheck;
    default:
      return {
        ...base,
        status: 'couldNotCheck',
        detail: 'Git status is unavailable for this folder.',
      } as ReadinessCheck;
  }
}

/** Full-check results replace automatic results with the same ID. */
export function mergeChecks(base: ReadinessCheck[], updates: ReadinessCheck[]): ReadinessCheck[] {
  const replacements = new Map(updates.map((check) => [check.id, check]));
  const merged = base.map((check) => replacements.get(check.id) ?? check);
  const known = new Set(base.map((check) => check.id));
  return [...merged, ...updates.filter((check) => !known.has(check.id))];
}

export function groupChecks(checks: ReadinessCheck[]) {
  return groupOrder
    .map((group) => ({
      group,
      label: groupLabels[group],
      checks: checks.filter((check) => check.group === group),
    }))
    .filter((section) => section.checks.length);
}

export function summarize(checks: ReadinessCheck[]): Record<ReadinessStatus, number> {
  return Object.fromEntries(
    statuses.map((status) => [status, checks.filter((check) => check.status === status).length]),
  ) as Record<ReadinessStatus, number>;
}

/**
 * Commands a full check may offer. Only saved, enabled and already reviewed commands
 * qualify; long-running development servers and deployments are never offered.
 */
export function commandEligibility(command: ProjectCommand): string | null {
  if (!command.enabled) return 'Disabled';
  if (command.imported) return 'Review it in Commands before its first run';
  if (command.category === 'development') return 'Development servers keep running';
  if (command.category === 'deploy') return 'Deployments are never run as a check';
  return null;
}

export function commandResult(
  command: ProjectCommand,
  run: CommandRun | null,
  error = '',
): ReadinessCheck {
  const base = {
    id: `run-${command.id}`,
    group: 'commands' as const,
    title: `${command.name} · run`,
    fix: null,
    inferred: false,
    network: false,
    fullCheck: true,
  };
  if (!run)
    return {
      ...base,
      status: 'couldNotCheck',
      detail: error || 'The command could not be started.',
    };
  const seconds = Math.max(
    0,
    Math.round(((run.finishedAt ?? run.startedAt) - run.startedAt) / 1000),
  );
  if (run.status === 'succeeded')
    return { ...base, status: 'ready', detail: `Finished successfully in ${seconds}s.` };
  if (run.status === 'failed')
    return {
      ...base,
      status: 'attention',
      detail: `Exited${run.exitCode === null ? '' : ` with code ${run.exitCode}`} after ${seconds}s. Open Commands to read its output.`,
    };
  return { ...base, status: 'couldNotCheck', detail: 'Stopped before it finished.' };
}
