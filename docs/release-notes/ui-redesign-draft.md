# Repo Creator — A clearer path from setup to first commit

This redesign brings Git setup, project creation and everyday workspace tools into a consistent desktop layout.

### What's New

- **First-run setup checklist** — See whether Git and your commit identity are ready, with a fix for each required item. GitHub publishing remains optional.
- **Commit identity choices** — Save an identity for projects made in Repo Creator. The app writes global Git configuration only after you explicitly confirm **Save to my Git configuration**.
- **Sidebar and one-page New Project** — Move between New Project, Projects, Presets and Settings. Configure files and AI agents on one scrolling page, search the generated-file tree and review the exact contents before creating.
- **Presets and advanced options** — Browse **Yours** and **Built-in**, save the current starting point and edit individual custom presets. The Simple/Advanced switch is now **Settings → General → Show advanced options by default**.
- **Project workspace** — See why technologies were detected, review previous command runs with their output, and open the editable AI prompt from **Handoff**.

### Installation

When a build is published, choose the Windows x64 or matching macOS package under **Assets** and compare its checksum with `SHA256SUMS.txt`. Move the Mac application out of the DMG before opening it. See the [installation guide](../getting-started.md#download-and-install).

**Known limitations:**

- Windows packages are unsigned at the operating-system level. Mac packages use an ad-hoc signature and are not notarized.
- Physical Mac installation and launch, screen-reader passes and real display-scaling checks remain pending.
- Technology detection reads a bounded set of local files. Unusual project layouts may need manual technology selections.

### Feedback

Found a bug or have a suggestion? [Open an issue](https://github.com/DefinitivedCode/RepoCreator/issues).
