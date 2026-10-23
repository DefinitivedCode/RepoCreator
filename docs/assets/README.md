# Application screenshots

The README's `overview`, `configuration`, `workspace` and `readiness` PNG pairs
are unmodified captures from the real Windows WebView2 application at 1100 × 740,
in light and dark themes with the Muted Teal accent. They were captured on
23 October 2026 from the Keystone integration build at `df5fe2a`, which includes
Project Readiness. Its source tree is identical to merged `main` at `8357223`.
This is a development preview, not the published v1.4.3 build.

The fictional Field Notes data uses an isolated application profile and an owned
`C:\Projects\field-notes` Git fixture with no remotes. The Readiness capture is
scrolled to real findings: deliberately absent lockfile, `node_modules` and
`.env`. No project scripts, model requests or remote publication run during
capture. Personal paths and account information are checked before every image.
The original `simple-mode.png` / `advanced-mode.png` remain historical assets.

To refresh, build the intended source, then run `node tests/public-screenshots.mjs`
on Windows. Set `REPO_CREATOR_SMOKE_EXE` to override the executable. The capture
refuses an existing demo project or occupied debugging port, preserves any
existing `C:\Projects` parent, and removes only its owned fixture and temporary
profile. Review every PNG before committing. Native binaries and browser data
stay outside the tracked assets.

The hero uses the approved, unmodified [Keystone banner exports](../branding/builder/exports/)
and their outlined Manrope lettering. See [brand provenance and font licensing](../branding/builder/fonts/README.md).
Theme images use [GitHub's supported picture markup](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/quickstart-for-writing-on-github#adding-an-image-to-suit-your-visitors).
