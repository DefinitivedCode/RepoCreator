# Preparing a release

Release preparation is separate from publishing a release. The workflow never changes visibility, creates tags, rewrites history or publishes a release. v1.4.0 was published as a prerelease. Starting with v1.4.1, complete the one-time [updater signing and channel setup](updates.md) before preparing a draft.

## One-command preparation

For a future version already merged and reviewed on main, instruct Codex:

```text
$repo-creator-release prepare 1.5.3 for beta release
```

That explicit version/channel request authorizes the complete preparation: preflight/privacy/history/licensing/security review, exact-commit CI/version checks, an absent annotated tag, one signed draft-mode workflow execution, verification of actual artifacts and attachments, and completion/readback of the matching unpublished draft's title, channel flag and final notes. Codex returns the verified draft URL; the owner reviews it and clicks **Publish release** manually. No separate intermediate tagging, build, draft or metadata prompts are needed. `stable` is supported for a version without a SemVer prerelease suffix.

Read-only requests such as “review the release” do not authorize mutations. A prepare request never authorizes publication, unreviewed code, PR merging, protection bypasses, tag movement/deletion, signing changes or manual feed writes. Version drift, unreviewed source, failed required checks, incomplete source notes or unresolved privacy/licensing findings block preparation. Any source/version/notes PR must be reviewed, merged by the maintainer and green on its exact resulting main SHA before preparation continues.

This is the existing release system. The [release skill](../.agents/skills/repo-creator-release/SKILL.md) coordinates its existing helpers/workflow and safe resume behavior; it does not add a second pipeline. The current v1.5.2 process is not migrated or changed by this future-release improvement.

## Before the first release

Review privacy findings in the current source, reachable Git history and relevant prior Actions logs/artifacts. Under explicit combined preparation authorization, Codex performs and records this review along with licensing/security/platform checks; failures still block tagging and dispatch. Removing a file in a new commit does not remove its historical contents. Resolve blocking findings and confirm licence notices and warnings before tagging. Publication and a visibility change remain separate, deliberate owner actions.

Windows builds are **unsigned**. Mac builds are **ad-hoc signed, not notarized**. CI checks both Mac architectures and their bundle signatures, but does not establish that the app launches on physical Mac hardware. Follow [Mac installation guidance](macOS-testing.md) and record physical-device results before representing the application as fully tested on Macs.

## What CI prepares

