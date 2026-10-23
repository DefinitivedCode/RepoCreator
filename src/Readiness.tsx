import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon, type IconName } from './icons';
import { displayPath } from './validation';
import { WorkspaceDialog } from './WorkspaceDialog';
import {
  commandDirectory,
  commandText,
  type CommandRun,
  type ProjectCommand,
  type ProjectWorkspaceState,
  type RecentProject,
} from './workspaceTypes';
import {
  commandEligibility,
  commandResult,
  countLabel,
  errorText,
  gitCheck,
  groupChecks,
  isReport,
  mergeChecks,
  statusLabels,
  summarize,
  type FullReadinessReport,
  type ReadinessCheck,
  type ReadinessReport,
  type ReadinessStatus,
} from './readinessModel';
import './readiness.css';

const statusIcons: Record<ReadinessStatus, IconName> = {
  ready: 'check',
  attention: 'alert',
  notChecked: 'pending',
  couldNotCheck: 'question',
};
const summaryOrder: ReadinessStatus[] = ['attention', 'couldNotCheck', 'notChecked', 'ready'];
const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));
function presented(command: ProjectCommand): string {
  return commandText({
    ...command,
    executable: displayPath(command.executable),
    args: command.args.map(displayPath),
  });
}
function time(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface FullCheckState {
  running: boolean;
  step: string;
  finishedAt: number | null;
  cancelled: boolean;
}

/** Automatic inspection runs when a workspace opens; the full check only on request. */
export function useReadiness(project: RecentProject | undefined, exists: boolean) {
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [verified, setVerified] = useState<ReadinessCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [full, setFull] = useState<FullCheckState>({
    running: false,
    step: '',
    finishedAt: null,
    cancelled: false,
  });
  const request = useRef(0);
  const running = useRef(false);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  const currentRun = useRef('');
  const id = project?.id;
  const commandsKey = JSON.stringify(project?.commands ?? []);
  async function inspect(reset = false) {
    const revision = ++request.current;
    if (reset) {
      setVerified([]);
      setFull((value) => ({ ...value, finishedAt: null, cancelled: false }));
    }
    if (!id || !exists) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await invoke<ReadinessReport>('get_project_readiness', { id });
      if (revision !== request.current) return;
      if (isReport(result)) {
        setReport(result);
        setError('');
        setCheckedAt(Date.now());
      } else {
        setReport(null);
        setError('Readiness information is unavailable.');
      }
    } catch (value) {
      if (revision === request.current) setError(errorText(value));
    } finally {
      if (revision === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    void inspect();
  }, [id, exists, commandsKey]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      // Leaving the project ends its full check; a started check command is stopped.
      mounted.current = false;
      if (running.current) {
        cancelled.current = true;
        if (id) void invoke('cancel_readiness_check', { id }).catch(() => undefined);
      }
    };
  }, [id]);
  async function runCommand(projectId: string, command: ProjectCommand) {
    let run: CommandRun;
    try {
      run = await invoke<CommandRun>('run_project_command', {
        projectId,
        commandId: command.id,
        confirmed: false,
      });
    } catch (value) {
      return commandResult(command, null, errorText(value));
    }
    if (!run || typeof run.id !== 'string') return commandResult(command, null);
    currentRun.current = run.id;
    let stopRequested = false;
    while (run.status === 'running') {
      await wait(800);
      if (cancelled.current && !stopRequested) {
        stopRequested = true;
        await invoke('stop_project_command', { runId: run.id }).catch(() => undefined);
      }
      try {
        const runs = await invoke<CommandRun[]>('list_command_runs', { projectId });
        const latest = Array.isArray(runs) ? runs.find((item) => item.id === run.id) : undefined;
        if (latest) run = latest;
      } catch {
        // Keep polling the bounded snapshot; the run itself is unaffected.
      }
      if (!mounted.current && stopRequested) break;
    }
    currentRun.current = '';
    return commandResult(command, run);
  }
  async function runFull(commands: ProjectCommand[]) {
    if (!id || running.current) return;
    running.current = true;
    cancelled.current = false;
    setError('');
    setFull({
      running: true,
      step: 'Checking versions and remote access…',
      finishedAt: null,
      cancelled: false,
    });
    let results: ReadinessCheck[] = [];
    let interrupted = false;
    try {
      const result = await invoke<FullReadinessReport>('run_readiness_check', { id });
      if (result && Array.isArray(result.checks)) {
        results = result.checks.map((check) => ({ ...check, fullCheck: true }));
        interrupted = !!result.cancelled;
      }
    } catch (value) {
      if (mounted.current) setError(errorText(value));
    }
    if (mounted.current) setVerified(results);
    for (const command of commands) {
      if (cancelled.current || !mounted.current) break;
      setFull((value) => ({ ...value, step: `Running ${command.name}…` }));
      results = mergeChecks(results, [await runCommand(id, command)]);
      if (mounted.current) setVerified(results);
    }
    running.current = false;
    if (mounted.current)
      setFull({
        running: false,
        step: '',
        finishedAt: Date.now(),
        cancelled: interrupted || cancelled.current,
      });
  }
  async function cancel() {
    cancelled.current = true;
    setFull((value) => ({ ...value, step: 'Cancelling…' }));
    if (id) await invoke('cancel_readiness_check', { id }).catch(() => undefined);
    if (currentRun.current)
      await invoke('stop_project_command', { runId: currentRun.current }).catch(() => undefined);
  }
  return {
    report,
    checks: report ? mergeChecks(report.checks, verified) : verified,
    loading,
    error,
    checkedAt,
    full,
    refresh: () => void inspect(true),
    runFull: (commands: ProjectCommand[]) => void runFull(commands),
    cancel: () => void cancel(),
  };
}
export type ReadinessState = ReturnType<typeof useReadiness>;

