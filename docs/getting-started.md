# Getting started

Repo Creator creates new Git repositories on your computer. Publishing to GitHub is optional. A local project works without GitHub, a coding assistant or an AI account.

## Download and install

Published prereleases are available from [GitHub Releases](https://github.com/DefinitivedCode/RepoCreator/releases). Choose a version and download the asset for your computer. Read its notes and compare its SHA-256 checksum with `SHA256SUMS.txt` before opening it. A matching checksum checks file integrity; it does not replace a trusted publisher signature. Features and screenshots on `main` may be newer than the published package.

| Platform            | Package                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Windows x64         | `windows-x64-unsigned-setup.exe` for the per-user installer, or `windows-x64-unsigned.msi` |
| macOS Apple Silicon | `macos-arm64-adhoc.dmg`                                                                    |
| macOS Intel         | `macos-x64-adhoc.dmg`                                                                      |

The full filename also includes Repo Creator and its version. Source-code archives are for development; they are not application installers. You do not need Rust, Node.js or this repository to use a packaged application.

On Windows, run one installer and follow its prompts. The installer can download the official WebView2 runtime when needed. Builds are unsigned, so Windows or your browser may warn about the publisher or an unfamiliar download. Review the source and release notes, follow [Microsoft's SmartScreen guidance](https://support.microsoft.com/en-us/edge/how-can-smartscreen-help-protect-me-in-microsoft-edge), and stop if you cannot establish trust. Do not disable Windows security protections to install the app.

Mac users should follow the [Mac installation and testing guide](macOS-testing.md). Current builds are ad-hoc signed and not notarized.

The repository and published downloads are public. For development test builds, see a successful [Actions run](https://github.com/DefinitivedCode/RepoCreator/actions/workflows/windows.yml) and its available artifacts; GitHub may require sign-in. Ordinary PR checks compile the application without creating installers. Use Releases for installable packages; see the Mac guide or [release preparation](releases.md) for packaging details.

## First launch and setup

The first time you open Repo Creator with no projects, a welcome checklist replaces the main window. **Required** items are Git and your commit identity; **Optional** items are publishing to GitHub and editors. Each unfinished row has a button that fixes it in place, and **Create my first project** unlocks when the required items are ready. If you already have projects, Repo Creator checks quietly instead and never interrupts you. You can revisit it any time under **Settings → Setup**, where **Run setup again** shows the checklist on the next start without resetting anything else. Repo Creator never installs software: for Git or GitHub CLI it opens the official download page and shows a command you can copy.

## Keyboard shortcuts

Ctrl+N (Command+N on macOS) starts a new project and Ctrl+, (Command+,) opens Settings. Each also has a visible control in the sidebar.

## Check Git

1. Open Repo Creator and select **Settings**.
2. If Git is missing or older than 2.28, use **Install Git** (or **Update Git**) and install it from the official source.
3. Return to the app and select **Recheck**. If it is still unavailable, reopen the app and see [Troubleshooting](troubleshooting.md).
4. Settings shows the name and email Git already has, and where each came from. If either is missing, enter them under **Commit identity**. Git records them with every commit, so use an email you are comfortable recording in Git history; GitHub offers a [private no-reply address](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).
5. Choose where the identity applies:
   - **Use only for Repo Creator projects** (the default) saves it in Repo Creator and applies it inside each new project. Your global Git settings are not changed.
   - **Set as my Git default** shows the exact `git config --global` commands, the file they edit and any value they replace. Nothing changes until you select **Save to my Git configuration**.

Local creation requires Git and a commit identity. While something is missing, the footer names it and offers a fix without losing what you have entered.

## Create your first local project

1. Enter a project name, for example `Learning Notes`. Repo Creator shows the final repository name (`learning-notes`) before creation. Spaces, underscores and repeated hyphens become a single hyphen; letters become lowercase. The readable title is kept in the README. Names must still be valid on Windows and macOS: paths, control characters, reserved device names and `.git` endings are rejected.
2. Add a short description if useful, then select **Experiment** as the starting point. It creates a lightweight README and safe file exclusions without choosing a license.
3. Leave **AI coding assistant** set to **None**, or select a tool whose project instructions you want to generate. Installation of the assistant is not required.
4. Choose **Browse…** and a parent folder you can write to, such as a folder inside Documents. Select **On this computer**.
5. Select **Review project**. Check the destination and generated files, then choose **Create Project**.
6. On success, use **Open Folder**. The screen shows the branch, initial commit and generated-file count. Expand **Generated files** to inspect the creation previews.

The project gets a new child folder. Repo Creator refuses to overwrite an existing folder or file with the same name. **Blank repository** creates only a Git repository with an empty initial commit.

## Publish to GitHub

Install [GitHub CLI](https://cli.github.com/) first. In **Settings → GitHub**, select **Connect to GitHub**. A terminal window opens and shows a one-time code; enter it on github.com, then return to Repo Creator. The app checks again when you return to its window, or you can select **Check GitHub connection**. Repo Creator never asks for a password or token. If it cannot reach GitHub to check your sign-in, it says so and offers **Retry** instead of reporting that you are signed out.

In Overview, set the destination to **GitHub**, choose an owner, and review **Private** or **Public** visibility. GitHub enforces account and organisation permissions. Creation still makes a local repository, then publishes its initial commit. GitHub projects use the verified account's no-reply commit email for that initial commit.

Keep the app open while it creates the project. If publication fails after local creation, the local files and commit remain available. Read the displayed recovery guidance before retrying; see [publication recovery](troubleshooting.md#github-publication-failed).

## Choose an appearance

Open **Settings → Appearance** to choose System, Light or Dark and an accent:
Slate, Muted Teal, Muted Gold, Copper, Monochrome or Custom. Fresh installations
use Muted Teal (`#4FA69B`). Existing installations keep their saved theme and
start with Copper when no accent was previously saved.

For Custom, use the colour picker or enter a six-digit hexadecimal colour such as
`#436F7A`. Valid changes apply immediately and persist locally. Invalid text
keeps the previous colour. The app derives readable shades for buttons, text and
focus indicators in each theme; status colours retain their meaning.
**Reset to default** restores System and Muted Teal. Appearance settings do not
change project configuration or generated files.

## Adjust the project

Every section, including **Project Files** and **AI Agents**, is available to everyone. **Settings → General → Show advanced options by default** only changes how much detail pickers such as the technology selector show at first; it never discards configuration.

- **Project Files** controls README sections, ignore rules, project license text, optional `.editorconfig`/`.gitattributes`, Git branch/commit and opening actions. Preview before creation. A generated project's license is your choice and is separate from Repo Creator's MIT License.

- **AI Agents** configures optional assistants, specialists and skills. It generates local instruction/configuration files; it does not run a model or install tools.
- **Manage…** saves, updates, duplicates, imports and exports project presets. Applying a preset offers **Undo preset change**. Imports are reviewed before use and do not execute code.
- **AI Handoff** prepares editable prompts locally. Missing details are omitted. Changing a template or style keeps your edits until **Regenerate**. Copying a prompt into another service shares the text you choose to send.

README presets keep documentation concise: General uses selected sections with known details, Minimal includes the title and description, Custom also lets you author section Markdown, and None omits the file. Empty sections and comment-only placeholders are omitted. Selected technologies describe project intent; Repo Creator does not invent setup commands or source folders. The optional **Created with Repo Creator** footer is off by default. The preview shows the exact generated file.

- **Projects** opens the local library and workspace, including Git status, launchers, saved commands and project preferences. Add an existing Git repository without scanning the filesystem. See the [project workspace guide](project-workspace.md).

Preferences, custom presets and recent-project metadata stay in local app storage. They can contain project descriptions, paths and authored configuration. Review settings files and screenshots for private information before sharing them. GitHub credentials remain managed by GitHub CLI.