The normal **Desktop checks and test builds** workflow runs on pushes to `main`, pull requests and manual dispatch. It checks that the application version matches `package.json`, both npm lockfile version fields, Tauri configuration, `Cargo.toml` and the application entry in `Cargo.lock`. It runs release-helper tests, frontend checks/tests and Rust checks/tests; Windows also runs the browser suite. It then builds Windows x64, macOS Apple Silicon and macOS Intel from the same commit. Pull requests and pushes build debug executables/apps, including Mac architecture, ad-hoc signature and bundled-notice verification, without installers or DMGs. **Run workflow** on this workflow performs full unsigned test packaging; **Prepare release draft** always performs full optimized, updater-signed packaging. See [CI coverage and caching](development.md#ci-coverage-and-caching) for the checks preserved in each mode.

`npm run desktop:build` uses a local wrapper to remap home, checkout, Cargo and Rustup paths to generic compiler source paths. This prevents compiler-generated source locations from retaining a builder's local username. Existing encoded Rust flags are preserved. A nonempty plain `RUSTFLAGS` causes a clear error rather than being silently replaced; unset it or move custom flags to Cargo's encoded form before building. Packaging scans the native executable for the current builder's home/source/toolchain paths in UTF-8 and UTF-16 and stops if any remain. These checks complement the broader source/history privacy review; they are not a complete secret scanner. See [Rust source-path remapping](https://doc.rust-lang.org/rustc/command-line-arguments.html#--remap-path-prefix-remap-source-names-in-output).

Each successful full-packaging platform job uploads only its versioned application assets and a platform checksum manifest. Pull request/push validation does not upload distribution assets. Development build folders and the portable ZIP staging folder are excluded. For version `1.4.1`, the application assets are:

| Platform                  | File                                                   |
| ------------------------- | ------------------------------------------------------ |
| Windows x64 installer     | `Repo-Creator-1.4.1-windows-x64-unsigned-setup.exe`    |
| Windows x64 MSI           | `Repo-Creator-1.4.1-windows-x64-unsigned.msi`          |
| Windows x64 portable app  | `Repo-Creator-1.4.1-windows-x64-unsigned-portable.zip` |
| Apple Silicon installer   | `Repo-Creator-1.4.1-macos-arm64-adhoc.dmg`             |
| Apple Silicon app archive | `Repo-Creator-1.4.1-macos-arm64-adhoc.app.tar.gz`      |
| Intel Mac installer       | `Repo-Creator-1.4.1-macos-x64-adhoc.dmg`               |
| Intel Mac app archive     | `Repo-Creator-1.4.1-macos-x64-adhoc.app.tar.gz`        |

The portable ZIP contains the executable, license, third-party notices and short setup instructions. Packaging verifies every archive entry against its source bytes. Extract the entire ZIP before opening the executable. Installers and Mac app bundles include the license and notices as resources; CI compares the bundled Mac notices with the source and checks the MSI notice entries and Windows resource hashes. `SHA256SUMS-windows-x64.txt`, `SHA256SUMS-macos-arm64.txt` and `SHA256SUMS-macos-x64.txt` cover their respective platform downloads.

Actions artifacts are temporary test-build downloads and require repository access. They are not a substitute for a published GitHub Release intended for ordinary users.

## Prepare an approved tag

An explicit `prepare VERSION for CHANNEL release` instruction authorizes tagging that version's reviewed candidate after all preflight checks pass. Record the exact main SHA and its review provenance, then create/push only the matching absent annotated tag. Existing matching tags are reused after verification; mismatched or lightweight tags block preparation and are never rewritten. The tag must already exist on GitHub before the workflow runs and must point to reviewed main history.

The requested version must agree across all six checked manifests and lockfile values. For the illustrative future 1.5.3 release, validate before tagging:

```sh
node scripts/release.mjs version --version 1.5.3 --tag v1.5.3
node --test scripts/release.test.mjs
```

## Prepare assets or a draft

The autonomous skill uses **Actions → Prepare release draft → Run workflow** on `main` once, with an explicit channel and both draft/review booleans true. For manual use the inputs are:

- **version:** `1.5.3` in the future example
- **tag:** `v1.5.3` (the existing checked tag for that example)
- **channel:** `beta` or `stable` for final versioned notes and the correct GitHub prerelease flag. Notes must exist at `docs/release-notes/VERSION.md` in the immutable tagged source. Stable rejects SemVer prerelease versions.
- **create_draft:** true for a complete unpublished draft; false only when the owner explicitly requests artifacts-only preparation.
- **publication_review_complete:** true only after explicit preparation authorization and a completed, successful privacy/history, licensing and platform-warning review; required for draft creation. It does not authorize publication.

For the future example above, the single signed preparation command is:

```sh
gh workflow run release.yml --repo DefinitivedCode/RepoCreator --ref main -f version=1.5.3 -f tag=v1.5.3 -f channel=beta -f create_draft=true -f publication_review_complete=true
```

Do not run artifacts-only first and then repeat the same builds for draft creation. The workflow validates the explicit channel and complete tagged notes before builds, resolves the tag to its immutable commit, builds all three platforms through the existing shared workflow, then verifies the complete eleven application/signature assets and platform checksums. If any required check fails, assembly/draft creation remains gated. Its notes validator checks structure and important warnings; factual claims still require source/test review by the agent.

Omitting `channel` preserves legacy manual behavior, including generic preparation notes and separately selected draft channel/notes. This compatibility path keeps existing v1.5.2 commands valid. New autonomous preparation always supplies the explicit channel. No skill examples or tests should dispatch a real release or touch the active v1.5.2 tag/draft.

The assembled Actions artifact uses the requested version, for example `Repo-Creator-1.5.3-release-assets`. It contains the application assets, `LICENSE.txt`, `THIRD_PARTY_NOTICES.txt`, combined `SHA256SUMS.txt`, updater metadata `updater.json` and final `RELEASE_NOTES.md`. Four detached `.sig` files supplement the seven application downloads illustrated earlier; Tauri signs the original Mac app archives. The combined checksum file covers application assets, signatures, notices and updater metadata. Notes become draft release text rather than a downloadable release asset.

With **create_draft** enabled, the final job refuses an existing draft or published release for that tag, then creates an unpublished draft with verified assets. Explicit-channel preparation uses the exact validated tagged notes, title `Repo Creator VERSION` and Beta/Stable prerelease flag; it reads back and validates actual GitHub metadata. Concurrent preparations of the same tag remain serialized. Only this job has `contents: write`; checks/builds have `contents: read`. The short-lived `GITHUB_TOKEN` still needs draft-write permission, plus existing signing prerequisites in [Built-in updates](updates.md). Publication stays manual.

The agent first inspects matching runs/drafts to make retries safe: follow an in-flight run, reverify a complete matching draft, or finish only verified missing files/metadata on the same unpublished draft. Never duplicate/delete a draft, use clobber to replace a conflicting asset or edit a published release. A demonstrated transient failure may receive one failed-job retry in the same run; repeated or integrity failures stop. The workflow's existing-release guard remains in place, so a draft created before a later failure must be inspected before retrying creation. See [preparation recovery](../.agents/skills/repo-creator-release/references/preparation.md).

## Review and publish separately

The GitHub Release title must be exactly `Repo Creator <version>`, such as `Repo Creator 1.4.2`, with no `Beta`, `Stable`, feature name or subtitle. Use GitHub's prerelease flag for Beta releases. The notes may have a descriptive Markdown heading, such as `# Repo Creator 1.4.2 — README & Project Setup Improvements`; keep that heading separate from the release title.

Use the published v1.4.0 and v1.4.1 notes as formatting references and fill the [release-notes template](../.agents/skills/repo-creator-release/assets/release-notes.md) in the versioned source notes file. Follow this order: descriptive heading, one concise introductory sentence, `### What's New` with 3–6 short feature bullets, `### Installation`, `**Known limitations:**` with verified relevant limitations, and `### Feedback` linking to GitHub Issues. Keep notes concise and user-facing, retain important security warnings, and put technical verification in the separate release report. Explicit-channel assembly preserves those exact final notes. Legacy generic notes are not publication-ready.

Before declaring preparation complete, read back the actual draft title/body/prerelease flag and verify all actual attachments. Combined preparation authorization includes correcting metadata of the matching unpublished draft without another prompt, followed by another readback. Never call boilerplate or the wrong channel ready. A narrower user restriction takes precedence. Published releases, immutable assets/tags and updater feeds must not be changed to enforce formatting.

Inspect/download the actual draft assets, verify hashes/signatures/resources and test launch where available, distinguishing payload launch from installation/update testing. Confirm accurate installation/security warnings, including which upgrade paths really were tested. Return the verified draft/workflow URLs and concise limitations. The owner manually reviews and clicks **Publish release**; the prepare command never publishes. Repository visibility and manual feed repair remain separately authorized actions.

For Mac checksum verification, place the downloaded assets and checksum file in the same directory. A signed release's platform checksum file covers its DMG, app archive and detached `.sig` file, so download all three or compare a single file's hash with its line in the manifest:

```sh
shasum -a 256 -c SHA256SUMS-macos-arm64.txt
```

Use `SHA256SUMS-macos-x64.txt` for Intel. On Windows, inspect a download's SHA-256 hash with `Get-FileHash -Algorithm SHA256 -LiteralPath '.\downloaded-file.exe'` and compare it with its manifest entry. Checksums detect a changed or incomplete download; they do not provide trusted code signing.

The release workflow intentionally does not test publication by creating a real release. Its packaging, version and checksum code has local regression tests; actual three-platform installer packaging is exercised by manual test builds and release preparation. The gated tag/draft path must be exercised only after its required owner approval.

References: [GitHub reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows), [workflow token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token), and [`gh release create`](https://cli.github.com/manual/gh_release_create), including its draft and existing-tag flags.
