# Testing Repo Creator 1.3 on a Mac

These are development test builds. They are **ad-hoc signed, not notarized**.
CI checks compilation, tests, packaging, the binary architecture and the local
signature. It does not prove that the app launches or behaves correctly on a
physical Mac.

## Get the correct build

1. Open **Apple menu → About This Mac**. A **Chip** named Apple M1/M2/M3/M4 or
   later means Apple Silicon. A **Processor** named Intel means Intel.
2. Visit [Repo Creator Actions](https://github.com/DefinitivedCode/RepoCreator/actions/workflows/windows.yml).
   Open a successful **Desktop checks and test builds** run for the desired commit.
3. Under **Artifacts**, download **Repo-Creator-macOS-Apple-Silicon** or
   **Repo-Creator-macOS-Intel**. GitHub may require signing in to download artifacts.
   A queued or failed job has no successful build to download.
4. Unzip the artifact. Open its `.dmg`, then drag **Repo Creator** to
   **Applications**. Alternatively, double-click the `.app.tar.gz` archive in
   Finder to extract the application bundle.

macOS may block a downloaded test app because it is not signed with a verified
Developer ID and notarized by Apple. Only if you trust the source and intended
commit, follow Apple's [official instructions for opening a blocked app](https://support.apple.com/en-us/102445).
Do not disable Gatekeeper, remove quarantine attributes or change system-wide
security settings. If your Mac's policy does not allow the app, stop and report
the warning. Public distribution requires appropriate Apple signing credentials
and successful notarization; this test workflow does neither.

## Check setup

Open Repo Creator and use **Setup & status** to recheck prerequisites.

- **Git** keeps a history of your project's changes and is required to create a
  repository. The installation link opens the official Git instructions.
- Your **Git name and email** identify commits. If they are missing, enter an
  identity for this new repository in Setup & status. Repo Creator does not change
  your global Git identity. GitHub projects use your verified account's private
  no-reply email for the initial commit.
- **GitHub CLI** and a connection are required only for publishing to GitHub.
  **Connect to GitHub** opens Terminal for GitHub CLI's official browser/device
  authentication flow. Complete that flow, return to Repo Creator and recheck.
  Never paste credentials into Repo Creator or a bug report.
- **Claude Code, Codex and the other assistants** are optional. You can generate
  their instruction files and copy a handoff prompt without installing them.
- **Visual Studio Code** is optional and is detected in Applications, your user
  Applications folder and standard installation locations where appropriate.

Finder-launched apps do not inherit Terminal's shell PATH. Repo Creator checks
the inherited absolute PATH plus common Homebrew (`/opt/homebrew/bin`,
`/usr/local/bin`), system and user CLI directories. It does not execute shell
profiles. Version-manager-only installations may need an executable or symlink
in a standard location; use the manual action if detection is unavailable.

For isolated testing or portable preferences, launch the process with
`REPO_CREATOR_DATA_DIR` set to an absolute directory you own. This redirects
preferences, recent-project history and window geometry together; ordinary
launches use the platform's native application configuration directory. The UI
cannot change this process environment setting. Native smoke tests use a new
temporary data directory so existing user settings and running instances remain
untouched.

## Try these projects

Choose a writable location such as a new folder in Documents. Use new project
names; Repo Creator never overwrites existing projects.

- [ ] Select **Simple**, choose **Blank repository**, and create **On this computer**.
      Confirm the destination opens and contains a Git repository. The success
      screen should show the initial branch and commit, even with no project files.
- [ ] Create an **Experiment** project with a short description. Confirm its
      README contains that description and experiment guidance.
- [ ] Select **Claude Code** and create another local project. Confirm the
      generated `AGENTS.md` and `CLAUDE.md` files match their Review previews.
      Claude installation/authentication must not be required.
- [ ] In **AI Handoff** or after creation, select **Project Discovery**, **Architecture & Planning**,
      then **Development Handoff**. Copy a prompt and paste into a local text
      editor. Confirm its project name, location and selected files are correct.
- [ ] After connecting to GitHub, create **Computer and GitHub**, leaving
      **Private** selected. Use **Open on GitHub** and verify the repository is
      private, its selected branch is the default and the initial files exist.
      This is an explicit manual test; CI never creates test GitHub repositories.
- [ ] Use **Open folder**, and **Open in VS Code** if installed. Confirm both
      show the correct project, including when its parent path contains spaces.
- [ ] Switch Simple/Advanced and sections, resize the window, and try light and
      dark appearance. Confirm settings persist and buttons remain reachable.
- [ ] Close and reopen the app. Confirm saved preferences and recent-project
      information survive.

If Git verification is needed, open Terminal in the created folder and run
`git log -1` and `git status`. The first displays the initial commit; the second
should report a clean working tree. This is optional for the basic visual test.

## Report a failure

Include the Actions run/commit, artifact architecture, Mac model/chip, macOS
version, app version, selected preset/mode, operation attempted, expected result
and actual result. Copy the app's error and guidance, and attach a screenshot if
helpful. State whether the app launched from Applications or Terminal. Redact
usernames, private paths, repository URLs and project text as needed. Do not
include tokens, authentication output, `.gitconfig` or complete settings files.

References: [GitHub runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[Tauri ad-hoc signing](https://v2.tauri.app/distribute/sign/macos/).
