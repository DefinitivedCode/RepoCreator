# Redesign remainder: instructions for Codex

Paste everything inside the fence into Codex at the repository root. It continues the Repo Creator UI redesign after Phases 1–8, the Phase 9 follow-up and Phase 5b (PR #35). Re-pasting the same prompt resumes from `docs/ui-redesign-progress.md`.

```text
You are finishing the remaining work of the approved Repo Creator UI/UX redesign as a sequence of small, reviewable pull requests. Work until every item below is done or you hit a blocker you cannot resolve.

SOURCES OF TRUTH (read fully before writing code)
1. AGENTS.md and docs/development.md. These rules override everything below.
2. docs/ui-redesign-brief.md (decisions 1–8 are final, including "no left accent bar on selected items").
3. docs/ui-redesign-phases-spec.md (Phases 5–8 and the blocker protocol).
4. docs/ui-redesign-progress.md (what is delivered, what is not, how to run baselines and native smokes) and docs/redesign-summary.md (criteria 1–25 with honest status).
5. docs/redesign-release-checklist.md and docs/accessibility-checklist.md.

STATE OF THE REPOSITORY
Phases 1–8 and the Phase 9 follow-up are merged into main. Phase 5b (New Project as one scrolling page, PR #35) may still be open: check `gh pr list` and `git log origin/main`. If #35 is unmerged, base your first branch on `redesign/phase-5b-single-page`; otherwise on main. Never redo finished work. Preserve any uncommitted changes you did not make.

GIT AND PR WORKFLOW (hard rules)
- Never commit or push to main. Never merge any PR. Never force-push, rewrite shared history or delete remote branches. Do not touch release configuration, version numbers, updater signing, feeds or workflows (record a blocker if one seems necessary).
- One branch and one PR per numbered group below, named `redesign/<group-slug>`. Use stacked branches when a group depends on an unmerged one, and state the merge order in every PR description. CI runs the full checks only for PRs targeting main, so retarget to main (or merge main into the branch) once the base merges.
- Small logical commits. Commit messages end with the attribution lines this environment gives you.
- After opening a PR, leave it unmerged. Update docs/ui-redesign-progress.md and docs/redesign-summary.md at the end of each group and commit them.

HOW TO WORK EACH GROUP
1. Re-read the relevant spec section and the files named under "Inspect first".
2. Implement exactly that scope. No unrelated refactoring, no dependency additions or upgrades, no feature removal, no format changes beyond additive serde-default fields. Prefer preserving existing behaviour over the spec when they conflict, and record the conflict.
3. Write tests. Use temporary directories and isolated GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM, HOME and USERPROFILE. Never read or modify my real Git config. Never call real GitHub or create real repositories. Never run destructive commands.
4. Verify: `npm run check`, `npm run format:check`, `npm test`, `node --test scripts/audit-styles.test.mjs`, `npm run test:ui`, and for any Rust change `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test --locked`. Fix failures; never delete or weaken a test to pass. List every intentionally changed assertion with its reason in the PR.
5. View screenshots of any UI change at 820×580, 1100×740 and 1440×900 in both themes. Do not claim a visual result you did not look at.
6. Never claim a platform, screen reader or device was tested unless it actually was. State plainly what was not tested.
7. Known pitfalls: the full browser run can hang at exit if an earlier run left Playwright or Vite processes alive (check and clear only processes you started); `aria-disabled` buttons need `click({ force: true })`; use the `setMode`, `fileTab`, `agentTab`, `openHandoff`, `resultPreview`, `overviewOverflow` and `overviewHeight` helpers in tests/fixtures.ts; CI runs scripts/third-party-notices.mjs --check, so never edit src/icons.tsx (use src/ui/UiIcon.tsx); merge, never rebase, to propagate fixes up a stack; write regexes in test files with the file tool, since shell heredocs can strip backslashes.

GROUP 1: Phase 5 leftovers (branch redesign/new-project-leftovers)
Inspect first: src/App.tsx, src/WorkspaceFields.tsx (Overview, Context, FirstCommit), src/PresetDialog.tsx, src/ConfigurationPanels.tsx, src/GeneratedFilesDialog.tsx, src/FocusedFilePreview.tsx.
a. Add "Save as preset" in the Starting point section of Overview. It saves the current configuration as a custom preset through the existing preset commands, asks for a name, and keeps "Manage…" for editing. Test: saving, duplicate-name handling and that creation output is unchanged.
b. Replace the flat generated-file list in the result pane (Context) with a file tree (folders expandable, files selectable, keyboard accessible with the ARIA tree pattern or a clearly labelled nested list), showing the count. The previewed content must stay identical to the generated output. Tests: tree structure from nested paths, keyboard use, selection drives the preview.
c. At container widths of 900px and below, open the Project Files and AI Agents Customize editors as a focused view with a Back button (state is kept, focus returns to the Customize trigger on Back); above 900px they stay in place. Check editor widths at 820px first and record the [Q] answer. Tests at 820×580 and 1100×740.
d. Page-wide file search: add the "Find generated files" search to the result pane tree (filter by path) so it is not only in the expanded dialog. Keep the dialog's search.
Done when: criteria 14–19 evidence still holds and the new behaviour is covered at three sizes in both themes.

GROUP 2: Phase 6 workspace remainder (branch redesign/workspace-remainder)
Inspect first: src/workspace/Workspace.tsx, Commands.tsx, Library.tsx, Settings.tsx, src/HandoffPanel.tsx, src/Readiness.tsx, src/presets/, tests/project-workspace.spec.ts, tests/presets.spec.ts. Command safety rules do not change: nothing runs without an explicit user action.
a. Handoff tab in the project workspace (between Commands and Readiness or as the spec orders it), using PromptWorkspace; move the Overview "Plan with AI" action to switch to this tab. The Copy action is the primary button.
b. Overview as a definition list (Git status, branch, technologies with an expandable "Why detected" evidence list from the existing detection data, created, last opened, repository link). Keep every existing fact.
c. Commands: a run-history list (most recent first, status and exit code, duration, selectable to show that run's output through the existing viewer). Use list_command_runs. Test with several runs, long names and output at 820×580.
d. Presets page: Edit opens that specific preset in the existing PresetDialog (no new editor). Test the Edit path for custom presets only.
Done when: every previous capability is still reachable (list each launcher, command action, readiness action and preset action in the PR) and the native workspace smoke (tests/native-workspace-smoke.mjs) is run if a debug build is possible.

GROUP 3: Phase 7 polish (branch redesign/consistency-polish)
a. Remove the legacy alias variables (--surface, --text, --background, --primary, --radius, --motion and similar) from the old stylesheets once unused: migrate each usage to the tokens in src/tokens.css, then delete the aliases. No visual regression: compare baseline screenshots (REPO_CREATOR_BASELINE=1 REPO_CREATOR_BASELINE_DIR=<dir> npx playwright test tests/baseline.spec.ts) before and after and explain any pixel difference.
b. Loading skeletons: replace bare "Loading…" text with a skeleton placeholder plus a role="status" text for screen readers on the library, workspace, readiness, tools and Settings loading states. Any action over one second shows progress.
c. Inline errors: show an error's message and guidance next to its cause with a fix action instead of a bottom banner, wherever the cause is known (create-flow errors, settings saves, command and library errors). Keep a banner only for page-level failures.
d. Button-variant audit: every screen uses the Button variants (primary, secondary, tertiary, danger) and sizes. Find bespoke button styles and migrate them to the primitive or its tokens; at most one primary button per view. Extend scripts/audit-styles.mjs and its node tests with a rule that fails on new bespoke button classes you remove.
e. Appearance Settings: change the System/Light/Dark radio cards to a segmented control if the existing tests and instant-apply behaviour are preserved (accent swatches may stay radio cards). Keep invalid-hex behaviour.
Done when: `npm run check` gate is clean and both themes pass.

GROUP 4: Phase 8 accessibility evidence (branch redesign/accessibility-evidence)
a. Dialog audit: for every dialog and popover (Dialog, WorkspaceDialog, Menu, Open in, blocker popover, confirmation sheets, technology picker, preset dialog, files dialog, handoff dialog) test open focus, Tab and Shift+Tab containment, Escape, and focus return. Fix real failures.
b. Focus-ring contrast: measure the computed focus-ring colour against its adjacent background for every accent and both themes and assert at least 3:1 (reuse the contrast helpers behind src/tokens.test.ts). Fix tokens that fail, and keep the 4.5:1 button-label guarantee.
c. Close the partial criteria in docs/redesign-summary.md: (10) remove or justify the remaining aria-pressed navigation uses (technology categories) and keep the lint rule; (11) a test that asserts at most one primary-styled button is visible per screen; (5) a table-driven test over the full Git × identity × GitHub setup matrix with a mocked environment; (7) a static test that no input in onboarding or settings accepts a password or token. Update the summary statuses honestly.

GROUP 5: Release preparation drafts (branch redesign/release-prep-drafts). You may DRAFT and prepare; you may not release or claim human testing.
a. Draft release notes in docs/release-notes/ naming the redesign, the first-run setup checklist, commit identity handling (saved for Repo Creator projects only, global Git write only after explicit confirmation), the sidebar, the one-page New Project, the Presets page sections, and the removed Simple/Advanced switch (kept as "Show advanced options by default"). Follow the format of existing notes. Do not set or change a version number or channel, and do not publish.
b. Rewrite the README feature table and "Look inside" section and update docs/getting-started.md, docs/project-workspace.md and docs/troubleshooting.md for the final UI. Describe only what exists.
c. Screenshots: the existing script tests/public-screenshots.mjs captures the real native app, creates a fictional project under C:\Projects and needs a release build. Do not run it as written. Either adapt it to use a temporary directory only (never touching C:\Projects, my home folder or real Git config) and run it against a local debug/release build, or stop and record a blocker with the exact command and risks for me to run. Never commit screenshots containing a real username, path or email. If you cannot capture native images, leave the README images untouched and say so.
d. Do NOT: edit the version, release.yml, update-feeds.yml, signing, feeds or channels; publish a release; open a release PR; or write "tested" for anything below.

GROUP 6: Human-only items. You cannot do these. Do not mark them done.
In docs/accessibility-checklist.md, docs/redesign-release-checklist.md and docs/redesign-summary.md keep these as "Not tested" and add a short, specific runbook for me to follow for each, including exact commands and what to record:
- NVDA, Narrator and VoiceOver passes against the checklist items.
- A physical Mac launch and install (CI only builds and signs ad hoc).
- Windows High Contrast with the forced-colors styles in src/forced-colors.css.
- Real 125% and 150% display scaling on hardware (browser emulation is not the same).
- A real signed-out `gh` check of the GitHub tab (needs a live GitHub call).
- Release decisions: versions, publishing and the updater stay with me; list them as open decisions, with your recommendation, but take none.

AUTONOMY AND BLOCKERS
- Do not stop to ask about anything these instructions or the brief already decide. Make routine implementation choices yourself and keep going.
- Follow the blocker protocol in docs/ui-redesign-phases-spec.md. On a blocker, record it in docs/ui-redesign-progress.md with options and a recommendation, continue with unblocked work, and otherwise stop and report. Never guess on capability loss, new dependencies, schema changes beyond additive fields, workflow changes or a failing test you cannot fix honestly.
- If a command would be destructive or outside the repository (deleting files you did not create, changing global config, installing software), do not run it.
- If you run low on budget, finish the current commit, update the progress file with the exact next step, push the branch and stop cleanly so the run can be resumed.

FINISH
Give me a final report: PR list in merge order, verification per group with exact pass counts, what was not tested, open blockers, the human-only runbooks you wrote, and decisions I still need to make. Leave all merging and release decisions to me.
```
