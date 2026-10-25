# Application performance measurements

Measured on October 25, 2026, against `main` at `618fc1b` (PR #16 merged).
The measured builds used application version `1.5.1`. No release assets or updater settings changed during that audit.

## Method

`tests/native-performance.mjs` launches a real optimized Windows x64 Tauri build
with WebView2, isolated settings and a disposable WebView profile. It creates two
fictional Git repositories (12 and 1,500 TypeScript source files, package and
TypeScript manifests) and a full 100-row project library referencing those two
fixtures. It creates no remote repositories and executes no project scripts.
Each operation has five samples; startup has one fresh-profile sample and five
launches reusing that profile. Medians are in milliseconds.

The host runs Windows, Node 22.23.4 and Rust 1.98.1. Both revisions use
`npm run desktop:build -- --ci --no-bundle --target x86_64-pc-windows-msvc`,
the committed lockfiles and the unchanged optimized release profile. Baseline and
accepted comparison runs do not overlap the native test suite. An exploratory
after run overlapping Rust/browser tests was slower, including 3,289.9 ms warm
Git readiness; it was excluded from the controlled comparison because the
overlapping run also encountered browser-load and process-deadline test timeouts.
This illustrates the sensitivity to test conditions.

Launch-to-input measures process spawn until the harness observes the Project
name input. Launch-to-Git-ready additionally waits for the actual prerequisite
checks. These are observation upper bounds including CDP attachment/polling,
not time to first pixel. A fresh WebView profile is **not an OS-cold launch**:
filesystem/executable caches were not flushed and no reboot measurement was made.
DOMContentLoaded is the WebView navigation timing, not React render duration.
IPC measurements cover the native operation and WebView round trip. UI tab timings
include the click, React commit and two animation frames; workspace opening waits
for its heading. Preview editing includes the existing 180 ms debounce. These
categories must not be compared as if they were the same metric.

## Results

| Operation                                       | Before ms | After ms | Change ms | Change |
| ----------------------------------------------- | --------: | -------: | --------: | -----: |
| Fresh-profile launch to input (one sample)      |     605.8 |    671.6 |     +65.8 | +10.9% |
| Fresh-profile launch to Git ready (one sample)  |    2447.5 |   2005.7 |    -441.8 | -18.1% |
| Warm launch to input                            |     514.7 |    512.0 |      -2.7 |  -0.5% |
| Warm launch to Git ready                        |    2371.5 |   1843.7 |    -527.8 | -22.3% |
| Frontend DOMContentLoaded                       |      42.7 |     43.6 |      +0.9 |  +2.1% |
| Local environment IPC                           |    1730.1 |   1032.6 |    -697.5 | -40.3% |
| Library, 100 rows, IPC                          |      31.5 |     31.0 |      -0.5 |  -1.6% |
| Small workspace IPC                             |     886.5 |    592.5 |    -294.0 | -33.2% |
| Moderate workspace IPC                          |    1030.6 |    581.3 |    -449.3 | -43.6% |
| Small technology detection IPC                  |       7.8 |      7.9 |      +0.1 |  +1.3% |
| Moderate technology detection IPC               |     183.3 |    120.0 |     -63.3 | -34.5% |
| Library, 100 rows, UI                           |      35.5 |     34.5 |      -1.0 |  -2.8% |
| Open moderate workspace, UI                     |    1348.7 |    859.8 |    -488.9 | -36.2% |
| Commands tab, UI                                |      28.3 |     28.5 |      +0.2 |  +0.7% |
| Readiness tab, UI                               |      30.6 |     30.4 |      -0.2 |  -0.7% |
| Project Settings tab, UI                        |      30.7 |     30.6 |      -0.1 |  -0.3% |
| Presets → Settings → New Project, UI            |      67.9 |     62.6 |      -5.3 |  -7.8% |
| Generated preview after editing                 |     211.7 |    210.2 |      -1.5 |  -0.7% |
| Input edit plus concurrent detection completion |     149.0 |    110.7 |     -38.3 | -25.7% |

The supported improvements are fewer processes on the setup/workspace critical
paths and the corresponding repeatable latency reductions. Technology detection
and preview generation were not changed; their differences are observations,
not claimed improvements. The input/concurrent-scan measurement waits for both
operations and is not a standalone input-latency measurement. Tab rendering,
initial input availability and library rendering are effectively unchanged.
The initial JS bundle is essentially unchanged (466.10 → 466.49 kB before gzip),
so no bundle/startup-render improvement is claimed.

## Changes and regression coverage

- Setup reuses the Git name lookup and runs independent Git and GitHub probes
  concurrently. Required checks still finish before creation is enabled; a failed
  refresh clears the old environment result.
- Workspace status and branch come from one porcelain-v2 snapshot, with
  ahead/behind history walks disabled. Existing filter suppression, fsmonitor
  suppression, optional-lock avoidance and submodule exclusion remain in place.
  Rust tests cover status parsing and verify actual inspection does not run Git
  filters or change the index.
- Opening a workspace no longer reloads the hidden library. In-flight requests
  are shared during Strict Mode effect replay and obsolete responses are ignored.
  Returning to the library and successful imports trigger fresh reads; there is
  no persistent Git/filesystem cache. A browser test asserts request counts and
  refreshed metadata on return. Readiness invalidates responses on effect cleanup.
- On unchanged main, the Studio regression stopped `Ctrl+End` 121 pixels short
  after expanding Advanced AI configuration. Studio's intrinsic-height transition
  changed the scroll extent during keyboard navigation. Keeping its fade while
  applying height immediately makes the original test pass at all four supported
  frames. No test tolerance or scenario was removed.

## Reproduce

Build each revision, then run the same benchmark script from this branch against
each executable. Keep other builds/tests idle. Optionally copy the baseline
executable into an ignored artifact directory before building the new revision.

```powershell
$env:REPO_CREATOR_SMOKE_EXE = (Resolve-Path 'src-tauri/target/x86_64-pc-windows-msvc/release/repo-creator.exe').Path
$env:REPO_CREATOR_PERF_OUTPUT = 'artifacts/performance/native.json'
node tests/native-performance.mjs
```

The JSON contains all samples and no project paths or identity data. No wall-clock
threshold is imposed in CI. Fresh-profile results need repeated independent
profiles before statistical claims; OS-cold startup, physical Mac launch and
render-only React profiling remain unmeasured. Live GitHub publishing and updater
installation are deliberately not exercised. Existing Rust/browser tests cover
their validation, failure handling and update trust boundaries.
