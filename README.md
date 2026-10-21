# Repo Creator 1.3.1

A Windows and macOS desktop utility for creating local or GitHub repositories with configurable project files and AI coding-agent instructions. Built with Tauri 2, React, TypeScript and Rust. AI Agent Studio generates project-local configuration; it does not run agents or require AI credentials.

## Create a repository

New installations open in **Simple** mode. Enter a project name and optional idea, choose a **Starting point**, optional technology and assistant, then a native save location. Choose **On this computer** or **Computer and GitHub**, select **Review project**, inspect the destination and generated files, and choose **Create Project**. The app creates a new child folder, generates the selected files, initialises Git and verifies the initial commit. Existing files and folders are never overwritten.

The neutral **System / Light / Dark** desktop workspace has a navigation rail, an independently scrolling main pane, and a contextual file panel on wider windows. **Overview**, **Project Files**, **AI Agents**, **Review**, **AI Handoff**, **Recent Projects** and **Setup & status** keep related work together. The review/create action stays at the bottom. The compact Overview fits ordinary local and GitHub setup without scrolling at default size. Independent fields share rows, secondary help lives in the context panel, and long file lists scroll within bounded areas. Expanded editors, increased text size and smaller windows retain normal scrolling. The default window is 1100×740 with an 820×580 minimum; window size and maximized state are remembered.

**Simple** hides technical Git, file and AI rule editors. **Advanced** exposes every existing setting through local subsections. Both use the same configuration, so navigation and switching modes preserve settings. Existing v1.1/v1.2 installations migrate to Advanced; fresh installations start Simple. The Review pane uses the same Rust generator that writes the project files.

### Runtime requirements

