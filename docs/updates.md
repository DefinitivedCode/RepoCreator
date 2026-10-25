# Built-in updates

Repo Creator 1.4.1 introduces updates for installed Windows x64 applications and macOS Apple Silicon/Intel app bundles. **v1.4.0 has no updater: install the first updater-enabled version manually.** Later compatible releases can be downloaded and installed from the application.

## Using updates

Open **Settings → Updates** to see the installed version, choose Stable or Beta, change automatic startup checking, or select **Check for Updates**. New and migrated installations default to Stable with automatic checking enabled. Checks run in the background and never install anything automatically.

Stable receives published stable releases. Beta receives published prereleases and stable releases. Both exclude drafts, releases without complete verified artifacts, and versions equal to or older than the installed version. Switching from a newer Beta to Stable waits for a newer eligible stable release; it never rolls back the installation. A prerelease may use a normal version marked **Set as a pre-release** in GitHub, or a SemVer version such as `1.5.0-beta.1`.

Review the version and release notes, choose **Download update**, then **Update and Restart** when ready. Save your work first: installation closes the app and stops its running commands. **Later** postpones installation. Downloads can be cancelled; partial bytes stay in memory and are discarded on cancellation or exit. Interrupted downloads start again rather than resume. Completed downloads are verified before installation, and installation verifies them again, including the signed application version. Offline/feed/signature failures leave settings and projects intact and can be retried.

Windows portable ZIP copies continue to work and can be replaced manually. They do not perform in-app installation: install the NSIS or MSI package to opt in. macOS updates require a writable installed app location; move the app out of the DMG before updating. Updating preserves the application identifier and native data directories, preferences, history and project records. Project source directories are not part of the update package.

## Owner setup — once, before releasing 1.4.1

Generate an updater key on a trusted machine using the installed Tauri CLI:

```sh
npm run tauri -- signer generate --write-keys /secure/offline/location/repocreator.key
```

Use an absolute path outside the repository (on Windows, for example, a private directory on an encrypted drive). Enter a strong password. Do not paste the private key or command output into issues, pull requests or chat. Keep an offline backup of the private key and password; losing or replacing the trust key breaks updates for existing installations.

Configure the upstream GitHub repository under **Settings → Secrets and variables → Actions**:

| Type     | Name                                 | Value                                                                  |
| -------- | ------------------------------------ | ---------------------------------------------------------------------- |
| Secret   | `TAURI_SIGNING_PRIVATE_KEY`          | Entire base64 content of the generated `.key` file, not its local path |
| Secret   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Key password (omit only for an intentionally passwordless key)         |
| Variable | `REPO_CREATOR_UPDATER_PUBLIC_KEY`    | Entire base64 content of the `.key.pub` file, not its path             |

Only the public key is compiled into the app. Private signing secrets are supplied only to explicitly requested release build steps, never to pull request checks or the feed refresher. Release preparation fails if key configuration is missing, signatures are invalid, or any target is incomplete. Ordinary developer/PR builds remain possible without signing secrets; builds without the public key clearly report that updates are unconfigured.

Allow the repository's short-lived `GITHUB_TOKEN` to create release drafts and write **only the generated `update-feeds` branch**. Keep `main` protected and require review/CI. Restrict human writes to `update-feeds`; if branch rules would block Actions, configure an appropriate GitHub App bypass for that branch rather than weakening `main`. No personal access token, Pages site or external update server is required. The feed workflow creates its branch automatically on its first successful run. After merging and configuring the public key, the owner can run **Refresh published update channels** to initialize valid empty feeds before the first updater-enabled release. Do not initialize these feeds from a feature branch.

## Future releases

Use `$repo-creator-release prepare VERSION for CHANNEL release` after the version/source/notes PR has been reviewed, merged and passed exact-main CI. This single explicit request authorizes checked tagging and one existing [signed draft workflow](releases.md) on `main`, including final notes, channel flag, actual attachment verification and safe completion of the matching unpublished draft. It never authorizes publishing or bypassing an unmerged/failed prerequisite.

The workflow still invokes the existing three-platform checks/build pipeline with updater signing enabled. Signing adds detached `.sig` files for NSIS, MSI and both Mac `.app.tar.gz` archives; original installers, portable ZIP, checksums and notices remain. The signed Mac archive is copied byte-for-byte rather than repacked. Assembly verifies signatures against the existing public key and exact release version, then creates `updater.json` with installer-specific Windows targets and both Mac architectures. All checks must pass before the draft exists. The workflow never creates tags or publishes; the authorized agent handles the checked tag, and the owner publishes manually. Existing channel-less manual preparation remains compatible with the ongoing v1.5.2 procedure.

The completed draft has exact title `Repo Creator VERSION`, reviewed final notes and the correct flag already set: Beta is a prerelease; Stable is not and cannot use a SemVer prerelease suffix. Review the verified draft and testing limitations, then publish manually. Draft changes do not update either channel.

**Refresh published update channels** runs after publication, release edits/withdrawal/deletion, and every six hours to recover missed events or asset edits. It executes reviewed `main` code and reads published releases only. It validates the entire asset/checksum inventory, downloads and checks every required asset, verifies package signatures and signed versions, and checks that metadata matches those verified assets. Only then does it atomically update `stable.json` and `beta.json` on `update-feeds`. The highest eligible SemVer wins, independently of publication order. Invalid/incomplete releases are skipped; network failures leave existing feeds unchanged and fail the workflow. Empty channels use version `0.0.0`, which the app treats as no update. The feeds use HTTPS raw GitHub URLs, not `/releases/latest`; GitHub/CDN caches can briefly delay discovery or withdrawal. Already downloaded offers are not remotely revoked.

No per-release manifest editing is needed. After owner publication and successful feed refresh, installed copies discover updates at their next startup or manual check. Automatic checking still respects the user's preference; downloading, installing and restarting always require user actions. If refresh fails, repair the release assets/configuration and rerun it. Never replace a published package with different bytes under an existing version; use a new reviewed release/version instead. Retain the same updater public key across compatible releases.

## Platform verification

Updater signatures authenticate packages and their versions; they do **not** provide Windows Authenticode signing or Apple Developer ID/notarization. The existing Windows unsigned and macOS ad-hoc signing warnings remain. Mac launch, Gatekeeper behaviour, writable-installation handling and real update/restart on both architectures require physical-device testing. Windows NSIS and MSI update/restart also require installation testing before publication. Automated tests use temporary local fixtures and IPC mocks; they do not create releases or install updates on the developer's machine.

References: [Tauri updater and signing](https://v2.tauri.app/plugin/updater/), [Tauri updater API](https://docs.rs/tauri-plugin-updater/2.14.0/tauri_plugin_updater/), [GitHub release events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release).
