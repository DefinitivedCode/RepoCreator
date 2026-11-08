# Redesign progress

Resumable log for the autonomous redesign run ([prompt](ui-redesign-autonomous-prompt.md), [phases spec](ui-redesign-phases-spec.md)). Update at the end of each phase. Nothing is merged; PRs must be merged in stack order.

## Stack

| Phase                                      | Branch                                                                                                                                      | Base                          | PR                                                            | Status                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------- | --------------------------- |
| 1 Setup correctness                        | `fix/setup-correctness` (kept; the prompt's suggested `redesign/phase-1-setup-correctness` was not used because work was already open here) | `main`                        | [#21](https://github.com/DefinitivedCode/RepoCreator/pull/21) | Verified, PR open, unmerged |
| 0 Baseline                                 | `redesign/phase-0-baseline`                                                                                                                 | `fix/setup-correctness`       | [#22](https://github.com/DefinitivedCode/RepoCreator/pull/22) | Verified, PR open, unmerged |
| 2 Tokens and primitives                    | `redesign/phase-2-tokens`                                                                                                                   | `redesign/phase-0-baseline`   | [#23](https://github.com/DefinitivedCode/RepoCreator/pull/23) | Verified, PR open, unmerged |
| 3 Shell and navigation                     | `redesign/phase-3-shell`                                                                                                                    | `redesign/phase-2-tokens`     | [#24](https://github.com/DefinitivedCode/RepoCreator/pull/24) | Verified, PR open, unmerged |
| 4 Onboarding                               | `redesign/phase-4-onboarding`                                                                                                               | `redesign/phase-3-shell`      | [#25](https://github.com/DefinitivedCode/RepoCreator/pull/25) | Verified, PR open, unmerged |
| 5a Result pane and drawer                  | `redesign/phase-5a-layout`                                                                                                                  | `redesign/phase-4-onboarding` | [#26](https://github.com/DefinitivedCode/RepoCreator/pull/26) | Verified, PR open, unmerged |
| 5b–5c New Project sections and create flow | `redesign/phase-5b-sections`, then `redesign/phase-5c-create-flow`                                                                          | `redesign/phase-5a-layout`    | —                                                             | Not started                 |
| 6 Projects, workspace, presets             | `redesign/phase-6-workspace`                                                                                                                | phase 5                       | —                                                             | Not started                 |
| 7 Settings and polish                      | `redesign/phase-7-settings`                                                                                                                 | phase 6                       | —                                                             | Not started                 |
| 8 Accessibility                            | `redesign/phase-8-accessibility`                                                                                                            | phase 7                       | —                                                             | Not started                 |

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

## Phase 3 — verification (Windows 11 only)

`check` pass; `format:check` pass; `npm test` 328 passed (new `route.test.ts`); `npm run test:ui` 185 passed, 2 skipped (opt-in baseline) in the final run (earlier runs each had one load flake in `project-workspace.spec.ts`/`creation-refinement.spec.ts`/`ui-kit.spec.ts` that passed on repeat); `cargo fmt`/`clippy -D warnings` pass; `cargo test --locked` 147 passed. New `tests/shell.spec.ts`: 20 passed. Native smoke on a rebuilt debug exe with empty `HOME`: pass. Screenshots at 820×580 and 1100×740 viewed for the sidebar and icon rail.

Changed existing tests (all intentional): `.app-header` → `.app-sidebar` (appearance, updates, native scripts, public-screenshots); workspace/file/agent tab selectors `group`+`button` → `tablist`+`tab` (fixtures, project-workspace, native scripts); two `aria-pressed` assertions on converted tabs → `aria-selected`; `ui-polish` widens the viewport to 1440 before using the context panel (it now needs 1250px beside the sidebar). Test strings and nav labels (`New Project`, `Projects`, `Presets`, `Settings`) are unchanged.

Decisions: width media queries in the existing stylesheets became container queries on the content region (`@container app`), so each screen keeps the width logic it had; `:root` variables inside them moved to `.app-content`; the two `900px` rules became `880px` so the default window (content exactly 900px) keeps its previous layout. Not done in Phase 3: the Settings tablist and the Technology category list still use their own markup; the first-time update notice remains the existing dismissible aside plus a new sidebar line; the breadcrumb is a labelled back link ("Projects") rather than "Projects / name" (the name is the page heading).

## Phase 4 — verification (Windows 11 only)

`check` pass; `format:check` pass; `npm test` 328 passed; `npm run test:ui` 204 passed, 2 skipped (opt-in baseline), including 18 new `onboarding.spec.ts` tests (both themes); `cargo fmt`/`clippy -D warnings` pass; `cargo test --locked` 151 passed (4 new). Native smoke on a rebuilt debug exe (empty `HOME`) passes. A manual real-app check (fresh data dir, empty `HOME`): welcome checklist shown with no sidebar, Create disabled until an identity is saved, then enabled and onboarding recorded; isolated global config stayed empty. I viewed a first-run screenshot at 1100×740 (the 820×580 layout is asserted by a test for no horizontal scroll and a reachable last action, not viewed).

[Q] findings: Git for Windows' page lists `winget install --id Git.Git -e` but warns the winget package is not the official build, so the official download is offered first; GitHub CLI is `winget install --id GitHub.cli --source winget` (cli/cli install_windows.md) and `brew install gh` (cli.github.com); macOS `xcode-select --install` wording was not re-verified against Apple's docs. `SETTINGS_VERSION` stays 5 (same precedent as `updates` and `identityOverride`).

Changed existing tests: `appearance.spec` expects Settings tab wrap-around to pass through the new Setup tab; native scripts seed completed onboarding in the preferences they write; the shared fixture defaults to completed onboarding (first-run specs set `window.testOnboarding`).

Not done / limits: the focus recheck on the first-run page is implemented but not covered by a test; connecting-flow auto-recheck every 3 s for 2 minutes with a Cancel button is not implemented beyond Phase 1's focus recheck; no keyboard-only completion test; macOS untested.

## Phase 5a — verification (Windows 11 only)

`check` pass; `format:check` pass; `npm test` 328; `npm run test:ui` 212 passed, 2 skipped (opt-in baseline) incl. 7 new `result-pane.spec.ts` tests; `cargo fmt`/`clippy` pass; `cargo test --locked` 151. Viewed screenshots: drawer at 820×580 and pane at 1440×900. Native smoke not re-run (no native or Rust change since Phase 4).

Scope actually delivered: the existing context panel is the Result pane and gains a **First commit** summary (branch, message, author: project identity > saved Repo Creator identity > detected Git identity; GitHub shows "your GitHub private address"), a **Handoff prompt** button (opens `HandoffPanel` in a dialog; [Q] answered: `HandoffPanel` needs the live form, files and result, so it cannot simply move to the workspace), and a **Preview files (N)** bottom drawer below the pane's 1250px window breakpoint. The footer grid and every existing test are unchanged.

Not delivered from the spec's 5a: the new single `NewProject` page (recipe column plus always-visible pane), the constant "Create project" label (the Review step and the "Review project" button remain), and a file _tree_ (the list is flat). These belong with 5b/5c because the Review step and the rail are removed together.

## Blockers

None open.

## Next step

Run stopped cleanly after Phase 5a because of working-budget limits, not a blocker. Resume by re-sending the autonomous prompt.

1. `git checkout redesign/phase-5a-layout && git checkout -b redesign/phase-5b-sections`.
2. 5b: single scrolling New Project page with a sticky section index (Name & location, Starting point, Files, AI agents, Destination) and Customize disclosures (use `Disclosure` from `src/ui`); remove the rail and the Simple/Advanced switch while keeping the stored `experienceMode` (reinterpret as "start Customize regions expanded"; add the toggle to Settings → General). This will change many existing specs (`navigate()`/`fileTab()`/`agentTab()` helpers in `tests/fixtures.ts`, `creation-refinement`, `file-editor`, `agent-studio`, `ui`); change them through those helpers where possible and list every changed assertion in the PR.
3. 5c: blocker popover from the `aria-disabled` Create button (reuse `creator.blockers`), confirmation sheet only for GitHub or Public (new `Dialog`), vertical stage list from `repo-progress`, success screen actions including Handoff prompt.
4. Then Phases 6–8. Facts: baseline capture is `REPO_CREATOR_BASELINE=1 REPO_CREATOR_BASELINE_DIR=<dir> npx playwright test tests/baseline.spec.ts`; native smoke needs a debug build and an empty `HOME`; write multi-line scripts with the file tool (shell heredocs with many quotes fail here); occasional load flakes in `project-workspace.spec.ts`; existing specs default to completed onboarding via the shared fixture.

## Final deliverables still owed after Phase 8

`docs/redesign-summary.md` (criteria 1–25 with evidence or an honest untested/unmet) and the final report.
