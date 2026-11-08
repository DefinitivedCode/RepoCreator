# Redesign phases 0 and 2–8 — implementation specs

Parent documents: [design brief](ui-redesign-brief.md) (approved), [Phase 1 spec](ui-redesign-phase-1-spec.md). This file specifies every remaining phase. The brief is the source of truth for design intent (sections C, E, F, G); this file says what to build, in what order, and how to prove it.

Phase order: **1 → 0 → 2 → 3 → 4 → 5 → 6 → 7 → 8**. (Phase 0 is placed after Phase 1 because Phase 1 changes little visually, and baselines should be captured before any visual work begins.)

Tags: **[V]** verified while writing the brief; **[Q]** the implementer must verify before relying on it. This spec was written without running the app and without reading `readiness.rs`, `handoff.rs`, the AI studio panels or the technology picker in full. Each phase therefore begins with a mandatory inspection step.

## Rules common to every phase

1. Follow `AGENTS.md`. One feature branch per phase, one PR per phase, never merge, never push to `main`, no force-push, no release/updater/version/signing changes.
2. Preserve every existing capability. If a redesign seems to remove one, stop and record it as a blocker instead.
3. Preserve data and config formats. Only additive `#[serde(default)]` fields.
4. Reuse existing dependencies. No router, UI kit, icon pack or CSS framework. (If a genuinely needed dependency is proposed, record it as a blocker; do not add it.)
5. Tests use temp dirs and isolated `GIT_CONFIG_*`/`HOME`. Never touch the real Git config, never call real GitHub, never create real repositories.
6. Each phase ends with the standard verification block and honest reporting:

