import type {
  Destination,
  Environment,
  GitState,
  GithubState,
  IdentityOverride,
  IdentityReport,
} from './types';

export type BlockerId =
  | 'setup-check'
  | 'git-missing'
  | 'git-old'
  | 'identity-name'
  | 'identity-email'
  | 'identity-invalid'
  | 'github-cli'
  | 'github-signin'
  | 'github-unverified'
  | 'location'
  | 'form'
  | 'preview'
  | 'busy';

export type FixTarget =
  'settings-git' | 'settings-github' | 'choose-location' | 'switch-local' | 'recheck';

export interface Fix {
  label: string;
  target: FixTarget;
}

export interface Blocker {
  id: BlockerId;
  /** Plain language: what is wrong. */
  title: string;
  fix?: Fix;
  /** A second way out, for example publishing locally instead of to GitHub. */
  alternative?: Fix;
  /** False for transient waiting states that need no action from the person. */
  required: boolean;
}

/** The oldest Git that supports `git init --initial-branch`, used by project creation. */
export const MINIMUM_GIT = '2.28';

const setupIds: readonly BlockerId[] = [
  'setup-check',
  'git-missing',
  'git-old',
  'identity-name',
  'identity-email',
  'identity-invalid',
  'github-cli',
  'github-signin',
  'github-unverified',
];
/** Git and a commit identity: what first-run setup requires (GitHub is optional). */
const requiredIds: readonly BlockerId[] = [
  'setup-check',
  'git-missing',
  'git-old',
  'identity-name',
  'identity-email',
  'identity-invalid',
];
export const requiredSetupMet = (blockers: Blocker[]) =>
  !blockers.some((blocker) => requiredIds.includes(blocker.id));
export const isSetupBlocker = (blocker: Blocker) => setupIds.includes(blocker.id);

/** A structural check only; the native side enforces the same rule for saved values. */
export function validEmail(email: string): boolean {
  const at = email.indexOf('@');
  return (
    at > 0 &&
    at < email.length - 1 &&
    email.indexOf('@', at + 1) === -1 &&
    !/\s/.test(email) &&
    email.length <= 254
  );
}

export interface EnvironmentDetail {
  gitState: GitState;
  gitVersion: string | null;
  identity: IdentityReport;
  githubState: GithubState;
}

/**
 * Fills detail that older native reports and test fixtures do not carry from the
 * original fields, so every consumer sees one complete shape.
 */
export function detailOf(env: Environment): EnvironmentDetail {
  const derivedEmail = env.identityReady ? 'configured' : null;
  return {
    gitState: env.gitState ?? (env.gitInstalled ? 'ok' : 'missing'),
    gitVersion: env.gitVersion ?? null,
    identity: env.identity ?? {
      name: env.identityName ?? (env.identityReady ? 'configured' : null),
      email: derivedEmail,
      nameScope: null,
      emailScope: null,
      resolves: env.identityReady,
      emailValid: env.identityReady,
      globalConfigPath: null,
    },
    githubState:
      env.githubState ??
      (env.githubUser ? 'signed-in' : env.ghInstalled ? 'signed-out' : 'cli-missing'),
  };
}

export interface BlockerInput {
  environment: Environment | null;
  checking: boolean;
  picking: boolean;
  previewing: boolean;
  destination: Destination;
  hasLocation: boolean;
  /** The first form or preview error, if any. */
  formMessage: string;
  /** The project-specific commit author in the form, if both parts are filled in. */
  projectIdentity: boolean;
  /** The identity saved for Repo Creator projects. */
  savedIdentity: IdentityOverride | null | undefined;
}

export function identityTitle(identity: IdentityReport): string {
  if (identity.name && !identity.email) return 'Git needs your email to record commits';
  if (!identity.name && identity.email) return 'Git needs your name to record commits';
  return 'Git needs your name and email to record commits';
}

/** Why the project cannot be created yet, most important first. Empty means ready. */
export function deriveBlockers(input: BlockerInput): Blocker[] {
  const blockers: Blocker[] = [];
  const env = input.environment;
  const alternative: Fix = { label: 'Use a local project instead', target: 'switch-local' };

  if (!input.hasLocation) {
    blockers.push({
      id: 'location',
      title: 'Choose a save location.',
      fix: { label: 'Choose folder', target: 'choose-location' },
      required: true,
    });
  }
  if (!env) {
    // While the first check runs the transient state below explains the wait.
    if (!input.checking) {
      blockers.push({
        id: 'setup-check',
        title: 'Couldn’t check your setup',
        fix: { label: 'Check again', target: 'recheck' },
        required: true,
      });
    }
  } else {
    const detail = detailOf(env);
    if (!env.gitInstalled) {
      blockers.push({
        id: 'git-missing',
        title: 'Git isn’t installed',
        fix: { label: 'Install Git', target: 'settings-git' },
        required: true,
      });
    } else {
      if (detail.gitState === 'too-old') {
        blockers.push({
          id: 'git-old',
          title: `Your Git${detail.gitVersion ? ` (${detail.gitVersion})` : ''} is too old; Repo Creator needs ${MINIMUM_GIT} or newer`,
          fix: { label: 'Update Git', target: 'settings-git' },
          required: true,
        });
      }
      const identityReady = env.identityReady || input.projectIdentity || !!input.savedIdentity;
      if (!identityReady) {
        const identity = detail.identity;
        if (identity.email && !validEmail(identity.email)) {
          blockers.push({
            id: 'identity-invalid',
            title: 'The email address Git has doesn’t look valid',
            fix: { label: 'Fix email', target: 'settings-git' },
            required: true,
          });
        } else {
          blockers.push({
            // The first missing item names the blocker; the title says whether both are missing.
            id: identity.name ? 'identity-email' : 'identity-name',
            title: identityTitle(identity),
            fix: {
              label: identity.name || identity.email ? 'Add it' : 'Add name and email',
              target: 'settings-git',
            },
            required: true,
          });
        }
      }
    }
    if (input.destination === 'github') {
      if (!env.ghInstalled) {
        blockers.push({
          id: 'github-cli',
          title: 'GitHub CLI isn’t installed',
          fix: { label: 'Set up GitHub', target: 'settings-github' },
          alternative,
          required: true,
        });
      } else if (!env.githubUser) {
        if (detail.githubState === 'unverified') {
          blockers.push({
            id: 'github-unverified',
            title: 'Couldn’t reach GitHub to check your sign-in',
            fix: { label: 'Retry', target: 'recheck' },
            alternative,
            required: true,
          });
        } else {
          blockers.push({
            id: 'github-signin',
            title: 'Sign in to GitHub to publish',
            fix: { label: 'Sign in', target: 'settings-github' },
            alternative,
            required: true,
          });
        }
      }
    }
  }
  if (input.formMessage) {
    blockers.push({ id: 'form', title: input.formMessage, required: true });
  }
  if (input.previewing) {
    blockers.push({ id: 'preview', title: 'Updating generated files…', required: false });
  }
  if (input.picking) {
    blockers.push({ id: 'busy', title: 'Finish the open dialog.', required: false });
  } else if (input.checking) {
    blockers.push({ id: 'busy', title: 'Checking setup…', required: false });
  }
  return blockers;
}

/** The text a person should see: the first blocker, or a count when several need action. */
export function summarizeBlockers(blockers: Blocker[]): { text: string; first?: Blocker } {
  const required = blockers.filter((blocker) => blocker.required);
  if (required.length > 1) return { text: `${required.length} things to fix`, first: required[0] };
  const first = required[0] ?? blockers[0];
  return { text: first?.title ?? '', first };
}
