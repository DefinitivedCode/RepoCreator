---
name: repo-creator-release
description: Prepare a specific Repo Creator version and Beta/Stable channel through reviewed tagging, signed builds and a verified unpublished GitHub draft. Also use for read-only release reviews, troubleshooting and post-publication feed verification. Publication stays manual.
---

# Repo Creator release

Work from the repository root and use the existing release workflow and helpers. The normal result is a complete, verified, **unpublished** draft; the owner publishes it manually.

## Select the mode and authority

An explicit owner instruction such as `$repo-creator-release prepare 1.5.3 for beta release` is **combined preparation authorization for that exact version and channel**. It authorizes the preflight reviews, creation/push of its annotated tag, one signed draft-mode workflow run, creation or safe completion of the matching unpublished draft, and correction of that draft's title, channel flag and final notes. Complete these steps in one session without asking for separate tagging, build, draft or metadata approvals. Respect any narrower user restriction.

This authorization does **not** include publication, PR merging, unreviewed code, tag deletion/movement/force updates, signing-key or trust changes, visibility/licensing changes, protection bypasses, or manual update-feed writes. Host/sandbox execution permissions are unchanged.

A vague request to review readiness, an implicit skill selection, quoted examples, or a request to edit/test this skill grants **read-only inspection**, not release mutations. Ask for a missing version/channel only when it cannot be resolved from the actual owner request. Accept `beta` or `stable`; Stable cannot have a SemVer prerelease suffix. An explicit artifacts-only or tagging-only request keeps its stated narrower scope.

For `prepare`, continue autonomously until the verified draft is ready or a real blocker is established. Do not treat successful checks as approval to expand the requested version/channel or to publish.

## Prepare the requested release

Read `AGENTS.md`, `docs/development.md`, [release procedures](../../../docs/releases.md), [update safeguards](../../../docs/updates.md), all `.github/workflows/`, `scripts/release.mjs`, `scripts/update-feeds.mjs` and the desktop build wrapper. Use their reviewed configuration as the source of truth. Read [preparation commands and recovery](references/preparation.md) for executable recipes and resume rules.

1. **Bind a reviewed candidate.** Check the branch, clean working tree and actual upstream; fetch main and tags, stopping on fetch failure or local changes. Record the full fetched main SHA and its merged-PR/review provenance (or prior explicit owner review of that SHA). Verify main protection/rulesets and every required completed check on that exact commit; currently `version`, `windows`, `macOS Apple-Silicon`, `macOS Intel`. A green PR for another SHA is insufficient. An unreviewed commit, failed/missing checks or unverifiable protection is a blocker.
2. **Check the exact version.** `node scripts/release.mjs version --version VERSION --tag vVERSION` must validate all six values: package.json, both npm lockfile root versions, tauri.conf.json, Cargo.toml and the application Cargo.lock entry. Do not bump versions or silently merge to satisfy the command. If source/version/notes changes are needed, prepare a focused PR under existing review rules and stop until its merged main SHA is reviewed and green.
3. **Finish the pre-tag review.** Inspect current source, reachable history/identities, relevant prior Actions logs/artifacts, privacy/security findings, project/third-party licensing and notices, platform warnings, signing configuration names (never private values), existing tags/releases/drafts and update-feed eligibility. Compare the previous published tag with the candidate; include drafts/prereleases when inspecting release history. Run release/build/licensing/feed helper tests and version/notice checks. Record scoped evidence and real testing limitations. Combined preparation authorizes doing this review; it does not make failures acceptable. Do not dispatch with the review acknowledgement true until this review actually passes.
4. **Validate final notes before tagging.** Use the versioned `docs/release-notes/VERSION.md` from reviewed source and the [notes template](assets/release-notes.md). Inspect the diff/source and published v1.4.0/v1.4.1 style references to confirm factual claims. Run `node scripts/release.mjs notes --version VERSION --channel CHANNEL`. Its format checks supplement, not replace, factual review. Missing/incomplete source notes require a reviewed preparation PR. Keep concise user-facing notes and accurate installation/security/testing warnings; put logs, hashes and inventories in a local review report. Do not carry forward stale untested claims when a specific prior upgrade was confirmed tested.
5. **Reconcile existing state before mutations.** Inspect local/remote tags, all matching releases/drafts and in-flight/completed preparation runs. A matching immutable annotated tag may be reused; a mismatched or lightweight existing tag is a blocker, never rewritten. A published release is read-only. Reuse/verify a matching completed draft or follow its original run rather than creating a duplicate or starting another signed build. If provenance, version/channel or asset identity cannot be established, stop and report it.
6. **Create/push only a missing approved tag.** Recheck the candidate, CI and tag state immediately before mutation. If absent, create annotated `vVERSION` at the reviewed full SHA and push only that ref. Verify its remote peeled commit. A failed lookup is not absence; a failed push must be inspected before retrying. Preserve an existing valid tag and all other refs.
7. **Use one signed draft-mode execution.** Dispatch the existing `Prepare release draft` workflow on `main` with version, existing tag, explicit channel, `create_draft=true`, `publication_review_complete=true`. Track that specific run and resolved tag SHA. Do not first run artifacts-only and then repeat the same build for a draft. Artifacts-only is reserved for an explicit owner request. All validation, three native platform builds, assembly and final draft checks must pass. A draft upload/readback job failure alone may be recovered in place under the resume rules below; never substitute caches or earlier PR artifacts for release verification.
8. **Verify actual outputs and attachments.** Download the run's assembled and platform artifacts into fresh temporary storage. Derive the inventory from `platformAssets` / `requiredAssets`. Check every hash, all four updater signatures against the existing public key and signed version, all manifest targets/URLs/signatures, executable/package versions, licence/notices, native architecture, Mac ad-hoc signatures, MSI/resources, portable contents and source-path/privacy checks. Never repack a signed Mac archive. Test downloaded native launch where available and distinguish it from actual installation/update/restart. Verify every attached draft asset matches the verified run bytes; report unavailable physical Mac or updater end-to-end tests honestly.
9. **Finish and read back the unpublished draft.** Its exact title is `Repo Creator VERSION`, tag `vVERSION`, prerelease flag true for Beta / false for Stable, and body the reviewed final notes. Never append Beta/Stable/subtitles to the GitHub title. Under combined authorization, automatically correct incomplete metadata/notes of this matching unpublished draft and verify again; no extra metadata prompt is needed. Complete only verified missing assets from the same approved run without overwriting existing bytes. A conflicting asset is a blocker. Read back the actual GitHub title/body/flag, draft state and attachments; local notes or workflow success alone are insufficient. Never call a generic boilerplate draft ready.

