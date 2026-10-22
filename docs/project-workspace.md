# Project workspace

Repo Creator 1.4 adds a local project library and development workspace alongside
repository creation. Choose **New Project** to create a repository, **Projects**
to return to one, **Presets** for reusable configurations, or **Settings** to
check the computer's setup. Simple and Advanced modes continue to share settings.

## Choose a technology stack

Select several technologies together. Search by name, filter by category, use a
stack preset, or add a custom label. Remove individual chips or clear the
selection. Simple Mode keeps common choices compact; expand its selector for the
full catalogue.

Technologies describe intent. Selecting React, Rust, SQLite and Cloudflare
Workers does not install them or imply that they share an application component.
The bounded **Browse technologies** picker stays open while you select several
entries. Search or use its category navigation, then close it with **Done** or
Escape; selected chips remain visible in the project form.

Selections inform ignore recommendations, generated AI context, project summaries
and handoff prompts. Review suggested ignore groups before creating the project.
Older single-technology configuration and project presets remain supported.

## Keep a project library

Created projects enter **Projects**. Use **Add existing repository** to select an
existing local Git repository. Repo Creator checks only the selected directory;
it does not scan your drives or execute package scripts.

Search and sort the library, pin useful projects, and open a workspace to inspect
its location, Git branch/status and technology summary. The stored identity is
the directory rather than the repository name, so projects with matching names
can coexist. If a folder moves, use its location recovery action. Removing a
project removes its library entry; it never deletes the source folder.

Workspace preferences are local application data. Opening a project does not
write configuration into its source tree.

The Git overview is a safe summary: it disables repository-configured filters
and fsmonitor hooks, avoids index writes and does not inspect submodule contents.
Projects using content filters such as Git LFS may show changes in this summary.
Use your terminal for the full Git status when needed. The library retains up to
100 projects, with a bounded local history file.

## Open development tools

The workspace and creation result provide a compact launcher for the folder,
terminal, VS Code, Claude Code CLI, Codex CLI, Antigravity CLI and Antigravity IDE.
Available tools appear first; expand **Other tools** for integrations that need
attention. Status distinguishes a missing executable, an invalid configured path
and an installation that cannot be checked. Use **Refresh** after installing or
moving a tool, or configure its executable path manually.

Passive discovery checks filesystem locations only. It never starts an editor,
assistant, terminal, browser, authentication flow, or `--help`/`--version` probe.
Results use a short bounded cache; explicit refresh bypasses it. Antigravity's
`agy` CLI and IDE are detected independently. Only choosing a launch action starts
an external application.

Choose a terminal preference and, when automatic discovery cannot find a tool,
provide an absolute executable path under **Advanced Executable Configuration**
in project settings. Manual overrides are collapsed by default. Paths are validated.
Windows supports Windows Terminal and PowerShell; macOS supports Terminal. Tool
discovery includes common user and Homebrew locations for Finder-launched apps.

Interactive assistants open in a real terminal in the project directory. Repo
Creator leaves their authentication, workspace trust and approval choices to
the tools themselves. It does not add unrestricted execution flags.

The workspace displays conventional Windows drive/UNC paths while retaining
canonical paths internally. Long paths and Unicode directory names are preserved.

Official launch references checked for this implementation:

- [Claude Code CLI](https://code.claude.com/docs/en/cli-reference): `claude`.
- [Codex CLI](https://learn.chatgpt.com/docs/codex/cli): `codex`.
- [Antigravity CLI](https://antigravity.google/docs/getting-started?tab=cli): `agy`.
- [Windows Terminal arguments](https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments).

## Configure commands

In **Commands**, add a command with a name, category and optional description.
Categories are organisational labels: Setup, Development, Build, Test, Lint,
Deploy and Custom. Several commands may use the same category.

Choose one execution representation:

- **Executable**: name or absolute executable path plus separate arguments.
  Each argument remains a distinct value. Shell operators are not interpreted.
- **Shell**: an explicitly authored command interpreted by PowerShell on Windows
  or the platform shell on macOS. Use this deliberately for pipelines and shell
  syntax; commands may need different syntax across operating systems.

On Windows, recognised npm, npx, pnpm and Yarn batch shims are resolved to their
Node entry points, including Corepack, so separate arguments stay literal.
Other `.cmd` and `.bat` programs require explicit Shell mode.

The working directory defaults to the project root. Supply an existing relative
subdirectory or an absolute directory. The native backend verifies it before
launch. Environment overrides are for non-secret configuration only. Keep
credentials in your normal operating-system environment or the tool's credential
store. Obvious credential-like environment names are rejected; no naming check
can determine whether an arbitrary value is a secret.

Edit, disable, delete or reorder saved commands. **Suggested commands** reads
recognised project manifests, such as `package.json` scripts or a valid Cargo
manifest, and offers commands for review. Selecting a technology alone does not
invent a working build system. Discovery never runs scripts or installs packages.

## Run and stop

Only **Run** starts a command. Imported templates and discovered suggestions
require explicit review of the actual command and working directory. They never
run merely because you opened a project or applied a preset.

The output panel shows stdout/stderr, running state, elapsed time and the final
exit code. Use **Stop** for a long-running server; process-tree cleanup includes
ordinary child processes. Closing Repo Creator stops managed command processes.
Commands deliberately launched in an external terminal belong to that terminal.
Use a terminal for interactive prompts; the output panel is not a terminal
emulator and does not provide interactive stdin.

Duplicate running instances of the same saved command are blocked. Retained
output and completed-run history are bounded. Copy the output before clearing
it if needed, and review it for credentials before sharing: tools can print
secrets inherited from your environment, and Repo Creator cannot reliably redact
arbitrary process output.

A project can save up to 64 commands. Up to eight commands can run at once across
the application; the latest 40 runs retain at most 256 KiB of output each. Run
output is kept in memory, not written into project source or exported presets.

## Reuse command presets

Save workspace commands through the existing project preset system. A preset
stores command templates alongside the project configuration. Import templates
into another workspace, then review their commands and working directories.
An imported command is not evidence that its executable, dependencies or scripts
exist on this machine.

Portable JSON exports remove command environment values and machine-specific
working directories. Imported commands are always marked for review. Shell
commands and absolute executable locations may need editing on another platform.
Review all authored text before sharing a preset; do not put secrets into command
arguments, descriptions or shell text.
