import { describe, expect, it } from 'vitest';
import {
  countLabel,
  commandEligibility,
  commandResult,
  gitCheck,
  groupChecks,
  isReport,
  mergeChecks,
  summarize,
  type ReadinessCheck,
} from './readinessModel';
import type { CommandRun, ProjectCommand } from './workspaceTypes';

const check = (id: string, status: ReadinessCheck['status'], group: ReadinessCheck['group']) =>
  ({
    id,
    group,
    title: id,
    status,
    detail: '',
    fix: null,
    inferred: false,
    network: false,
  }) as ReadinessCheck;
const command: ProjectCommand = {
  id: 'build',
  name: 'Build',
  category: 'build',
  mode: 'executable',
  executable: 'npm',
  args: ['run', 'build'],
  shellCommand: '',
  workingDirectory: '.',
  environment: {},
  description: '',
  enabled: true,
  imported: false,
};
const run = (status: CommandRun['status'], exitCode: number | null): CommandRun => ({
  id: 'run-1',
  projectId: 'project',
  commandId: 'build',
  name: 'Build',
  status,
  startedAt: 1_000,
  finishedAt: 4_000,
  exitCode,
  output: 'secret output is never summarized',
});

describe('readiness model', () => {
  it('replaces automatic results with full-check results and keeps new ones', () => {
    const merged = mergeChecks(
      [
        check('version-node', 'notChecked', 'requirements'),
        check('gitignore', 'ready', 'configuration'),
      ],
      [check('version-node', 'attention', 'requirements'), check('remote', 'ready', 'remote')],
    );
    expect(merged.map((item) => [item.id, item.status])).toEqual([
      ['version-node', 'attention'],
      ['gitignore', 'ready'],
      ['remote', 'ready'],
    ]);
    expect(summarize(merged)).toEqual({ ready: 2, attention: 1, notChecked: 0, couldNotCheck: 0 });
  });

  it('groups results in a stable order and omits empty groups', () => {
    const groups = groupChecks([
      check('remote', 'ready', 'remote'),
      check('tool-node', 'attention', 'tools'),
      check('project-type', 'ready', 'project'),
    ]);
    expect(groups.map((group) => group.label)).toEqual([
      'Project',
      'Development tools',
      'Remote access',
    ]);
  });

  it('presents existing Git state without treating uncommitted work as a failure', () => {
    expect(gitCheck({ gitStatus: 'clean', branch: 'main' }).status).toBe('ready');
    const changes = gitCheck({ gitStatus: 'changes', branch: 'main' });
    expect(changes.status).toBe('ready');
    expect(changes.detail).toContain('Uncommitted changes on main');
    expect(gitCheck({ gitStatus: 'missing', branch: '' }).status).toBe('attention');
    expect(gitCheck({ gitStatus: 'unavailable', branch: '' }).status).toBe('couldNotCheck');
  });

  it('offers only saved, enabled, reviewed and finite commands', () => {
    expect(commandEligibility(command)).toBeNull();
    expect(commandEligibility({ ...command, imported: true })).toContain('Review');
    expect(commandEligibility({ ...command, enabled: false })).toBe('Disabled');
    expect(commandEligibility({ ...command, category: 'development' })).not.toBeNull();
    expect(commandEligibility({ ...command, category: 'deploy' })).not.toBeNull();
  });

  it('summarizes command runs without copying their output', () => {
    expect(commandResult(command, run('succeeded', 0))).toMatchObject({
      id: 'run-build',
      status: 'ready',
      fullCheck: true,
    });
    const failed = commandResult(command, run('failed', 2));
    expect(failed.status).toBe('attention');
    expect(failed.detail).toContain('code 2');
    expect(failed.detail).not.toContain('secret');
    expect(commandResult(command, run('stopped', null)).status).toBe('couldNotCheck');
    expect(commandResult(command, null, 'Review required.').detail).toBe('Review required.');
  });

  it('labels counts with correct agreement', () => {
    expect(countLabel('attention', 1)).toBe('1 needs attention');
    expect(countLabel('attention', 2)).toBe('2 need attention');
    expect(countLabel('couldNotCheck', 3)).toBe('3 could not check');
  });

  it('rejects responses that are not readiness reports', () => {
    expect(isReport(undefined)).toBe(false);
    expect(isReport({ checks: [] })).toBe(false);
    expect(isReport({ checks: [], probes: [] })).toBe(true);
  });
});
