import { useRef, useState } from 'react';
import { detailOf } from '../blockers';
import {
  GitSettings,
  GithubSettings,
  type IdentityDraft,
  type IdentityMode,
} from '../SetupSections';
import type { Creator } from '../useCreator';
import { Banner, Button, Disclosure, StatusRow, type StatusState } from '../ui';
import { githubCliInstallHelp, gitInstallHelp, type InstallPlatform } from './installHelp';

/**
 * The first-run checklist, also used as Settings → Setup. Rows show only what is
 * left; each fix is the same component used elsewhere in Settings.
 */
export function SetupChecklist({
  creator,
  variant,
  onCreate,
  onAddExisting,
}: {
  creator: Creator;
  variant: 'first-run' | 'settings';
  onCreate?: () => void;
  onAddExisting?: () => void;
}) {
  const env = creator.environment;
  const saved = creator.preferences?.identityOverride ?? null;
  const skipped = !!creator.preferences?.onboarding?.githubSkipped;
  const platform: InstallPlatform = env?.platform ?? 'other';
  const [draft, setDraft] = useState<IdentityDraft>({
    name: saved?.name ?? '',
    email: saved?.email ?? '',
  });
  const [mode, setMode] = useState<IdentityMode>('project');
  const [open, setOpen] = useState<{ git: boolean; identity: boolean; github: boolean }>({
    git: false,
    identity: variant === 'first-run',
    github: false,
  });
  const identityRow = useRef<HTMLDivElement>(null);

  if (!env) {
    return (
      <section className="setup-checklist" aria-label="Setup checklist">
        {creator.checking ? (
          <p role="status">Checking your computer…</p>
        ) : (
          <Banner
            tone="warning"
            title="Couldn’t check"
            action={
              <Button size="compact" onClick={() => void creator.refresh(false)}>
                Retry
              </Button>
            }
          >
            Repo Creator could not look at your Git setup.
          </Banner>
        )}
      </section>
    );
  }

  const detail = detailOf(env);
  const gitOk = env.gitInstalled && detail.gitState === 'ok';
  const identityOk = gitOk && (env.identityReady || !!saved);
  const requiredMet = gitOk && identityOk;
  const gitHelp = gitInstallHelp(platform);
  const ghHelp = githubCliInstallHelp(platform);
  const identity = detail.identity;

  const gitState: StatusState = gitOk ? 'ok' : 'warning';
  const identityState: StatusState = identityOk ? 'ok' : gitOk ? 'warning' : 'neutral';
  const githubState: StatusState =
    detail.githubState === 'signed-in'
      ? 'ok'
      : detail.githubState === 'unverified'
        ? 'warning'
        : 'neutral';
  const githubDetail =
    detail.githubState === 'signed-in'
      ? `Connected as ${env.githubUser}`
      : detail.githubState === 'unverified'
        ? 'Couldn’t reach GitHub to check your sign-in'
        : !env.ghInstalled
          ? skipped
            ? 'Skipped. Projects stay on this computer.'
            : 'Optional. GitHub CLI isn’t installed.'
          : skipped
            ? 'Skipped. Projects stay on this computer.'
            : 'Optional. Not signed in.';

  return (
    <section className="setup-checklist" aria-label="Setup checklist">
      <h3 className="setup-checklist-group">Required</h3>
      <StatusRow
        state={gitState}
        title="Git is installed"
        detail={
          !env.gitInstalled
            ? 'Repo Creator uses Git to create your project. It isn’t installed.'
            : detail.gitState === 'too-old'
              ? `Your Git${detail.gitVersion ? ` (${detail.gitVersion})` : ''} is too old to name the first branch. Update Git.`
              : `Git ${detail.gitVersion ?? ''}`.trim()
        }
        action={
          !gitOk ? (
            <Button size="compact" onClick={() => setOpen({ ...open, git: !open.git })}>
              Show how
            </Button>
          ) : undefined
        }
      />
      {!gitOk && open.git && (
        <div className="setup-checklist-fix">
          <Button
            variant="primary"
            size="compact"
            icon="external"
            onClick={() => void creator.action('open_setup_resource', { resource: 'git' })}
          >
            Open the official Git download
          </Button>{' '}
          <Button size="compact" icon="refresh" onClick={() => void creator.refresh(false)}>
            Recheck
          </Button>
          {gitHelp && (
            <p className="help">
              Or copy a command: <code>{gitHelp.command}</code>{' '}
              <Button
                size="compact"
                variant="tertiary"
                onClick={() => void creator.copy(gitHelp.command)}
              >
                Copy
              </Button>
              <br />
              {gitHelp.note} Repo Creator never installs software for you.
            </p>
          )}
        </div>
      )}
      <div ref={identityRow}>
        <StatusRow
          state={identityState}
          title="Your commit identity"
          detail={
            identityOk
              ? env.identityReady
                ? `Commits will be signed as ${identity.name} <${identity.email}>`
                : `Repo Creator projects will use ${saved?.name} <${saved?.email}>`
              : gitOk
                ? 'Git needs a name and email to record who made each commit.'
                : 'Needs Git first.'
          }
          action={
            gitOk ? (
              <Button size="compact" onClick={() => setOpen({ ...open, identity: !open.identity })}>
                {identityOk ? 'Change' : 'Add'}
              </Button>
            ) : undefined
          }
        />
      </div>
      {gitOk && open.identity && (
        <div className="setup-checklist-fix">
          <GitSettings
            creator={creator}
            env={env}
            draft={draft}
            onDraft={setDraft}
            mode={mode}
            onMode={setMode}
            hideGitRow
          />
        </div>
      )}

      <h3 className="setup-checklist-group">Optional</h3>
      <StatusRow
        state={githubState}
        title="Publish to GitHub"
        detail={githubDetail}
        action={
          <>
            <Button size="compact" onClick={() => setOpen({ ...open, github: !open.github })}>
              {open.github ? 'Hide' : detail.githubState === 'signed-in' ? 'Details' : 'Connect…'}
            </Button>{' '}
            {variant === 'first-run' && detail.githubState !== 'signed-in' && !skipped && (
              <Button size="compact" variant="tertiary" onClick={() => void creator.skipGithub()}>
                Skip for now
              </Button>
            )}
          </>
        }
      />
      {open.github && (
        <div className="setup-checklist-fix">
          <GithubSettings creator={creator} env={env} />
          {ghHelp && !env.ghInstalled && (
            <p className="help">
              Install help: <code>{ghHelp.command}</code>{' '}
              <Button
                size="compact"
                variant="tertiary"
                onClick={() => void creator.copy(ghHelp.command)}
              >
                Copy
              </Button>
              <br />
              {ghHelp.note}
            </p>
          )}
        </div>
      )}
      <StatusRow
        state="neutral"
        title="Editors and AI tools"
        detail={[
          env.vscodeAvailable ? 'VS Code found' : 'VS Code not found',
          ...(env.optionalTools ?? []).map(
            (tool) => `${tool.name} ${tool.status === 'available' ? 'found' : 'not found'}`,
          ),
        ].join(' · ')}
      />

      {variant === 'settings' && (
        <Disclosure title="Details" summary="versions, paths and sources">
          <dl className="setup-details">
            <dt>Git</dt>
            <dd>{detail.gitVersion ?? 'not found'}</dd>
            <dt>Name</dt>
            <dd>
              {identity.name ?? 'not set'}
              {identity.nameScope ? ` (${identity.nameScope})` : ''}
            </dd>
            <dt>Email</dt>
            <dd>
              {identity.email ?? 'not set'}
              {identity.emailScope ? ` (${identity.emailScope})` : ''}
            </dd>
            <dt>Global Git settings file</dt>
            <dd>{identity.globalConfigPath ?? 'not found'}</dd>
            <dt>GitHub</dt>
            <dd>{detail.githubState}</dd>
          </dl>
        </Disclosure>
      )}

      {variant === 'first-run' ? (
        <div className="setup-checklist-actions">
          <Button
            variant="primary"
            size="large"
            reason={requiredMet ? undefined : 'Finish the required setup to continue.'}
            onClick={onCreate}
          >
            Create my first project
          </Button>
          <Button
            size="large"
            reason={requiredMet ? undefined : 'Finish the required setup to continue.'}
            onClick={onAddExisting}
          >
            Add an existing project
          </Button>
          {!requiredMet && (
            <p className="help" role="status">
              Finish{' '}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (gitOk) setOpen({ ...open, identity: true });
                  else setOpen({ ...open, git: true });
                  identityRow.current?.scrollIntoView?.({ block: 'center' });
                }}
              >
                {gitOk ? 'Your commit identity' : 'Git'}
              </button>{' '}
              to continue.
            </p>
          )}
        </div>
      ) : (
        <div className="setup-checklist-actions">
          <Button onClick={() => void creator.resetOnboarding()}>Run setup again</Button>
          <p className="help">
            Shows the welcome checklist on the next start. Nothing else is reset.
          </p>
        </div>
      )}
    </section>
  );
}
