import { useEffect, useRef, useState } from 'react';
import { detailOf, MINIMUM_GIT, validEmail } from './blockers';
import { Icon } from './icons';
import type { Creator } from './useCreator';
import type { AppError, Environment } from './types';
import { appError } from './validation';

export interface IdentityDraft {
  name: string;
  email: string;
}
export type IdentityMode = 'project' | 'global';

const scopeLabels: Record<string, string> = {
  global: 'global Git settings',
  system: 'system Git settings',
  local: 'this folder’s Git settings',
  worktree: 'this folder’s Git settings',
  command: 'Git command-line settings',
};
const sourceOf = (scope: string | null) =>
  scope ? (scopeLabels[scope] ?? `${scope} settings`) : '';

function openGuide(creator: Creator, resource: string) {
  void creator.action('open_setup_resource', { resource });
}

export function GitSettings({
  creator,
  env,
  draft,
  onDraft,
  mode,
  onMode,
  hideGitRow = false,
}: {
  creator: Creator;
  env: Environment;
  hideGitRow?: boolean;
  draft: IdentityDraft;
  onDraft: (draft: IdentityDraft) => void;
  mode: IdentityMode;
  onMode: (mode: IdentityMode) => void;
}) {
  const form = creator.form!;
  const detail = detailOf(env);
  const identity = detail.identity;
  const saved = creator.preferences?.identityOverride ?? null;
  const projectName = form.options.commitAuthorName?.trim() ?? '';
  const projectEmail = form.options.commitAuthorEmail?.trim() ?? '';
  const hasProjectIdentity = !!(projectName && projectEmail);
  const ready = env.identityReady || hasProjectIdentity || !!saved;
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [replaced, setReplaced] = useState('');
  const [error, setError] = useState<AppError | null>(null);

  const name = draft.name.trim();
  const email = draft.email.trim();
  const emailError = email && !validEmail(email) ? 'Enter an email like name@example.com' : '';
  const nameError =
    name.startsWith('-') || name.length > 100
      ? 'Use a name of up to 100 characters that does not start with a dash'
      : '';
  const canSave = !!name && !!email && !emailError && !nameError && !saving;

  const edit = (next: Partial<IdentityDraft>) => {
    onDraft({ ...draft, ...next });
    setStatus('');
    setReplaced('');
    setError(null);
  };
  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    setStatus('');
    setReplaced('');
    try {
      await action();
    } catch (value) {
      setError(appError(value));
    } finally {
      setSaving(false);
    }
  }
  const saveForProjects = () =>
    run(async () => {
      await creator.saveIdentity({ name, email });
      setStatus(
        `Saved. New Repo Creator projects will be signed as ${name} <${email}>. Your global Git settings were not changed.`,
      );
    });
  const removeSaved = () =>
    run(async () => {
      await creator.saveIdentity(null);
      onDraft({ name: '', email: '' });
      setStatus('Removed. Repo Creator will use your Git settings again.');
    });
  // The only call that writes global Git configuration. It runs from this explicit button.
  const saveGlobally = () =>
    run(async () => {
      const result = await creator.saveGlobalIdentity(name, email);
      if (result.previousName || result.previousEmail)
        setReplaced(
          `Replaced ${[result.previousName, result.previousEmail && `<${result.previousEmail}>`].filter(Boolean).join(' ')}.`,
        );
      setStatus(`Tested: commits will be signed as ${result.resolvedIdentity}`);
    });

  const globalName = identity.nameScope === 'global' ? identity.name : null;
  const globalEmail = identity.emailScope === 'global' ? identity.email : null;
  const stateMessage =
    detail.gitState === 'too-old'
      ? `Your Git${detail.gitVersion ? ` (${detail.gitVersion})` : ''} is older than ${MINIMUM_GIT}. Update Git, then select Recheck.`
      : env.identityReady && identity.email && !validEmail(identity.email)
        ? `The email Git has (${identity.email}) doesn’t look valid. Save a corrected one below.`
        : env.identityReady
          ? identity.resolves
            ? `Commits will be signed as ${identity.name} <${identity.email}>.`
            : `Git has ${identity.name} <${identity.email}>.`
          : identity.name && !identity.email
            ? 'Git has your name but no email.'
            : !identity.name && identity.email
              ? 'Git has your email but no name.'
              : 'Git doesn’t have a name or email yet.';

  return (
    <>
      {!hideGitRow && (
        <div className="setup-status-row">
          <div className="setup-tool-name">
            <Icon name="repo" size={18} />
            <div>
              <strong>Git</strong>
              <span>
                Version control · required for new projects
                {detail.gitVersion ? ` · version ${detail.gitVersion}` : ''}
              </span>
            </div>
          </div>
          <span className="setup-status" data-ready={env.gitInstalled && detail.gitState === 'ok'}>
            {!env.gitInstalled
              ? 'Not detected'
              : detail.gitState === 'too-old'
                ? 'Too old'
                : 'Installed'}
          </span>
          <button type="button" className="text-button" onClick={() => openGuide(creator, 'git')}>
            {!env.gitInstalled
              ? 'Install Git'
              : detail.gitState === 'too-old'
                ? 'Update Git'
                : 'Official guide'}
            <Icon name="external" size={12} />
          </button>
        </div>
      )}
      <div className="setup-identity">
        <div className="setup-section-heading">
          <h3>Commit identity</h3>
          <span className="setup-status" data-ready={ready}>
            {env.identityReady
              ? 'Git identity ready'
              : saved
                ? 'Repo Creator identity saved'
                : hasProjectIdentity
                  ? 'Project identity set'
                  : 'Needs a name & email'}
          </span>
        </div>
        <p className="help">
          Git records a name and email with every commit. They identify the author of the changes.
        </p>
        <p className="help" role="status">
          <strong>Name:</strong> {identity.name ?? 'not set'}
          {identity.name && identity.nameScope ? ` (${sourceOf(identity.nameScope)})` : ''}
          {' · '}
          <strong>Email:</strong> {identity.email ?? 'not set'}
          {identity.email && identity.emailScope ? ` (${sourceOf(identity.emailScope)})` : ''}
        </p>
        <p className="help">{stateMessage}</p>
        {saved && (
          <p className="help">
            Repo Creator projects will use {saved.name} &lt;{saved.email}&gt; (saved in Repo
            Creator).
          </p>
        )}
        {hasProjectIdentity && (
          <p className="help">
            This new project uses its own identity: {projectName} &lt;{projectEmail}&gt;.{' '}
            <button
              type="button"
              className="text-button"
              onClick={() =>
                creator.update('options', {
                  ...form.options,
                  commitAuthorName: '',
                  commitAuthorEmail: '',
                })
              }
            >
              Remove
            </button>
          </p>
        )}
        <fieldset className="setup-identity-choice">
          <legend>Where should this identity apply?</legend>
          <div className="visibility" role="radiogroup" aria-label="Where this identity applies">
            <label>
              <input
                type="radio"
                name="identity-scope"
                checked={mode === 'project'}
                onChange={() => onMode('project')}
              />
              Use only for Repo Creator projects
            </label>
            <label>
              <input
                type="radio"
                name="identity-scope"
                checked={mode === 'global'}
                onChange={() => onMode('global')}
              />
              Set as my Git default
            </label>
          </div>
          <p className="help">
            {mode === 'project'
              ? 'Saved in Repo Creator and applied inside each new project. Your global Git settings are not changed.'
              : 'Changes the name and email Git uses for all your projects on this computer.'}
          </p>
        </fieldset>
        <div className="two-columns">
          <div className="identity-field">
            <label className="field">
              <span>Name</span>
              <input
                value={draft.name}
                placeholder={identity.name || 'Your name'}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'identity-name-error' : undefined}
                onChange={(event) => edit({ name: event.target.value })}
              />
            </label>
            {nameError && (
              <span className="help" id="identity-name-error">
                {nameError}
              </span>
            )}
          </div>
          <div className="identity-field">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={draft.email}
                placeholder="author@example.com"
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'identity-email-error' : undefined}
                onChange={(event) => edit({ email: event.target.value })}
              />
            </label>
            {emailError && (
              <span className="help" id="identity-email-error">
                {emailError}
              </span>
            )}
          </div>
        </div>
        {mode === 'project' ? (
          <div className="inline-actions">
            <button type="button" className="primary" disabled={!canSave} onClick={saveForProjects}>
              {saving ? 'Saving…' : 'Save for Repo Creator projects'}
            </button>
            {saved && (
              <button type="button" disabled={saving} onClick={removeSaved}>
                Remove saved identity
              </button>
            )}
          </div>
        ) : (
          <div className="setup-global-confirm" role="group" aria-label="Change my Git default">
            <p className="help">This will run these commands:</p>
            <pre className="setup-command">
              {`git config --global user.name ${JSON.stringify(name || '…')}\ngit config --global user.email ${JSON.stringify(email || '…')}`}
            </pre>
            <p className="help">
              This edits{' '}
              {identity.globalConfigPath ? (
                <code>{identity.globalConfigPath}</code>
              ) : (
                'your global Git configuration file (usually .gitconfig in your home folder)'
              )}
              .
              {(globalName || globalEmail) &&
                ` It replaces ${[globalName, globalEmail && `<${globalEmail}>`].filter(Boolean).join(' ')}.`}
            </p>
            <div className="inline-actions">
              <button type="button" className="primary" disabled={!canSave} onClick={saveGlobally}>
                {saving ? 'Saving…' : 'Save to my Git configuration'}
              </button>
              <button type="button" disabled={saving} onClick={() => onMode('project')}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <strong>{error.message}</strong>
            <p>{error.guidance}</p>
          </div>
        )}
        {status && (
          <p className="notice" role="status">
            {status} {replaced}
          </p>
        )}
        <div className="setup-identity-note">
          <span>
            Projects published to GitHub use your GitHub private address as the author email.
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() => openGuide(creator, 'git-identity')}
          >
            Git identity help
            <Icon name="external" size={12} />
          </button>
        </div>
      </div>
    </>
  );
}

