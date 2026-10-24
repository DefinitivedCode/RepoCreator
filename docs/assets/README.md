# Application screenshots

The `overview`, `configuration`, `workspace`, `commands` and `settings` PNG pairs
are unmodified captures from the real Windows WebView2 application at **1100 × 740**,
in light and dark appearances with the actual default **Muted Teal** accent
(`#4FA69B`, with theme-specific UI shades). Captured on 24 October 2026 from the
`codex/project-commands-ux` development build in this PR, they show refinements
following published **v1.5.0 Beta**. The header still says 1.5.0; no version bump
or release is implied.

The Overview and Project Files pairs were refreshed again for the footer
correction: Git readiness now shares the bottom bar with summary, helper status
and the review/create action. The Overview before images in the comparison show
the initial PR #14 layout at `52c1b17`, rather than the older 1.4.3 capture.

The fictional Field Notes fixture uses isolated application settings, an isolated
Git home with the name **Example Developer**, and an owned `C:\Projects\field-notes`
repository without remotes. Commands captures show actual Vite output, started
explicitly through the command runner. The harness links already installed build
tooling into the demo; it installs nothing, opens no output links, makes no model
requests and publishes nothing. The process is stopped before owned data is
removed. Images are checked for private paths and account data before capture
and reviewed before committing.

The still-accurate `readiness` pair is preserved from 23 October 2026, captured
from Keystone integration build `df5fe2a`, whose tree matches merged `8357223`.
Those images retain a **1.4.3** header, although their UI is included in v1.5.0
Beta. That fixture deliberately lacked a lockfile, installed packages and `.env`;
its findings were read-only and no project scripts ran. The original
`simple-mode.png` and `advanced-mode.png` remain historical assets.

To refresh affected views, build the intended source and run
`node tests/public-screenshots.mjs` on Windows. Set `REPO_CREATOR_SMOKE_EXE` to
select the executable and optionally `REPO_CREATOR_SCREENSHOT_OUTPUT` to write
review captures outside this folder. The harness refuses an existing demo project
or occupied debugging port, preserves an existing `C:\Projects` parent, and
removes only its owned fixture and temporary profile. Vite uses port 5187 with
strict port selection. Readiness is preserved by default; set
`REPO_CREATOR_CAPTURE_READINESS=1` only when intentionally refreshing that view
and review its changed fixture state. Binaries and browser data stay untracked.

[Before/after comparisons, verification and website refresh inventory](../commands-ux-review.md).

The hero uses the approved, unmodified [Keystone banner exports](../branding/builder/exports/)
and outlined Manrope lettering. See [brand provenance and font licensing](../branding/builder/fonts/README.md).
Theme images use [GitHub's supported picture markup](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/quickstart-for-writing-on-github#adding-an-image-to-suit-your-visitors).