```sh
npm run check
npm run format:check
npm test
npm run test:ui
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Plus native Windows smoke with isolated settings where the environment allows. State exactly what ran. Never claim macOS or screen-reader testing that did not happen. 7. Update existing browser tests only for intentional changes (labels, structure). Every changed assertion is listed in the PR description with the reason. Never delete a test to make a build pass. 8. Update docs (`getting-started.md`, `project-workspace.md`, `troubleshooting.md`, `development.md`, screenshots in `docs/images`) only where behaviour or UI changed. Use fictional fixture data in screenshots.

---

## Phase 0 — Baseline (no product change)

**Goal:** a recorded "before" so later phases can prove no regression and measure improvement.

**Work**

1. Run the app (`npm run desktop:dev`) and the browser fixture (`npm run dev` with the IPC mock used by `tests/fixtures.ts`). Record the exact commands and any failure.
2. Add `tests/baseline.spec.ts` (or extend an existing visual spec) capturing, for light and dark and at 820×580, 1100×740, 1440×900: New Project (Overview, Project Files each sub-tab, AI Agents each sub-tab, Review, Handoff), Success, Projects library (empty and populated), project workspace (each tab, including Commands with output and Readiness with failures), Presets, Settings (each tab), preset dialog, generated-file dialog, command editor dialog, update available state. Output goes to ignored `artifacts/redesign-baseline/` (do not commit images except a small curated set under `docs/images/redesign/` if useful).
3. Add `scripts/audit-styles.mjs`: prints counts of font sizes, radii, distinct colours and `aria-pressed` vs `role=tab` usage across `src/`. Write results to `docs/redesign-baseline.md` (committed, text only). Record current numbers: ~15 font sizes, ~90 declarations ≤11px, radii {2,3,4,5,8,9}.
4. Add the style lint as **report-only** for now (`npm run lint:styles` exits 0 and prints violations) so Phase 2 can turn it into a gate.
5. Add an axe-core accessibility smoke over key screens **only if** `@axe-core/playwright` is already a dependency; otherwise record the gap in `docs/redesign-baseline.md` and do not add the dependency.

**Done when:** baseline doc exists, scripts run, existing test suite unchanged and green. **Risks:** fixture drift, screenshot flakiness (use fixed clock/data, disable animations). **Depends on:** Phase 1 merged or its branch as base.

---

## Phase 2 — Design tokens and primitives

**Goal:** the shared foundation from brief section E, adopted by new primitives only. No page redesign yet.

**Inspect first:** `src/styles.css`, `desktop-refinement.css`, `workspace.css`, `project-workspace.css`, `creation-fields.css`, `readiness.css`, `technology-selector.css`, `appearance-settings.css`, `updates.css`, `appearance.ts` (accent derivation), `icons.tsx`.

**Work**

1. `src/tokens.css`, imported first. Tokens for: colours (light/dark per brief E2, `--bg --surface --sunken --text --text-2 --hairline --field-border --accent-text --accent-fill --accent-on-fill`, status colours with paired icon use), type scale (E1), spacing 4px scale, radii (6/8/999), control heights (28/32/40), focus ring, motion (≤160ms, none under reduced motion), z-index/elevation. Map the existing six accents and custom accent onto `--accent-text/--accent-fill/--accent-on-fill` through the existing derivation in `appearance.ts`; add a contrast guarantee: if a derived fill cannot reach 4.5:1 with its label, adjust the derived shade (not the label) and unit-test it for all six accents in both themes. **[Q]** read `appearance.ts` first and extend rather than replace it.
2. Keep the **existing CSS variable names working** (alias old → new) so un-migrated screens render the same. Do not mass-rename in this phase.
3. Primitives in `src/ui/`: `Button` (variants primary/secondary/tertiary/danger, sizes, `aria-disabled` pattern with `reason` prop wired through `aria-describedby`), `Field` (label, helper, error, optional text, ids), `Tabs` (extracted from the Settings tablist in `WorkspaceFields.tsx:592-630`: arrow/Home/End, roving tabindex, `aria-selected`, optional count badge), `StatusRow` (icon+title+state+action), `Disclosure` (chevron, `aria-expanded`, "Customize" use), `Dialog` (wrapper around the existing native `<dialog>` handling; reuse `WorkspaceDialog.tsx` behaviour: focus trap/return, Escape), `Banner`, `Toast` region (`role=status`), `Chip`. Each with unit tests (React Testing Library only if already a dependency; otherwise Playwright component-level pages in the browser suite).
4. Icons: extend `icons.tsx` with the icons later phases need (sidebar items, check, warning, minus, chevron, more, external, copy, pin, folder, repo, github, settings, play, stop, refresh) at 16px/1.5 stroke. Replace `★/☆` pin glyphs only in Phase 6.
5. Convert `lint:styles` into a **gate for new files only** (`src/ui/**`, `tokens.css`): no `font-size` < 12px, no radius outside the token set, no raw hex outside `tokens.css`.
6. Add a living reference page reachable only in the dev fixture (`/?kitchen-sink`, excluded from production build) showing every primitive in every state in both themes. **[Q]** confirm Vite can tree-shake it out; if not, gate behind `import.meta.env.DEV`.

**Done when:** primitives documented in `docs/development.md` (short section), all existing specs unchanged and passing, kitchen-sink renders, contrast tests pass for six accents × two themes. **Risks:** visual regressions from aliasing — verify against Phase 0 baselines (diff screenshots; expected differences must be zero or explained). **Depends on:** 0.

---

## Phase 3 — App shell and navigation

**Goal:** one navigation grammar (brief C). Sidebar replaces header navigation; tabs unified; vestigial navigation removed.

**Inspect first:** `App.tsx` (state: `page`, `section`, `selectedProjectId`, update banner, mode switch), `RepositoryState.tsx`, `ProjectWorkspace.tsx` header/tabs, `tests/ui*.spec.ts`, `scrolling.mjs`, `resize-window.ps1`.

**Work**

1. `src/shell/AppShell.tsx`, `Sidebar.tsx`, `PageHeader.tsx`. Sidebar: brand + version, **New project** primary button (action, not destination), Projects, Presets, spacer, Setup status dot (from Phase 1 blockers, shown only when a required item is unmet), Settings, update line ("Update available" → Settings → Updates). ≤ 900px window width: collapse to a 52px icon rail with tooltips and accessible names. Landmarks: `<nav aria-label="Main">`, one `<main>`, skip-to-content link.
2. State: introduce a typed `route` (`{ page: 'new' | 'projects' | 'presets' | 'settings'; projectId?; tab? }`) managed with `useReducer` in the shell. **No router dependency.** Preserve the existing behaviours: navigation is disabled while `creator.busy` (`App.tsx:108`), `New` resets a finished creation (`App.tsx:110-113`), heading focus after navigation (`App.tsx:72-75`).
3. Retire the header nav, the header Simple/Advanced switch **visually only in this phase** (the mode logic stays until Phase 5; temporarily render the switch inside the New Project page header so behaviour is preserved), and the update banner (replace with the sidebar line plus a one-time dismissible inline notice on first discovery; keep `updates.later`/dismissed semantics).
4. Replace workspace `aria-pressed` pseudo-tabs and the New Project `Subnav` with the `Tabs` primitive (Files and Agents sub-sections keep their content). The project workspace shows a breadcrumb "Projects / name" with Back. Remove dead `'recent'`/`'setup'` section values and labels after confirming they are unreachable.
5. Settings keeps its tabs via the shared `Tabs`; page structure otherwise unchanged until Phase 7.
6. Update browser tests for the new structure; add tests: sidebar `aria-current`, tab semantics everywhere (`role=tablist/tab/tabpanel`, arrow keys), no `aria-pressed` buttons used for navigation (assert by selector), skip link, focus after navigation, collapsed rail at 820px, navigation disabled while busy.

**Done when:** one nav component per level; all prior navigation reachable; keyboard-complete; 820×580 usable with no horizontal page scroll. **Risks:** focus management regressions; busy-state navigation locks; large diff in `App.tsx` (extract in small commits). **Depends on:** 2.

---

## Phase 4 — Onboarding

**Goal:** the first-run Setup checklist (brief F), also used as Settings → Setup and the inline fix sheet.

**Inspect first:** Phase 1 results (`Environment` report, blockers, identity commands), `list_recent_projects`, `preferences.rs` load/backup logic.

**Work**

1. Rust: additive `onboarding { completed_at: Option<String>, github_skipped: bool, version: u32 }` in `Preferences` (`serde(default)`); commands `get_onboarding_state`/`complete_onboarding`/`skip_github_setup`/`reset_onboarding`. Tests: old settings load; round-trip; recovery path unchanged. **[Q]** follow precedent used for `updates` for versioning.
2. `src/setup/SetupChecklist.tsx` + `SetupRow` built on `StatusRow`/`Disclosure`: rows per brief F4 (Git, commit identity, GitHub publishing as one row with CLI+sign-in parts, editors/AI tools). Reuse Phase 1's identity radio, global-write confirmation, GitHub states and focus-recheck. Add detection skeleton state (Screen 0) with timeout → "Couldn't check — Retry".
3. First-run gating in the shell: show full-window Setup when `completed_at` is unset **and** there are no recent projects (`list_recent_projects` empty). If projects exist, detect silently; mark complete if required items pass, else show the sidebar dot only. Primary actions "Create my first project" and "Add an existing project" (uses `add_existing_project`) remain visible with `aria-disabled` + linked reason until required items pass. Experienced-user path: all green → one confirmation line, one click.
4. Connecting flow: pre-launch notice; "Waiting for you to finish in the terminal…" state with Cancel and "I finished, check now"; auto-recheck on window focus and every 3 s for up to 2 minutes; never display a token/password field.
5. Settings → **Setup** tab renders the same checklist plus a details disclosure (versions, paths, config sources) and "Run setup again" (clears `completed_at` only; resets nothing else).
6. Install help: copyable install commands as constants (never executed): Git — Windows `winget install --id Git.Git -e`, macOS via Xcode Command Line Tools; GitHub CLI — `winget install --id GitHub.cli`, `brew install gh`. **[Q]** verify each against official docs at implementation and cite the pages in the PR.
7. Tests: table-driven over every F4 row state with mocked environment; upgrade user with existing projects never sees first-run; first-run → create project path; skip GitHub persists; revisit from Settings; no `gh` call during local-only creation; no secret inputs; keyboard-only completion; 820×580 layout.

**Done when:** brief acceptance criteria 1–9 pass. **Risks:** interrupting upgrading users (mitigated by recents check); false signed-out states (Phase 1 tri-state); macOS terminal sign-in untested here — state that. **Depends on:** 1, 3.

---

## Phase 5 — New Project recomposition

**Goal:** single recipe page with an always-visible Result pane (brief G2, C4). Largest phase; deliver in ordered sub-PRs if the diff exceeds reviewability (5a layout, 5b sections, 5c create flow).

**Inspect first:** `App.tsx` form and sections, `WorkspaceFields.tsx` (`Overview`, `ProjectSummary`, `Context`), `ConfigurationPanels.tsx`, `AgentStudio.tsx`, `StudioAdvanced.tsx`, `SpecialistEditor.tsx`, `TechnologySelector.tsx`, `HandoffPanel.tsx` (does it need creation form data?), `RepositoryState.tsx`, `useCreator.ts`, `validation.ts`, tests `creation-refinement`, `file-editor`, `agent-studio`, `scrolling`.

**Work**

1. **5a Layout:** new `NewProject` page: recipe column (max 560–720px) + `ResultPane` (file tree + selected-file preview, count, first-commit summary incl. branch/message/identity from Phase 1, "Expand" opens the existing `GeneratedFilesDialog`) + bottom action bar (destination summary left, **Create project** right, single constant label). At 820px the Result pane becomes a bottom drawer opened by "Preview files (N)". Reuse `creator.files`, `FocusedFilePreview`, `GeneratedFilesDialog`; no change to the Rust generator.
2. **5b Sections** on one scrolling page with a sticky section index: (1) Name & location with live final path (`normalizeProjectName`); (2) Starting point (preset select with one-line description, technology chips, Customize opens existing `TechnologySelector`; "Save as preset"); (3) Files (README, .gitignore, license, extras, Git settings) as a compact list with **Customize** revealing the existing editors in place — at ≤ 900px open them as a focused view with Back instead **[Q]** after checking editor widths; (4) AI agents (assistant first; Customize reveals Instructions, Specialists & Skills, Advanced with every existing field; instruction preview in Result pane); (5) Destination segmented (local/GitHub) with owner, visibility (public warning text), topics, homepage under Customize and inline Connect when not signed in (Phase 4 component).
3. **Simple/Advanced:** remove the switch and rail. Existing `experienceMode` persists and is reinterpreted as "show advanced options by default" (Customize regions start expanded when `advanced`); add the toggle to Settings → General. Do not rename the stored key.
4. **Handoff:** removed from the New Project rail; remains in the project workspace (Phase 6) and on the success screen. **[Q]** if `HandoffPanel` needs unsaved form data, keep a "Handoff prompt" button on the success screen and in the Result pane footer instead of deleting capability.
5. **5c Create flow:** typed blockers (Phase 1) rendered in a "To create this project" popover opened by activating the `aria-disabled` Create button; each blocker has an in-place fix (identity sheet, location picker, Connect/switch to local) without losing form state. Confirmation sheet **only** for GitHub destination or Public visibility (names `owner/name`, visibility, branch). Progress: vertical stage list driven by `repo-progress` events (Folder → Files → Git → Commit → GitHub) with inline retry using `retry_publish`. Success: path, branch, commit, count; primary **Open project**; secondary Open folder / VS Code / Create another / Handoff prompt.
6. Preserve: "Undo preset change", "Reset configuration", unsaved-change behaviour, duplicate-create guards, no overwrite of existing destinations.
7. Tests: all existing creation/file-editor/agent-studio/scrolling specs adapted for new structure (list changes); new: blocker popover and each fix; confirmation only for GitHub/public (Cancel creates nothing); preview equals native output (existing native smoke retained and run); Customize regions preserve every field; 820px drawer; keyboard-only creation; focus management on drawer/popover/sheet.

**Done when:** brief criteria 14–18 pass and user journeys H1/H2 work end to end in the browser fixture and native smoke. **Risks:** state regressions across sub-editors; layout at 820px; hidden dependency of handoff on form data. **Depends on:** 2, 3 (and 4 for inline Connect/identity sheet).

---

## Phase 6 — Projects, workspace, presets

**Goal:** brief G3–G6 for the library, workspace and presets.

**Inspect first:** all of `ProjectWorkspace.tsx` (1,839 lines), `Readiness.tsx`, `readinessModel.ts`, `readiness.rs` public surface, `CommandOutput.tsx`, `commandOutputModel.ts`, `DetectedTechnologies.tsx`, `technology_detection.rs`, `PresetDialog.tsx`, `docs/project-workspace.md`, `docs/commands-ux-review.md`.

**Work**

1. First split `ProjectWorkspace.tsx` by tab into `src/workspace/*.tsx` with **no behaviour change** (own commit; tests green before restyling).
2. Library: rows (name, middle-truncated path with full value on focus/hover + copy, technologies, branch, last opened, readiness badge only if attention > 0), search, sort, **Add existing project** and **New project** actions, icon pin toggle (replace `★/☆`), row menu with Remove-from-history confirm ("The folder on disk is kept"), roving arrow-key navigation, distinct empty states (none vs no match).
3. Workspace header: name, path, branch, remote if available, **Open in…** split button replacing the Open tab. Move launcher configuration ("Advanced executable configuration") to Project Settings → Tools. Tabs: Overview, Commands, Readiness, Handoff, Settings. **[Q]** confirm no launcher state is lost.
4. Overview: definition list metadata; technologies with expandable evidence from the existing detection payload and the existing accept/ignore behaviour **[Q]** confirm what exists; brief as disclosure.
5. Commands: list + output panes; one primary action per command (Run/Stop), Edit/Delete/reorder in a menu; run history list (status, duration) using the existing `list_command_runs`; output pane keeps ANSI handling, copy, clear, stop, open in terminal, long-output scroll. **[Q]** re-verify raw ANSI escapes in the current build before changing `commandOutputModel.ts`.
6. Readiness: group by Needs attention / Passing / Not run, `StatusRow` per check, single **Run checks**, per-check Run/Cancel; nothing runs until the user asks (preserve).
7. Handoff tab: existing prompt workspace restyled; Copy primary.
8. Presets page: Built-in / Yours sections as rows with description and counts; Use (primary), Edit, Duplicate, Delete (custom only, confirm); one-sentence explanation at top; reuse `PresetDialog` unchanged for editing.
9. Tests: adapt `project-workspace.spec.ts`; add tests for row keyboard navigation, Open-in menu, command safety flows unchanged (no command runs without explicit action), run history, readiness grouping, preset actions, long paths/names/output at 820×580. Run native workspace smoke if possible.

**Done when:** every previous capability is reachable (checklist in PR: each launcher, command action, readiness action, preset action). **Risks:** command-runner state, size of file, readiness semantics. **Depends on:** 3.

---

## Phase 7 — Settings, appearance, updates, polish

**Goal:** brief G7, G9 and consistency polish.

**Work**

1. Settings tabs: **Setup** (Phase 4), **General** (show advanced options by default, default save location), **Appearance**, **Updates**. Single status display, top-aligned, 720px measure.
2. Appearance: System/Light/Dark segmented, six accent swatches + custom colour with live preview; preserve instant apply and invalid-hex behaviour (existing tests).
3. Updates: version, channel, Check now, Markdown release notes (existing renderer), download/install progress as a `StatusRow`; preserve every existing control and flow; **no** changes to updater, feeds, signing or release config.
4. Empty/error/loading states across the app per brief G9: error `message` + `guidance` shown inline next to the cause with a fix action; skeleton + `role=status` loading; confirmations use the shared `Dialog` with the verb as primary label and Cancel focused.
5. Migrate remaining CSS to tokens; delete dead rules; turn `lint:styles` into a **repo-wide gate** (no `font-size` < 12px, radii in token set, colours via tokens, no `aria-pressed` navigation). Remove alias variables once unused.
6. Motion pass (≤160ms, reduced-motion respected), copy pass (sentence case, plain language, no all-caps eyebrows).
   6a. **Selected-state and button consistency (maintainer decision 8).** Remove every left accent bar / side stripe used to mark a selected item and apply the single grammar from brief E5 (tint + weight, no stripe) to every button, navigation item and list row, including the screens that predate the redesign. Known occurrences: `src/shell/shell.css` (sidebar `aria-current` item, `inset 3px`), `src/desktop-refinement.css` (project-setup rail active item and two other `inset … var(--accent)` rules), and any similar `border-left` accent. Then audit all buttons for one set of variants (primary, secondary, tertiary, danger) and sizes, so no screen mixes bespoke button styles with the `Button` primitive. Add `lint:styles` rules that fail on a coloured `box-shadow: inset` or `border-left` used for selection, and a browser test that asserts selected items have no side stripe (computed `box-shadow` and `border-left-width`).
7. Tests: `updates.spec.ts`, `appearance.spec.ts` adapted; contrast test across accents/themes; style lint in CI script (`npm run check` or documented separate command, following existing CI conventions; do not edit workflows unless required — if so, record as a blocker for the maintainer).

**Depends on:** 3 (and 4 for Setup). **Risks:** updater UX regressions; leftover legacy styles.

---

## Phase 8 — Accessibility and platform pass

**Goal:** verify and fix, not redesign.

**Work**

1. Automated: axe over every screen/state in both themes and 3 sizes (add `@axe-core/playwright` **only** if already a dependency; otherwise write DOM-based checks for names, roles, label associations, heading order, duplicate ids, tab semantics, `aria-describedby` targets, contrast tokens).
2. Keyboard audit script/tests: every action reachable; logical focus order; focus visible (≥ 3:1); dialogs trap/return focus; no keyboard traps; Escape behaviour; shortcut conflicts (optional Ctrl/Cmd+N and Ctrl/Cmd+, only if added, platform-aware, never the only path).
3. Layout: 820×580, 1100×740, 1440×900, 125/150% emulation, enlarged text, long paths/names/output; no horizontal page scroll; all regions scrollable by wheel and keyboard.
4. Reduced motion, forced-colors (Windows High Contrast) check — **[Q]** verify support in WebView2/WKWebView and fix obvious failures (`forced-colors` media query, borders on interactive elements).
5. Documentation of the manual checklist for NVDA/Narrator (Windows) and VoiceOver (macOS) in `docs/accessibility-checklist.md`. Do **not** claim those tests were performed unless a human did; record "not tested" explicitly.
6. Final: refresh tracked screenshots under `docs/images/redesign/` (fictional data), update `getting-started.md`, `project-workspace.md`, `troubleshooting.md`, `README.md` screenshots as needed, and write `docs/redesign-summary.md` mapping each brief acceptance criterion (1–25) to the test or manual evidence that covers it, with any that are unmet or untested listed plainly.

**Depends on:** all. **Done when:** criteria matrix complete with honest status.

---

## Blocker protocol

A **blocker** is anything requiring maintainer judgment: a capability that would be lost, a new dependency, a schema change beyond additive fields, a CI/workflow change, an ambiguous `[Q]` that cannot be resolved by testing or official docs, or tests that cannot be made green without deleting coverage. Record it in `docs/ui-redesign-progress.md` (what, why, options, recommendation), continue with independent work in the phase if any exists, and otherwise stop and report rather than guess.
