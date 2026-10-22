# Getting started

Repo Creator creates new Git repositories on your computer. Publishing to GitHub is optional. A local project works without GitHub, a coding assistant or an AI account.

## Download and install

The first public release is still being prepared. Once published, open [GitHub Releases](https://github.com/DefinitivedCode/RepoCreator/releases), choose a version, and download the asset for your computer. Read its notes and compare its SHA-256 checksum with `SHA256SUMS.txt` before opening it. A matching checksum checks file integrity; it does not replace a trusted publisher signature.

| Platform            | Package                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Windows x64         | `windows-x64-unsigned-setup.exe` for the per-user installer, or `windows-x64-unsigned.msi` |
| macOS Apple Silicon | `macos-arm64-adhoc.dmg`                                                                    |
| macOS Intel         | `macos-x64-adhoc.dmg`                                                                      |

The full filename also includes Repo Creator and its version. Source-code archives are for development; they are not application installers. You do not need Rust, Node.js or this repository to use a packaged application.

On Windows, run one installer and follow its prompts. The installer can download the official WebView2 runtime when needed. Builds are unsigned, so Windows or your browser may warn about the publisher or an unfamiliar download. Review the source and release notes, follow [Microsoft's SmartScreen guidance](https://support.microsoft.com/en-us/edge/how-can-smartscreen-help-protect-me-in-microsoft-edge), and stop if you cannot establish trust. Do not disable Windows security protections to install the app.

Mac users should follow the [Mac installation and testing guide](macOS-testing.md). Current builds are ad-hoc signed and not notarized.

While the repository remains private, the source and build artifacts are available only to its owner and invited collaborators. Collaborators can obtain test builds from a successful [Actions run](https://github.com/DefinitivedCode/RepoCreator/actions/workflows/windows.yml); see the Mac guide or [release preparation](releases.md). There is no public download yet.

## Check Git

1. Open Repo Creator and select **Settings**.
2. If Git is missing, use **Open Git installation instructions** and install it from the official source.
3. Return to the app and select **Recheck**. If it is still unavailable, reopen the app and see [Troubleshooting](troubleshooting.md).
4. If a commit identity is missing, enter a name and email in the project identity fields. This applies only to the new project. Use an email you are comfortable recording in Git history; GitHub offers a [private no-reply address](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).

Local creation requires Git and a commit identity. The application does not change your global Git identity.

## Create your first local project

1. Select **Simple** and enter a project name, for example `learning-notes`.
2. Add a short description if useful, then select **Experiment** as the starting point. It creates a lightweight README and safe file exclusions without choosing a license.
3. Leave **AI coding assistant** set to **None**, or select a tool whose project instructions you want to generate. Installation of the assistant is not required.
4. Choose **Browse…** and a parent folder you can write to, such as a folder inside Documents. Select **On this computer**.
5. Select **Review project**. Check the destination and generated files, then choose **Create Project**.
6. On success, use **Open Folder**. The screen shows the branch, initial commit and generated-file count. Expand **Generated files** to inspect the creation previews.

The project gets a new child folder. Repo Creator refuses to overwrite an existing folder or file with the same name. **Blank repository** creates only a Git repository with an empty initial commit.

## Publish to GitHub

Install [GitHub CLI](https://cli.github.com/) first. In **Settings**, select **Connect to GitHub** and complete GitHub CLI's official sign-in in the terminal/browser it opens. Return to Repo Creator and check the connection.

In Overview, select **Computer and GitHub**, choose an owner, and review **Private** or **Public** visibility. GitHub enforces account and organisation permissions. Creation still makes a local repository, then publishes its initial commit. GitHub projects use the verified account's no-reply commit email for that initial commit.

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

Simple and Advanced use the same settings. Switching modes does not discard configuration. Advanced exposes **Project Files**, **AI Agents** and their local subsections.

- **Project Files** controls README sections, ignore rules, project license text, optional `.editorconfig`/`.gitattributes`, Git branch/commit and opening actions. Preview before creation. A generated project's license is your choice and is separate from Repo Creator's MIT License.
- **AI Agents** configures optional assistants, specialists and skills. It generates local instruction/configuration files; it does not run a model or install tools.
- **Manage…** saves, updates, duplicates, imports and exports project presets. Applying a preset offers **Undo preset change**. Imports are reviewed before use and do not execute code.
- **AI Handoff** prepares editable prompts locally. Missing details are omitted. Changing a template or style keeps your edits until **Regenerate**. Copying a prompt into another service shares the text you choose to send.
- **Projects** opens the local library and workspace, including Git status, launchers, saved commands and project preferences. Add an existing Git repository without scanning the filesystem. See the [project workspace guide](project-workspace.md).

Preferences, custom presets and recent-project metadata stay in local app storage. They can contain project descriptions, paths and authored configuration. Review settings files and screenshots for private information before sharing them. GitHub credentials remain managed by GitHub CLI.