- Windows 11 x64 and [Microsoft Edge WebView2](https://developer.microsoft.com/microsoft-edge/webview2/). Installers can bootstrap WebView2 if needed.
- macOS 11 or newer; Apple Silicon and Intel test builds are provided by GitHub Actions after successful packaging. See the [Mac testing guide](docs/macOS-testing.md).
- [Git](https://git-scm.com/downloads) with a commit identity. **Setup & status** explains requirements, provides official installation links, and can set an identity only in the new repository. Alternatively, configure Git yourself:

  ```powershell
  git config --global user.name "Your Name"
  git config --global user.email "you@example.com"
  ```

- For publishing: [GitHub CLI](https://cli.github.com/) on `PATH`, authenticated to an account with permission to create the selected repository.
- VS Code is optional. The app detects native Windows/macOS installations and explains when it is unavailable.

Use **Recheck** after installing a tool. Executable discovery includes common Homebrew and user-install locations when Finder does not inherit a Terminal PATH. Local mode works offline. **Connect to GitHub** opens the official `gh auth login --web` device flow in an interactive terminal and browser; select **Check connection** afterward. Credentials remain with GitHub CLI.

## Configuration

### Project presets

Choose **Blank repository**, **Experiment**, **Standard**, **Website**, **Desktop Application**, or **Claude Experiment**, alongside the retained Default, Web application, React / Vite, Python, Rust, Tauri and Unity presets. Experiment uses a short exploratory README, safe file exclusions, no license and a Discovery handoff. Claude Experiment includes Claude instructions without requiring Claude to be installed. Presets select README sections, ignore rules and appropriate optional files. They configure the repository; they do not install dependencies or scaffold frameworks.

All options remain editable after selection. **Manage…** saves current settings with a name and description, duplicates built-ins, loads or restores defaults, updates custom presets, renames and deletes them, and imports/exports portable versioned JSON through native dialogs. Applying a preset has an **Undo preset change** action. Built-ins cannot be overwritten. Project names, GitHub owner details, credentials and save paths are excluded; the optional project brief and preferred handoff template are included. Imported files are bounded to 1 MiB, strictly validated, and shown for review before adding a new preset. Duplicate names and unsupported schemas are reported; imports never install or execute anything.

Saved project presets now include destination, visibility and the complete AI Studio configuration alongside existing file/Git/action settings. Older v1.1 presets remain loadable and start with AI disabled. Built-in project presets recommend intended technologies without claiming to scaffold or inspect an implementation.

### AI Agent Studio

In Advanced mode open **AI Agents → Assistants**, enable **Generate AI agent files**, and select one or more tools. AI is off by default. The existing workflow remains available without generating any AI files.

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

Open **Project Files → Gitignore** to search and combine 18 curated presets:

- General: operating-system files, environment/local secrets, editors/IDEs, temporary files/logs.
- JavaScript/web: Node.js, React, Vite, Next.js, TypeScript, frontend builds.
- Languages: Python, Rust, C#, C++, Java.
- Applications/engines: Tauri, Unity, .NET.

The default selection covers operating-system files and `.env` secrets while retaining `.env.example`, `.env.sample` and `.env.template`. Project presets recommend suitable combinations, and **Use project preset recommendations** can restore them after changes. You can override every selection.

Add individual custom patterns and remove them independently. Their order is preserved, and they are applied after preset rules. Duplicate positive rules are omitted only when no intervening negation could change their meaning. Negations and subsequent re-ignore rules retain their order. Patterns are not trimmed or rewritten. Selecting no presets and no custom rules generates no `.gitignore`.

The live preview is produced by the same Rust generator used to write the actual file, before staging. The templates avoid excluding Rust `Cargo.lock`, Unity `Assets`, `Packages`, `ProjectSettings`, or `.meta` files. Git's directory traversal rule still applies: to retain `scratch/keep.txt`, use `scratch/*` followed by `!scratch/keep.txt`, rather than ignoring `scratch/` itself. See [Git's ignore documentation](https://git-scm.com/docs/gitignore).

### README and licenses

README modes are **None**, **Minimal**, **General**, and **Custom**. General and Custom expose independent overview, features, installation, usage, development, contributing and license sections. Fresh defaults and built-in presets select only overview and license, avoiding comment-only headings on GitHub. Saved and explicitly requested sections are preserved; an explicitly selected empty section still contains an editable comment. Custom supports Markdown content for each selected section. Unknown details are marked with editable HTML comments, never invented commands or functionality. A license section is generated only when a license file is selected.

License choices are **None** (default), **MIT**, **Apache-2.0**, **GPL-3.0**, **BSD-3-Clause**, and **Unlicense**. Texts are bundled from the official [SPDX License List Data v3.29.0](https://github.com/spdx/license-list-data/tree/v3.29.0/text) for offline generation. GPL-3.0 uses GPL-3.0-only. Applicable licenses require an editable copyright holder and year; the holder is initially suggested from Git identity. MIT/BSD fields are substituted; Apache/GPL retain the complete canonical text and instructional appendices, with a separate project copyright notice. Unlicense remains unchanged.

Open **Review** to inspect a searchable file tree, generated-file count and syntax-highlighted Markdown, TOML, JSON, MDC and YAML metadata. It uses the same Rust generator as repository creation. Invalid configuration must be corrected before creation. The initial commit stages exactly the selected generated files, even if a broad local/global ignore rule matches them; unrelated runtime files are not staged.

### Advanced Git settings and actions

Choose a valid **Initial branch** and **Initial commit message**. Defaults remain `main` and `Initial commit`. With no generated files, the app creates an empty initial commit. The Blank preset is a shortcut to that configuration.

Optional `.editorconfig` uses UTF-8, LF endings and final newlines, retaining significant trailing whitespace in Markdown. Optional `.gitattributes` enables automatic text detection and identifies common binary formats. Neither assumes an indentation style or framework.

Independent post-creation actions can open the folder, VS Code, and the GitHub page. A launcher failure is reported on the success screen without falsely marking repository creation as failed. These actions never run after incomplete creation. The success screen also has manual open actions and copy controls for the path and GitHub URL.

## Local AI Project Handoff

**AI Handoff** creates deterministic prompts on this computer. No model, AI API, account or network request is involved. Three templates cover **Project Discovery**, **Architecture & Planning**, and **Development Handoff**. Five styles tailor the next conversation: Beginner Guide, Rapid Prototype, Architecture First, Production-Oriented, and Coding Agent Implementation.

An optional Project Brief supplies the concept, audience, first version, preferred technologies and constraints. Missing details stay unspecified. Planning prompts describe proposed files; post-creation prompts use the verified path, branch, file list and actual remote URL. A private URL never implies chatbot access to its contents.

Edit the prompt, regenerate explicitly, copy it or save Markdown/text through a native dialog. Duplicate built-ins into custom templates, edit/rename/delete them, restore template text, or import/export validated JSON. Supported variables are listed in the editor. Unknown variables and unsupported versions are rejected. Empty brief fields are omitted and built-in prompts use readable labeled context. Template/style/context changes retain prompt edits until you explicitly regenerate; navigation retains the current prompt and template-editor drafts in memory. Invalid or newer saved template data is kept read-only with a notice.

The success screen keeps the project path, branch, commit, remote URL and open actions visible first. Generated files appear as a count with a collapsible preview/tree, and **AI Project Handoff** expands the prompt panel. **Recent Projects** stores up to 20 creation records with name, time, path, verified remote URL, brief, preset, selected assistants and generated file paths. It stores no generated file contents or prompt bodies. Reopen known folders/URLs, regenerate prompts or remove records. Missing/moved folders report an error without deleting history. This history describes creation time and does not inspect later changes.

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

The versioned v4 settings format migrates v1 location/destination settings, v2 project presets and v3 AI Studio settings, preserving existing configurations and choosing Advanced for existing users. The preferred experience mode is remembered. It remembers appearance, file/Git/action preferences, AI Studio configuration, instruction presets, specialist definitions and up to five native-picked recent locations. AI configuration has its own versioned structure. Malformed AI fields can fall back without discarding valid v1.1 file/Git settings, with a visible recovery notice. Original damaged settings are backed up before replacement; existing backups are retained. Settings from an unsupported future version are not overwritten. Writes and recovery backups use temporary files and replacement.

On macOS preferences use the native application configuration directory (`~/Library/Application Support/com.definitivedcode.repocreator`). Separate bounded `window.json` and `history.json` files hold presentation state and recent-project metadata. Custom prompt templates/styles are versioned in the webview’s local storage; edited prompt drafts are kept only in memory until the app closes.

For portable use or isolated smoke tests, the process environment may set `REPO_CREATOR_DATA_DIR` to an absolute local directory. This relocates preferences, history and window state together; normal launches use the native default. The webview cannot set this override.

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
| Per-user NSIS installer | `src-tauri/target/release/bundle/nsis/Repo Creator_1.3.1_x64-setup.exe` |
| MSI installer | `src-tauri/target/release/bundle/msi/Repo Creator_1.3.1_x64_en-US.msi` |

The first build downloads official NSIS/WiX tools. `npm run build` checks and builds the frontend only. Generated binaries, settings and test output are excluded from source control. CI builds explicit Windows x64, Apple Silicon ARM64 and Intel x86_64 targets. Successful macOS jobs upload `.dmg` installers and `.app.tar.gz` bundles with executable permissions preserved, verify Mach-O architecture and ad-hoc signatures, and run frontend/Rust checks before packaging. No release or tag is created. Windows builds are unsigned. Mac test builds are ad-hoc signed, **not notarized**; public distribution needs Apple signing/notarization credentials. CI packaging does not confirm a physical Mac launch. See the [Mac guide](docs/macOS-testing.md).

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

Workspace regressions verify zero overflow for normal Simple/Advanced local/GitHub Overview at the default size, bounded 40–100-file success views, rendering-scale emulation and increased root text size. They also inspect 1100×740 (default), 820×580 (minimum), 1440×900 (wide) and 1024×680 (laptop) in both themes. They verify navigation, main-pane scrolling, unclipped controls, absence of page overflow, review/creation states and preserved state across Simple/Advanced. Code previews retain independent scrolling. Fresh OS/environment ignore defaults and explicit saved selections are covered separately.

After building, an opt-in smoke test exercises the production executable through its real WebView2 and Rust commands:

```powershell
node tests/native-smoke.mjs
```

The test isolates app data and WebView2 state in a temporary directory, uses temporary local project directories, checks preview/output equality, custom Git settings, empty commits, metadata history and both themes, then removes its temporary directories. Other running instances keep their own settings. A compact report and a few inspection screenshots remain in ignored `artifacts/`. The debugging port is enabled only in the launched test process; normal release launches do not enable it.

The v1.3 production smoke test creates temporary Blank, Experiment and advanced multi-assistant local projects, verifies previews, exact files, Git branches and commits, and captures the workspace in both themes and supported sizes. It never publishes test repositories.

See [the v1.3.1 quality inventory](docs/v1.3.1-quality-audit.md) and [the architecture audit and integration boundaries](docs/v1.3-architecture.md) for the release design.