export function GithubSettings({ creator, env }: { creator: Creator; env: Environment }) {
  const detail = detailOf(env);
  const state = detail.githubState;
  const [connecting, setConnecting] = useState(false);
  // Zero until the first check; also stops a quick remount from checking twice.
  const lastCheck = useRef(0);
  const { refresh, checking } = creator;

  // Opening this tab always checks GitHub, even for a local project.
  useEffect(() => {
    const now = Date.now();
    if (lastCheck.current && now - lastCheck.current < 1000) return;
    lastCheck.current = now;
    void refresh(true);
  }, [refresh]);
  useEffect(() => {
    if (state === 'signed-in') setConnecting(false);
  }, [state]);
  // Returning from the sign-in terminal rechecks, at most once every three seconds.
  useEffect(() => {
    if (state !== 'signed-out' && state !== 'unverified') return;
    const onFocus = () => {
      const now = Date.now();
      if (checking || now - lastCheck.current < 3000) return;
      lastCheck.current = now;
      void refresh(true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [state, checking, refresh]);

  const message = !env.ghInstalled
    ? 'GitHub CLI isn’t installed. It’s optional: install it only to publish projects to GitHub.'
    : state === 'signed-in'
      ? `Connected as ${env.githubUser}`
      : connecting
        ? 'Waiting for you to finish signing in. Repo Creator checks again when you return to this window.'
        : state === 'unverified'
          ? 'Couldn’t reach GitHub to check your sign-in. Check your connection, then try again.'
          : state === 'signed-out'
            ? 'You’re not signed in to GitHub.'
            : 'Checking GitHub…';
  return (
    <>
      <div className="setup-status-row">
        <div className="setup-tool-name">
          <Icon name="github" size={18} />
          <div>
            <strong>GitHub CLI</strong>
            <span>Optional · publish repositories to GitHub</span>
          </div>
        </div>
        <span className="setup-status" data-ready={env.ghInstalled}>
          {env.ghInstalled ? 'Installed' : 'Not detected'}
        </span>
        <button type="button" className="text-button" onClick={() => openGuide(creator, 'gh')}>
          {env.ghInstalled ? 'Official guide' : 'Install GitHub CLI'}
          <Icon name="external" size={12} />
        </button>
      </div>
      <div className="setup-account">
        <h3>GitHub account</h3>
        <p role="status">{message}</p>
        {env.ghInstalled && (
          <p className="help">
            A terminal window will open and show a one-time code. Enter it on github.com, then
            return here.
          </p>
        )}
        <div className="inline-actions">
          {env.ghInstalled && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                void creator.connect().then((started) => setConnecting(started));
              }}
            >
              {state === 'signed-in' ? 'Connect another account' : 'Connect to GitHub'}
            </button>
          )}
          <button type="button" disabled={checking} onClick={() => void refresh(true)}>
            {state === 'unverified' ? 'Retry' : 'Check GitHub connection'}
          </button>
        </div>
      </div>
    </>
  );
}
