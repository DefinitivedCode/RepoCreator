# CI performance measurements

The October 25, 2026 audit starts from `main` at `618fc1b`, after PR #16.
The required names remain `version`, `windows`, `macOS Apple-Silicon` and
`macOS Intel`. All application versions remain `1.5.1`.

## Baselines

Durations below come from successful Actions run/job/step API timestamps.
Workflow elapsed includes dependency scheduling, runner queues and teardown.
Runner queue is job `started_at - created_at`; it is not compilation time.

| Metric, seconds                           | [PR #16](https://github.com/DefinitivedCode/RepoCreator/actions/runs/40194913594) | [Post-merge v1.5.1](https://github.com/DefinitivedCode/RepoCreator/actions/runs/40103853003) |
| ----------------------------------------- | --------------------------------------------------------------------------------: | -------------------------------------------------------------------------------------------: |
| Total workflow elapsed                    |                                                                               505 |                                                                                          393 |
| Windows job elapsed                       |                                                                               490 |                                                                                          380 |
| Windows queue                             |                                                                                 3 |                                                                                            3 |
| Windows npm install                       |                                                                                16 |                                                                                            9 |
| Windows Rust cache restore / save         |                                                                            32 / 0 |                                                                                       21 / 0 |
| Windows frontend check / format / unit    |                                                                        1 / 7 / 10 |                                                                                    1 / 6 / 3 |
| Windows browser tests                     |                                                                               201 |                                                                                          227 |
| Windows Clippy / Rust tests               |                                                                          124 / 32 |                                                                                      35 / 26 |
| Windows Tauri debug build                 |                                                                                14 |                                                                                           17 |
| Apple Silicon job elapsed / queue         |                                                                           177 / 3 |                                                                                      170 / 4 |
| Apple Silicon npm install                 |                                                                                 3 |                                                                                            4 |
| Apple Silicon Rust cache restore / save   |                                                                            10 / 1 |                                                                                       16 / 0 |
| Apple Silicon Clippy / tests / app bundle |                                                                      37 / 57 / 48 |                                                                                 32 / 53 / 42 |
| Intel job elapsed / queue                 |                                                                           449 / 4 |                                                                                      284 / 4 |
| Intel npm install                         |                                                                                 8 |                                                                                            6 |
| Intel Rust cache restore / save           |                                                                            19 / 1 |                                                                                       31 / 0 |
| Intel Clippy / tests / app bundle         |                                                                   116 / 156 / 104 |                                                                                 74 / 75 / 68 |

The successful [v1.5.1 signed preparation](https://github.com/DefinitivedCode/RepoCreator/actions/runs/40107919633)
took 476 seconds. Windows took 404 seconds (168 browser, 26 Clippy, 20 tests,
120 optimized build/installers); Intel took 422 seconds (66 cache restore,
36 Clippy, 50 tests, 231 app/DMG); Apple Silicon took 234 seconds (15 restore,
23 Clippy, 29 tests, 132 app/DMG). Platform queues were 3–4 seconds. Preparation
also validates the tag, assembles/verifies assets and creates the authorized draft.
No release workflow was dispatched for this optimisation task.

The immediate post-PR-16 main run failed its existing Studio keyboard-scrolling
test, so its shorter elapsed duration is not a successful performance baseline.
The small identical Studio height-transition fix is shared with the application
performance PR so either PR can be validated and merged independently.

## Changes and tradeoffs

Windows frontend/browser verification and native verification now run in parallel
on separate Windows runners. The `windows` gate depends on both, runs with
`always()`, and requires both results to be exactly `success`. Failure,
cancellation, skipping or a missing result cannot produce a green required check.
A regression test executes the actual shell gate for all 25 result combinations.

Both jobs check out the same explicit commit, including approved release-tag
builds. Frontend check/format/unit tests and every Edge test still run once.
Clippy, locked Rust tests, native compilation and appropriate Tauri builds remain
on all three native targets. Only the native Windows job has updater/signing
configuration. Optimized installers, Mac architecture/signature/notices checks,
privacy scans, checksum validation, version checks, release permissions and
serialized signing remain unchanged.

The additional Windows runner duplicates checkout/Node/npm setup; it trades a
small amount of setup compute for overlapping the measured 201–227-second browser
stage with Rust work. It does not claim to reduce the total CPU cost of the tests.
Cold-cache compilation still takes time; this change overlaps rather than
eliminates it. Intel can become the critical path. Release preparation may see
little elapsed reduction when Intel optimized packaging already dominates.

Existing npm tarball caching, target/profile-separated Rust dependency caches,
source remapping, development debug-symbol settings, main-only cache saves and
superseded-PR cancellation are retained. Cache restores measured 10–32 seconds
for validation and up to 66 seconds for release preparation. Cache saves were
0–1 seconds in these runs; there is no evidence justifying a larger cache or new
compiler flags. Frontend builds are short compared with native work, so they
remain on each native platform; downloading a shared bundle adds complexity and
must not replace platform compilation.

Local Vite startup diagnostics found the first main stylesheet taking 25,747 ms
to transform with 48,588 files under the accumulated Rust target directory.
Ignoring generated Rust/test output in the file watcher reduced that transform
to 98 ms and made the same previously timing-out first-page appearance test pass
in 1.6 seconds. These are individual diagnostic samples, not a production startup
benchmark or a guaranteed CI gain. Frontend source and bundled resources remain
watched. Test assertions, supported dimensions and timeouts are unchanged.

## Comparison procedure

The read-only exporter records per-step durations, queue times, skipped steps and
unknown timestamps separately without fetching logs, credentials or cache data:

```powershell
node scripts/ci-timings.mjs DefinitivedCode/RepoCreator 40194913594 40103853003 > artifacts/ci-baseline.json
node scripts/ci-timings.mjs DefinitivedCode/RepoCreator NEW_RUN_ID > artifacts/ci-after.json
```

Compare successful runs of the same event, target, toolchain, dependency lockfiles
and packaging mode. For the new Windows path, compare the end-to-end workflow and
the combined browser/native critical path, not the short aggregate gate alone.
Keep each Mac architecture separate. Record cache hit/miss and bytes from the
individual cache steps when reviewing private logs; do not commit those logs.

After merge, let main save its normal caches, then compare at least three
successful PR and post-merge runs. Include a naturally occurring cold-cache run
(new toolchain or lockfile); do not evict production caches to manufacture one.
Treat runner queue/setup changes as scheduling differences. A single new PR run
cannot establish a representative warm-cache median or a release-time improvement.
