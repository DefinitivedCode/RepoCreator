# Repo Creator

A compact Windows utility for starting a real Git repository, with an initial commit on `main` and optional publishing to GitHub.

Built with **Tauri 2, React, TypeScript and Rust**. The interface follows the Windows light or dark appearance, uses a native folder picker, and remembers your last project location and destination.

## Use the application

Double-click `repo-creator.exe`, or install Repo Creator using the setup executable or MSI. Enter a project name, choose **Local only** or **GitHub**, select a README template and location, then click **Create Repository**.

Both destinations create a new child folder and an initial commit on `main`. Choosing **None** for the README creates an empty initial commit. GitHub defaults to **Private**. After success, open the local folder or the verified GitHub URL, or choose **Create Another**.

### Runtime prerequisites

- Windows 11 x64 and [Microsoft Edge WebView2](https://developer.microsoft.com/microsoft-edge/webview2/). The installers can bootstrap WebView2 when needed.
- [Git for Windows](https://git-scm.com/downloads/win), available on `PATH`.
- A Git commit identity. If missing, the app shows the exact setup commands:

  ```powershell
  git config --global user.name "Your Name"
  git config --global user.email "you@example.com"
  ```

- For GitHub publishing: the official [GitHub CLI](https://cli.github.com/), available on `PATH`, and a GitHub account with permission to create repositories. **Connect to GitHub** opens the official `gh auth login --web` flow in an interactive terminal and browser. Select **Check connection** when finished.

Reopen Repo Creator after installing Git or GitHub CLI so it inherits the updated `PATH`. Local creation needs no network connection.

## Build from source

Install Node.js 22.18 or newer, stable Rust with the MSVC toolchain, and the **Desktop development with C++** workload from Microsoft C++ Build Tools. See the official [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows). MSI packaging also needs the Windows VBScript optional feature.

```powershell
npm ci
npm run desktop:dev
```

Create the production executable and both Windows installers:

```powershell
npm run desktop:build
```

The build downloads official NSIS/WiX tooling on first use. Outputs:

| Artifact | Path from repository root |
| --- | --- |
| Standalone executable | `src-tauri/target/release/repo-creator.exe` |
| Per-user setup executable | `src-tauri/target/release/bundle/nsis/Repo Creator_1.0.0_x64-setup.exe` |
| MSI installer | `src-tauri/target/release/bundle/msi/Repo Creator_1.0.0_x64_en-US.msi` |

`npm run build` builds the frontend only. Use `desktop:build` to produce a working desktop application. Generated binaries are excluded from Git; the Windows CI workflow also uploads build artifacts for download.

## Verification

```powershell
npm run check
npm test
npm run test:ui
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

UI tests use installed Microsoft Edge and Tauri's official IPC mock. Native tests create real Git repositories in temporary directories, verify all README modes, the branch, commit and working tree, and test safe GitHub command arguments, remote verification and partial failure recovery. GitHub requests in tests are simulated; **tests never create real GitHub repositories**.

An additional opt-in test exercises the compiled Windows executable through its real WebView2 and Rust IPC:

```powershell
node tests/native-smoke.mjs
```

Run it with other instances of Repo Creator closed. It briefly backs up and replaces the harmless folder preference, restores it afterward, and leaves inspectable local test repositories and a report in ignored `artifacts/`. Its debugging port exists only for the launched test process. Release builds do not enable debugging themselves.

## Reliability and recovery

- Existing project folders and files are refused, never overwritten or removed.
- Repository names are validated in TypeScript and again in Rust, including Windows device names and path traversal.
- The selected parent folder is controlled by native state. The frontend cannot submit arbitrary filesystem paths or shell commands.
- Git and `gh` run with separate argument arrays, hidden console windows, bounded output and a two-minute timeout per command. Creation remains responsive and repeated submissions are blocked in both layers.
- A GitHub repository is created with `gh repo create --source --remote`, followed by an authenticated HTTPS push. The app retrieves its actual URL and compares the remote `main` commit with the local commit before showing success. It never creates a second README on GitHub.
- If publishing fails, the local project and commit are preserved. **Retry publishing** reuses a confirmed remote and does not create another one. Retries are available while the app remains open. After closing it, use the preserved folder and official Git/GitHub tools to finish publication.
- If a network interruption makes remote creation ambiguous, the app refuses to adopt an existing repository on the next attempt. Inspect GitHub and the preserved folder before finishing manually. No remote is deleted automatically, and pushes never use `--force`.
- Initial commits explicitly skip inherited hooks and signing, avoiding hidden prompts; your global Git configuration is left unchanged.
- GitHub mode sets the authenticated account's `id+username@users.noreply.github.com` email **only in the new repository** before committing. This preserves email privacy and prevents protected-email push rejections. Local mode uses your configured identity.
- Credentials remain managed by GitHub CLI. Only the parent location and destination are saved in `%APPDATA%/com.definitivedcode.repocreator/preferences.json`. Raw CLI error output is not displayed or logged because it can contain credentials.
- The app prevents closing its window during creation. If a process is forcibly terminated, any files already written remain on disk.

## Project layout

```text
src/                       React interface, appearance, types and validation
src-tauri/src/lib.rs        Narrow native commands and operation state
src-tauri/src/repository.rs Local creation and publication orchestration
src-tauri/src/github.rs     GitHub CLI arguments and URL validation
src-tauri/src/process.rs    Safe, bounded native process execution
src-tauri/src/preferences.rs Harmless local preferences
src-tauri/src/tests.rs      Native tests and fake GitHub runner
tests/                     Browser tests and opt-in production smoke test
```

No server, database or custom credential store is used. The webview has no filesystem, general shell or unrestricted opener plugin permissions; the only core permission is progress-event subscription. External links and project folders open through narrow Rust commands.

## Delivery notes

Version 1.0.0 builds successfully on Windows x64. The executable and both installers are **unsigned**; Windows may display its normal reputation warning. Signing requires a Windows code-signing certificate. GitHub publishing is covered by simulated command and recovery tests; no test repository has been published to your account.

Implementation references: [Tauri commands](https://v2.tauri.app/develop/calling-rust/), [Tauri capabilities](https://v2.tauri.app/security/capabilities/), [Windows packaging](https://v2.tauri.app/distribute/windows-installer/), [GitHub repository creation](https://cli.github.com/manual/gh_repo_create), and [GitHub authentication](https://cli.github.com/manual/gh_auth_login).
