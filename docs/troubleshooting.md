# Troubleshooting

Read the app's error message and recovery guidance first. Keep completed local work until you understand what failed.

## Download or launch is blocked

Use only the intended version from this repository's published releases or an authorised successful test build. Compare its SHA-256 checksum with the supplied checksum list and review the signing status.

Windows builds are unsigned. SmartScreen may warn about an unfamiliar app or download; see [Microsoft's explanation](https://support.microsoft.com/en-us/edge/how-can-smartscreen-help-protect-me-in-microsoft-edge). Stop if the origin is uncertain or a managed-device policy blocks installation. Do not disable security protections.

Mac builds are ad-hoc signed and not notarized. Follow the [Mac guide](macOS-testing.md), including Apple's official instructions for trusted apps. A damaged-app or malware warning should be investigated rather than bypassed.

## Git or another tool is not detected

Open **Settings → Setup**, use the relevant official installation link, then select **Recheck**. Reopen Repo Creator if the installer changed your environment.

Git is required for local creation. GitHub CLI and sign-in are required only for GitHub publishing. Coding assistants and VS Code are optional, so their absence does not prevent local creation or prompt generation.

On macOS, Finder-launched apps may have a different executable search path from Terminal. Repo Creator checks inherited absolute paths and common system, Homebrew and user CLI locations without executing shell profiles. Version-manager-only installations may not be discoverable. Use a standard installation or consult the tool's official guide.

## Commit identity is missing

Git needs a name and email to record commits. Open **Settings → Git & identity**, which shows what Git has now and what is missing, or configure Git using its [first-time setup guide](https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup). Saving **Use only for Repo Creator projects** affects only new Repo Creator projects. **Set as my Git default** edits your global Git configuration and only runs after you select **Save to my Git configuration**. Choose an email you are comfortable recording in commits; GitHub documents [private no-reply addresses](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).

For a GitHub project, Repo Creator verifies the authenticated account and uses its no-reply email for the initial commit. Repo Creator never changes your global Git identity automatically.

## Create project explains a requirement

Read the explanation beside **Create project**. Activate the button to open **To create this project**, which lists the outstanding requirements and fix actions. Check the project name, save location and Git setup. Wait for file generation or a native dialog to finish. If creating fails, read the guidance beside the action bar before retrying.

Use **Customize files** or **Customize AI agents** to correct a file or agent option. Choose **Back** to return from the focused editor with your changes. To check the output before trying again, open **Generated files** or **Preview files** and search by path.

## A folder with this name already exists

Choose a new name or another parent folder. Repo Creator refuses to overwrite existing files or folders, including a project from an earlier attempt. Do not delete a preserved repository just to clear the error.

## GitHub publication failed

First open the displayed local folder and confirm what was created. A failure during remote creation, metadata updates, pushing or verification does not remove completed local files and commits.

- Recheck GitHub CLI sign-in, account, owner permissions and network connection. "Couldn't reach GitHub to check your sign-in" means the check itself did not finish (network, rate limit or timeout); it does not mean you are signed out. Select **Retry**, or use **Use a local project instead**.
- Use **Retry publishing** when offered. It reuses the confirmed remote and verifies the original account, branch, commit and location.
- If remote creation was interrupted before confirmation, inspect GitHub and the local folder before proceeding. Repo Creator will not silently adopt a repository with the same name.
- Retry state belongs to the current app session. After restarting, finish publication manually from the preserved repository using Git/GitHub CLI or your usual Git client.

Do not create another repository or delete the remote until you have checked which step succeeded. A GitHub URL does not by itself grant other tools access to private content.

## A folder or editor does not open

Use the success screen's manual action or open the shown path yourself. An opening-action failure does not undo a successfully created repository. VS Code is optional and must be installed before **Open in VS Code** is available.

**Projects** records the original location. If the folder moved, open its workspace and use **Locate folder**, or choose **Locate moved project** in Project Settings. **Remove from history** removes the library entry and keeps the folder on disk.

## Presets, prompts or settings look different

Applying a preset offers **Undo preset change**. If **Save as preset** reports a duplicate name, choose another name or edit the saved preset under **Presets → Yours**. A new template or changed project context keeps your edited Handoff prompt until you select **Regenerate**.

If custom prompt-template storage is unreadable or from a newer version, the app keeps the original data and disables saving template changes for that session. Do not clear application data if you need to recover custom templates. For general settings recovery notices, preserve any backup before changing files.

## Report a bug

Open a [GitHub issue](https://github.com/DefinitivedCode/RepoCreator/issues) with the app version, operating system, architecture, preset, steps, expected result and displayed error. Mention whether **Show advanced options by default** was enabled and whether you used an installer or test artifact. For a launch problem, include the exact warning.

Review screenshots before attaching them. Remove account names, private paths, repository URLs, project text, tokens and authentication output. Do not attach complete settings files or `.gitconfig`. For vulnerabilities, follow [SECURITY.md](../SECURITY.md) instead of posting details publicly.
