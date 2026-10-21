import { Icon } from './icons';
import type { Creator } from './useCreator';
import { displayPath } from './validation';
import { stages } from './types';
import { HandoffPanel } from './HandoffPanel';
import { FilePreview } from './ConfigurationPanels';

export function RepositoryState({
  creator,
  onAnother,
  presetName,
}: {
  creator: Creator;
  onAnother: () => void;
  presetName: string;
}) {
  const { state, form } = creator;
  if (!form || state.kind === 'form') return null;
  if (state.kind === 'creating') {
    const applicable = stages
      .filter(
        ([key]) =>
          !['github', 'metadata', 'push', 'verify'].includes(key) || form.destination === 'github',
      )
      .filter(([key]) => key !== 'metadata' || !!form.topics.length || !!form.homepage);
    const current = applicable.findIndex(([key]) => key === state.stage);
    return (
      <main className="content">
        <div className="state-content" aria-live="polite" aria-busy="true">
          <h2>Creating repository</h2>
          <p className="state-project">{form.name}</p>
          <ol className="progress-list">
            {applicable.map(([key, label], index) => (
              <li
                key={key}
                className={
                  state.stage === 'complete' || index < current
                    ? 'done'
                    : key === state.stage
                      ? 'active'
                      : ''
                }
              >
                <span className={`step-symbol ${key === state.stage ? 'spinner' : ''}`}>
                  {(state.stage === 'complete' || index < current) && (
                    <Icon name="check" size={12} />
                  )}
                </span>
                {label}
              </li>
            ))}
          </ol>
          <p className="help">Keep this window open until creation finishes.</p>
        </div>
      </main>
    );
  }
  const success = state.kind === 'success';
  const result = success ? state.result : null;
  const error = state.kind === 'failure' ? state.error : null;
  const path = result?.path ?? error?.localPath ?? '';
  const url = result?.githubUrl ?? error?.githubUrl;
  return (
    <>
      <main className="content completion-content">
        <div className="state-content completion-summary">
          <div className="state-heading" role="status">
            <Icon name={success ? 'check' : 'alert'} size={21} />
            <h2>
              {success
                ? 'Repository created'
                : error?.localReady
                  ? 'Publishing incomplete'
                  : 'Creation incomplete'}
            </h2>
          </div>
          <p className="state-project">{result?.name ?? form.name}</p>
          {error && (
            <div className="error-banner" role="alert">
              <strong>{error.message}</strong>
              <p>{error.guidance}</p>
            </div>
          )}
          <dl className="result-details">
            <dt>Location</dt>
            <dd>
              <span className="copy-value">{displayPath(path)}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Copy project path"
                onClick={() => void creator.copy(displayPath(path))}
              >
                <Icon name="copy" size={14} />
              </button>
            </dd>
            {(result || error?.localReady) && (
              <>
                <dt>Branch</dt>
                <dd>
                  <code>{result?.branch ?? form.options.initialBranch}</code>
                </dd>
                <dt>Initial commit</dt>
                <dd>
                  <span>{result?.commitMessage ?? form.options.commitMessage}</span>
                  {result && <code className="commit-hash">{result.commit.slice(0, 7)}</code>}
                </dd>
              </>
            )}
            {url && (
              <>
                <dt>GitHub</dt>
                <dd>
                  <button
                    type="button"
                    className="result-link"
                    onClick={() => void creator.action('open_github')}
                  >
                    {url.replace('https://', '')}
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Copy GitHub URL"
                    onClick={() => void creator.copy(url)}
                  >
                    <Icon name="copy" size={14} />
                  </button>
                </dd>
              </>
            )}
          </dl>
          {result?.warnings.map((warning) => (
            <p key={warning} className="notice" role="status">
              {warning}
            </p>
          ))}
          <div className="result-actions">
            {error?.canRetry && (
              <button className="primary" type="button" onClick={() => void creator.execute(true)}>
                Retry publishing <Icon name="arrow" size={14} />
              </button>
            )}
            <button type="button" onClick={() => void creator.action('open_project')}>
              <Icon name="folder" size={14} />
              Open Folder
            </button>
            {creator.environment?.vscodeAvailable && (
              <button type="button" onClick={() => void creator.action('open_vscode')}>
                <Icon name="code" size={14} />
                Open in VS Code
              </button>
            )}
            {url && (
              <button type="button" onClick={() => void creator.action('open_github')}>
                <Icon name="external" size={13} />
                {success ? 'Open on GitHub' : 'Inspect on GitHub'}
              </button>
            )}
          </div>
          {result &&
            (result.files.length ? (
              <details className="result-files">
                <summary>
                  Generated files <span className="file-count">{result.files.length}</span>
                </summary>
                <FilePreview
                  name={result.name}
                  files={creator.files}
                  loading={false}
                  error=""
                  expanded
                  created
                />
              </details>
            ) : (
              <p className="help">0 files · empty initial commit</p>
            ))}
          {result && (
            <details className="completion-handoff">
              <summary>
                AI Project Handoff <span className="help">Plan your next step</span>
              </summary>
              <HandoffPanel
                form={form}
                files={creator.files}
                parentPath={creator.preferences?.parentPath ?? ''}
                presetName={presetName}
                result={result}
                simple={creator.preferences?.experienceMode !== 'advanced'}
                onTemplateChange={(id) => creator.update('handoffTemplate', id)}
                copy={creator.copy}
              />
            </details>
          )}
          {creator.notice && (
            <p className="notice" role="status">
              {creator.notice}
            </p>
          )}
        </div>
      </main>
      <footer className="action-bar">
        <span className="help">{success ? '' : 'Created files are preserved.'}</span>
        <button type="button" className={success ? 'primary' : ''} onClick={onAnother}>
          Create Another <Icon name="arrow" size={14} />
        </button>
      </footer>
    </>
  );
}
