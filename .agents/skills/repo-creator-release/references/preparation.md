# Preparation commands and recovery

Use these recipes only for a real, explicitly authorized preparation request after the skill's preflight. Examples in a maintenance/test task are not commands to execute. Resolve the exact version/channel and reviewed full SHA first; the values below illustrate a future release. Native command failures must be checked explicitly in PowerShell.

## Bind the clean main candidate

```powershell
$version = '1.5.3'
$channel = 'beta'
$tag = "v$version"
$repository = 'DefinitivedCode/RepoCreator'
if (git status --porcelain) { throw 'Preserve local changes before release preparation.' }
git fetch origin main --tags
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed.' }
git switch main
if ($LASTEXITCODE -ne 0) { throw 'Could not switch to main.' }
git merge --ff-only origin/main
if ($LASTEXITCODE -ne 0) { throw 'Main cannot be fast-forwarded safely.' }
$releaseCommit = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve main.' }
if ($releaseCommit -ne (git rev-parse origin/main)) { throw 'Local main differs from upstream.' }
node scripts/release.mjs version --version $version --tag $tag
if ($LASTEXITCODE -ne 0) { throw 'Version validation failed; prepare a reviewed PR.' }
node scripts/release.mjs notes --version $version --channel $channel
if ($LASTEXITCODE -ne 0) { throw 'Reviewed notes/channel validation failed.' }
```

Record `$releaseCommit` and complete merged-review provenance, exact-SHA required CI, privacy/history/Actions, licensing/notices, security/platform and channel-eligibility review **before** proceeding. Inspect branch protection/rulesets rather than assuming the current four required names can never change. Inspect secret/variable names only; use the public key for verification without printing private material. A complete review lets the combined prepare command proceed without another approval prompt; an actual failure stops it.

Use `gh release list` / the releases API including drafts and prereleases. Inspect local and remote tags, matching drafts and preparation runs before choosing a mutation. Preserve previous published notes and historical testing evidence.

## Tag state

```powershell
git show-ref --verify --quiet "refs/tags/$tag"
$localStatus = $LASTEXITCODE
$remoteTag = @(git ls-remote --exit-code --tags origin "refs/tags/$tag" "refs/tags/$tag^{}")
$remoteStatus = $LASTEXITCODE
if ($localStatus -notin @(0, 1) -or $remoteStatus -notin @(0, 2)) { throw 'Tag lookup failed.' }
```

- Both absent: recheck main still equals the reviewed `$releaseCommit` and its checks remain successful, then create/push the annotated tag below.
- Existing tag: inspect its object type and peeled SHA locally/remotely. Reuse only an annotated tag at the reviewed SHA. If a previous push failed, a matching local annotated tag can be pushed after remote absence is freshly confirmed. Fetch a missing local copy of an existing remote ref without force, then verify it. Never silently accept a lightweight tag or a different commit.
- Failed/ambiguous lookup: stop; absence must not be inferred from a network/authentication error.

```powershell
# Only when the tag is confirmed absent locally and remotely:
git tag -a $tag $releaseCommit -m "Repo Creator $version"
if ($LASTEXITCODE -ne 0) { throw 'Tag creation failed.' }
git push origin "refs/tags/$tag"
if ($LASTEXITCODE -ne 0) { throw 'Tag push failed; inspect state before retrying.' }
```

Verify `git cat-file -t`, `git rev-parse "refs/tags/$tag^{commit}"` and remote `refs/tags/$tag^{}`. Push only that ref, never `--tags` or `--force`. The combined command supplies authorization; these checks supply evidence, not a new approval gate.

## One existing workflow execution

Inspect matching in-flight/completed runs and drafts first. Follow an existing correctly bound run rather than dispatching another. Bind a run to its actual inputs, main workflow ref, immutable tag SHA and emitted draft URL; timestamps or another version's green run are insufficient.

```powershell
gh workflow run release.yml --repo $repository --ref main -f "version=$version" -f "tag=$tag" -f "channel=$channel" -f create_draft=true -f publication_review_complete=true
if ($LASTEXITCODE -ne 0) { throw 'Dispatch failed; inspect before retrying.' }
```

