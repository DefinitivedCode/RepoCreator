# Redesign release checklist

Use this checklist when you decide to ship the redesign. The redesign PRs prepare the interface, documentation and manual checks. The maintainer chooses the version, channel, signing and publication in the separate [release process](releases.md).

## Version

**Decided by the maintainer: 2.0.0 on Beta first**, so users can exercise the redesigned workflows before a Stable release. The version pull request and [preparation page](v2.0.0-preparation.md) record it; the draft and publication steps below are still open.

[Update channels](updates.md)

## Change the version everywhere

Checked files that currently contain `1.5.2` (re-run `git grep -l "<current version>"` before editing):

- `package.json`, `package-lock.json`
- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `README.md` (version references, screenshots)
- `docs/README.md`, `docs/assets/README.md`
- `docs/project-workspace.md`, `docs/commands-ux-review.md`, `docs/redesign-baseline.md` (check whether each mention is a historical fact or the current version before changing it)
- New `docs/release-notes/<version>.md` and a `docs/v<version>-preparation.md`, following the existing 1.5.1 and 1.5.2 files

The version shown at the top left of the app comes from the native build (`get_update_info`), so it follows the manifests; no separate edit is needed. Browser tests read `package.json`, so they follow too. Validate with:

```sh
node scripts/release.mjs version --version <version> --tag v<version>
```

## README and docs

- The README and user guides describe the redesigned UI. The [release notes draft](release-notes/ui-redesign-draft.md) is unversioned.
- Native screenshot refresh is blocked in the current session. The README still uses the existing preparation-build images. Use the capture instructions below when native verification is available.

## Release process

**Open decisions.** Approve the version PR and its exact `main` commit, then choose whether to request `$repo-creator-release prepare <version> for <channel> release`. Review the unpublished draft and publish manually only after the required checks. The recommendation is to retain the existing updater key and feed behavior for compatible installations. Confirm signing and updater decisions with the maintainer before running release preparation.

```powershell
$version = Read-Host 'Enter the approved version'
$tag = "v$version"
node scripts/release.mjs version --version $version --tag $tag
gh run list --branch main --workflow windows.yml --limit 5
```

Record the approved version and channel, commit SHA, CI run and platform results, draft URL, signing decision and publication date. Once publication and feed refresh are approved and complete, use `gh release view $tag --json tagName,isDraft,isPrerelease,url` and **Settings → Updates → Check for Updates** on supported installed builds to record the published release and the channel result. [Updater verification details](updates.md#platform-verification)

## Before publishing

- All redesign PRs merged in order and `main` CI green on Windows and both macOS runners.
- Physical Mac install and launch and the live signed-out GitHub check remain **Not tested**. Follow the runbooks below.
- NVDA, Narrator, VoiceOver, Windows High Contrast and physical 125%/150% display scaling remain **Not tested**. Follow the [accessibility checklist](accessibility-checklist.md).

## Physical Mac install and launch

**Not tested.** Use a physical Mac and the package for its architecture. Repeat on Intel and Apple Silicon when both are available. A local DMG uses an ad-hoc signature. From the intended checkout, build it and select the exact DMG produced by that run.

```sh
git rev-parse --short HEAD
sw_vers
case "$(uname -m)" in
  arm64) target=aarch64-apple-darwin ;;
  x86_64) target=x86_64-apple-darwin ;;
esac
npm run desktop:build -- --ci --target "$target" --bundles app,dmg
ls -lt "src-tauri/target/$target/release/bundle/dmg"
printf 'Path to the DMG just built: '
IFS= read -r dmg
shasum -a 256 "$dmg"
qa_dir=$(mktemp -d "${TMPDIR:-/tmp}/repo-creator-mac.XXXXXX")
mkdir -p "$qa_dir/mount" "$qa_dir/Applications" "$qa_dir/projects"
hdiutil attach -readonly -nobrowse -mountpoint "$qa_dir/mount" "$dmg"
qa_app="$qa_dir/Applications/Repo Creator.app"
ditto "$qa_dir/mount/Repo Creator.app" "$qa_app"
hdiutil detach "$qa_dir/mount"
codesign --verify --strict --verbose=2 "$qa_app"
lipo -archs "$qa_app/Contents/MacOS/repo-creator"
REPO_CREATOR_DATA_DIR="$qa_dir/app-data" "$qa_app/Contents/MacOS/repo-creator" &
```

Confirm the copied app opens after the DMG is detached. Use the welcome checklist to create a fictional local project in `$qa_dir/projects`. Compare its README to the preview, open the workspace, quit and relaunch to verify the project and settings persist. Record Mac model and chip, macOS build, commit, DMG checksum, architecture, signing and Gatekeeper result, app launch and any failure text. See the [Mac launch guidance](macOS-testing.md#if-macos-blocks-the-app).

## Live signed-out GitHub check

**Not tested.** Use an interactive disposable account with GitHub CLI installed, online access to `github.com` and no saved GitHub CLI credentials. Start the [Windows test session](accessibility-checklist.md#start-a-windows-test-session) through the `$exe` assignment. Set these variables in that same disposable shell before opening the app.

```powershell
$env:GH_CONFIG_DIR = Join-Path $qaRoot 'gh'
New-Item -ItemType Directory -Path $env:GH_CONFIG_DIR | Out-Null
Remove-Item Env:GH_TOKEN,Env:GITHUB_TOKEN,Env:GH_ENTERPRISE_TOKEN,Env:GITHUB_ENTERPRISE_TOKEN -ErrorAction SilentlyContinue
gh --version
Test-NetConnection github.com -Port 443 -InformationLevel Quiet
gh auth status --hostname github.com
"Auth status exit code: $LASTEXITCODE"
gh api --hostname github.com user
"User probe exit code: $LASTEXITCODE"
$app = Start-Process -FilePath $exe -PassThru
```

Complete the local setup with a fictional identity if needed, then open **Settings → GitHub** and select **Check GitHub connection**. Expect a signed-out message and a Connect action on the online machine. Record the build, CLI version, connectivity, CLI exit codes, exact app message and whether local creation is still available. Keep auth output and credentials out of the report. [GitHub CLI environment variables](https://cli.github.com/manual/gh_help_environment)

## Native public screenshots

**Not tested.** The native smokes timed out before attaching to WebView2 in the current session. The existing script also creates and removes `C:\Projects\field-notes`, depends on an unused debugging port 9225 and has selectors for the earlier layout. Run it only on a disposable Windows machine with that fixture path unoccupied and Git configuration isolated, after updating the selectors for focused Customize editors and workspace tabs. The recommendation is to move the fixture under an owned temporary root before refreshing the published screenshots.

```powershell
npm run desktop:build -- --ci --target x86_64-pc-windows-msvc --no-bundle
$env:REPO_CREATOR_SMOKE_EXE = (Resolve-Path 'src-tauri/target/x86_64-pc-windows-msvc/release/repo-creator.exe').Path
$env:REPO_CREATOR_SCREENSHOT_OUTPUT = Join-Path $PWD.Path 'artifacts/redesign-public-review'
node tests/public-screenshots.mjs
```

Record the build SHA, WebView2 version, capture result and reviewed file list. Inspect each image for real usernames, paths and email addresses before replacing any tracked image.