The six-part notes order is: descriptive Markdown heading; one concise introduction; `### What's New` with 3–6 short source-supported bullets; `### Installation`; `**Known limitations:**`; `### Feedback` linking to GitHub Issues. Keep manual-upgrade/portable guidance and distinguish cryptographic updater signatures from Windows unsigned installers and Mac ad-hoc signing/notarization. Assertions about testing must identify the version/platform actually tested.

## Safe retries and blockers

Follow the existing specific run first. Retry failed jobs **once** for a demonstrated transient runner/network failure, retaining the original evidence and every validation gate. Stop for a repeated failure, signature/hash/inventory/version mismatch, privacy/licensing finding, missing signing prerequisite or any protection bypass. Do not weaken checks or replace immutable assets to get a green result.

If a draft was created before a later upload/readback failure, inspect that exact draft and run before retrying. Only when every validation/build/assembly job succeeded may the existing draft be completed in place: add fully verified missing files from that run and/or correct its metadata, then independently repeat all final attachment and draft checks. The original workflow may remain marked failed; disclose the failure and in-place recovery rather than claiming every job passed. A complete matching draft can be finalized/reverified within the original authorization. Never use `--clobber`, delete a draft to restart, duplicate a draft or edit a published release. Ambiguous provenance or failed validation/build/assembly is a blocker. Never rerun both preparation modes as a recovery shortcut.

When blocked, report the concrete issue and required remedy, preserving the tag and successful artifacts. Request only genuinely missing information/authorization. Normal intermediate steps already included in `prepare VERSION for CHANNEL release` need no repeated approval.

## Completion and manual publication

Return the verified draft URL, workflow URL, exact version/channel and important testing limitations. Keep the completion short, for example:

> Repo Creator 1.5.3 Beta is ready for publication.
>
> All builds and verification passed.
>
> [View GitHub release draft]
>
> You can now review the draft and click Publish release.

Use actual verified links and results, not this example text when something is pending. Keep detailed evidence locally; include a larger report only for failures or when requested. **Preparation ends with the unpublished draft. The owner alone performs the final publication action.**

If the owner later requests post-publication verification, confirm public accessibility, draft=false, exact title/tag/SHA/channel, all downloadable asset bytes/signatures/checksums and the publication-triggered `Refresh published update channels` run on reviewed main. Read both feeds: Beta considers stable and prerelease versions, Stable excludes prereleases, and the highest eligible SemVer wins. Compare target URLs/signatures, publication date and notes with the verified release; for Beta, ensure Stable remains unchanged (or its valid empty manifest). Drafts do not update channels. Never edit feeds by hand, retag or change trust keys to recover; a manual feed-repair dispatch needs separate explicit authorization.
