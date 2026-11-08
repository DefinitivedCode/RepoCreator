# Autonomous run prompt

Paste everything inside the fence into Claude Code or Codex at the repository root. Re-pasting the same prompt resumes the run from `docs/ui-redesign-progress.md`.

```text
You are implementing the approved Repo Creator UI/UX redesign end to end, autonomously, as a sequence of reviewable pull requests. Work until every phase is finished or you hit a blocker you cannot resolve.

SOURCES OF TRUTH (read fully before writing code)
1. AGENTS.md and docs/development.md. These rules override everything below.
2. docs/ui-redesign-brief.md: the approved design (decisions 1–7 are final: "Quiet Workbench", left sidebar, per-section Customize replacing global Simple/Advanced, confirmation sheet only for GitHub/public creation, identity default "Repo Creator projects only", handoff in project workspace and success screen, Phase 1 first).
3. docs/ui-redesign-phase-1-spec.md: Phase 1.
4. docs/ui-redesign-phases-spec.md: Phases 0 and 2–8 plus the blocker protocol.

PHASE ORDER: 1 → 0 → 2 → 3 → 4 → 5 → 6 → 7 → 8.

RESUMING: First read docs/ui-redesign-progress.md if it exists. It records finished phases, branches, PR URLs, open blockers and the next step. Continue from there. If it does not exist, create it on the first phase branch. Check `git branch -a`, `git status` and `gh pr list` so you never redo or duplicate finished work. Preserve any uncommitted changes you did not make.

GIT AND PR WORKFLOW (hard rules)
- Never commit or push to main. Never merge any PR. Never force-push, rewrite shared history, or delete remote branches. Never touch release config, version numbers, updater signing, feeds, or workflows (if one seems necessary, record a blocker).
- Use stacked branches because nothing is merged: Phase 1 branches from main as `redesign/phase-1-setup-correctness`; each later phase branches from the previous phase's branch (`redesign/phase-0-baseline`, `redesign/phase-2-tokens`, `redesign/phase-3-shell`, `redesign/phase-4-onboarding`, `redesign/phase-5-new-project`, `redesign/phase-6-workspace`, `redesign/phase-7-settings`, `redesign/phase-8-accessibility`). Open each PR with base = previous phase branch (Phase 1's base = main). State the stack order and that the PRs must be merged in order in every PR description. Phase 5 may be split into 5a/5b/5c PRs.
- Commit in small logical commits with clear messages. Push the phase branch and open the PR when the phase's verification passes. Do not start the next phase until the current phase's verification block is green and its PR is open.
- After opening a PR, bind it per the harness's PR tooling and leave it unmerged. The docs files listed above may be committed in the Phase 1 branch if they are still untracked (this is the only exception to "focused changes").

HOW TO WORK EACH PHASE
1. Re-read that phase's spec and the brief sections it cites. Do the "Inspect first" files before changing anything. Resolve every [Q] by testing or by checking current official documentation (cite sources in the PR). If a [Q] cannot be resolved, apply the spec's stated safe default and note it.
2. Implement exactly the phase's scope. No unrelated refactoring, no dependency additions or upgrades, no feature removal, no format changes beyond additive serde-default fields. If the spec conflicts with the code, prefer preserving existing behaviour and record the conflict.
3. Write tests as specified. Use temp dirs and isolated GIT_CONFIG_GLOBAL / GIT_CONFIG_SYSTEM / HOME / USERPROFILE. Never read or modify my real Git config. Never call real GitHub or create real repositories. Never run destructive commands.
4. Run the full verification block from the spec (npm run check, format:check, test, test:ui, cargo fmt --check, clippy -D warnings, cargo test) and native Windows smoke with isolated settings where possible. Fix failures; never delete or weaken a test to pass. Every intentionally changed assertion goes in the PR description with its reason.
5. Visually verify UI phases by running the app or browser fixture and viewing screenshots at 820×580, 1100×740 and 1440×900 in light and dark. Fix what you see; do not claim a visual result you did not look at.
6. Update docs/ui-redesign-progress.md at the end of each phase (status, branch, PR URL, verification results with exact pass counts, what was and was not tested, blockers, next step) and commit it.
7. Each PR description: concise summary, what changed, verification actually run, limitations, [Q] findings with sources, blockers, and the stack/merge order. Be honest: never claim macOS, screen-reader, high-DPI hardware or live GitHub testing that did not occur.

AUTONOMY AND BLOCKERS
- Do not stop to ask about anything the brief or specs already decide. Make routine implementation choices yourself and keep going.
- Follow the blocker protocol in docs/ui-redesign-phases-spec.md. On a blocker: record it in the progress file with options and a recommendation, continue with unblocked work in the same phase if any, otherwise stop the whole run and report clearly. Never guess on capability loss, new dependencies, schema changes beyond additive fields, workflow changes, or a failing test you cannot fix honestly.
- If a command would be destructive or outside the repository (deleting files you did not create, changing global config, installing software), do not run it.
- If you run low on budget, finish the current commit, update the progress file with the exact next step, push the branch, and stop cleanly so the run can be resumed.

FINISH
When Phase 8 is done, write docs/redesign-summary.md mapping every brief acceptance criterion (1–25) to its evidence or to "untested"/"unmet" honestly, make sure every PR is open and unmerged in the stated stack order, and give me a final report: PR list in merge order, verification per phase, what was not tested, open blockers, and decisions I still need to make. Leave all merging and release decisions to me.
```
