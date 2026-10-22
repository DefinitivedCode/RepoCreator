# Development

This guide is for building or changing Repo Creator. To use the application, follow [Getting started](getting-started.md) instead.

## Prerequisites

- Git, Node.js 22.18 or newer in the supported Node 22 line, and stable Rust with Cargo. The crate declares Rust 1.90 as its minimum; CI uses current stable Rust and the committed lockfile.
- Windows: Microsoft C++ Build Tools with **Desktop development with C++**, the MSVC Rust toolchain and Microsoft Edge WebView2. Building MSI packages also needs the Windows VBScript optional feature.
- macOS: Xcode Command Line Tools or Xcode, plus the Rust toolchain for your architecture. Desktop development does not require the iOS toolchain.

Follow the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform setup. Browser tests expect Microsoft Edge to be installed; CI runs those tests on Windows. GitHub CLI is required only to exercise publishing or repository administration.

## Get the source

```sh
git clone https://github.com/DefinitivedCode/RepoCreator.git
cd RepoCreator
npm ci
npm run desktop:dev
```

The standard HTTPS URL permits anonymous cloning once the repository is public. While it is private, only authorised accounts can clone it. This does not change application installation.

`npm run desktop:dev` starts Vite and the Tauri application. `npm run dev` starts only the frontend; native operations require Tauri or the browser tests' IPC mock. Default launch dimensions are 1100×740, with an 820×580 minimum. Preserve usable scrolling for enlarged text, smaller windows and expanded editors.

## Structure and boundaries

| Location               | Purpose                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `src/`                 | React workspace, configuration state, validation, previews and handoff rendering               |
| `src-tauri/src/`       | Native validation, settings/presets, generation, Git/GitHub operations and desktop integration |
| `src-tauri/resources/` | Bundled license texts and generation data                                                      |
| `tests/`               | Browser regressions, fixtures and opt-in Windows production smoke                              |
| `.github/workflows/`   | Platform checks, packaging and controlled release preparation                                  |

Preview and creation use the same Rust generator. The native boundary revalidates input and receives structured command arguments. Existing destinations are never adopted or overwritten; native creation guards reject duplicate operations. Publishing failures preserve completed local work. Do not replace these boundaries with frontend filesystem or shell access.

The generator describes intended project context without installing frameworks. The project workspace can explicitly launch installed tools and user-authored commands through the native backend. [Workspace contracts](workspace-architecture.md) describe the shared types; the [workspace guide](project-workspace.md) documents execution and safety. [Agent format documentation](agent-formats.md) records supported provider formats and sources. Product instruction templates are application data, separate from developer instructions for this repository.

## Checks

Run from the repository root:

```sh
npm run check
npm run format:check
npm test
npm run test:ui
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

`npm run build` checks TypeScript and builds the frontend. `npm run format` formats application/test sources and root configuration; review the diff. Browser tests use Tauri's IPC mock and cover both themes, modes, supported dimensions, enlarged text, recovery and configuration preservation. Rust tests create temporary local Git repositories and simulate remote failures. Automated tests do not create real GitHub repositories or invoke provider models.

## Build application packages

On Windows:

```sh
npm run desktop:build -- --ci --target x86_64-pc-windows-msvc
```

The executable is under `src-tauri/target/x86_64-pc-windows-msvc/release/`; NSIS and MSI packages are under its `bundle/nsis/` and `bundle/msi/` directories. Output filenames contain the application version. Windows packages are unsigned.

`npm run desktop:build` remaps compiler source paths before invoking Tauri. Release packaging rejects binaries containing the build machine's home or checkout paths. See [release preparation](releases.md) for custom Rust flags and distribution checks.

On a matching Mac, install the appropriate Rust target and build:

```sh
# Apple Silicon
rustup target add aarch64-apple-darwin
npm run desktop:build -- --ci --target aarch64-apple-darwin --bundles app,dmg

# Intel: use these commands on an Intel Mac
rustup target add x86_64-apple-darwin
npm run desktop:build -- --ci --target x86_64-apple-darwin --bundles app,dmg
```

macOS output is under the corresponding `src-tauri/target/<target>/release/bundle/` directory. The platform configuration creates ad-hoc signed test bundles, not Developer ID signed or notarized distribution. CI builds both architectures and verifies package existence, architecture and ad-hoc signature. Physical Mac launch and installation must still be tested.

[Release preparation](releases.md) explains version checks, normalized download names, checksums and the draft-only workflow. Normal CI does not publish a release.

[Built-in updates](updates.md) describes Settings → Updates, updater signing setup and the post-publication Stable/Beta feeds. Ordinary builds do not require private signing credentials; without a configured public key their updater is disabled. Release preparation requires the signing secrets and public-key variable documented there.

## Production smoke on Windows

After building, run the real WebView2 application through the opt-in test:

```powershell
$env:REPO_CREATOR_SMOKE_EXE = (Resolve-Path 'src-tauri/target/x86_64-pc-windows-msvc/release/repo-creator.exe').Path
node tests/native-smoke.mjs
node tests/native-workspace-smoke.mjs
```

The script uses isolated application/WebView data and temporary local projects, verifies previews against disk and initial commits, checks existing-directory protection and restores a resized window after relaunch. It also exercises all six assistants and built-in specialists/skills. It removes its owned temporary data and leaves a report/screenshots under ignored `artifacts/`. It does not publish repositories. Inspect reports before sharing: native screenshots may include local temporary paths.

The workspace smoke additionally exercises real command output, exit codes,
import consent, duplicate prevention, cancellation and child-process cleanup,
including application closure. It compiles a harmless local launcher fixture to
verify Windows Terminal/PowerShell cwd and arguments without starting real
assistant sessions. Use the same `REPO_CREATOR_SMOKE_EXE` for both scripts.

## Persistence and privacy

Preferences use the platform's native application configuration directory. Versioned settings preserve supported older configuration; damaged settings are backed up during recovery, and unsupported future versions are not overwritten. Window geometry and recent-project metadata are bounded, separate files. Custom handoff templates/styles use WebView local storage; unsaved prompt drafts remain in memory until the app closes.

For isolated tests, the process environment can set `REPO_CREATOR_DATA_DIR` to an absolute directory owned by the test. This redirects preferences, history and window state together. The frontend cannot set it. Do not point tests at normal user settings.

Keep credentials, authentication output, private project data, internal reports and machine-specific paths out of tracked files and screenshots. Use fictional fixture identities and generic paths. Review commit email settings before contributing; GitHub provides [private no-reply email guidance](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address). See [CONTRIBUTING](../CONTRIBUTING.md) and [SECURITY](../SECURITY.md).

## Third-party notices

`THIRD_PARTY_NOTICES.txt` includes dependency licenses, asset attribution and source links. CI checks its integrity and coverage with:

```sh
node scripts/third-party-notices.mjs --check
node --test scripts/licensing.test.mjs
```

After changing dependencies, icons or license templates, review their licenses and pinned provenance in `scripts/third-party-license-sources.json`, then run `node scripts/third-party-notices.mjs --generate`. Generation needs the corresponding locked Cargo and npm sources cached locally; it does not upload source or fetch license text from mutable upstream pages. Review the generated diff and run the checks before committing.
