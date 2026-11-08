# Redesign release checklist

For when the redesign ships as a real version. Not to be done as part of the redesign PRs: release preparation is separate, and `AGENTS.md` and [Releases](releases.md) say a maintainer approves it.

## Version

The maintainer asked for **1.6.0 or 2.0.0**, left to judgement. Recommendation: **2.0.0**.

- The redesign is the largest user-visible change since the app began: a new navigation model, a first-run checklist, and the Simple/Advanced switch gone.
- Nothing breaks stored data: preferences only gain additive, defaulted fields, and generated project files are unchanged. That would justify 1.6.0 on a strict reading of compatibility, so choose 2.0.0 if you want the version to say "this looks different", and 1.6.0 if you want it to say "compatible".
- The project already ships Beta and Stable channels ([Updates](updates.md)); publishing the first build on Beta before Stable fits either number.

## Change the version everywhere

Checked files that currently contain `1.5.2` (re-run `git grep -l "<current version>"` before editing):

- `package.json`, `package-lock.json`
- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `README.md` (version references, screenshots)
- `docs/README.md`, `docs/assets/README.md`
- `docs/project-workspace.md`, `docs/commands-ux-review.md`, `docs/redesign-baseline.md` (check whether each mention is a historical fact or the current version before changing it)
- New `docs/release-notes/<version>.md` and a `docs/v<version>-preparation.md`, following the existing 1.5.1 and 1.5.2 files

The version shown at the top left of the app comes from the native build (`get_update_info`), so it follows the manifests; no separate edit is needed. Browser tests read `package.json`, so they follow too. Validate with:

```sh
node scripts/release.mjs version --version <version> --tag v<version>
```

## README and docs

- Replace screenshots with fresh ones of the redesigned UI using fictional data (Phase 8 plans this; the existing native screenshot script is `tests/public-screenshots.mjs`).
- Rewrite the README feature table and "Look inside" section: there is no Simple/Advanced mode any more, there is a first-run setup, a sidebar, and a Presets page with sections.
- Update `docs/getting-started.md`, `docs/troubleshooting.md` and `docs/project-workspace.md` for anything Phases 7 and 8 change.
- Write release notes that name the redesign, the first-run checklist, the commit identity handling (saved for Repo Creator only, global write only on explicit confirmation), and the removed mode switch.

## Release process

Use the documented flow, which needs the maintainer's explicit approval: the version-preparation PR first, then `$repo-creator-release prepare <version> for <channel> release` ([Development](development.md#ci-coverage-and-caching)). Publication stays manual. Do not touch updater signing, feeds or workflows as part of this.

## Before publishing

- All redesign PRs merged in order and `main` CI green on Windows and both macOS runners.
- Physical Mac launch and install tested by a person (CI only builds and signs ad hoc).
- A real signed-out `gh` check of the GitHub tab (not testable without a live GitHub call).
- Screen reader pass from `docs/accessibility-checklist.md` once Phase 8 writes it, performed by a human.
