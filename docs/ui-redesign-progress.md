# Redesign progress

Resumable log for the autonomous redesign run ([prompt](ui-redesign-autonomous-prompt.md), [phases spec](ui-redesign-phases-spec.md)). Update at the end of each phase. Nothing is merged; PRs must be merged in stack order.

## Stack

| Phase                                          | Branch                                                                                                                                      | Base                            | PR                                                            | Status                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------- | --------------------------- |
| 1 Setup correctness                            | `fix/setup-correctness` (kept; the prompt's suggested `redesign/phase-1-setup-correctness` was not used because work was already open here) | `main`                          | [#21](https://github.com/DefinitivedCode/RepoCreator/pull/21) | Verified, PR open, unmerged |
| 0 Baseline                                     | `redesign/phase-0-baseline`                                                                                                                 | `fix/setup-correctness`         | [#22](https://github.com/DefinitivedCode/RepoCreator/pull/22) | Verified, PR open, unmerged |
| 2 Tokens and primitives                        | `redesign/phase-2-tokens`                                                                                                                   | `redesign/phase-0-baseline`     | [#23](https://github.com/DefinitivedCode/RepoCreator/pull/23) | Verified, PR open, unmerged |
| 3 Shell and navigation                         | `redesign/phase-3-shell`                                                                                                                    | `redesign/phase-2-tokens`       | [#24](https://github.com/DefinitivedCode/RepoCreator/pull/24) | Verified, PR open, unmerged |
| 4 Onboarding                                   | `redesign/phase-4-onboarding`                                                                                                               | `redesign/phase-3-shell`        | [#25](https://github.com/DefinitivedCode/RepoCreator/pull/25) | Verified, PR open, unmerged |
| 5a Result pane and drawer                      | `redesign/phase-5a-layout`                                                                                                                  | `redesign/phase-4-onboarding`   | [#26](https://github.com/DefinitivedCode/RepoCreator/pull/26) | Verified, PR open, unmerged |
| 5c Create flow (confirmation, blocker popover) | `redesign/phase-5c-create-flow`                                                                                                             | `redesign/phase-5a-layout`      | [#27](https://github.com/DefinitivedCode/RepoCreator/pull/27) | Verified, PR open, unmerged |
| 5b Unified wording, no mode switch (partial)   | `redesign/phase-5b-sections`                                                                                                                | `redesign/phase-5c-create-flow` | [#28](https://github.com/DefinitivedCode/RepoCreator/pull/28) | Verified, PR open, unmerged |
| 6 Projects, workspace, presets (partial)       | `redesign/phase-6-workspace`                                                                                                                | `redesign/phase-5b-sections`    | [#29](https://github.com/DefinitivedCode/RepoCreator/pull/29) | Verified, PR open, unmerged |
| 7 Settings and polish                          | `redesign/phase-7-settings`                                                                                                                 | `main` (phases 1–6 merged)      | pending                                                       | Verified, PR open, unmerged |
| 8 Accessibility                                | `redesign/phase-8-accessibility`                                                                                                            | `redesign/phase-7-settings`     | pending                                                       | Verified, PR open, unmerged |

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

## Phase 5c — verification (Windows 11 only)

`check` pass; `format:check` pass; `npm test` 328; `npm run test:ui` 220 passed, 2 skipped (opt-in baseline) incl. 8 new `create-flow.spec.ts` tests; `cargo fmt`/`clippy` pass; `cargo test --locked` 151; native smoke on a rebuilt debug exe (empty `HOME`) pass. Viewed the blocker popover at 1100×740; the confirmation sheet screenshot caught the dialog mid-fade, so its content is covered by tests rather than by eye.

Delivered: the Create button is `aria-disabled` (focusable, inert) and opens a "To create this project" popover with a fix per blocker (Escape closes and returns focus); a confirmation sheet appears **only** for GitHub destinations (names `owner/name`, visibility with a public warning, branch; Cancel is first and focused; Cancel or Escape creates nothing). Already present and unchanged: the vertical stage list driven by `repo-progress`, and the success screen with Open Folder / VS Code / GitHub / project launcher / Create Another and an AI Project Handoff section.

Order note: 5c was done before 5b because the create-flow pieces are independent of the page rewrite. 5c is based on 5a.

Changed existing tests: the shared `createProject` helper confirms the GitHub sheet when it appears (it waits for the sheet or the progress heading).

**5b is deferred, not dropped.** Why: the single scrolling page, removal of the rail and of the Simple/Advanced switch, and Customize disclosures would rewrite 100+ assertions, because the UI text itself differs by mode (for example "On this computer" vs "Local only", "What are you making?" vs "Description") and 18 tests click the mode switch. Doing it safely needs one coordinated change plus test helper rewrites (`navigate`, `fileTab`, `agentTab`, `createProject` already centralise most usage). Recommendation: do it as its own PR on top of 5c, keep the stored `experienceMode` key, and decide whether mode-dependent wording should be unified first (a maintainer decision, see below).

## Phase 5b — verification (Windows 11 only)

`check` pass; `format:check` pass; `npm test` 328; `npm run test:ui` 220 passed, 2 skipped (opt-in baseline); `cargo fmt`/`clippy` pass; `cargo test --locked` 151; native smoke on a rebuilt debug exe (empty `HOME`) pass.

Decision taken (yours): **unify the wording**. Both modes now read: Description, Starting point, Destination, On this computer, GitHub. Delivered: the Simple/Advanced switch is removed from the New Project page; Project Files and AI Agents, "Reset configuration", "More…" (multiple assistants) and all project-brief fields are available to everyone; `experienceMode` (stored key unchanged) is now Settings → General → "Show advanced options by default" and only sets how much detail pickers such as the technology selector show at first.

Changed existing tests (all intentional): wording (`Local only`→`On this computer`, `Computer and GitHub`→`GitHub`, `Project preset`→`Starting point`, `What are you making?`→`Description`); switch clicks replaced by a `setMode` helper (`tests/fixtures.ts`, `tests/mode.mjs`) that uses Settings → General; `ui.spec` no longer expects Project Files hidden in Simple mode (it is now visible by design); `appearance.spec` tab wrap-around includes General; native scripts updated (the old switch also returned to Overview, now explicit).

**Still not delivered from the spec's 5b:** the single scrolling page with a sticky section index and per-section Customize disclosures (the rail with section views remains), and Customize regions that start expanded in advanced mode. An attempt to open the project brief by default in advanced mode was reverted because it broke the existing zero-scroll guarantee at 1100×740; the general approach for expanded Customize regions should be designed together with the single-page layout.

## Phase 6 — verification (Windows 11 only)

`check` pass; `format:check` pass; notices check pass; `npm test` 331 (3 new `middleTruncate` tests); `npm run test:ui` 232 passed, 2 skipped (opt-in baseline) incl. 2 new library tests in `project-workspace.spec.ts` and 8 new `presets.spec.ts` tests; `cargo fmt`/`clippy` pass; `cargo test --locked` 151; **native workspace smoke** on a rebuilt debug exe (empty `HOME`) pass after two script fixes (below). Presets page screenshot viewed at 1100×740.

Delivered:

1. **Split** `ProjectWorkspace.tsx` (1,839 lines) into `src/workspace/{Library,Workspace,Tools,Settings,Commands,shared}` with no behaviour change, in its own commit; the full browser suite was unchanged (220 passed) before anything was restyled.
2. **Library:** the pin is an icon (no ★/☆ glyphs, still a toggle), middle-truncated path with the full value in the title and a copy button, branch shown, **New project** action, arrow-key navigation between projects, and **Remove from history** now asks first ("The folder on disk is kept"; Cancel is the default focus). Search, sort and distinct empty states already existed.
3. **Presets page:** one-sentence explanation, **Yours** and **Built-in** sections, **Use preset**, **Duplicate** (unique "copy" names) and **Delete** (custom only, confirmed). Editing remains in the existing preset manager, unchanged. The all-caps eyebrow is gone from this page.

Changed existing tests: the remove-from-history flow now confirms; `native-workspace-smoke.mjs` uses tab selectors for the workspace tabs (they became tabs in Phase 3) and seeds `accent: 'teal'` (my Phase 4 seeding made the file look like an older install, which keeps the legacy copper accent).

**Not delivered from the spec's Phase 6:** the workspace header "Open in…" split button replacing the Open tab; moving launcher configuration to Project Settings → Tools; the Handoff workspace tab; definition-list Overview with expandable technology evidence; Commands list with one primary action plus a menu for Edit/Delete/reorder and a run-history list; Readiness grouping into Needs attention / Passing / Not run with a single Run checks; Edit on the Presets page opening that specific preset. These are each their own change to command and readiness behaviour that needs careful tests; recorded for a follow-up.

## Phase 7 — verification (Windows 11 only)

`check` (tsc + repo-wide style gate) pass; `format:check` pass; `npm test` 331; audit-script node tests 6 passed; `npm run test:ui` 238 passed, 2 skipped (opt-in baseline) incl. 3 new `polish.spec.ts` tests (both themes). No Rust or native change, so cargo and native smoke were not re-run. Viewed Settings → Appearance and New Project at 1100×740 (light); other sizes and dark theme are asserted by tests, not viewed.

Delivered: (6a) every left accent bar / inset stripe on a selected item is gone (sidebar item, New Project rail, assistant option, legacy rail rule in `workspace.css`), selected items use tint + weight; (5) `lint:styles` is now a repo-wide gate for font-size < 12px, radii outside 6/8/999 (0 and % allowed), side stripes on selected selectors, all-caps text and `aria-pressed` on navigation markup; 94 sub-12px sizes became 12px and 56 radii snapped to 6px (9px → 8px); the "PROJECT SETUP" eyebrow is sentence case; (1) Settings content is one 720px measure and readiness is stated once (the duplicate line in the panel summary is gone).

Changed existing tests: none. Added: `tests/polish.spec.ts` (no stripe via computed shadow and border, 720px panels, status once, no text under 12px or uppercase), node tests for the new lint rules.

**Not delivered from the spec's Phase 7:** raw colour literals in the legacy stylesheets are still outside the gate (126 distinct literals; the gate covers `src/ui` and `tokens.css`) and the alias variables were not removed; Updates download/install progress is not yet a `StatusRow` (existing controls and tests kept); the Settings tabs keep the seven existing tabs (Git & identity, GitHub, Development tools, Appearance, Updates, Setup, General) rather than the four in the spec, because Git identity and GitHub controls have no other home; the Appearance theme/accent controls keep their radio-card markup (no segmented control); the global loading skeleton and inline error `message`+`guidance` placement from G9 were not reworked; the button-variant audit across old screens was not done beyond the stripe fix.

## Phase 8 — verification (Windows 11 only)

`npm run check`, `format:check`, `npm test` 331 and `npm run test:ui` 264 passed (2 skipped opt-in baseline) incl. 26 new `accessibility.spec.ts` tests; no Rust or native change. Delivered: `tests/accessibility.spec.ts` (DOM checks for names, label associations, duplicate ids, `aria-describedby`/`aria-labelledby` targets, tab semantics, landmarks, heading order, no horizontal scroll over 9 screens x 3 sizes x 2 themes; ring check on tabbed controls; forced-colors and reduced-motion), one real fix (the Appearance preview skipped from h2 to h4), `forced-colors` styles, `docs/accessibility-checklist.md` (every item recorded as not tested by a human) and `docs/redesign-summary.md`.

Not done: refreshed screenshots under `docs/images/redesign/` and the README/getting-started/troubleshooting updates; keyboard shortcuts; WebView2/WKWebView forced-colors verification; axe (not a dependency).

## Decisions for the maintainer

- Should the Simple/Advanced wording differences be unified before 5b? Unifying them removes the largest source of test churn but changes visible text for Simple users.

## Blockers

None open.

## Next step

Run stopped cleanly after Phase 6 (partial) because of working-budget limits, not a blocker. Resume by re-sending the autonomous prompt.

1. Optional remainder of Phase 6 (list above), on `git checkout redesign/phase-6-workspace && git checkout -b redesign/phase-6b-workspace-details`. Start with the Readiness grouping (pure presentation in `src/Readiness.tsx`), then the Commands primary-action menu and run history (`list_command_runs`), then the header Open-in menu. Re-verify [Q] items before touching `commandOutputModel.ts` (raw ANSI) and launcher state.
2. Phase 7 (settings, appearance, updates, polish; repo-wide `lint:styles` gate) on `git checkout redesign/phase-6-workspace && git checkout -b redesign/phase-7-settings`.
3. Phase 8 (accessibility, forced colours, checklist doc, `docs/redesign-summary.md`).

Facts: baseline capture is `REPO_CREATOR_BASELINE=1 REPO_CREATOR_BASELINE_DIR=<dir> npx playwright test tests/baseline.spec.ts`; native smokes need a debug build (`npm run desktop:build -- --ci --debug --no-bundle`) and an empty `HOME`; write multi-line scripts with the file tool; the browser suite has occasional load flakes; `aria-disabled` buttons need `click({ force: true })`; use `setMode` for mode; CI runs `scripts/third-party-notices.mjs --check`, so never edit `src/icons.tsx` (use `src/ui/UiIcon.tsx`); merge, never rebase, to propagate fixes up the stack.

## Final deliverables still owed after Phase 8

`docs/redesign-summary.md` (criteria 1–25 with evidence or an honest untested/unmet) and the final report.
