# Redesign progress

Resumable log for the autonomous redesign run ([prompt](ui-redesign-autonomous-prompt.md), [phases spec](ui-redesign-phases-spec.md)). Update at the end of each phase. Nothing is merged; PRs must be merged in stack order.

## Stack

| Phase                          | Branch                                                                                                                                      | Base                        | PR                                                            | Status                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------- | --------------------------- |
| 1 Setup correctness            | `fix/setup-correctness` (kept; the prompt's suggested `redesign/phase-1-setup-correctness` was not used because work was already open here) | `main`                      | [#21](https://github.com/DefinitivedCode/RepoCreator/pull/21) | Verified, PR open, unmerged |
| 0 Baseline                     | `redesign/phase-0-baseline`                                                                                                                 | `fix/setup-correctness`     | [#22](https://github.com/DefinitivedCode/RepoCreator/pull/22) | Verified, PR open, unmerged |
| 2 Tokens and primitives        | `redesign/phase-2-tokens`                                                                                                                   | `redesign/phase-0-baseline` | [#23](https://github.com/DefinitivedCode/RepoCreator/pull/23) | Verified, PR open, unmerged |
| 3 Shell and navigation         | `redesign/phase-3-shell`                                                                                                                    | phase 2                     | —                                                             | Not started                 |
| 4 Onboarding                   | `redesign/phase-4-onboarding`                                                                                                               | phase 3                     | —                                                             | Not started                 |
| 5 New Project                  | `redesign/phase-5-new-project`                                                                                                              | phase 4                     | —                                                             | Not started                 |
| 6 Projects, workspace, presets | `redesign/phase-6-workspace`                                                                                                                | phase 5                     | —                                                             | Not started                 |
| 7 Settings and polish          | `redesign/phase-7-settings`                                                                                                                 | phase 6                     | —                                                             | Not started                 |
| 8 Accessibility                | `redesign/phase-8-accessibility`                                                                                                            | phase 7                     | —                                                             | Not started                 |

## Phase 1 — verification (Windows 11 only)

| Check                                                                        | Result                                                                                                                                                    |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                              | pass                                                                                                                                                      |
| `npm run format:check`                                                       | pass once the redesign docs are formatted (they were untracked and unformatted before this commit)                                                        |
| `npm test`                                                                   | 302 passed                                                                                                                                                |
| `npm run test:ui`                                                            | 144 passed (an earlier run had one unrelated `project-workspace` flake under parallel load; it passes alone and serially)                                 |
| `cargo fmt --check`, `clippy -D warnings`                                    | pass                                                                                                                                                      |
| `cargo test --locked`                                                        | 147 passed                                                                                                                                                |
| Native smoke (debug build, empty `HOME`)                                     | pass                                                                                                                                                      |
| Manual no-identity check, real debug app, isolated data dir and empty `HOME` | Original failure reproduced; footer, native error and fix correct; creation succeeds after saving an identity; isolated global config untouched (0 bytes) |

Not tested: macOS, release/installer builds, a real signed-out `gh api user`, a real Git-default write in the live app, workspace native smoke.

### Phase 1 spec audit

All seven work items, tests and docs are implemented. Deliberate additions and deviations are listed in the PR description (Git older than 2.28 blocks; `setup-check` blocker; `recheck` fix; `alternative` fix; `globalConfigPath`).

### [Q] sources

- `git config --show-scope` added in Git 2.26: <https://github.blog/open-source/git/highlights-from-git-2-26/>
- `git init --initial-branch` added in Git 2.28: <https://git-scm.com/docs/git-init/2.28.0>
- `gh` exit code 4 means authentication required: <https://cli.github.com/manual/gh_help_exit-codes>. Not verified for `gh api user` when signed out (would need a real GitHub call); ambiguous failures stay `Unverified`.
- `SETTINGS_VERSION` stays 5, following `updates` and `specialistLibrary`.

## Phase 0 — verification (Windows 11 only)

`check` pass; `format:check` pass; `npm test` 302 passed; `npm run test:ui` 144 passed, 2 skipped (the opt-in baseline spec); `cargo fmt`/`clippy -D warnings` pass; `cargo test --locked` 147 passed. Added `tests/baseline.spec.ts` (172 screenshots captured, gaps in [redesign-baseline.md](redesign-baseline.md)), `scripts/audit-styles.mjs` (+ node tests), `npm run lint:styles` (report-only) and `audit:styles`, and the baseline doc. No product change. Axe is not a dependency; recorded as a gap, not added.

## Phase 2 — verification (Windows 11 only)

`check` (tsc + gated style lint) pass; `format:check` pass; `npm test` 323 passed (new `tokens.test.ts`: 6 accents plus awkward custom colours × 2 themes); `npm run test:ui` 166 passed, 2 skipped (opt-in baseline); node tests for the audit script 3 passed; `cargo fmt`/`clippy -D warnings` pass; `cargo test --locked` 147 passed. New `tests/ui-kit.spec.ts`: 22 passed (both themes).

No-regression evidence: the baseline was recaptured on this branch (`REPO_CREATOR_BASELINE_DIR=artifacts/redesign-phase2`) and all 172 PNGs are byte-identical to Phase 0. Kitchen sink: tree-shaken from the production build (no matching strings in `dist/`); reachable only in `npm run dev` at `/?kitchen-sink`.

Decisions: tokens.css does not redefine variable names the old styles use (`--surface`, `--text`, `--background`, `--primary`, `--radius`, `--motion`), so no alias layer was needed and nothing changed visually; those take new values during migration (Phases 3–7). `--motion` (160ms) already existed and is reused. Primitives were not wired into existing screens (Phase 3 does that), and no component-test library was added (Playwright against the kitchen sink instead).

## Blockers

None open.

## Next step

Phase 3: create `redesign/phase-3-shell` from `redesign/phase-2-tokens`.
