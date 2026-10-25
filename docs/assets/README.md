# Application screenshots

The `overview`, `configuration`, `workspace`, `commands`, `settings` and `readiness`
PNG pairs, plus the current technology-detection captures, come from the real **Repo Creator 1.5.2** Windows
WebView2 application at **1100 × 740**, in light and dark appearances with the
actual default **Muted Teal** accent (`#4FA69B`, using theme-specific UI shades).
They were captured on 25 October 2026 for the upcoming **v1.5.2 Beta**, from the
version-preparation branch based on green main `c367eb1`, containing PRs #16–18.

The header is the application's actual native version, not edited image text or
a frontend override. The capture harness checks `get_update_info.currentVersion`
and the visible header against `package.json` before saving images. Each capture
also checks the header and native accent preference. It rejects stale builds,
including the prior 1.5.1 executable. All six checked application version values
are 1.5.2. The current published release is v1.5.1 Beta; these screenshots do not
imply that v1.5.2 is already available to download.

The fictional Field Notes fixture uses isolated application settings, an isolated
Git home with **Example Developer**, and an owned `C:\Projects\field-notes`
repository without remotes. Readiness is captured first, with deliberately
missing lockfile, `node_modules` and `.env`, using read-only inspection and no
project command execution. Only afterward does the harness link already installed
build tooling and explicitly start the local Vite preview for the console images.
Technology-detection captures also precede command execution and show real manifest
evidence, pending additions and unchanged saved selections. The harness installs
nothing, opens no output links, makes no model requests and publishes nothing.
The process is stopped before owned fixture data is removed. Images
are checked for private paths and account data and visually reviewed.

Historical before images in `docs/images/commands-ux` retain their original
1.4.3 or 1.5.0 headers, with provenance in the comparison report. The original
`simple-mode.png` and `advanced-mode.png` remain historical assets and are not
used as current README screenshots. The technology-detection before image retains
its real 1.5.1 header from before PR #16. Current detection images use the generic
Field Notes path and include the complete application frame and native 1.5.2
header; they are direct screenshots with no image editing or masking.

To refresh, build the intended source and run `node tests/public-screenshots.mjs`
on Windows. Set `REPO_CREATOR_SMOKE_EXE` to select the matching executable and
optionally `REPO_CREATOR_SCREENSHOT_OUTPUT` for review captures outside this
folder. The harness refuses an existing demo project or occupied debugging port,
preserves an existing `C:\Projects` parent, and removes only its owned fixture
and temporary profile. Vite uses port 5187 with strict port selection. Binaries
and browser data remain untracked.

[Version preparation and verification](../v1.5.2-preparation.md) ·
[Before/after comparisons and website refresh inventory](../commands-ux-review.md).
The separate marketing website and its intentionally pinned v1.5.1 interactive
demo are not modified by this preparation.

The hero uses the approved, unmodified [Keystone banner exports](../branding/builder/exports/)
and outlined Manrope lettering. See [brand provenance and font licensing](../branding/builder/fonts/README.md).
Theme images use [GitHub's supported picture markup](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/quickstart-for-writing-on-github#adding-an-image-to-suit-your-visitors).
