---
name: repo-creator-release
description: Guide the Repo Creator owner through version selection, concise release notes, approved tags, verified signed release drafts, manual publication and Stable/Beta feed verification. Use when preparing, reviewing or troubleshooting a Repo Creator release.
---

# Repo Creator release

Work from the repository root. Invocation authorizes inspection and preparation of a release plan, not release mutations. Never create/push a tag, dispatch release preparation, create a draft, publish a release or modify channels without explicit owner authorization for that action. Reuse authorization already given in the conversation. Never bypass CI, move an existing tag, print signing secrets/private keys, or change signing trust, visibility or branch protection as a workaround.

## Discover the current process

Read `AGENTS.md`, `docs/development.md`, `docs/releases.md`, `docs/updates.md`, all `.github/workflows/`, `scripts/release.mjs`, `scripts/update-feeds.mjs`, and the desktop build wrapper. Use those files as the source of truth; adapt the commands below if reviewed configuration has changed. Link to the release/update docs for detailed packaging, signing setup and installation guidance instead of copying them.

Inspect before proposing changes:

- `git status --short`, current branch/remotes, fetched `origin/main`, tags (including remote tags), and recent commits. Preserve local work; stop on a dirty release checkout or a failed fetch.
- GitHub releases, including drafts and prereleases: use `gh release list` / the releases API, not only GitHub's stable-only latest-release endpoint. Read the latest published release and v1.4.0/v1.4.1 notes as style references. Identify the actual previous release tag and compare its changes with the candidate commit.
- The six checked version values: `package.json`, both root version fields in `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the application entry in `src-tauri/Cargo.lock`. Use `node scripts/release.mjs version` to validate them together.
- Main's protection/rulesets, required check names, and completed Actions runs for the exact candidate SHA. Currently the required checks are `version`, `windows`, `macOS Apple-Silicon` and `macOS Intel`. A green PR for another SHA is insufficient. If settings are inaccessible, report that limitation and obtain owner confirmation of the checks.
- Presence of the documented signing secret/variable **names** if accessible; do not retrieve private values. Existing signed updates and trust keys must remain compatible.

## Agree on version, channel and notes

Resolve the exact next version and Stable/Beta intent from the owner's request and current release history; ask if either is missing or ambiguous. Accept versions supported by `releaseVersion` (including `1.5.0-beta.1`); do not invent a version bump or include unsupported build metadata. If manifests need updating, prepare a focused PR and wait for it to merge and pass main CI before tagging.

- Stable: no SemVer prerelease suffix; GitHub's **Set as a pre-release** must be off.
- Beta: GitHub's **Set as a pre-release** must be on; either a normal version or a SemVer prerelease is supported. Do not assume a suffix sets the GitHub flag automatically.
- Feeds select by SemVer, not publication date. Stable considers only stable releases; Beta considers both. Explain if an existing higher eligible version will still win, or an equal-version promotion will not update already installed copies. Never retag to solve this.

Generate notes from `git log` and `git diff` between the previous published tag and the candidate SHA; inspect relevant PRs/source to confirm claims. Use the actual release bodies as style references: a short title/introduction, a few user-facing change bullets, brief installation guidance and current known limitations. Avoid commit dumps, internal CI detail unless useful to users, unsupported testing claims, and stale limitations copied from older releases. Distinguish cryptographic updater signing from unsigned Windows installers / ad-hoc signed, unnotarized Macs. Keep relevant manual-upgrade and portable ZIP limitations from the current docs. Save proposed notes for owner review; the workflow's generated `RELEASE_NOTES.md` is only a generic starting point.

## Validate main and prepare exact PowerShell commands

Confirm the candidate is merged into `origin/main`, the intended release checkout is clean and its required CI checks passed. Run the documented checks appropriate to the changes, including release/build/licensing/feed helper tests and version validation. Development push/PR CI builds debug binaries/apps; full installer packaging is separately verified by manual/release runs. Do not treat development CI as proof that signed release assets exist.

Provide runnable PowerShell with the confirmed version, tag, repository and reviewed full commit SHA substituted. Use the actual upstream remote; the template below assumes the currently configured `origin`. Check native command exit codes explicitly (Windows PowerShell does not automatically throw for Git failures):

```powershell
$version = '<confirmed version>'
$tag = "v$version"
$releaseCommit = '<reviewed full SHA>'
if (git status --porcelain) { throw 'Preserve local changes before releasing.' }
git fetch origin main --tags
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed.' }
git switch main
if ($LASTEXITCODE -ne 0) { throw 'Could not switch to main.' }
git merge --ff-only origin/main
if ($LASTEXITCODE -ne 0) { throw 'Main cannot be fast-forwarded safely.' }
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { throw 'Local main differs from upstream.' }
if ((git rev-parse HEAD) -ne $releaseCommit) { throw 'Main changed; review the candidate and CI again.' }
node scripts/release.mjs version --version $version --tag $tag
if ($LASTEXITCODE -ne 0) { throw 'Version validation failed.' }
git show-ref --verify --quiet "refs/tags/$tag"
$localTagStatus = $LASTEXITCODE
git ls-remote --exit-code --tags origin "refs/tags/$tag" "refs/tags/$tag^{}"
$remoteTagStatus = $LASTEXITCODE
if ($localTagStatus -ne 1 -or $remoteTagStatus -ne 2) { throw 'Tag exists or lookup failed; inspect before proceeding.' }
```

Inspect GitHub for an existing release/draft for the tag as well. If the tag already exists, resolve its peeled commit locally and remotely. If it matches the reviewed release commit, omit tag creation/push and continue only with the authorized remaining preparation. If it differs, stop; never move/delete/recreate it. Existing drafts/publications must be inspected rather than recreated.

Only after the owner explicitly approves tagging that version/commit, offer or execute this separate block; recheck tag absence immediately beforehand:

```powershell
git tag -a $tag $releaseCommit -m "Repo Creator $version"
if ($LASTEXITCODE -ne 0) { throw 'Tag creation failed.' }
git push origin "refs/tags/$tag"
if ($LASTEXITCODE -ne 0) { throw 'Tag push failed; inspect remote state before retrying.' }
```

Push only the specific tag, never `--tags` or `--force`. Confirm its remote peeled SHA matches the approved commit.

## Prepare and verify the draft

Explain **Actions → Prepare release draft → Run workflow**, choosing the workflow on `main`. Read `release.yml` for the current inputs. Currently these are `version`, existing approved `tag`, `create_draft` and `publication_review_complete`.

Provide the equivalent exact PowerShell command after substituting the confirmed values:

```powershell
gh workflow run release.yml --repo DefinitivedCode/RepoCreator --ref main -f "version=$version" -f "tag=$tag" -f create_draft=false -f publication_review_complete=false
if ($LASTEXITCODE -ne 0) { throw 'Dispatch failed.' }
```

This artifacts-only run still performs signed release builds and needs preparation authorization. For an explicitly approved draft, set both booleans to `true` only after the owner completes the documented privacy/history, licensing and platform-warning review. Do not silently run both variants: each repeats all release builds. Never dispatch to evade failed checks or from a feature branch.

Track the **specific dispatched run** and resolved tag SHA. Require `validate`, every shared platform check/build, `assemble`, and (if requested) `draft` to succeed. Release preparation always rebuilds the immutable tag with signing enabled; never substitute PR artifacts or an unverified cache hit for this verification.

Download the run's assembled release-assets artifact into a fresh temporary directory. Derive filenames and inventory from `platformAssets` / `requiredAssets`, not old version examples. Verify:

- Windows x64 NSIS, MSI and portable ZIP; both Mac architectures' DMG and original app archives; four detached updater signatures; `updater.json`, `SHA256SUMS.txt`, license and notices. Check all hashes, not just file presence. Platform checksum manifests are available in the per-platform artifacts.
- The run's Windows MSI/resource notices checks, Mac architecture/ad-hoc signature/resource checks, source-path scans and portable archive checks passed. Test actual downloaded installation/launch where available; report unavailable physical Mac or updater end-to-end testing honestly.
- Assembly verified every updater signature against the configured public key and exact version. Inspect all four updater targets, download URLs and signature entries. To independently reassemble/verify, download the three per-platform artifacts and run the existing `release.mjs collect --updater true` command into a new empty directory as documented; use only the public key. Never repack a signed Mac archive.

## Owner review, publication and feeds

Present the concrete draft URL, proposed final notes, version/channel flag, artifact/checksum evidence and known limitations before requesting publication approval. Replace the generic draft notes only when authorized. The owner reviews the actual uploaded assets, installation guidance and privacy/licensing findings, selects the agreed prerelease flag and publishes manually. Never interpret skill invocation or preparation approval as publication approval.

After owner publication, confirm the release is published (not draft), the tag/SHA and prerelease flag are correct, and **Refresh published update channels** completed successfully for that event using reviewed `main`. Read the current feed script/docs for paths and validation behavior. Currently `update-feeds/stable.json` and `update-feeds/beta.json` are generated atomically on the `update-feeds` branch. Inspect both manifests and compare the eligible winning version, all target URLs/signatures, publication date and notes with the verified published release. A lower version may legitimately not become the winner. Beta publication must leave Stable pointing to its eligible stable release (or its valid empty manifest).

Finish with a short checklist recording: clean merged SHA and green CI; confirmed version/channel; approved immutable remote tag; successful signed three-platform preparation; verified assets/signatures/checksums/notices; reviewed notes/warnings and installation tests/limitations; owner publication; successful feed refresh and correct winning Stable/Beta versions. Mark incomplete items as pending, never as passed.

For failures, inspect the specific job/log and stop before dependent mutations. Version mismatch: fix manifests through a reviewed PR. Existing tag/release: inspect and preserve it. Build/signature/inventory failure: do not publish or weaken validation; check documented key configuration without exposing values. Draft permission failure: report the required token policy from `docs/releases.md`. Missing/stale feed: inspect refresh logs and eligible-release validation (a successful refresh may exclude an invalid release), then request authorization for a manual `update-feeds.yml` dispatch on `main` if needed. Refer to `docs/updates.md` for branch-write policy; never edit manifests by hand, replace trust keys or weaken `main` protection to recover.
