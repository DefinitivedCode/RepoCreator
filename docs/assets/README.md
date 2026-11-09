# Application screenshots

The `overview`, `configuration`, `workspace`, `technology-detection-review` and `readiness`
PNG pairs come from the **Repo Creator 2.0.0** Windows debug build, in light and dark
appearances, at about **1100 × 740** with the default **Muted Teal** accent. They were
captured by hand from the running application on 9 November 2026, from the version
pull request that sets 2.0.0. The header shows the application's real version.

The fictional Field Notes project uses an isolated application data folder, an isolated
Git configuration with the fictional identity **Ada Example**, and a small repository
without remotes. Readiness was captured before any project command ran. The technology
review shows real manifest evidence for TypeScript and Vite and was captured before
adding the suggestions. Nothing was installed, no output links were opened, no model
requests were made and nothing was published.

**These ten images are edited in two ways, and in no other way:**

- The text of a local folder path was replaced with `C:\Projects` (the Save location field
  on New Project, and the project path under the project name), because the real path
  contained a private user name. The replacement text is drawn in the same colours.
- On the two technology-detection images, a few pixels of path text behind the dialog
  were covered with the dialog's background colour, and the bottom 8 pixels were cropped
  because they contained unrelated desktop content.

Because the folder shown is not the real one, `C:\Projects\field-notes` in these images
is illustrative; no such folder was used.

The `commands`, `settings`, `technology-detection-before`, `technology-detection-pending`
and `technology-detection-settings` images are older, real **1.5.2** captures from
25 October 2026 and show the earlier layout. Historical before images in
`docs/images/commands-ux` retain their original 1.4.3 or 1.5.0 headers, with provenance in
the comparison report. The original `simple-mode.png` and `advanced-mode.png` remain
historical assets and are not used as current README screenshots. The
technology-detection before image retains its real 1.5.1 header from before PR #16.

To refresh the images automatically, build the intended source and run
`node tests/public-screenshots.mjs` on Windows. That script is **not usable as written for
2.0.0**: it still writes to `C:\Projects\field-notes` and uses selectors from the earlier
layout (see the [release checklist](../redesign-release-checklist.md#native-public-screenshots)).
Binaries and browser data remain untracked.

[Version preparation and verification](../v2.0.0-preparation.md) ·
[Earlier 1.5.2 preparation](../v1.5.2-preparation.md) ·
[Before/after comparisons and website refresh inventory](../commands-ux-review.md).
The separate marketing website and its intentionally pinned v1.5.1 interactive
demo are not modified by this preparation.

The hero uses the approved, unmodified [Keystone banner exports](../branding/builder/exports/)
and outlined Manrope lettering. See [brand provenance and font licensing](../branding/builder/fonts/README.md).
Theme images use [GitHub's supported picture markup](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/quickstart-for-writing-on-github#adding-an-image-to-suit-your-visitors).
