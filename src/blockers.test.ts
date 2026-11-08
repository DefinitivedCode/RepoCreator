import { describe, expect, it } from 'vitest';
import {
  deriveBlockers,
  detailOf,
  isSetupBlocker,
  summarizeBlockers,
  validEmail,
  type BlockerId,
  type BlockerInput,
} from './blockers';
import type { Environment, GithubState } from './types';

type GitCase = 'ok' | 'missing' | 'old';
type IdentityCase =
  'ok' | 'invalid-but-set' | 'name-only' | 'email-only' | 'none' | 'bad-email-only';
type GithubCase = 'signed-in' | 'signed-out' | 'unverified' | 'cli-missing';

const identities: Record<
  IdentityCase,
  { name: string | null; email: string | null; ready: boolean }
> = {
  ok: { name: 'Ada', email: 'ada@example.invalid', ready: true },
  // Git has both values, so detection is ready even though the email is malformed.
  'invalid-but-set': { name: 'Ada', email: 'not-an-email', ready: true },
  'name-only': { name: 'Ada', email: null, ready: false },
  'email-only': { name: null, email: 'ada@example.invalid', ready: false },
  none: { name: null, email: null, ready: false },
  'bad-email-only': { name: null, email: 'not-an-email', ready: false },
};

function environment(git: GitCase, identity: IdentityCase, github: GithubCase): Environment {
  const who = identities[identity];
  const githubState: GithubState = github === 'cli-missing' ? 'cli-missing' : github;
  return {
    gitInstalled: git !== 'missing',
    gitState: git === 'missing' ? 'missing' : git === 'old' ? 'too-old' : 'ok',
    gitVersion: git === 'old' ? '2.20.0' : git === 'ok' ? '2.45.1' : null,
    identityReady: git !== 'missing' && who.ready,
    identityName: who.name,
    identity: {
      name: who.name,
      email: who.email,
      nameScope: who.name ? 'global' : null,
      emailScope: who.email ? 'global' : null,
      resolves: who.ready,
      emailValid: !!who.email && validEmail(who.email),
      globalConfigPath: null,
    },
    ghInstalled: github !== 'cli-missing',
    githubUser: github === 'signed-in' ? 'octocat' : null,
    githubOwners: github === 'signed-in' ? ['octocat'] : [],
    githubState,
    vscodeAvailable: false,
  };
}

function input(overrides: Partial<BlockerInput>): BlockerInput {
  return {
    environment: null,
    checking: false,
    picking: false,
    previewing: false,
    destination: 'local',
    hasLocation: true,
    formMessage: '',
    projectIdentity: false,
    savedIdentity: null,
    ...overrides,
  };
}

function expectedSetup(
  git: GitCase,
  identity: IdentityCase,
  destination: 'local' | 'github',
  github: GithubCase,
): BlockerId[] {
  const expected: BlockerId[] = [];
  if (git === 'missing') expected.push('git-missing');
  if (git === 'old') expected.push('git-old');
  if (git !== 'missing' && !identities[identity].ready) {
    if (identity === 'bad-email-only') expected.push('identity-invalid');
    else if (identity === 'name-only') expected.push('identity-email');
    else expected.push('identity-name');
  }
  if (destination === 'github') {
    if (github === 'cli-missing') expected.push('github-cli');
    else if (github === 'signed-out') expected.push('github-signin');
    else if (github === 'unverified') expected.push('github-unverified');
  }
  return expected;
}

