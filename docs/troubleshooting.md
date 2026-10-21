# Troubleshooting

Read the app's error message and recovery guidance first. Keep completed local work until you understand what failed.

## Download or launch is blocked

Use only the intended version from this repository's published releases or an authorised successful test build. Compare its SHA-256 checksum with the supplied checksum list and review the signing status.

Windows builds are unsigned. SmartScreen may warn about an unfamiliar app or download; see [Microsoft's explanation](https://support.microsoft.com/en-us/edge/how-can-smartscreen-help-protect-me-in-microsoft-edge). Stop if the origin is uncertain or a managed-device policy blocks installation. Do not disable security protections.

Mac builds are ad-hoc signed and not notarized. Follow the [Mac guide](macOS-testing.md), including Apple's official instructions for trusted apps. A damaged-app or malware warning should be investigated rather than bypassed.

## Git or another tool is not detected

Open **Setup & status**, use the relevant official installation link, then select **Recheck**. Reopen Repo Creator if the installer changed your environment.

Git is required for local creation. GitHub CLI and sign-in are required only for GitHub publishing. Coding assistants and VS Code are optional, so their absence does not prevent local creation or prompt generation.

On macOS, Finder-launched apps may have a different executable search path from Terminal. Repo Creator checks inherited absolute paths and common system, Homebrew and user CLI locations without executing shell profiles. Version-manager-only installations may not be discoverable. Use a standard installation or consult the tool's official guide.

## Commit identity is missing

Enter the project's commit name and email in **Setup & status**, or configure Git using its [first-time setup guide](https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup). Project fields affect only the new repository. Choose an email you are comfortable recording in commits; GitHub documents [private no-reply addresses](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).

For a GitHub project, Repo Creator verifies the authenticated account and uses its no-reply email for the initial commit. It does not change global Git identity.

## Review or Create is disabled

Check the explanation beside the primary action. Complete the project name, save location, required setup and invalid configuration. Wait for preview updates or an open native dialog to finish. Existing project names, invalid branch names and incomplete license/identity fields must be corrected.

If a settings or tool check failed, use the retry action. Advanced settings remain active when switching to Simple Mode; return to Advanced if a hidden setting needs correction.

## A folder with this name already exists

Choose a new name or another parent folder. Repo Creator refuses to overwrite existing files or folders, including a project from an earlier attempt. Do not delete a preserved repository just to clear the error.

## GitHub publication failed

First open the displayed local folder and confirm what was created. A failure during remote creation, metadata updates, pushing or verification does not remove completed local files and commits.

- Recheck GitHub CLI sign-in, account, owner permissions and network connection.
- Use **Retry publishing** when offered. It reuses the confirmed remote and verifies the original account, branch, commit and location.
- If remote creation was interrupted before confirmation, inspect GitHub and the local folder before proceeding. Repo Creator will not silently adopt a repository with the same name.
- Retry state belongs to the current app session. After restarting, finish publication manually from the preserved repository using Git/GitHub CLI or your usual Git client.

Do not create another repository or delete the remote until you have checked which step succeeded. A GitHub URL does not by itself grant other tools access to private content.

## A folder or editor does not open

Use the success screen's manual action or open the shown path yourself. An opening-action failure does not undo a successfully created repository. VS Code is optional and must be installed before **Open in VS Code** is available.

Recent Projects records the original location; moved or deleted folders may no longer open. Removing a history entry does not remove the project from disk.

## Presets, prompts or settings look different

Applying a preset offers **Undo preset change**. Simple and Advanced share configuration. A selected prompt template or changed project context does not overwrite edited prompt text until **Regenerate** is selected.

If custom prompt-template storage is unreadable or from a newer version, the app keeps the original data and disables saving template changes for that session. Do not clear application data if you need to recover custom templates. For general settings recovery notices, preserve any backup before changing files.

## Report a bug

Open a [GitHub issue](https://github.com/DefinitivedCode/RepoCreator/issues) with the app version, operating system, architecture, selected mode/preset, steps, expected result and displayed error. Mention whether you used an installer or test artifact. For a launch problem, include the exact warning.

Review screenshots before attaching them. Remove account names, private paths, repository URLs, project text, tokens and authentication output. Do not attach complete settings files or `.gitconfig`. For vulnerabilities, follow [SECURITY.md](../SECURITY.md) instead of posting details publicly.
