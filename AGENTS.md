# Repo Creator — Development Guidelines

## Project

Repo Creator is an existing cross-platform desktop application built with Tauri 2, React, TypeScript and Rust.

It supports Windows and macOS. Changes must preserve existing functionality across supported platforms.

Read `docs/development.md` and inspect relevant source files before implementing changes.

## Scope and implementation

- Make focused changes addressing the assigned issue.
- Preserve the existing architecture and established conventions.
- Do not perform unrelated refactoring, redesigns or dependency upgrades.
- Do not replace working implementations without a demonstrated reason.
- Do not remove existing features to simplify an implementation.
- Prefer existing dependencies and native cross-platform APIs.
- Ask for clarification before making substantial architectural decisions.

## Git collaboration

- Check the current branch and working tree before modifying files.
- Work on a dedicated feature or bug-fix branch.
- Never commit or push directly to `main`.
- Never force-push, rewrite shared history or delete remote branches without explicit approval.
- Do not merge pull requests or publish releases.
- Do not modify repository visibility, licensing or release configuration without maintainer approval.
- Preserve existing uncommitted changes.
- Prepare changes for review through a pull request.

## Reliability

- Preserve Windows and macOS compatibility.
- Avoid introducing platform-specific assumptions.
- Preserve existing data and configuration formats.
- Keep generated file previews consistent with actual output.
- Never expose credentials or other sensitive information.
- Do not execute destructive commands without explicit authorisation.

## Verification

- Run relevant tests and type checks for affected components.
- Verify builds when changes affect compilation or packaging.
- Use temporary directories for repository-creation tests.
- Do not create real GitHub repositories as part of automated testing.
- Never claim a platform was tested unless it actually was.

## Completion

Provide a concise summary of changes, verification performed, limitations and any remaining issues.

Leave merging and release decisions to the maintainers.
