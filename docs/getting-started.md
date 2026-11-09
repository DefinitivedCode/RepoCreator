# Getting started

Repo Creator creates new Git repositories on your computer. Publishing to GitHub is optional. A local project works without GitHub, a coding assistant or an AI account.

## Download and install

Choose a version from GitHub Releases and download the package for your computer. Read its notes and compare its SHA-256 checksum with `SHA256SUMS.txt` before opening it. A matching checksum verifies file integrity. Use the signing information to assess publisher trust. Features and screenshots on `main` may be newer than the published package. [GitHub Releases](https://github.com/DefinitivedCode/RepoCreator/releases)

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

The first time you open Repo Creator with no projects, the welcome checklist shows whether Git and your commit identity are ready. GitHub publishing and development tools are optional. Use the fix on an unfinished row to complete it, then choose **Create my first project** or **Add an existing project**. Existing projects stay accessible while Repo Creator checks setup in the background. Revisit the checklist from **Settings → Setup**. **Run setup again** clears the completion flag and keeps your settings. The Git and GitHub CLI install actions open official pages and offer commands you can copy.

## Keyboard shortcuts

Ctrl+N (Command+N on macOS) starts a new project and Ctrl+, (Command+,) opens Settings. Each also has a visible control in the sidebar.

## Check Git

1. Open **Settings → Git & identity** from the sidebar.
2. If Git is missing or older than 2.28, use **Install Git** (or **Update Git**) and install it from the official source.
3. Return to the app and select **Recheck**. If it is still unavailable, reopen the app and see [Troubleshooting](troubleshooting.md).
4. Settings shows the name and email Git already has, and where each came from. If either is missing, enter them under **Commit identity**. Git records them with every commit, so use an email you are comfortable recording in Git history; GitHub offers a [private no-reply address](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).
5. Choose where the identity applies:
   - **Use only for Repo Creator projects** (the default) saves it in Repo Creator and applies it inside each new project. Your global Git settings are not changed.
   - **Set as my Git default** shows the exact `git config --global` commands, the file they edit and any value they replace. Nothing changes until you select **Save to my Git configuration**.

Local creation requires Git and a commit identity. The footer names an unmet requirement. Activate **Create project** to see the checklist and its fix actions while keeping your form entries.

## Create your first local project

1. Enter a project name, for example `Learning Notes`. Repo Creator shows the final repository name (`learning-notes`) before creation. Spaces, underscores and repeated hyphens become a single hyphen; letters become lowercase. The readable title is kept in the README. Names must still be valid on Windows and macOS: paths, control characters, reserved device names and `.git` endings are rejected.
2. Add a short description if useful, then select **Experiment** as the starting point. It creates a lightweight README and safe file exclusions without choosing a license.
3. Leave **AI coding assistant** set to **None**, or select a tool whose project instructions you want to generate. Installation of the assistant is not required.
4. Choose **Browse…** and a parent folder you can write to, such as a folder inside Documents. Select **On this computer**.
5. Check the **Generated files** pane, or open **Preview files** from the footer in a narrower window. Use **Find generated files** to filter paths, select a file to preview it and choose **Expand preview** for a larger view. The pane also shows the branch, initial commit message and author. Select **Create project** when ready.
6. On success, use **Open Folder** or **Open project workspace**. The screen shows the branch, initial commit and generated-file count. Expand **Generated files** to inspect the created contents.

The project gets a new child folder. Repo Creator refuses to overwrite an existing folder or file with the same name. **Blank repository** creates only a Git repository with an empty initial commit.

## Publish to GitHub

Install [GitHub CLI](https://cli.github.com/) first. In **Settings → GitHub**, select **Connect to GitHub**. A terminal window opens and shows a one-time code; enter it on github.com, then return to Repo Creator. The app checks again when you return to its window, or you can select **Check GitHub connection**. Repo Creator never asks for a password or token. If it cannot reach GitHub to check your sign-in, it says so and offers **Retry** instead of reporting that you are signed out.

In Overview, set the destination to **GitHub** and choose an owner and **Private** or **Public** visibility. **Create project** opens a confirmation with the repository name, visibility and branch. **Create on GitHub** makes the local repository and publishes its initial commit. GitHub enforces account and organisation permissions. The initial commit uses the verified account's no-reply email.

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

**New Project** is one scrolling page. The section index takes you to **Overview**, **Project Files** or **AI Agents**. **Customize files** and **Customize AI agents** open in place when the content area is wide enough. In the focused editor, **Back** returns you to the section and keeps your changes. Use **Settings → General → Show advanced options by default** to open detailed pickers and wide editors by default.

- **Project Files** controls README sections, ignore rules, project license text, optional `.editorconfig`/`.gitattributes`, Git branch/commit and opening actions. Preview before creation. A generated project's license is your choice and is separate from Repo Creator's MIT License.

- **AI Agents** configures optional assistants, specialists and skills. It generates local instruction/configuration files; it does not run a model or install tools.
- **Save as preset** beside Starting point saves your current choices under a new name. In **Presets**, use or duplicate a **Built-in** preset, or edit or delete one under **Yours**. **Manage…** opens the full preset studio with import, export and replace options. Applying a preset offers **Undo preset change**.
- **Handoff prompt** in the result pane prepares an editable prompt before creation. The success screen and the workspace **Handoff** tab use the saved project context. Changing a template or style keeps your edits until **Regenerate**.

README presets keep documentation concise: General uses selected sections with known details, Minimal includes the title and description, Custom also lets you author section Markdown, and None omits the file. Empty sections and comment-only placeholders are omitted. Selected technologies describe project intent; Repo Creator does not invent setup commands or source folders. The optional **Created with Repo Creator** footer is off by default. The preview shows the exact generated file.

- **Projects** opens the local library and workspace, including Git status, launchers, saved commands and project preferences. Add an existing Git repository without scanning the filesystem. See the [project workspace guide](project-workspace.md).

Preferences, custom presets and recent-project metadata stay in local app storage. They can contain project descriptions, paths and authored configuration. Review settings files and screenshots for private information before sharing them. GitHub credentials remain managed by GitHub CLI.