`publication_review_complete=true` records that the authorized agent completed the required review successfully. It does not waive the review or authorize publishing. Do not set it when findings remain unresolved.

The explicit channel path validates `docs/release-notes/VERSION.md` from the immutable tagged source before builds, copies its exact bytes into assembled `RELEASE_NOTES.md`, sets the draft's channel flag and checks the actual GitHub metadata. CI notes validation checks format/warnings; the agent still reviews factual accuracy against source and testing. Missing/inaccurate source notes requiring a repository change go through a PR and green merged main before tagging.

For compatibility, omitted `channel` retains the previous manual workflow behavior (generic notes/channel handling). This preserves the existing v1.5.2 procedure. The new autonomous prepare command **always** supplies `beta` or `stable`; it never selects the legacy path or dispatches a real release to test these instructions.

Follow the specific run. Require validate, all shared native/browser checks/builds, assembly and final draft/readback checks to pass. A draft-only upload/readback failure can be recovered in place as described below; failed validation/build/assembly cannot. Download its assembled and three platform artifacts to a fresh temporary directory and perform the skill's full verification. `collect --updater true --channel CHANNEL` can independently reassemble only the complete platform sets; preserve original Mac archives. Do not use PR binaries or silently fall back to an older run.

## Resume without duplicate drafts

| Observed state                                                              | Action within combined preparation authorization                                                                                                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matching run in progress                                                    | Follow that run; do not dispatch again                                                                                                                                              |
| One demonstrated transient failed job                                       | Retry failed jobs once in that same run; retain failure evidence and all checks                                                                                                     |
| Matching complete unpublished draft                                         | Reverify original run, immutable tag and actual attachments; finalize metadata and return the existing URL                                                                          |
| Draft exists after upload/readback failure                                  | Inspect original run and current inventory before any retry; do not rerun draft creation blindly                                                                                    |
| Missing attachments, other bytes correct                                    | If validation/build/assembly succeeded, upload only verified missing files from that same run, without clobbering; repeat final checks and disclose the recovered draft-job failure |
| Conflicting attachment/provenance/tag, repeated failure or failed signature | Stop and report the blocker; do not delete/recreate/overwrite to hide it                                                                                                            |
| Published release                                                           | Read-only verification; no edits, replacement assets or new draft                                                                                                                   |

The workflow itself refuses an existing release for a tag and serializes preparation by tag. This protects against duplicate drafts; it does not replace the agent's resume checks. After a create/upload error, re-read actual GitHub state before retrying. Incomplete files whose identity cannot be proven are blockers, not permission to replace them.

Routine metadata completion is included in the explicit prepare authorization, provided this is the matching **unpublished** draft at the reviewed immutable tag. Re-read its draft/tag state immediately before editing. For a verified local final-notes file:

```powershell
$betaFlag = ($channel -eq 'beta').ToString().ToLowerInvariant()
gh release edit $tag --repo $repository --draft "--prerelease=$betaFlag" --title "Repo Creator $version" --notes-file $reviewedNotesFile
if ($LASTEXITCODE -ne 0) { throw 'Draft completion failed; inspect actual state.' }
gh release view $tag --repo $repository --json name,tagName,isDraft,isPrerelease,body,assets,url
if ($LASTEXITCODE -ne 0) { throw 'Draft readback failed.' }
```

Never apply that command to a published release or to unrelated metadata. Verify exact title, version/tag, channel flag, complete final body, draft=true and every attached file's size/hash/signature against the verified original run. A body mismatch or generic boilerplate is not success. If a user explicitly narrows or withholds metadata-edit authority, follow that restriction and report the concrete pending changes.

Keep notes concise and reports scoped. Preserve OS-signing warnings and distinguish downloaded payload launch from installer/update testing. The final response links the actual verified draft and workflow and names material testing limits. Do not add another preparation prompt on the successful path. The owner reviews and clicks **Publish release**; post-publication feed checks are read-only unless a separate repair action is authorized.
