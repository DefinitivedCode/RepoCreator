import type { ProjectPreset } from '../types';
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '../icons';
import { Button, Dialog, Menu } from '../ui';
import { WorkspaceDialog } from '../WorkspaceDialog';
import { CommandOutput } from '../CommandOutput';
import { parseCommandOutput } from '../commandOutputModel';
import { displayPath } from '../validation';
import {
  commandDirectory,
  availableCommandSuggestions,
  type CommandCategory,
  type CommandRun,
  type ProjectCommand,
  type RecentProject,
} from '../workspaceTypes';
import { categories, message, presentedCommand } from './shared';

function runTiming(run: CommandRun) {
  const seconds = Math.max(0, Math.floor(((run.finishedAt ?? Date.now()) - run.startedAt) / 1000));
  return `${seconds}s${run.exitCode == null ? '' : ` · exit ${run.exitCode}`}`;
}

export function Commands({
  project,
  exists,
  copy,
  onChange,
  presets,
  onSavePreset,
}: {
  project: RecentProject;
  exists: boolean;
  copy: (text: string) => Promise<void>;
  onChange: (project: RecentProject) => void;
  presets: ProjectPreset[];
  onSavePreset: (commands: ProjectCommand[]) => void;
}) {
  const [editor, setEditor] = useState<ProjectCommand | null>(null);
  const [suggestions, setSuggestions] = useState<ProjectCommand[] | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
  const [runs, setRuns] = useState<CommandRun[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [cleared, setCleared] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<ProjectCommand | null>(null);
  const [issue, setIssue] = useState<{ scope: string; detail: string }>();
  const [historyError, setHistoryError] = useState('');
  const [pending, setPending] = useState(false);
  const [presetId, setPresetId] = useState('');
  const [detected, setDetected] = useState<ProjectCommand[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(true);
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestionRefresh, setSuggestionRefresh] = useState(0);
  const suggestionRequest = useRef<{ key: string; result: Promise<ProjectCommand[]> } | null>(null);
  const commandsKey = JSON.stringify(project.commands);
  useEffect(() => {
    let active = true;
    if (!exists) {
      suggestionRequest.current = null;
      setSuggestionLoading(false);
      return;
    }
    setSuggestionLoading(true);
    setSuggestionError('');
    // Reuse the in-flight request during React Strict Mode's effect replay.
    const key = JSON.stringify([
      project.id,
      project.context.localPath,
      commandsKey,
      suggestionRefresh,
    ]);
    if (suggestionRequest.current?.key !== key)
      suggestionRequest.current = {
        key,
        result: invoke<ProjectCommand[]>('suggest_project_commands', { id: project.id }),
      };
    void suggestionRequest.current.result
      .then((result) => {
        if (active) setDetected(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (active) {
          setDetected([]);
          setSuggestionError('Could not inspect project files. Try refreshing suggestions.');
        }
      })
      .finally(() => {
        if (active) setSuggestionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project.id, project.context.localPath, exists, commandsKey, suggestionRefresh]);
  const availableSuggestions = availableCommandSuggestions(
    detected,
    project.commands,
    project.context.localPath,
  );
  useEffect(() => {
    let active = true,
      fetching = false;
    const poll = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const result = await invoke<CommandRun[]>('list_command_runs', { projectId: project.id });
        if (active) {
          setHistoryError('');
          const snapshots = Array.isArray(result)
            ? result.sort((a, b) => b.startedAt - a.startedAt)
            : [];
          setRuns(snapshots);
          const retainedIds = new Set(snapshots.map((run) => run.id));
          setCleared((previous) =>
            Object.keys(previous).every((id) => retainedIds.has(id))
              ? previous
              : Object.fromEntries(Object.entries(previous).filter(([id]) => retainedIds.has(id))),
          );
        }
      } catch (error) {
        if (active) setHistoryError(message(error));
      } finally {
        fetching = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 850);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [project.id]);
  const availablePresets = presets.filter(
    (preset) => preset.configuration.options.commands?.length,
  );
  const run = runs.find((run) => run.id === selectedRun) ?? runs[0];
  const outputStart =
    run && cleared[run.id] && run.output.startsWith(cleared[run.id]) ? cleared[run.id].length : 0;
  function errorAt(scope: string) {
    return issue?.scope === scope ? issue.detail : '';
  }
  function showError(scope: string) {
    const detail = errorAt(scope);
    return (
      detail && (
        <p role="alert" className="field-error">
          {detail}
        </p>
      )
    );
  }
  async function save(commands: ProjectCommand[], scope: string) {
    setPending(true);
    setIssue(undefined);
    try {
      const result = await invoke<RecentProject>('save_project_commands', {
        id: project.id,
        commands,
      });
      onChange(result);
      return true;
    } catch (error) {
      setIssue({ scope, detail: message(error) });
      return false;
    } finally {
      setPending(false);
    }
  }
  async function execute(command: ProjectCommand, confirmed = false) {
    setIssue(undefined);
    if (command.imported && !confirmed) {
      setConfirmation(command);
      return;
    }
    setPending(true);
    try {
      const result = await invoke<CommandRun>('run_project_command', {
        projectId: project.id,
        commandId: command.id,
        confirmed,
      });
      setRuns((runs) => [result, ...runs.filter((run) => run.id !== result.id)]);
      setSelectedRun(result.id);
      if (command.imported)
        onChange({
          ...project,
          commands: project.commands.map((saved) =>
            saved.id === command.id ? { ...saved, imported: false } : saved,
          ),
        });
      setConfirmation(null);
    } catch (error) {
      setIssue({ scope: confirmed ? 'confirmation' : command.id, detail: message(error) });
    } finally {
      setPending(false);
    }
  }
  async function stop(run: CommandRun) {
    try {
      await invoke('stop_project_command', { runId: run.id });
    } catch (error) {
      setIssue({ scope: 'output', detail: message(error) });
    }
  }
  const [deleting, setDeleting] = useState<ProjectCommand | null>(null);
  function move(index: number, delta: number) {
    const commands = [...project.commands];
    [commands[index], commands[index + delta]] = [commands[index + delta], commands[index]];
    void save(commands, project.commands[index].id);
  }
  return (
    <section className="commands-workspace">
      <div className="view-heading">
        <div>
          <h3>Project commands</h3>
          <p className="help">Run only when you choose. Output includes stdout and stderr.</p>
        </div>
        <div className="inline-actions">
          <Button
            type="button"
            variant="primary"
            disabled={pending}
            onClick={() =>
              setEditor({
                id: crypto.randomUUID(),
                name: '',
                category: 'custom',
                mode: 'executable',
                executable: '',
                args: [],
                shellCommand: '',
                workingDirectory: '.',
                environment: {},
                description: '',
                enabled: true,
                imported: false,
              })
            }
          >
            Add command
          </Button>
        </div>
      </div>
      {pending && (
        <p role="status" className="help">
          Updating commands…
        </p>
      )}
      {exists && (
        <div className="command-suggestions">
          <div role="status">
            <strong>
              {suggestionLoading
                ? 'Checking for suggested commands…'
                : suggestionError
                  ? 'Suggestions unavailable'
                  : availableSuggestions.length
                    ? `${availableSuggestions.length} suggested ${availableSuggestions.length === 1 ? 'command' : 'commands'} found`
                    : 'No new suggested commands'}
            </strong>
            <p className="help">
              {suggestionError ||
                (availableSuggestions.length
                  ? "Found in your project's configuration. Review and add the commands you want. Nothing runs automatically."
                  : 'Suggestions come from supported project files. Nothing runs automatically.')}
            </p>
          </div>
          <div className="inline-actions">
            {availableSuggestions.length > 0 && (
              <button
                type="button"
                disabled={suggestionLoading || pending}
                onClick={() => {
                  setSuggestions(availableSuggestions);
                  setSelectedSuggestions(availableSuggestions.map((command) => command.id));
                }}
              >
                Review suggestions <Icon name="arrow" size={13} />
              </button>
            )}
            <Button
              type="button"
              variant="tertiary"
              size="compact"
              aria-label="Refresh suggestions"
              disabled={suggestionLoading}
              onClick={() => setSuggestionRefresh((value) => value + 1)}
            >
              Refresh
            </Button>
          </div>
        </div>
      )}
      <div className="command-presets">
        <button
          type="button"
          disabled={!project.commands.length}
          onClick={() => onSavePreset(project.commands)}
        >
          Save commands as preset
        </button>
        {availablePresets.length > 0 && (
          <>
            <select
              aria-label="Command preset"
              value={presetId}
              onChange={(event) => setPresetId(event.target.value)}
            >
              <option value="">Choose command preset…</option>
              {availablePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!presetId || pending}
              onClick={() => {
                const commands =
                  availablePresets.find((preset) => preset.id === presetId)?.configuration.options
                    .commands ?? [];
                setSuggestions(
                  commands.map((command) => ({
                    ...command,
                    id: crypto.randomUUID(),
                    environment: {},
                    imported: true,
                  })),
                );
                setSelectedSuggestions([]);
              }}
            >
              Review preset commands
            </button>
          </>
        )}
      </div>
      <div className="command-layout">
        <div className="command-list">
          {!project.commands.length && (
            <div className="empty-workspace">
              <Icon name="code" size={27} />
              <h3>No commands configured</h3>
              <p className="help">
                Add a command, or inspect the project's manifests for suggestions. Discovery does
                not execute scripts.
              </p>
            </div>
          )}
          {project.commands.map((command, index) => {
            const running = runs.find(
              (run) => run.commandId === command.id && run.status === 'running',
            );
            const latest = runs.find((run) => run.commandId === command.id);
            return (
              <article
                className={`command-card ${!command.enabled ? 'disabled-command' : ''}`}
                key={command.id}
              >
                <div className="command-card-heading">
                  <span className="command-category">{command.category}</span>
                  {latest && (
                    <span className={`command-last-status status-${latest.status}`}>
                      {latest.status}
                      {latest.exitCode !== null ? ` / exit ${latest.exitCode}` : ''}
                    </span>
                  )}
                  {command.imported && (
                    <span className="unreviewed-label">Review before first run</span>
                  )}
                  {!command.enabled && <span className="help">Disabled</span>}
                </div>
                <h4>{command.name}</h4>
                <code className="saved-command-text">{presentedCommand(command)}</code>
                <p className="command-working-directory">
                  <Icon name="folder" size={12} />
                  <span
                    title={displayPath(
                      commandDirectory(project.context.localPath, command.workingDirectory),
                    )}
                  >
                    {displayPath(
                      commandDirectory(project.context.localPath, command.workingDirectory),
                    )}
                  </span>
                  <span className="command-mode-label">
                    {command.mode === 'shell' ? 'Shell' : 'Executable'}
                  </span>
                </p>
                {command.description && <p className="help">{command.description}</p>}
                <div className="command-card-actions">
                  <div className="inline-actions">
                    {running ? (
                      <Button
                        type="button"
                        variant="danger"
                        size="compact"
                        onClick={() => void stop(running)}
                      >
                        Stop
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        disabled={!exists || !command.enabled || pending}
                        variant="secondary"
                        size="compact"
                        onClick={() => void execute(command)}
                      >
                        Run <Icon name="arrow" size={13} />
                      </Button>
                    )}
                    <Menu
                      label={`More actions for ${command.name}`}
                      disabled={pending || !!running}
                      actions={[
                        {
                          id: 'edit',
                          label: 'Edit',
                          onSelect: () => setEditor(structuredClone(command)),
                        },
                        {
                          id: 'up',
                          label: 'Move up',
                          disabled: !index,
                          onSelect: () => move(index, -1),
                        },
                        {
                          id: 'down',
                          label: 'Move down',
                          disabled: index === project.commands.length - 1,
                          onSelect: () => move(index, 1),
                        },
                        { id: 'delete', label: 'Delete…', onSelect: () => setDeleting(command) },
                      ]}
                    />
                  </div>
                </div>
                {showError(command.id)}
              </article>
            );
          })}
        </div>
        <section className="command-output" aria-label="Command output">
          <div className="output-toolbar">
            <span className="output-title">
              <Icon name="code" size={15} />
              Output
            </span>
          </div>
          {run ? (
            <>
              <div className="run-summary">
                <strong>{run.name}</strong>
                <span className={`run-status status-${run.status}`}>{run.status}</span>
                <span>{runTiming(run)}</span>
              </div>
              <CommandOutput
                key={run.id}
                output={run.output}
                startOffset={outputStart}
                name={run.name}
                running={run.status === 'running'}
                onError={(detail) => setIssue({ scope: 'output', detail })}
              />
              {showError('output')}
              <div className="output-actions">
                <button
                  type="button"
                  onClick={() => void copy(parseCommandOutput(run.output, outputStart).text)}
                >
                  Copy output
                </button>
                <button
                  type="button"
                  onClick={() => setCleared({ ...cleared, [run.id]: run.output })}
                >
                  Clear output
                </button>
                {run.status === 'running' && (
                  <button type="button" onClick={() => void stop(run)}>
                    Stop process
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="output-empty">
              <Icon name="code" size={22} />
              <p>Command output appears here.</p>
            </div>
          )}
          <div className="output-terminal">
            <p className="help">For interactive tools, use a real terminal.</p>
            <button
              type="button"
              disabled={!exists}
              onClick={() =>
                void invoke('launch_project_tool', { id: project.id, tool: 'terminal' }).catch(
                  (error) => setIssue({ scope: 'terminal', detail: message(error) }),
                )
              }
            >
              Open in Terminal <Icon name="external" size={12} />
            </button>
          </div>
          {showError('terminal')}
          {historyError && (
            <p role="alert" className="field-error">
              {historyError} Checking again…
            </p>
          )}
          {runs.length > 0 && (
            <div className="command-history">
              <h4 id="command-history-title">Run history</h4>
              <ul aria-labelledby="command-history-title">
                {runs.map((entry) => (
                  <li key={entry.id}>
                    <Button
                      size="compact"
                      aria-pressed={run?.id === entry.id}
                      onClick={() => setSelectedRun(entry.id)}
                    >
                      <span className="command-history-name" title={entry.name}>
                        {entry.name}
                      </span>
                      <span className="command-history-details">
                        {entry.status} · {runTiming(entry)}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
      {editor && (
        <CommandEditor
          command={editor}
          nativeError={errorAt('editor')}
          pending={pending}
          onClose={() => setEditor(null)}
          onSave={async (command) => {
            const commands = project.commands.some((item) => item.id === command.id)
              ? project.commands.map((item) => (item.id === command.id ? command : item))
              : [...project.commands, command];
            if (await save(commands, 'editor')) setEditor(null);
          }}
        />
      )}
      {suggestions !== null && (
        <WorkspaceDialog title="Review suggested commands" onClose={() => setSuggestions(null)}>
          {showError('suggestions')}
          <p className="help">
            Suggested commands come from your project files. Review each command before running it
            for the first time. Imported preset commands also require review. Nothing runs
            automatically.
          </p>
          {!suggestions.length && <p>No commands found in supported manifests.</p>}
          <div className="suggestion-list">
            {suggestions.map((command) => (
              <label className="suggested-command" key={command.id}>
                <input
                  type="checkbox"
                  checked={selectedSuggestions.includes(command.id)}
                  onChange={(event) =>
                    setSelectedSuggestions(
                      event.target.checked
                        ? [...selectedSuggestions, command.id]
                        : selectedSuggestions.filter((id) => id !== command.id),
                    )
                  }
                />
                <span>
                  <strong>{command.name}</strong>
                  <code>{presentedCommand(command)}</code>
                  <small>
                    Directory:{' '}
                    {displayPath(
                      commandDirectory(project.context.localPath, command.workingDirectory),
                    )}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={() => setSuggestions(null)}>
              Cancel
            </button>
            <Button
              type="button"
              variant="primary"
              disabled={pending || !selectedSuggestions.length}
              onClick={() =>
                void save(
                  [
                    ...project.commands,
                    ...suggestions
                      .filter((command) => selectedSuggestions.includes(command.id))
                      .map((command) => ({ ...command, id: crypto.randomUUID(), imported: true })),
                  ],
                  'suggestions',
                ).then((saved) => {
                  if (saved) setSuggestions(null);
                })
              }
            >
              Import selected commands
            </Button>
          </div>
        </WorkspaceDialog>
      )}
      {confirmation && (
        <WorkspaceDialog title="Review imported command" onClose={() => setConfirmation(null)}>
          {showError('confirmation')}
          <p>This command came from a manifest or preset. Review it before allowing execution.</p>
          <dl className="workspace-facts command-review">
            <dt>Command</dt>
            <dd>
              <code>{presentedCommand(confirmation)}</code>
            </dd>
            <dt>Mode</dt>
            <dd>
              {confirmation.mode === 'shell'
                ? 'Shell command — shell syntax is evaluated'
                : 'Executable with separate arguments'}
            </dd>
            <dt>Directory</dt>
            <dd>
              <code>
                {displayPath(
                  commandDirectory(project.context.localPath, confirmation.workingDirectory),
                )}
              </code>
            </dd>
            <dt>Environment</dt>
            <dd>{Object.keys(confirmation.environment).join(', ') || 'Inherited environment'}</dd>
          </dl>
          <div className="dialog-actions">
            <button type="button" onClick={() => setConfirmation(null)}>
              Cancel
            </button>
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() => void execute(confirmation, true)}
            >
              Run reviewed command
            </Button>
          </div>
        </WorkspaceDialog>
      )}
      {deleting && (
        <Dialog
          title="Delete command?"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => {
                  const target = deleting;
                  void save(
                    project.commands.filter((item) => item.id !== target.id),
                    'delete',
                  ).then((saved) => {
                    if (saved) setDeleting(null);
                  });
                }}
              >
                Delete command
              </Button>
            </>
          }
        >
          <p>
            <strong>{deleting.name}</strong> will be removed from this project's saved commands.
            Nothing is run and no files are changed.
          </p>
          {showError('delete')}
        </Dialog>
      )}
    </section>
  );
}

export function CommandEditor({
  command,
  nativeError,
  pending,
  onClose,
  onSave,
}: {
  command: ProjectCommand;
  nativeError: string;
  pending: boolean;
  onClose: () => void;
  onSave: (command: ProjectCommand) => Promise<void>;
}) {
  const [draft, setDraft] = useState(command);
  const [argumentsText, setArgumentsText] = useState(command.args.join('\n'));
  const [environmentText, setEnvironmentText] = useState(
    Object.entries(command.environment)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
  const [error, setError] = useState('');
  function update<K extends keyof ProjectCommand>(key: K, value: ProjectCommand[K]) {
    setDraft({ ...draft, [key]: value });
  }
  function save() {
    const environment: Record<string, string> = {};
    for (const line of environmentText.split('\n').filter((line) => line.trim())) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
      if (!match) {
        setError('Use NAME=value for each environment override.');
        return;
      }
      environment[match[1]] = match[2];
    }
    if (
      !draft.name.trim() ||
      !(draft.mode === 'shell' ? draft.shellCommand.trim() : draft.executable.trim())
    ) {
      setError('Enter a display name and command.');
      return;
    }
    void onSave({
      ...draft,
      name: draft.name.trim(),
      args: argumentsText ? argumentsText.split('\n') : [],
      environment,
    });
  }
  return (
    <WorkspaceDialog title={command.name ? 'Edit command' : 'Add command'} onClose={onClose}>
      <div className="command-editor">
        <div className="two-columns">
          <label className="field">
            <span>Display name</span>
            <input
              autoFocus
              value={draft.name}
              maxLength={120}
              onChange={(event) => update('name', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Category</span>
            <select
              value={draft.category}
              onChange={(event) => update('category', event.target.value as CommandCategory)}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="segmented" role="group" aria-label="Command launch mode">
          <button
            type="button"
            aria-pressed={draft.mode === 'executable'}
            onClick={() => update('mode', 'executable')}
          >
            Executable & arguments
          </button>
          <button
            type="button"
            aria-pressed={draft.mode === 'shell'}
            onClick={() => update('mode', 'shell')}
          >
            Shell command
          </button>
        </div>
        {draft.mode === 'executable' ? (
          <>
            <label className="field">
              <span>Executable</span>
              <input
                value={displayPath(draft.executable)}
                placeholder="npm, cargo, or an executable path"
                onChange={(event) => update('executable', event.target.value)}
              />
            </label>
            <label className="field">
              <span>Arguments · one per line</span>
              <textarea
                rows={3}
                value={argumentsText}
                onChange={(event) => setArgumentsText(event.target.value)}
                placeholder={'run\ndev'}
              />
            </label>
            <p className="help">
              Each line is one literal argument. Shell operators and quotes are not interpreted.
            </p>
          </>
        ) : (
          <>
            <label className="field">
              <span>Shell command</span>
              <textarea
                rows={3}
                value={draft.shellCommand}
                onChange={(event) => update('shellCommand', event.target.value)}
              />
            </label>
            <p className="help">
              Evaluated by PowerShell on Windows or the system shell on macOS. Use shell syntax
              appropriate to this computer.
            </p>
          </>
        )}
        <label className="field">
          <span>Working directory</span>
          <input
            aria-label="Working directory"
            value={displayPath(draft.workingDirectory)}
            placeholder=". (project folder)"
            onChange={(event) => update('workingDirectory', event.target.value)}
          />
          <span className="help">
            A path relative to the project, or an absolute existing directory.
          </span>
        </label>
        <label className="field">
          <span>Environment overrides · non-secret values only</span>
          <textarea
            rows={3}
            value={environmentText}
            placeholder="NODE_ENV=development"
            onChange={(event) => setEnvironmentText(event.target.value)}
          />
          <span className="help">
            NAME=value, one per line. Stored locally in plain text; do not enter tokens or
            passwords. Exports omit these values.
          </span>
        </label>
        <label className="field">
          <span>Description</span>
          <input
            value={draft.description}
            maxLength={500}
            onChange={(event) => update('description', event.target.value)}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => update('enabled', event.target.checked)}
          />
          Enabled
        </label>
        {(error || nativeError) && (
          <p role="alert" className="field-error">
            {error || nativeError}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <Button type="button" variant="primary" disabled={pending} onClick={save}>
            Save command
          </Button>
        </div>
      </div>
    </WorkspaceDialog>
  );
}
