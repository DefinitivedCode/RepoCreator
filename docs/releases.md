# Preparing a release

Release preparation is separate from changing repository visibility or publishing a release. The workflow never changes visibility, creates tags, rewrites history or publishes a release. Until the repository is public, only invited collaborators can access its source and build artifacts. No public application release exists yet.

## Before the first release

The owner must review privacy findings in the current source, reachable Git history and prior Actions logs/artifacts. Removing a file in a new commit does not remove its historical contents. Resolve any blocking privacy findings, confirm the project and third-party license notices, and review the installation warnings before approving a release tag. A public release and a visibility change require separate, deliberate owner actions.

Windows builds are **unsigned**. Mac builds are **ad-hoc signed, not notarized**. CI checks both Mac architectures and their bundle signatures, but does not establish that the app launches on physical Mac hardware. Follow [Mac installation guidance](macOS-testing.md) and record physical-device results before representing the application as fully tested on Macs.

## What CI prepares

The normal **Desktop checks and test builds** workflow runs on pushes to `main`, pull requests and manual dispatch. It checks that the application version matches `package.json`, both npm lockfile version fields, Tauri configuration, `Cargo.toml` and the application entry in `Cargo.lock`. It runs release-helper tests, frontend checks/tests and Rust checks/tests; Windows also runs the browser suite. It then builds Windows x64, macOS Apple Silicon and macOS Intel from the same commit.

`npm run desktop:build` uses a local wrapper to remap home, checkout, Cargo and Rustup paths to generic compiler source paths. This prevents compiler-generated source locations from retaining a builder's local username. Existing encoded Rust flags are preserved. A nonempty plain `RUSTFLAGS` causes a clear error rather than being silently replaced; unset it or move custom flags to Cargo's encoded form before building. Packaging scans the native executable for the current builder's home/source/toolchain paths in UTF-8 and UTF-16 and stops if any remain. These checks complement the broader source/history privacy review; they are not a complete secret scanner. See [Rust source-path remapping](https://doc.rust-lang.org/rustc/command-line-arguments.html#--remap-path-prefix-remap-source-names-in-output).

Each successful platform job uploads only its versioned application assets and a platform checksum manifest. Development build folders and the portable ZIP staging folder are excluded. For version `1.3.2`, the application assets are:

| Platform                  | File                                                   |
| ------------------------- | ------------------------------------------------------ |
| Windows x64 installer     | `Repo-Creator-1.3.2-windows-x64-unsigned-setup.exe`    |
| Windows x64 MSI           | `Repo-Creator-1.3.2-windows-x64-unsigned.msi`          |
| Windows x64 portable app  | `Repo-Creator-1.3.2-windows-x64-unsigned-portable.zip` |
| Apple Silicon installer   | `Repo-Creator-1.3.2-macos-arm64-adhoc.dmg`             |
| Apple Silicon app archive | `Repo-Creator-1.3.2-macos-arm64-adhoc.app.tar.gz`      |
| Intel Mac installer       | `Repo-Creator-1.3.2-macos-x64-adhoc.dmg`               |
| Intel Mac app archive     | `Repo-Creator-1.3.2-macos-x64-adhoc.app.tar.gz`        |

The portable ZIP contains the executable, license, third-party notices and short setup instructions. Packaging verifies every archive entry against its source bytes. Extract the entire ZIP before opening the executable. Installers and Mac app bundles include the license and notices as resources; CI compares the bundled Mac notices with the source and checks the MSI notice entries and Windows resource hashes. `SHA256SUMS-windows-x64.txt`, `SHA256SUMS-macos-arm64.txt` and `SHA256SUMS-macos-x64.txt` cover their respective platform downloads.

Actions artifacts are temporary test-build downloads and require repository access. They are not a substitute for a published GitHub Release intended for ordinary users.

## Prepare an approved tag

Do this only after the owner approves release preparation. Choose the exact reviewed commit, confirm all checks passed, and create/push `v1.3.2` using GitHub or Git. The tag must already exist on GitHub and point to a commit in the history of `main`. Do not move an existing release tag.

The application version must be `1.3.2` across the checked manifests and lockfiles. Validate it locally before requesting a tag:

```sh
node scripts/release.mjs version --version 1.3.2 --tag v1.3.2
node --test scripts/release.test.mjs
```

## Prepare assets or a draft

From **Actions → Prepare release draft → Run workflow**, choose the workflow on `main`, then supply:

- **version:** `1.3.2`
- **tag:** `v1.3.2` (the existing approved tag)
- **create_draft:** leave false to prepare downloadable workflow artifacts without creating any release.
- **publication_review_complete:** set true only after the owner has approved preparation and reviewed privacy, licensing and platform warnings; required when requesting a draft.

The equivalent GitHub CLI command for preparing artifacts only is:

```sh
gh workflow run release.yml --repo DefinitivedCode/RepoCreator --ref main -f version=1.3.2 -f tag=v1.3.2 -f create_draft=false -f publication_review_complete=false
```

For an explicitly approved draft, set both boolean inputs to `true`. This is preparation, not publication. The workflow resolves the existing tag to its immutable commit, repeats all three platform builds through the shared workflow, then verifies the complete seven-asset inventory and each platform's checksums. If any required build or check fails, it does not assemble a release or create a draft.

The assembled Actions artifact is named `Repo-Creator-1.3.2-release-assets`. It contains the application assets, `LICENSE.txt`, `THIRD_PARTY_NOTICES.txt`, combined `SHA256SUMS.txt` and editable `RELEASE_NOTES.md`. The combined checksum file covers the application assets and notices. The notes file becomes draft release text rather than a downloadable release asset.

With **create_draft** enabled, the final job refuses an existing draft or published release for that tag, then creates a draft with the verified assets. Concurrent preparations of the same tag run serially. Only this job has `contents: write`; checks and builds have `contents: read`. It uses the short-lived repository `GITHUB_TOKEN` and requires no external host, signing credential or personal access token. Repository policy must allow that token to create release drafts. There is no automatic publication or update service.

## Review and publish separately

Inspect the draft, download and test the actual uploaded assets, verify checksums and review the release notes. Confirm installation instructions and known signing warnings are visible. Make the repository public only if the owner has explicitly approved the visibility change and all privacy blockers are resolved. Publish the draft only after separate owner approval.

For Mac checksum verification, place the downloaded asset and its checksum file in the same directory. A platform checksum file checks both its DMG and app archive, so download both or compare the single file's hash with its line in the manifest:

```sh
shasum -a 256 -c SHA256SUMS-macos-arm64.txt
```

Use `SHA256SUMS-macos-x64.txt` for Intel. On Windows, inspect a download's SHA-256 hash with `Get-FileHash -Algorithm SHA256 -LiteralPath '.\downloaded-file.exe'` and compare it with its manifest entry. Checksums detect a changed or incomplete download; they do not provide trusted code signing.

The release workflow intentionally does not test publication by creating a real release. Its packaging, version and checksum code has local regression tests; actual three-platform packaging is exercised by normal CI. The gated tag/draft path must be exercised only after its required owner approval.

References: [GitHub reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows), [workflow token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token), and [`gh release create`](https://cli.github.com/manual/gh_release_create), including its draft and existing-tag flags.