describe('blocker derivation', () => {
  const gits: GitCase[] = ['ok', 'missing', 'old'];
  const githubs: GithubCase[] = ['signed-in', 'signed-out', 'unverified', 'cli-missing'];
  for (const git of gits)
    for (const identity of Object.keys(identities) as IdentityCase[])
      for (const destination of ['local', 'github'] as const)
        for (const github of githubs)
          it(`git ${git} · identity ${identity} · ${destination} · github ${github}`, () => {
            const blockers = deriveBlockers(
              input({ environment: environment(git, identity, github), destination }),
            );
            expect(blockers.map((blocker) => blocker.id)).toEqual(
              expectedSetup(git, identity, destination, github),
            );
            // Every setup blocker is actionable and names a fix.
            for (const blocker of blockers) {
              expect(blocker.required).toBe(true);
              expect(blocker.fix).toBeTruthy();
              expect(blocker.title.length).toBeGreaterThan(5);
            }
          });

  it('a local project is never blocked by GitHub, however GitHub looks', () => {
    for (const github of githubs) {
      const ids = deriveBlockers(
        input({ environment: environment('ok', 'ok', github), destination: 'local' }),
      ).map((blocker) => blocker.id);
      expect(ids).toEqual([]);
    }
  });

  it('an unverified sign-in is worded as unreachable, never as signed out or not connected', () => {
    const [blocker] = deriveBlockers(
      input({ environment: environment('ok', 'ok', 'unverified'), destination: 'github' }),
    );
    expect(blocker.id).toBe('github-unverified');
    expect(blocker.title).toBe('Couldn’t reach GitHub to check your sign-in');
    expect(blocker.fix).toEqual({ label: 'Retry', target: 'recheck' });
    expect(blocker.alternative?.target).toBe('switch-local');
    expect(JSON.stringify(blocker)).not.toMatch(/not connected|signed out|sign in/i);
  });

  it('names exactly what is missing and where the fix is', () => {
    const titles = Object.fromEntries(
      (['name-only', 'email-only', 'none'] as const).map((who) => [
        who,
        deriveBlockers(input({ environment: environment('ok', who, 'signed-in') }))[0],
      ]),
    );
    expect(titles['name-only'].title).toBe('Git needs your email to record commits');
    expect(titles['email-only'].title).toBe('Git needs your name to record commits');
    expect(titles.none.title).toBe('Git needs your name and email to record commits');
    expect(titles.none.fix?.target).toBe('settings-git');
  });

  it('a saved Repo Creator identity or a project identity satisfies the identity requirement', () => {
    const missing = environment('ok', 'none', 'signed-in');
    expect(deriveBlockers(input({ environment: missing })).map((b) => b.id)).toEqual([
      'identity-name',
    ]);
    expect(
      deriveBlockers(
        input({
          environment: missing,
          savedIdentity: { name: 'Ada', email: 'ada@example.invalid' },
        }),
      ),
    ).toEqual([]);
    expect(deriveBlockers(input({ environment: missing, projectIdentity: true }))).toEqual([]);
    // It never hides a missing Git, though.
    expect(
      deriveBlockers(
        input({
          environment: environment('missing', 'none', 'signed-in'),
          projectIdentity: true,
        }),
      ).map((b) => b.id),
    ).toEqual(['git-missing']);
  });

  it('keeps today’s readiness for states that were already decided', () => {
    // Ready: Git, identity and (when publishing) a signed-in GitHub account.
    expect(deriveBlockers(input({ environment: environment('ok', 'ok', 'signed-in') }))).toEqual(
      [],
    );
    expect(
      deriveBlockers(
        input({ environment: environment('ok', 'ok', 'signed-in'), destination: 'github' }),
      ),
    ).toEqual([]);
    // An unavailable inspection fails closed, with a way to retry.
    const [blocker] = deriveBlockers(input({ environment: null }));
    expect(blocker).toMatchObject({ id: 'setup-check', fix: { target: 'recheck' } });
    // While the first inspection runs, the wait is explained instead.
    expect(deriveBlockers(input({ environment: null, checking: true })).map((b) => b.id)).toEqual([
      'busy',
    ]);
  });

  it('puts what must be fixed before transient waiting, and counts several required items', () => {
    const blockers = deriveBlockers(
      input({
        environment: environment('missing', 'none', 'cli-missing'),
        destination: 'github',
        hasLocation: false,
        formMessage: 'Enter a project name.',
        previewing: true,
        checking: true,
      }),
    );
    expect(blockers.map((b) => b.id)).toEqual([
      'location',
      'git-missing',
      'github-cli',
      'form',
      'preview',
      'busy',
    ]);
    expect(summarizeBlockers(blockers).text).toBe('4 things to fix');
    expect(blockers.filter(isSetupBlocker).map((b) => b.id)).toEqual(['git-missing', 'github-cli']);
    const waiting = deriveBlockers(
      input({ environment: environment('ok', 'ok', 'signed-in'), previewing: true }),
    );
    expect(summarizeBlockers(waiting)).toMatchObject({ text: 'Updating generated files…' });
    expect(waiting[0].required).toBe(false);
    expect(summarizeBlockers([]).text).toBe('');
  });

  it('fills detail for older reports from the original fields', () => {
    const legacy: Environment = {
      gitInstalled: true,
      identityReady: false,
      ghInstalled: true,
      githubUser: null,
      githubOwners: [],
      identityName: null,
      vscodeAvailable: false,
    };
    expect(detailOf(legacy)).toMatchObject({ gitState: 'ok', githubState: 'signed-out' });
    expect(detailOf({ ...legacy, ghInstalled: false }).githubState).toBe('cli-missing');
    expect(detailOf({ ...legacy, githubUser: 'octocat' }).githubState).toBe('signed-in');
  });

  it('validates email structurally', () => {
    for (const good of ['a@b', 'ada@example.com'] as const) expect(validEmail(good)).toBe(true);
    for (const bad of ['', 'ada', '@x.com', 'ada@', 'a@b@c', 'a b@x.com'] as const)
      expect(validEmail(bad)).toBe(false);
  });
});
