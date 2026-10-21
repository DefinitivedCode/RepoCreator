# Repo Creator 1.2.0

A Windows desktop utility for creating local or GitHub repositories with configurable project files and AI coding-agent instructions. Built with Tauri 2, React, TypeScript and Rust. AI Agent Studio generates project-local configuration; it does not run agents or require AI credentials.

## Create a repository

Open Repo Creator, enter a project name, choose **Local only** or **GitHub**, select the parent location, and click **Create Repository**. The app creates a new child folder, generates the selected files, initialises Git and verifies the initial commit. Existing files and folders are never overwritten.

The neutral light/dark interface follows Windows appearance or your **System / Light / Dark** selection. A scrolling content area holds expanded settings while the creation action remains available in the footer. Native title-bar controls and window resizing are retained.

### Runtime requirements

- Windows 11 x64 and [Microsoft Edge WebView2](https://developer.microsoft.com/microsoft-edge/webview2/). Installers can bootstrap WebView2 if needed.
- [Git for Windows](https://git-scm.com/downloads/win) on `PATH`, with a commit identity. If missing, the app shows these setup commands:

  ```powershell
  git config --global user.name "Your Name"
  git config --global user.email "you@example.com"
  ```

- For publishing: [GitHub CLI](https://cli.github.com/) on `PATH`, authenticated to an account with permission to create the selected repository.
- VS Code is optional. The app detects its native Windows executable and explains when it is unavailable.

Reopen Repo Creator after installing a command-line tool so it inherits the updated `PATH`. Local mode works offline. **Connect to GitHub** opens the official `gh auth login --web` device flow in an interactive terminal and browser; select **Check connection** afterward. Credentials remain with GitHub CLI.

## Configuration

### Project presets

Choose **Default**, **Blank repository**, **Web application**, **React / Vite**, **Python project**, **Rust project**, **Tauri application**, or **Unity project**. Presets select README sections, ignore rules and appropriate optional files. They configure the repository; they do not install dependencies or scaffold frameworks.

All options remain editable after selection. **Manage…** lets you save the current configuration as a named preset, load it, rename it, or delete it after confirmation. **Reset configuration** restores the default configuration while retaining the project identity and location. Names, descriptions, GitHub owner details and credentials are not included in custom presets.

Saved project presets now include destination, visibility and the complete AI Studio configuration alongside existing file/Git/action settings. Older v1.1 presets remain loadable and start with AI disabled. Built-in project presets recommend intended technologies without claiming to scaffold or inspect an implementation.

### AI Agent Studio

Expand **AI Agents**, enable **Generate AI agent files**, and select one or more tools. AI is off by default. The existing workflow remains available without generating any AI files.

| Tool | Generated integration |
| --- | --- |
| OpenAI Codex | Shared `AGENTS.md`; optional `.codex/config.toml` and `.codex/agents/*.toml` |
| Claude Code | `CLAUDE.md` importing `AGENTS.md`; scoped `.claude/rules/*.md`, specialist `.claude/agents/*.md`, optional settings |
| GitHub Copilot | `.github/copilot-instructions.md`, scoped `.github/instructions/*.instructions.md`, specialist `.github/agents/*.agent.md` |
| Cursor | Current `.cursor/rules/*.mdc`, with always-applied, file-pattern or agent-requested metadata |
| Gemini CLI | `GEMINI.md` importing shared instructions, or optional `.gemini/settings.json` selecting `AGENTS.md` directly |
| OpenCode | Shared `AGENTS.md`; optional `opencode.json` and `.opencode/agents/*.md` |

Choose **Minimal**, **Practical**, **Strict**, **Autonomous**, **Review First**, or **Custom** as an editable starting point. Individual implementation, verification, Git, documentation, safety and communication rules each affect the generated instructions. Advanced controls edit their wording, intended technology guidance, project context and working approach. Presets select rules rather than layering contradictory fixed prompts. User-authored wording remains the user's responsibility.

**Additional project instructions** accepts multiline Markdown. Save and load reusable instruction presets independently of project presets. Resetting preset rules preserves additional text. Importing UTF-8 Markdown (up to 64 KiB) asks whether to append or replace when text already exists. Import/export of portable JSON instruction presets uses native file dialogs; no remote skills or configuration are installed.

Optional specialists are **Code Reviewer**, **Debugger**, **Test Engineer**, **Documentation Writer**, **Architecture Reviewer**, **Security Reviewer** and **Implementation Assistant**. Edit a copy or create a custom role with its own ID, purpose, instructions, supported targets and review-only intent. Save definitions in the local library and reuse them in configurations. Project presets embed their definitions, so deleting a library entry does not break saved configurations. Specialist output targets Codex, Claude, Copilot and OpenCode; models are inherited.

Four optional task skills—**Focused Code Review**, **Debugging Workflow**, **Documentation Maintenance** and **Release Verification**—share one `.agents/skills` directory. This version limits skill generation to the verified Codex/OpenCode discovery paths. It does not generate specialist equivalents for Cursor or Gemini.

Optional settings are off until selected: Codex uses on-request approval with read-only or network-disabled workspace access; Claude uses standard prompts or plan mode; Gemini can load the shared context directly; OpenCode can ask before edits and shell commands. No settings select a model, add authentication, configure an MCP server or alter home-directory agent preferences. Codex specialist permission boundaries remain inherited; its review-only role wording and disabled shell capability do not create a separate read-only sandbox.

See [verified agent formats and compatibility decisions](docs/agent-formats.md) for official sources and supported boundaries.

### .gitignore

Expand **.gitignore** to search and combine 18 curated presets:

- General: operating-system files, environment/local secrets, editors/IDEs, temporary files/logs.
- JavaScript/web: Node.js, React, Vite, Next.js, TypeScript, frontend builds.
- Languages: Python, Rust, C#, C++, Java.
- Applications/engines: Tauri, Unity, .NET.

The default selection covers operating-system files and `.env` secrets while retaining `.env.example`, `.env.sample` and `.env.template`. Project presets recommend suitable combinations, and **Use project preset recommendations** can restore them after changes. You can override every selection.

Add individual custom patterns and remove them independently. Their order is preserved, and they are applied after preset rules. Duplicate positive rules are omitted only when no intervening negation could change their meaning. Negations and subsequent re-ignore rules retain their order. Patterns are not trimmed or rewritten. Selecting no presets and no custom rules generates no `.gitignore`.

The live preview is produced by the same Rust generator used to write the actual file, before staging. The templates avoid excluding Rust `Cargo.lock`, Unity `Assets`, `Packages`, `ProjectSettings`, or `.meta` files. Git's directory traversal rule still applies: to retain `scratch/keep.txt`, use `scratch/*` followed by `!scratch/keep.txt`, rather than ignoring `scratch/` itself. See [Git's ignore documentation](https://git-scm.com/docs/gitignore).

### README and licenses

README modes are **None**, **Minimal**, **General**, and **Custom**. General and Custom expose independent overview, features, installation, usage, development, contributing and license sections. Custom supports Markdown content for each selected section. Unknown details are marked with editable HTML comments, never invented commands or functionality. A license section is generated only when a license file is selected.

License choices are **None** (default), **MIT**, **Apache-2.0**, **GPL-3.0**, **BSD-3-Clause**, and **Unlicense**. Texts are bundled from the official [SPDX License List Data v3.29.0](https://github.com/spdx/license-list-data/tree/v3.29.0/text) for offline generation. GPL-3.0 uses GPL-3.0-only. Applicable licenses require an editable copyright holder and year; the holder is initially suggested from Git identity. MIT/BSD fields are substituted; Apache/GPL retain the complete canonical text and instructional appendices, with a separate project copyright notice. Unlicense remains unchanged.

Expand **File preview** to inspect a searchable file tree, generated-file count and syntax-highlighted Markdown, TOML, JSON, MDC and YAML metadata. It uses the same Rust generator as repository creation. Invalid configuration must be corrected before creation. The initial commit stages exactly the selected generated files, even if a broad local/global ignore rule matches them; unrelated runtime files are not staged.

### Advanced Git settings and actions

Choose a valid **Initial branch** and **Initial commit message**. Defaults remain `main` and `Initial commit`. With no generated files, the app creates an empty initial commit. The Blank preset is a shortcut to that configuration.

Optional `.editorconfig` uses UTF-8, LF endings and final newlines, retaining significant trailing whitespace in Markdown. Optional `.gitattributes` enables automatic text detection and identifies common binary formats. Neither assumes an indentation style or framework.

Independent post-creation actions can open the folder, VS Code, and the GitHub page. A launcher failure is reported on the success screen without falsely marking repository creation as failed. These actions never run after incomplete creation. The success screen also has manual open actions and copy controls for the path and GitHub URL.

## GitHub publishing and recovery

GitHub mode defaults to **Private**, supports Public, shows the current account, and allows that account or one of its visible organisations as owner. Organisation membership does not guarantee repository-creation permission; GitHub enforces the organisation's policies. Account switching remains managed by GitHub CLI. Advanced GitHub details support up to 20 topics and an HTTP(S) homepage.

The app uses `gh repo create --source --remote`, configures the requested topics/homepage, and pushes through GitHub CLI's HTTPS credential helper. It retrieves the actual repository URL, compares the remote branch's commit with the local commit, and sets the requested initial branch as GitHub's default before reporting full success. It never creates a second README remotely and never force-pushes.

GitHub mode sets the authenticated account's `id+username@users.noreply.github.com` address **only in the new repository** before committing, preventing protected-email push rejection. Local mode uses your configured identity. Global Git settings are not changed. Initial commits skip inherited signing and hooks to prevent hidden prompts.

If remote creation, metadata configuration, pushing, verification or default-branch configuration fails, local files and commits remain on disk. **Retry publishing** reuses a remote whose creation was confirmed. It checks that the original account, local commit, branch and location still match. A remote repository is never automatically deleted.

If a network interruption leaves remote creation ambiguous, the app refuses to adopt an already-existing repository on a later attempt. Inspect the preserved folder and GitHub before completing publication manually. Retry state lasts for the current app session; after restarting, finish through the preserved repository using Git/GitHub CLI.

## Settings and safety

Only harmless preferences and custom configurations are stored in:

```text
%APPDATA%/com.definitivedcode.repocreator/preferences.json
```

The versioned v3 settings format migrates v1 location/destination settings and v2 project presets. It remembers appearance, file/Git/action preferences, AI Studio configuration, instruction presets, specialist definitions and up to five native-picked recent locations. AI configuration has its own versioned structure. Malformed AI fields can fall back without discarding valid v1.1 file/Git settings, with a visible recovery notice. Original damaged settings are backed up before replacement; existing backups are retained. Settings from an unsupported future version are not overwritten. Writes and recovery backups use temporary files and replacement.

The frontend cannot supply arbitrary output paths or executable commands. All inputs are revalidated in Rust. Git and GitHub CLI receive structured arguments with bounded output and per-command timeouts. Raw command diagnostics are not displayed or logged because they can contain credentials. A backend operation guard prevents duplicate creation, and the window refuses normal closure during an operation. Files already created are preserved after a failure or forced termination.

There is no database, server, telemetry, custom token store, or broad filesystem/shell webview permission. The only core capability is progress-event subscription. VS Code launches through `Code.exe` directly, without interpolating project paths into a shell wrapper.

## Development and build

Install Node.js 22.18+, stable Rust (1.90+, tested with 1.98.1) with the MSVC toolchain, and Microsoft C++ Build Tools with **Desktop development with C++**. See the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows). MSI packaging requires the Windows VBScript optional feature.

```powershell
npm ci
npm run desktop:dev
```

Build the production application and both installers:

```powershell
npm run desktop:build
```

| Artifact | Path relative to repository root |
| --- | --- |
| Standalone executable | `src-tauri/target/release/repo-creator.exe` |
| Per-user NSIS installer | `src-tauri/target/release/bundle/nsis/Repo Creator_1.2.0_x64-setup.exe` |
| MSI installer | `src-tauri/target/release/bundle/msi/Repo Creator_1.2.0_x64_en-US.msi` |

The first build downloads official NSIS/WiX tools. `npm run build` checks and builds the frontend only. Generated binaries, settings and test output are excluded from source control. Windows CI runs checks and uploads the executable and installer artifacts. Builds are unsigned; code signing requires a signing certificate.

### Verification

```powershell
npm run check
npm run format:check
npm test
npm run test:ui
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Native tests create actual temporary Git repositories and verify generation, custom branches and commits, real ignore behaviour, canonical license content, migration/persistence, preset lifecycle, existing-directory protection, safe GitHub command construction and simulated partial failures. Browser tests use Tauri's official IPC mock and installed Edge to check light/dark layout, resizing, accessible controls, advanced settings, presets and recovery. Automated tests never create real GitHub repositories.

AI coverage includes all six adapters, all instruction presets and rule toggles, custom wording and Unicode, native specialist formats, scoped metadata, optional configuration, shared skill paths, deterministic previews, v1.1 migration, invalid paths/contents, and exact initial-commit contents with AI on/off. UI tests cover complete preset restore, instruction libraries, import/export calls, specialist reuse, escaped syntax previews and expanded Studio scrolling. Provider model sessions and native file-dialog interaction are not automated; import/export parsing and size limits are tested separately.

Scrolling regressions expand all configuration panels at 540×780 (default), 440×560 (minimum), 900×620 and 640×1000. They check wheel input, fractional pixel deltas representing touchpad input, keyboard navigation, native scrollbar dragging, disclosure changes, unclipped controls and the fixed Create Repository bar. Settings share one main scrollbar; code previews retain independent scrolling. Fresh OS/environment ignore defaults and explicit saved selections are covered separately.

After building, an opt-in smoke test exercises the production executable through its real WebView2 and Rust commands:

```powershell
node tests/native-smoke.mjs
```

Close other Repo Creator instances first. The test backs up/restores the actual harmless settings file, uses temporary local project directories, checks preview/output equality, licenses, custom Git settings, native preset persistence, empty commits and both themes, then removes its temporary directories. A compact report and a few inspection screenshots remain in ignored `artifacts/`. The debugging port is enabled only in the launched test process; normal release launches do not enable it.

The smoke test also runs the scrolling regressions in the production WebView2, resizing its owned native window to each supported test size through `tests/resize-window.ps1`.

It then configures all six integrations through the real Studio, saves custom instructions and a specialist, verifies syntax preview text, creates a local repository and checks every generated file against its preview and initial commit. Existing user settings are restored afterward.

### Code layout

```text
src/                         React interface, state, styles and inline validation
src-tauri/src/config.rs       Configuration types, built-in presets and validation
src-tauri/src/generation.rs   Shared preview/output generation
src-tauri/src/ai/             AI data model, validation, adapters, library/file-dialog commands and tests
src-tauri/src/repository.rs   Exclusive local creation and verified publication
src-tauri/src/github.rs       GitHub CLI arguments and account/URL validation
src-tauri/src/preferences.rs  Versioned settings and custom preset persistence
src-tauri/src/desktop.rs      Narrow native launchers and post-creation actions
src-tauri/resources/          Curated ignore patterns and canonical license texts
src/AgentStudio.tsx           Studio workflow, editable instructions and reusable presets
src/SpecialistEditor.tsx      Specialist selection, editor and local library
src/StudioAdvanced.tsx        Context, wording, scoped rules and optional settings
tests/                       Interface tests and production smoke test
```
