# Installing and testing on macOS

Repo Creator has separate Apple Silicon and Intel packages for macOS 11 or newer. CI checks compilation, tests, architecture, packaging and ad-hoc signatures. It does **not** confirm launch or installation on physical Mac hardware.

Current Mac builds are **ad-hoc signed and not notarized**. They do not have a verified Apple Developer ID signature.

## Choose and install the application

1. Open **Apple menu → About This Mac**. A **Chip** entry identifies an Apple Silicon Mac; an Intel **Processor** entry identifies an Intel Mac.
2. Open this repository's [Releases](https://github.com/DefinitivedCode/RepoCreator/releases) and choose a published version. The first public release is still being prepared. While the repository is private, only invited collaborators can access its builds.
3. For Apple Silicon, choose the file ending in `macos-arm64-adhoc.dmg`. For Intel, choose `macos-x64-adhoc.dmg`. The filename also includes the version. Do not download a source-code archive to install the app.
4. Compare the file's SHA-256 checksum with `SHA256SUMS.txt` from the same release. In Terminal, `shasum -a 256` followed by a space and the downloaded file path prints its checksum. A match verifies integrity, not publisher identity.
5. Open the DMG, drag **Repo Creator** to **Applications**, then open it from Applications. An `.app.tar.gz` archive is an alternative bundle; extract it in Finder and move the app to Applications.

You do not need Node.js, Rust, the source repository or developer tools merely to install a packaged application. Git is needed when you create a project.

## If macOS blocks the app

macOS checks downloaded apps with Gatekeeper. Because these builds lack Developer ID signing and notarization, macOS may be unable to verify the developer or check the app. Read [Apple's official guidance](https://support.apple.com/en-us/102445) before deciding whether to open it.

Only if you trust the source and have verified the intended download, Apple's documented per-app process may allow **System Settings → Privacy & Security → Open Anyway** after an initial launch attempt. Follow the warning and confirm only if you intend to trust that application. Managed Macs may prohibit this action.

Do not disable Gatekeeper, remove quarantine attributes or change system-wide protections. If macOS reports that the app is damaged or will harm your computer, stop and investigate. Report the exact warning rather than bypassing it.

## Create a local experiment

1. Open Repo Creator and choose **Setup & status**.
2. If Git is missing, open its official installation instructions, install it, then return and select **Recheck**.
3. If asked for a commit identity, enter the name and email you want recorded in the new project. These fields do not change global Git settings.
4. Select **Simple**, give the project a new name, choose **Experiment**, and select a writable parent folder inside Documents.
5. Leave the destination as **On this computer** and the assistant as **None**. Choose **Review project**, inspect the files, then **Create Project**.
6. Use **Open Folder** and confirm that the README contains your description. No GitHub or coding-assistant account is required.

For GitHub publishing later, install GitHub CLI, use **Connect to GitHub**, complete its terminal/browser sign-in, and recheck the connection. See [Getting started](getting-started.md) for the full workflow.

## Physical-Mac verification checklist

Use new local demonstration projects and preserve previous project files.

- [ ] Launch from Applications and complete Git detection/identity setup.
- [ ] Create **Blank repository** and **Experiment** locally; verify path, branch and initial commit on success.
- [ ] Create an optional assistant configuration and compare files with Review previews, without the assistant installed.
- [ ] Try Simple/Advanced, Project Files, AI Agents, Review, AI Handoff and Recent Projects in light/dark modes.
- [ ] Test the default window, a smaller window and 125%/150% display or text scaling where available. Controls must remain reachable and the primary action visible.
- [ ] Open the folder and optional editor; test a parent folder containing spaces and non-ASCII characters.
- [ ] Close/reopen the app and verify preferences, recent projects and resized dimensions.

Optional Git verification in the created folder uses `git log -1` and `git status`; expect the initial commit and a clean working tree. Publishing to a real GitHub account is a separate manual test requiring the tester's explicit choice, not part of automated CI.

## Collaborator test builds

Before a public release, invited collaborators can open [Desktop checks and test builds](https://github.com/DefinitivedCode/RepoCreator/actions/workflows/windows.yml), choose a successful run for the intended commit, and download its Mac artifact matching their architecture. GitHub may require sign-in for Actions artifacts. Unzip the artifact, then use its DMG or application archive as above. Keep any supplied checksum file with the package. A failed or queued job is not a verified download.

When reporting a problem, include the app version/commit, package architecture, Mac chip/model, macOS version, operation and exact error. Redact usernames, paths, repository URLs and project text from screenshots. Do not include credentials or complete settings files. See [Troubleshooting](troubleshooting.md).