export function readinessChecks(
  readiness: ReadinessState,
  workspace: Pick<ProjectWorkspaceState, 'gitStatus' | 'branch'>,
) {
  return [...readiness.checks, gitCheck(workspace)];
}

export function Readiness({
  project,
  workspace,
  readiness,
  copy,
  onOpenCommands,
}: {
  project: RecentProject;
  workspace: ProjectWorkspaceState;
  readiness: ReadinessState;
  copy: (text: string) => Promise<void>;
  onOpenCommands: () => void;
}) {
  const [stage, setStage] = useState<'closed' | 'plan' | 'confirm'>('closed');
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState('');
  if (!workspace.exists)
    return (
      <section className="readiness rc-readiness">
        <div className="empty-workspace">
          <Icon name="folder" size={27} />
          <h3>Readiness needs the project folder</h3>
          <p className="help">Locate the moved folder to check this project.</p>
        </div>
      </section>
    );
  const checks = readinessChecks(readiness, workspace);
  const counts = summarize(checks);
  const probes = readiness.report?.probes ?? [];
  const chosen = project.commands.filter(
    (command) => selected.includes(command.id) && !commandEligibility(command),
  );
  const { full } = readiness;
  const commandCount = `${chosen.length} command${chosen.length === 1 ? '' : 's'}`;
  function close() {
    setStage('closed');
    setSelected([]);
  }
  function start() {
    const commands = chosen;
    close();
    readiness.runFull(commands);
  }
  async function copyFix(check: ReadinessCheck) {
    if (!check.fix) return;
    await copy(check.fix);
    setCopied(check.id);
    window.setTimeout(() => setCopied((value) => (value === check.id ? '' : value)), 1600);
  }
  return (
    <section className="readiness rc-readiness" aria-busy={readiness.loading || full.running}>
      <div className="view-heading">
        <div>
          <h3>Project readiness</h3>
          <p className="help">
            Automatic checks read project files and locate tools without starting them. Nothing is
            installed or changed.
          </p>
        </div>
        <div className="inline-actions">
          <button
            type="button"
            className="text-button"
            disabled={readiness.loading || full.running}
            onClick={readiness.refresh}
          >
            <Icon name="refresh" size={14} />
            {readiness.loading ? 'Checking…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="primary"
            disabled={full.running || !readiness.report}
            onClick={() => setStage('plan')}
          >
            Run full check
          </button>
        </div>
      </div>
      <div className="readiness-summary" role="status" aria-live="polite">
        <div className="readiness-counts">
          {summaryOrder
            .filter((status) => counts[status])
            .map((status) => (
              <span className={`readiness-count status-${status}`} key={status}>
                <Icon name={statusIcons[status]} size={13} />
                {countLabel(status, counts[status])}
              </span>
            ))}
        </div>
        <span className="readiness-time">
          {full.finishedAt
            ? `Full check ${full.cancelled ? 'cancelled' : 'finished'} at ${time(full.finishedAt)}`
            : readiness.checkedAt
              ? `Checked at ${time(readiness.checkedAt)}`
              : readiness.loading
                ? 'Checking…'
                : ''}
        </span>
      </div>
      <p className="readiness-legend help">
        <span className="readiness-tag">Inferred</span> results rely on files being present.{' '}
        <span className="readiness-tag">Full check</span> results come from running the listed
        programs.
      </p>
      {full.running && (
        <div className="readiness-progress" role="status">
          <span className="readiness-progress-bar" aria-hidden="true" />
          <span>
            <strong>Running full check</strong> {full.step}
          </span>
          <button type="button" onClick={readiness.cancel}>
            Cancel
          </button>
        </div>
      )}
      {readiness.error && (
        <p role="alert" className="field-error">
          {readiness.error}
        </p>
      )}
      {groupChecks(checks).map((section) => (
        <section
          className="readiness-group"
          key={section.group}
          aria-labelledby={`readiness-${section.group}`}
        >
          <h4 id={`readiness-${section.group}`}>{section.label}</h4>
          <ul className="readiness-list">
            {section.checks.map((check) => (
              <li className={`readiness-check status-${check.status}`} key={check.id}>
                <span className="readiness-icon">
                  <Icon name={statusIcons[check.status]} size={15} />
                </span>
                <div className="readiness-body">
                  <div className="readiness-title">
                    <strong>{check.title}</strong>
                    <span className="readiness-state">{statusLabels[check.status]}</span>
                    {check.inferred && (
                      <span className="readiness-tag" title="Based on files being present">
                        Inferred
                      </span>
                    )}
                    {check.fullCheck && <span className="readiness-tag">Full check</span>}
                    {check.network && (
                      <span className="readiness-tag">
                        <Icon name="globe" size={11} />
                        Network
                      </span>
                    )}
                  </div>
                  <p>{check.detail}</p>
                  {check.fix && (
                    <div className="readiness-fix">
                      <span>Suggested fix</span>
                      <code>{check.fix}</code>
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`Copy suggested fix for ${check.title}`}
                        onClick={() => void copyFix(check)}
                      >
                        <Icon name={copied === check.id ? 'check' : 'copy'} size={13} />
                        {copied === check.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                  {check.id.startsWith('run-') && check.status !== 'ready' && (
                    <button type="button" className="text-button" onClick={onOpenCommands}>
                      Open Commands
                      <Icon name="arrow" size={13} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {stage === 'plan' && (
        <WorkspaceDialog title="Run full check" onClose={close}>
          <p className="help">
            The full check starts only the programs listed here. It never installs anything or
            applies a suggested fix. You can cancel it at any time.
          </p>
          <h3 className="readiness-dialog-heading">Programs that will run</h3>
          <ul className="readiness-probes">
            {probes.map((probe) => (
              <li key={probe.id}>
                <code>{probe.label}</code>
                {probe.network && (
                  <span className="readiness-tag">
                    <Icon name="globe" size={11} />
                    Contacts the network
                  </span>
                )}
              </li>
            ))}
          </ul>
          {probes.some((probe) => probe.network) && (
            <p className="help">
              Network checks use your existing Git and GitHub CLI sign-in. Remote credentials are
              never shown.
            </p>
          )}
          <h3 className="readiness-dialog-heading">Project commands · optional</h3>
          {project.commands.length ? (
            <div className="readiness-command-options">
              {project.commands.map((command) => {
                const reason = commandEligibility(command);
                return (
                  <label
                    className={`check-label readiness-command-option ${reason ? 'unavailable' : ''}`}
                    key={command.id}
                  >
                    <input
                      type="checkbox"
                      disabled={!!reason}
                      checked={selected.includes(command.id)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, command.id]
                            : selected.filter((id) => id !== command.id),
                        )
                      }
                    />
                    <span>
                      <strong>{command.name}</strong>
                      <code>{presented(command)}</code>
                      {reason && <small>{reason}</small>}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="help">No saved commands. Add them in Commands to include them.</p>
          )}
          <p className="help">Commands are never selected or run automatically.</p>
          <div className="dialog-actions">
            <button type="button" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => (chosen.length ? setStage('confirm') : start())}
            >
              {chosen.length ? `Review ${commandCount}` : 'Run checks'}
            </button>
          </div>
        </WorkspaceDialog>
      )}
      {stage === 'confirm' && (
        <WorkspaceDialog title="Run project commands?" onClose={close}>
          <div className="readiness-warning" role="note">
            <Icon name="alert" size={18} />
            <div>
              <strong>These commands run this project's own code</strong>
              <p>
                They run with your user permissions and the same access to your files as you. They
                may take a while, create or change files in the project folder (such as build
                output) and download packages from the internet. Only continue if you trust this
                project.
              </p>
            </div>
          </div>
          <ol className="readiness-confirm-list">
            {chosen.map((command) => (
              <li key={command.id}>
                <strong>{command.name}</strong>
                <code>{presented(command)}</code>
                <small>
                  In{' '}
                  {displayPath(
                    commandDirectory(project.context.localPath, command.workingDirectory),
                  )}
                </small>
              </li>
            ))}
          </ol>
          <p className="help">The version and remote checks listed earlier run first.</p>
          <div className="dialog-actions">
            <button type="button" onClick={() => setStage('plan')}>
              Back
            </button>
            <button type="button" className="primary" onClick={start}>
              Run {commandCount}
            </button>
          </div>
        </WorkspaceDialog>
      )}
    </section>
  );
}
