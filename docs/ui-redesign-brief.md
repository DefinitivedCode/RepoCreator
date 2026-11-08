# Repo Creator — UI/UX redesign and first-run design brief

Status: **proposal for review. Nothing in this document is implemented.** Baseline: branch `codex/autonomous-release-preparation` at `4df16cf` (app version 1.5.2 Beta), clean working tree during investigation.

## How to read this document

Every statement is tagged so findings and opinions never blur:

- **[V]** Verified in source, tests, docs or the screenshots in `docs/images/`. A file reference is given.
- **[P]** Proposed design decision. Open to change.
- **[Q]** Open question or an assumption that must be verified before implementation.

### What was and was not inspected

Inspected: `AGENTS.md`, `docs/development.md`, `getting-started.md`, `ui-polish-audit.md`, `project-workspace.md`, `src/App.tsx`, `WorkspaceFields.tsx` (`SetupPanel`), `useCreator.ts`, `ProjectWorkspace.tsx` (library, tabs), all 9 CSS files (6,070 lines, token and size audit by script), `src-tauri/src/lib.rs` (`check_environment`, handlers), `github.rs`, `desktop.rs`, `repository.rs`, `preferences.rs`, `tauri.conf.json` window sizes, and the tracked screenshots in `docs/images/ui-polish/` and `docs/images/commands-ux/`.

Not done: I did not run the app, so every screen claim comes from source plus the tracked fixture screenshots (v1.4.3, so some may predate later fixes). I did not read all of `readiness.rs` (3,179 lines), `handoff.rs`, the AI studio panels or the technology picker line by line. Their redesign sections below are based on structure and docs, and are marked where that limits confidence. No Git or GitHub configuration was read or changed. A first implementation phase should begin by running the app and capturing current states for every screen listed in section G.

---

## A. Current UX audit

Ordered by user impact.

### A1. A missing commit identity is under-explained and the error points to the wrong place — **Critical**

This reproduces the friend's experience. Evidence:

1. **[V]** The identity fields exist in exactly one place: the Settings → "Git & identity" tab (`WorkspaceFields.tsx:668-713`; `commitAuthorName` appears in no other component). The native creation error says: _"Enter your name and email in Project Files → Git Settings…"_ (`repository.rs:105`). `Project Files → Git Settings` contains branch and commit-message options, not identity. The error directs users to a screen that cannot fix the problem.
2. **[V]** The footer shows only "Setup required" (`App.tsx:555-561`), and the disabled-button reason is the generic _"Complete the required setup."_ (`App.tsx:59`). The app already knows whether Git is missing, the name is missing or the email is missing (`Environment` carries `gitInstalled`, `identityReady`) but surfaces one boolean.
3. **[V]** The Create button is simply `disabled` (`App.tsx:577`), which removes it from keyboard focus and screen-reader exploration, so a keyboard user cannot discover why.
4. **[V]** The fields are labelled "Your name for this project" and bind to the in-progress new-project form (`form.options.commitAuthorName`), not to an application or Git setting. Yet they live in _Settings_ under "Development environment". Users reasonably read them as account-level configuration. The footer text "Overrides apply only to the new repository" is the only clue.
5. **[V]** `identityReady` is true only when both `git config --get user.name` and `user.email` return non-empty values with the parent folder as working directory (`lib.rs:130-155`). That is a reasonable effective-config test, but it does not validate an email's shape, does not report _which_ value is missing, does not report where a value came from (system/global/local/`includeIf`), and the version of Git is never checked (`git init --initial-branch` at `repository.rs:~250` needs Git 2.28+; the environment check only runs `git --version` for success). **[Q]** Confirm minimum version in implementation.
6. **[V]** There is no first-run state anywhere. `Preferences` (`preferences.rs:36-64`) has no onboarding, completed-setup or seen-version field, and a repository-wide search for `onboard|welcome|firstRun` finds nothing. The app opens on the New Project form for everyone (`App.tsx:37`).

### A2. GitHub status conflates unrelated failure modes — **High**

- **[V]** Authentication is detected by running `gh api user` and treating any failure as "not connected" (`github.rs:20-45`, `lib.rs:157-165`). An expired token, no network, API rate limit and never-signed-in are different situations needing different guidance. The code already comments that timeouts "may be network failures", but the UI receives only `githubUser: string | null`.
- **[V]** When the destination is local, GitHub is not checked at all and the panel says "Not checked for this local project" (`WorkspaceFields.tsx:742`; `lib.rs:157`). A first-time user opening Settings cannot learn whether they are connected without switching the destination first or pressing a button.
- **[V]** "Connect to GitHub" opens PowerShell (Windows) or Terminal (macOS) running `gh auth login --hostname github.com --git-protocol https --web` (`desktop.rs:227-275`). This is the correct, token-safe mechanism. But the app gives no instruction about what will happen ("a terminal window will open and show a one-time code"), no progress, and no automatic recheck when the user returns: the user must find the separate "Check GitHub connection" button. **[V]** The install links are allowlisted (`desktop.rs:195-215`), which is a good safety property to preserve.

### A3. Navigation uses four unrelated patterns and three different accessibility models — **High**

| Pattern        | Where                                                                               | Visual active state         | Semantics                             |
| -------------- | ----------------------------------------------------------------------------------- | --------------------------- | ------------------------------------- |
| Header buttons | New Project / Projects / Presets / Settings (`App.tsx:95-121`)                      | Bordered, tinted pill       | `aria-current="page"`                 |
| Left rail      | Overview / Project Files / AI Agents / Review / AI Handoff (`App.tsx:299-330`)      | Tinted block with left edge | `aria-current="page"`                 |
| "Subnav" tabs  | Files and Agents sub-sections (`App.tsx:609-629`)                                   | Bordered pill               | `aria-pressed` buttons                |
| Workspace tabs | Project: Overview/Open/Commands/Readiness/Settings (`ProjectWorkspace.tsx:390-420`) | Bordered pill               | `aria-pressed` buttons                |
| Settings tabs  | Git / GitHub / Tools / Appearance / Updates (`WorkspaceFields.tsx:592-630`)         | Bordered pill               | real `role="tablist"` with arrow keys |
| Segmented      | Simple/Advanced, Destination, command mode                                          | Filled half                 | `aria-pressed`                        |

Five navigation-like controls look similar (bordered pill) but behave and announce differently. Only the Settings tabs implement the ARIA tab pattern and arrow-key navigation; the workspace tabs and subnavs are toggle buttons presented as tabs. The ui-polish audit (v1.4.3) harmonised their _look_ but not their structure **[V]** (`ui-polish-audit.md`: "unify equivalent tabs").

Also **[V]**: `Section` includes `'recent'` and `'setup'` values and labels that are filtered out of the rail and rerouted (`App.tsx:20-29, 66-70, 302-304`): vestigial navigation state. The **Simple/Advanced** switch sits in the global header but affects only the New Project page and hides two rail items (`App.tsx:304`). A global-looking control with page-local effect.

### A4. The New Project page is simultaneously dense and fragmented — **High**

- **[V]** At the default 1100×740 the layout has up to three columns plus header and footer: 140–254px rail, form, 254px "Generated files" context panel (`overview-after.png`, `ui-polish-audit.md` first finding). Project name, preset, technologies, assistant, location and destination share one "Overview" screen while Project Files and AI Agents are separate sections reached through a rail, and Review is a fourth place. Users must decide between _Review_ and the footer's "Review project", and the same footer button changes label (`Review project` → `Create Project`, `App.tsx:578`) so the primary action's meaning shifts by section.
- **[V]** In the screenshot, the technologies/assistant group is a bordered box inside a page that also has a bordered rail, bordered header buttons, bordered segmented control and bordered fields: five nested border treatments in one view.
- **[V]** "Preview files" and "Hide details" appear as small text buttons beside the heading (`App.tsx:338-357`) while the same information also sits permanently in the context panel. Three entry points to one preview.
- **[V]** "AI Handoff" is in the _project setup_ rail though it concerns prompts for an assistant; the Projects workspace also has a handoff view (`setHandoff`, `ProjectWorkspace.tsx:~398`). It is reachable from two unrelated places with different surroundings.

### A5. Typography is small and the scale is ad hoc — **Medium-High**

Measured across all `src/*.css` **[V]**: ~15 distinct font sizes. 123 declarations use `12px`, 39 use `11px`, 13 use `10px`, 3 use `9px`, plus rem equivalents (`0.6875rem` ×23, `0.625rem` ×8, `0.65625rem` ×6). Roughly 90 declarations are 11px or smaller. Radii are 2, 3, 4, 5, 8 and 9px, plus `50%` and a `--radius: 4px` token that most rules ignore (21 rules use a literal `3px`). The token set in `styles.css:1-60` defines colour only; spacing and type have no tokens, which is why consistency has to be re-audited each release.

Colour contrast of the existing muted text is acceptable (5.16:1 light, 6.46:1 dark, computed) **[V]**, so the problem is _size and weight_, not colour alone.

### A6. Page composition varies from cramped to empty — **Medium**

- **[V]** Settings content occupies the top ~45% of a 1440×900 window with an empty remainder (`settings-after.png`); status appears twice ("Git ready" under the title and "Ready for local projects" in the summary), and the "Development environment" heading is repeated inside a panel that is itself headed by tabs.
- **[V]** Commands screen (`before-commands-light.png`, v1.4.3 capture): a tab strip, an action row, a preset button, command cards with five equal-weight buttons, and an output panel with three more actions. Run/Edit/Delete/↑/↓ have the same visual weight; destructive Delete sits beside Edit. **[Q]** The screenshot shows raw ANSI escape sequences in output. `commandOutputModel.ts` exists, so this may already be fixed; re-verify in the running app.
- **[V]** Project library cards use text glyphs `★ / ☆` for pinning (`ProjectWorkspace.tsx:~262`) rather than the icon set.

### A7. Discoverability for first-time users — **Medium-High**

- **[V]** No explanation of what Presets are until the user opens the Presets page; "Manage…" and "Presets" co-exist; "Technologies / Browse… / Clear all / More…" use four different link/button treatments in one card.
- **[V]** Adding an existing project (`add_existing_project`) lives in the Projects page; there is no first-run route into it.
- **[V]** Update status, appearance and environment are bundled in one "Settings" page whose summary header reads "Development environment" even on the Appearance tab.

### A8. What already works and must be preserved

**[V]** Native generation shared by preview and creation (`docs/development.md`); no destination is ever overwritten; GitHub failures keep local work (`github.rs:publish_error`); allowlisted setup links; fixed-argument terminal sign-in; no credential entry in the app; tests for 820×580, both themes, enlarged text, keyboard scrolling and dialogs (`tests/*.spec.ts`); appearance with accents and custom colour; project launcher/command safety model. The redesign changes presentation and flow and adds a small amount of backend. It does not touch the generator.

---

## B. Product experience goals

**Feel:** a calm, precise tool that does one job well and shows its work: _you see what will be made before you make it_. Closer to a well-set technical document than a dashboard.

**Principles**

1. **Say what's wrong, where it is and how to fix it, in one place.** No generic "Setup required". Every blocker names itself and offers a fix action, inline, without losing the user's in-progress form.
2. **Never an unexplained disabled control.** Use `aria-disabled` plus visible reason text (programmatically associated).
3. **Required versus optional is always labelled.** Git and a commit identity are required for any project. GitHub, editors and AI tools are optional.
4. **Detect first, ask second.** Nothing is requested that the app can read.
5. **Consent for every environment change.** The app states the exact change, file and scope, and waits for an explicit click. It never writes global Git configuration silently.
6. **One navigation grammar** (section C): destinations, sections, tools and actions each have one look.
7. **The preview is the product.** File tree and content stay one click or less away and are always exact (same Rust generator).
8. **Progressive disclosure, not a mode switch.** Advanced options appear in place when wanted.
9. **Readable by default.** Body 14px, nothing below 12px, no information conveyed by colour alone.
10. **Local first.** GitHub is never a prerequisite for creating a local project.

---

## C. Proposed information architecture

### C1. Decision: replace top navigation + rail + pill tabs with a single left sidebar and one tab style

Is the present combination justified? **[P] Partly.** The _concepts_ (destinations, sections within a task, sub-sections) exist and are needed. The problem is that each level is drawn differently and the header spends its prime space on a destination list that has only four items. Proposed structure has exactly **three levels, each with one visual and semantic form**:

| Level               | Purpose                                         | Component                                                                                    | Semantics                                       |
| ------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1. App destinations | Where am I in the app                           | Left **sidebar** (icon + label, 200px; collapses to 52px icons at ≤ 900px window width)      | `<nav>` with `aria-current="page"`              |
| 2. Page sections    | Peer views of one subject (a project, settings) | **Underlined tabs** under the page title                                                     | real `tablist`, arrow keys, `aria-selected`     |
| 3. In-page grouping | Parts of one long task (new-project recipe)     | **Single scrolling page with a section index** (anchors) and collapsible "Customize" regions | `<section aria-labelledby>`, disclosure buttons |

Plus two non-navigation patterns that must not look like tabs: **segmented control** only for choosing a value of one setting (Destination, Visibility, Theme) and **primary/secondary actions** in a fixed page-header action area.

### C2. Application destinations (sidebar)

```
 ┌───────────────┐
 │ ◆ Repo Creator│
 │ [+ New project]│  ← the single primary action, always present
 │───────────────│
 │ Projects      │  ← default landing once any project exists
 │ Presets       │
 │               │
 │ (spacer)      │
 │───────────────│
 │ ● Setup       │  ← status dot only when something required is unmet
 │ Settings      │
 │ v1.5.2 · Update available │
 └───────────────┘
```

- **New project** is an action button, not a destination, because it begins a task. It opens the New Project page and exits through Create or Cancel. **[P]**
- **Projects** (library) is the home screen for returning users. Opening a project replaces the page area with the project workspace (level 2 tabs) and shows a breadcrumb "Projects / river-workbench" with a back affordance. The sidebar remains.
- **Presets** stays a destination: it is a library the user curates.
- **Settings** hosts: Setup (Git, identity, GitHub, tools), Appearance, Updates. Tabs at level 2. "Setup" is split out of "Settings" by being the same component as first-run (section F).
- **Update:** a single sidebar footer line "Update available" opens Settings → Updates; remove the transient banner above every page. The banner can remain for the first appearance only. **[P]**

### C3. Project workspace (level 2 tabs)

`Overview · Commands · Readiness · Handoff · Settings` with a persistent header: name, path (middle-truncated, full on hover/focus), branch, and an **Open in…** split button (VS Code / Terminal / Folder / GitHub), which replaces today's separate "Open" tab. All current launcher capability stays; it becomes a primary action rather than a sixth peer tab. **[P]** **[Q]** The "Open" tab also hosts launcher configuration (`advanced-executables`); move that to Project Settings → "Tools". Confirm no state is lost.

### C4. New Project page (level 3, no wizard)

One scrolling "recipe" with an always-visible **Result** pane (file tree + preview) and a bottom action bar. See G2. The Simple/Advanced header switch is removed; advanced content moves to per-section "Customize" disclosures, and a Settings preference "Show advanced options by default" preserves the current `experienceMode` setting. **[P]**

### C5. What the user always knows

- _Where am I:_ sidebar highlight + page title + breadcrumb inside a project.
- _Where can I go:_ three nav levels are visually distinct and consistent.
- _What next:_ each page has one primary action in the same place (top-right of the page header, or the bottom bar on New Project). Empty and error states name the next action.

---

## D. Visual directions

All three keep the Repo Creator name, brand mark and teal default accent **[V]** (`#4FA69B`, `docs/branding/`).

### Direction 1 — "Workbench"

Tool-window look: dark-leaning chrome, narrow icon rail, dense panels separated by 1px lines, mono-heavy, status bar.

- Strengths: efficient for commands/output; familiar to developers.
- Tradeoffs: reads as a VS Code derivative; density is the very thing criticised; small mono text hurts readability; beginners find it intimidating.

### Direction 2 — "Document" (typographic, content-first)

Large readable type, generous measure, almost no boxes (regions separated by space and hairlines), the file preview rendered as a paper-like sheet, restrained accent.

- Strengths: directly addresses "too many boxes" and small text; makes the preview feel central; elegant light and dark; easiest to keep consistent.
- Tradeoffs: lower information density; command/output and readiness lists need disciplined rows or they sprawl; risk of looking plain if hierarchy is weak.

### Direction 3 — "Console"

Terminal-flavoured: monospaced labels, ruled layout, command-palette-first interaction (Ctrl/Cmd+K), keyboard hints everywhere.

- Strengths: distinctive; fast for power users.
- Tradeoffs: poor first-run friendliness; accessibility cost of mono small labels; palette-first design departs from the beginner-help goal.

### Recommendation: **Direction 2 structure with Direction 1's workbench frame for the project workspace** — call it **"Quiet Workbench"**. **[P]**

Rationale: New Project, onboarding, Presets and Settings are _reading and deciding_ screens and benefit from Direction 2. The project workspace (commands, output, readiness) is a _working_ screen where Direction 1's tighter rows and a split output pane are right. Both share tokens, so it remains one system: same type scale, same hairlines, same selection grammar, different density modes (`comfortable` / `compact`). A command palette (Direction 3's best idea) can come later as an enhancement, not a foundation.

---

## E. Design system specification

All values **[P]**. Implemented as CSS custom properties in a new `tokens.css` that replaces the colour-only block in `styles.css:1-60` and is consumed by the existing files.

### E1. Typography

System UI stack for a native feel: `"Segoe UI Variable", "Segoe UI", system-ui` (Windows), `-apple-system, "SF Pro Text"` (macOS). Mono: `"Cascadia Code", "SF Mono", ui-monospace` for paths, commands, file content only.

| Token              | Size / line | Weight | Use                              |
| ------------------ | ----------- | ------ | -------------------------------- |
| `--text-hero`      | 28 / 34     | 600    | Onboarding welcome only          |
| `--text-title`     | 20 / 28     | 600    | Page titles                      |
| `--text-section`   | 16 / 24     | 600    | Section headings                 |
| `--text-body`      | **14 / 21** | 400    | Default text and fields          |
| `--text-secondary` | 13 / 19     | 400    | Helper text, metadata            |
| `--text-caption`   | **12 / 16** | 500    | Badges, counts; **minimum size** |
| `--text-mono`      | 13 / 20     | 400    | Paths, commands, previews        |

Rules: no size below 12px; weights 400/500/600 only; sentence case, no letter-spaced all-caps eyebrows (the current "PROJECT SETUP", "REUSABLE STARTING POINTS" go); respect OS text scaling and the existing enlarged-text tests.

### E2. Colour

Neutral surfaces with a single accent used for _selection, focus and the primary action only_. Status colours (success/warning/error) are paired with an icon and text, never used alone.

| Token                                    | Light                  | Dark                       |
| ---------------------------------------- | ---------------------- | -------------------------- |
| `--bg` (app)                             | `#F6F6F4`              | `#171718`                  |
| `--surface` (content, fields)            | `#FFFFFF`              | `#1E1E20`                  |
| `--sunken` (preview, code)               | `#F0F0EE`              | `#141415`                  |
| `--text`                                 | `#1C1C1E`              | `#ECECEE`                  |
| `--text-2`                               | `#55555C`              | `#A8A8B0`                  |
| `--hairline`                             | `#E3E3DF`              | `#2E2E32`                  |
| `--field-border`                         | `#8A8A90`              | `#6E6E76`                  |
| `--accent-text` (links, selected labels) | `#1F6F66`              | `#5BBFB2`                  |
| `--accent-fill` (primary button)         | `#2A7D73` (white text) | `#4FA69B` (`#0B1F1C` text) |

Computed WCAG contrast ratios **[V]** (script, not by eye): text 17.0:1 / 14.1:1; secondary 7.4:1 / 7.1:1; accent text on surface 6.0:1 / 7.6:1; button label 4.9:1 / 5.9:1; field borders 3.4:1 / 3.3:1 (meets the 3:1 UI-component threshold). Note the existing default accent `#4FA69B` with white text is only 2.9:1, so the current code already derives darker shades for fills (per `getting-started.md`); the token set must keep that derivation for custom/other accents and fail contrast tests for any accent that cannot reach 4.5:1 after derivation. **[Q]** Verify the existing derivation function in `appearance.ts` against these targets.

The six existing accents (Slate, Teal, Gold, Copper, Monochrome, Custom) are preserved; each maps to `--accent-fill/--accent-text` pairs.

### E3. Spacing, borders, radii, elevation

- 4px base; scale 4 · 8 · 12 · 16 · 24 · 32 · 48.
- Page gutters 24px (16px at < 900px); content measure max 720px for forms, 1040px for lists.
- **Borders are for fields and region dividers only.** Sections are separated by 24–32px space and, where needed, a single hairline. No card inside a card. No border on selected navigation.
- Radii: **6px** controls, **8px** panels/dialogs/popovers, **999px** only for status chips. Remove 2/3/4/5/9px usage.
- Elevation: only popovers and dialogs (one soft shadow + scrim). No glow, no gradient.

### E4. Components

| Component                     | Spec                                                                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Button**                    | Heights 28 compact / 32 default / 40 onboarding. _Primary_: accent fill (max one per view). _Secondary_: surface, 1px field border. _Tertiary_: text only with accent-text. _Danger_: secondary until confirm dialog uses error fill. Icon + label gap 8px. |
| **Field**                     | 32px, 1px `--field-border`, 6px radius, label above (14/500), helper below (13), error replaces helper with icon + text and `aria-describedby`. Required/optional stated in text ("Optional"), not placeholder.                                             |
| **Navigation item** (sidebar) | 36px, icon 16px + label; selected = `--sunken` tint + weight 600 + accent-coloured icon. **No left accent bar, side stripe, underline or border** (maintainer decision 8: the side-bar treatment looks generic and machine-made).                           |
| **Tab**                       | 40px, underline 2px accent when selected, weight 600; ARIA tab pattern everywhere.                                                                                                                                                                          |
| **Segmented**                 | Only for one setting's values; selected = surface raised with weight 600. Never for navigation.                                                                                                                                                             |
| **Status row**                | Icon (check / warning / minus) + title + one-line state + trailing action. Used in setup, readiness, project metadata. Same row everywhere.                                                                                                                 |
| **Disclosure**                | Chevron, entire row clickable, `aria-expanded`, "Customize" naming for advanced settings.                                                                                                                                                                   |
| **Dialog**                    | Native `<dialog>` (preserve current focus handling), 8px radius, title, body, footer with primary on the right; max-height with internal scroll. Used for destructive confirms and the file viewer only.                                                    |
| **Notification**              | Inline banners for blocking issues next to their cause; toast (bottom-right, 5s, `role="status"`) for completed actions; never for errors that need action.                                                                                                 |
| **Icons**                     | One set, 16px, 1.5px stroke, `currentColor`. Reuse and extend `icons.tsx` (127 lines) rather than adding a dependency; replace `★/☆` glyphs.                                                                                                                |

### E5. State grammar (identical for every interactive element)

- **Hover:** background `--sunken`; text unchanged.
- **Focus-visible:** 2px `--accent-text` outline, 2px offset, never removed; WCAG 2.2 focus-appearance sized.
- **Active/pressed:** one step darker than hover.
- **Selected:** a tint plus a weight change, so it is not colour-only. Never a coloured side bar or stripe on navigation items, buttons or list rows. Tabs keep their 2px underline (a tab strip is the one place an underline is the convention); if that also looks wrong in review, switch tabs to the same tint-and-weight treatment.
- **Disabled:** 45% opacity **and** a visible reason. Prefer `aria-disabled` + explanation over `disabled` for primary actions.
- **Reduced motion:** transitions ≤ 160ms, none when `prefers-reduced-motion`.

### E6. Responsive rules (window widths)

| Width                               | Behaviour                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 820 (min)                           | Sidebar collapses to icon rail (52px); New Project result pane becomes a bottom drawer opened by "Preview files (N)"; page gutter 16px; tab strips scroll horizontally with visible scroll affordance. |
| 1100 (default)                      | Sidebar 200px; New Project = form (≤ 560px) + Result pane (≥ 340px).                                                                                                                                   |
| ≥ 1440                              | Content is centred with max measure; Result pane widens to show tree and preview side by side; no stretched fields.                                                                                    |
| High DPI / 125–150% / enlarged text | Layout uses rem/clamp; every region scrolls independently; no fixed heights on text containers.                                                                                                        |

Long text: paths middle-truncate with full value in `title` and a copy action; project names wrap to two lines then truncate; command output keeps horizontal scroll inside its own region.

---

## F. First-run onboarding

### F1. Approach

**One Setup page built as a checklist, not a multi-step wizard.** **[P]** Rationale: the three requirements (Git, identity, GitHub) are independent and many users already have two of them. A wizard forces sequential screens for things already done; a checklist shows only what's left and lets users skip optional items. The same component serves first-run, "Setup" in Settings, and the inline "fix it" sheet in New Project, so there is a single implementation of each fix.

### F2. When it appears

| Condition                                                           | Behaviour                                                                                                                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `onboarding.completedAt` **and** no saved projects/recents       | Full-window Setup page before the main app.                                                                                                                                   |
| No `completedAt` but projects exist (an existing user upgrading)    | **Do not interrupt.** Silently run detection; set completed if required items pass; otherwise show a sidebar "Setup" dot. **[V]** `list_recent_projects` exists to test this. |
| Completed, required item later breaks (Git removed, config cleared) | No modal. Sidebar dot + inline blockers on New Project.                                                                                                                       |
| User chooses Settings → Setup → "Run setup again"                   | Same page, nothing resets.                                                                                                                                                    |

Persistence **[P]**: add an additive `onboarding: { completedAt?: string, githubSkipped?: bool, version: u32 }` with `#[serde(default)]` to `Preferences` so existing settings files remain valid and no schema break occurs **[V]** (the struct already uses `#[serde(default)]` for later additions). **[Q]** Check `SETTINGS_VERSION` handling and the backup/`future_version` behaviour (`preferences.rs`) before adding.

### F3. Screen flow

**Screen 0 — Detecting (≤ ~1s, skeleton).** Title "Welcome to Repo Creator". Three rows show a spinner each. No question is asked here. If detection times out, rows show "Couldn't check — Retry" instead of staying silent.

**Screen 1 — Welcome + checklist.**

```
Welcome to Repo Creator
Create a Git repository with the right files in a few clicks. Everything runs on
this computer; GitHub is optional.

REQUIRED                                           (2 of 2 ready ✓ / 1 to do)
 ✓  Git is installed                      Git 2.47.1
 !  Your commit identity                  Git needs a name and email to record who made each commit.
    [ expanded fix area — see F4 ]
OPTIONAL
 –  Publish to GitHub                     Not connected   [Connect…]   [Skip for now]
 –  Editors and AI tools                  VS Code found · Claude Code not found  [Details]

                                          [ Create my first project ]  [ Add an existing project ]
```

Primary actions are enabled only when required rows pass; if not, they remain visible with `aria-disabled` and a line "Finish _Your commit identity_ to continue", which is a link focusing that row. "Skip" for optional rows records `githubSkipped` so it is not re-offered.

### F4. Row logic (condition matrix)

Required: **Git** and **commit identity**. Optional: **GitHub CLI** and **GitHub sign-in** (two separate rows internally, shown as one "Publish to GitHub" row with a two-part state).

**Git installation**

| State                               | Display                                                               | Actions                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installed, version OK               | ✓ "Git 2.xx found at _path_"                                          | none (path via "Details")                                                                                                                                                                                                                                                                                                                             |
| Installed, too old (< 2.28 **[Q]**) | ! "Your Git is too old to name the first branch. Update Git."         | Open official download page; Recheck                                                                                                                                                                                                                                                                                                                  |
| Missing                             | ! "Repo Creator uses Git to create your project. It isn't installed." | **Open official Git download** (allowlisted URL, `desktop.rs`); _Copy install command_ (Windows `winget install --id Git.Git -e`, macOS: running `git` or `xcode-select --install` triggers Apple's tools installer — **[Q]** verify wording against official docs at implementation); **Recheck** (also auto-rechecks when the window regains focus) |

The app never installs software. **[V]** current footer text already promises "no tools are installed automatically"; keep it.

**Commit identity** (shown only if Git is usable)

Plain-language header: _"Git records a name and email with every change you commit. They identify the author of the project's history."_

| State                       | Display                                                                                                                                   | Actions                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Name and email both resolve | ✓ "Commits will be signed as **Name <email>**" and where it comes from ("Global Git settings", `~/.gitconfig`)                            | "Use a different identity for Repo Creator projects" (optional) |
| Only name or only email     | ! "Git has your name but no email" (or vice versa)                                                                                        | Same fix area, missing field highlighted                        |
| Neither                     | ! as above                                                                                                                                | Fix area                                                        |
| Email format invalid        | field error "Enter an email like name@example.com" before saving                                                                          | Prevents saving                                                 |
| GitHub-bound project        | Note: "Projects published to GitHub use your GitHub private address, so your real email isn't exposed." **[V]** (`repository.rs:270-278`) | —                                                               |

Fix area offers **two clearly separate choices** (radio group, no default pre-selected for the global one):

1. **Use for projects made in Repo Creator only** _(recommended default)_ — "Saved in Repo Creator. Applied only inside each new project (`git config --local`). Your global Git settings stay untouched." This is the existing mechanism **[V]** (`repository.rs:259-273`) promoted to an app-level preference instead of per-form state.
2. **Set as my Git default for all projects** — expands to: "This will run `git config --global user.name "…"` and `git config --global user.email "…"`, which edits `C:\Users\you\.gitconfig`." Button label states the action: **Save to my Git configuration**. Cancel is the default focus. If a global value already exists, the screen displays the current value and the replacement side by side and names it an overwrite.

Pre-fill: name from the OS account display name where available **[Q]**, email empty (never guessed). A link "Use my GitHub private address" appears only when GitHub is connected. Validation test after save: re-run the same check the creator uses (`git var GIT_AUTHOR_IDENT`, `repository.rs:282`) and show the result: "✓ Tested: commits will be signed as …".

**GitHub CLI (optional)**

| State                                                    | Display                                                                                                                                                                                                              | Actions                                                                                                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gh` missing                                             | "GitHub CLI (`gh`) is GitHub's official command-line tool. Repo Creator uses it to sign you in and create repositories on your behalf, so we never see your password or a token. Optional: skip it to work locally." | Open `cli.github.com` (allowlisted); copy install command (`winget install --id GitHub.cli` / `brew install gh`, **[Q]** verify); Recheck; Skip for now                                         |
| `gh` present, signed out                                 | "GitHub CLI is installed but not signed in."                                                                                                                                                                         | **Connect to GitHub** (existing `connect_github`). Before launching: a notice "A terminal window opens and shows a one-time code. Enter it on github.com in your browser, then come back here." |
| Connecting                                               | Spinner + "Waiting for you to finish in the terminal window… [Cancel]". Auto-recheck on window focus and every 3s up to 2 minutes. **[P]**                                                                           | Cancel; "I finished, check now"                                                                                                                                                                 |
| Signed in                                                | ✓ "Connected as **@login**" (+ organisations found)                                                                                                                                                                  | Disconnect guidance (link to `gh auth logout` docs; no action by app); Connect another account                                                                                                  |
| Cannot verify (network/rate limit/timeout)               | ! "Couldn't reach GitHub to check your sign-in" — **not** shown as signed out                                                                                                                                        | Retry; Skip                                                                                                                                                                                     |
| Signed in but token lacks create-repo permission **[Q]** | ! "Connected, but this sign-in can't create repositories"                                                                                                                                                            | Re-run connect                                                                                                                                                                                  |

The app never shows a password or token field. **[V]** the existing flow already satisfies this; keep fixed constant scripts (`desktop.rs:227-275`).

### F5. Experienced versus first-time developers

- **Experienced, all configured:** Screen 0 detects everything; the page opens already complete with one friendly confirmation: "You're set up. Git 2.47 · Signed commits as Ada <ada@…> · GitHub: @ada" and primary **Create a project**. A "Don't show again / Skip" is unnecessary because completing sets `completedAt` and the page is never shown again. Time-to-first-project: one click.
- **Experienced, Git but no identity set globally (typical on a fresh dev machine):** Only the identity row is open.
- **First-time developer:** Rows start expanded with explanatory text; "Details" popovers explain what Git and a repository are in two sentences, and the optional section is visually quieter so it does not read as homework.

### F6. Returning users and revisiting

- Settings → **Setup** shows the same checklist plus advanced details (paths, versions, config source). **[P]**
- Detection reruns whenever the window regains focus while a Setup row is unresolved or Setup is open (cheap `--version` calls; GitHub only if the user has opted in or is on Setup).
- GitHub status is checked lazily on the Setup page and in the New Project Destination control, not on every launch.

### F7. Inline recovery in New Project

The footer's text is replaced by a **"To create this project" checklist popover** listing each unmet item with its own action; each action opens the same Setup row in a side sheet **without navigating away or losing form data**:

- "Add your commit identity" → identity sheet.
- "Choose where to save" → folder picker.
- "Connect GitHub to publish, or switch to Local only" → two buttons.

---

## G. Screen-by-screen redesign

### G1. App shell

Sidebar (section C2), page header with title and primary action area, status dot for setup, update line. Removes header navigation, header mode switch, and the update banner. Respects `data-theme` appearance and accent.

### G2. New Project

**Layout:** at 1100px, left column = recipe (scroll), right = **Result** pane; bottom action bar.

1. **Name & location** — Project name (with live "Will be created at `C:\Projects\river-workbench`" using the final normalised name **[V]** `normalizeProjectName` exists), description (optional), save location (Browse).
2. **Starting point** — Preset as a searchable list/select with one-line description; selected technologies as chips; "Customize" for the full picker. The "Manage…" action moves to the Presets destination, with a "Save as preset" action here.
3. **Files** — README, .gitignore, license, extras shown as a compact checklist with "Customize" opening the current editors (README/gitignore/license/additional/git settings) in-place or as a focused editor view with Back. **[Q]** Decide in-place vs focused view after seeing the editor widths at 820px.
4. **AI agents** — Assistant selector plus "Customize" for instructions, specialists, advanced (all existing capability retained). Handoff moves to the project workspace; creation-time handoff prompt remains available from the success screen. **[Q]** Confirm the handoff template needs form data (`HandoffPanel` receives `form`, `files`); preserve it as a section if so.
5. **Destination** — segmented: _On this computer_ / _Publish to GitHub_; GitHub reveals owner, visibility (with a plain "Public: anyone can see this" warning), topics, homepage under "Customize". If GitHub isn't connected, the row shows its status and **Connect** inline.

**Result pane:** file tree with count, selected file preview, "Expand" opens the existing large dialog. Also shows "First commit: `main` — _Initial commit_" and the identity that will sign it. This makes _what you're creating, where, and which files_ visible at all times. It reuses `creator.files`, `FocusedFilePreview` and `GeneratedFilesDialog`.

**Action bar:** left = destination summary ("Local · `C:\Projects\river-workbench` · 7 files"); right = **Create project** (single label always). Unmet requirements → button stays reachable with `aria-disabled`; activating it opens the "To create this project" checklist.

**Review step:** removed as a separate section for _local_ projects (the Result pane already is the review). For **GitHub destination, and always for Public visibility**, Create opens a short confirmation sheet: "Create `owner/name` as **Private/Public** and push the first commit", Cancel / Create and publish. **[P] [Q]** Decision for the maintainer: keep an explicit review sheet for all creations or only publishing. Recommendation: only publishing.

**Progress:** keep the existing stage events (`repo-progress`) as a vertical stage list (Folder → Files → Git → Commit → GitHub), with inline retry for publish failure (existing `retry_publish`). **Success:** names the path, branch, commit, files count; primary **Open project** (workspace), secondary Open folder / Open in VS Code / Create another. Completes the journey into the workspace.

### G3. Projects (library)

Rows rather than cards: name, path (truncated), detected technologies, branch, last opened, readiness badge only if attention > 0. Search field, sort, **Add existing project** and **New project** at the top. Pin becomes an icon toggle. Removing from history is a row-menu item with a confirm that states "The folder on disk is kept" **[V]** (existing note `library-note`). Empty state differs for no projects ("Create your first project or add one you already have") versus no search matches. Keep keyboard: arrow keys move between rows; Enter opens.

### G4. Project workspace

Header with name/path/branch and **Open in…**. Tabs: Overview, Commands, Readiness, Handoff, Settings.

- **Overview:** metadata as a plain definition list (path, branch, remote, last commit if available), then _Technologies_ with **evidence**: each detected technology has an expandable "Why we think this" listing files that triggered it **[V]** `technology_detection.rs`/`DetectedTechnologies.tsx` exist; **[Q]** confirm the evidence payload and whether user confirmation (accept/ignore) exists today. Keep "brief" as a disclosure.
- **Commands:** two panes (commands list ⟷ output). One primary per command (Run/Stop); Edit/Delete/reorder in a "⋯" menu; drag or move up/down in edit mode. A **run history** list under output, with exit status and duration. Output region: monospace, ANSI handling, copy, clear, stop, "Open in terminal". Long output scrolls within its pane.
- **Readiness:** list of status rows grouped by _Needs attention / Passing / Not run_, with a single **Run checks** action and per-check Run/Cancel. **[Q]** I did not audit `readiness.rs` in depth; inspect its categories before final layout.
- **Handoff:** prompt workspace (templates, style) with the generated prompt in a sunken pane and **Copy** primary.
- **Settings:** project-level metadata, commands defaults, launcher/tool overrides ("Advanced executable configuration" moves here), relocate project.

### G5. Presets

Two-section list ("Built-in", "Yours") of rows with description and counts; row actions Use (primary), Edit, Duplicate, Delete (custom only). The page explains presets in one sentence at the top for new users. Removes the redundant "Manage presets" modal entry point in favour of inline editing, while keeping the existing dialog for the editing form. **[Q]** `PresetDialog` is 363 lines; first phase should reuse it unchanged.

### G6. AI agents and handoff

Within New Project: one "AI agents" section (assistant selection first; **Customize** reveals Instructions, Specialists & Skills, Advanced as in-page disclosures, each with its own short purpose line). A preview of `AGENTS.md`/provider files remains in the Result pane. Handoff lives in the workspace (G4). Keep all existing fields and formats (`docs/agent-formats.md`).

### G7. Settings

Tabs: **Setup** (the F checklist), **Appearance**, **Updates**, plus **General** for "Show advanced options by default" and default save location. Page uses the full 720px measure, top-aligned, with status shown once. Appearance: System/Light/Dark segmented + accent swatches (current six) with a small live preview. Updates: current version, channel, check now, release notes rendered as Markdown (already implemented), download/install progress as a status row; no banner nagging.

### G8. Generated-file previews

Tree + preview, always exact. Keep the large dialog; add copy-path and "wrap lines" toggle. Preview text 13px mono, wrapped by default (matches existing fix).

### G9. Empty, error, loading, progress

- Empty: one sentence of what this is and one action (never decorative illustrations).
- Errors: `message` + `guidance` (the existing `AppError` pair **[V]**) shown inline next to the cause with a fix button; never only in a banner at the bottom of a scrolled form (the current `error-banner` is placed after the fieldset, `App.tsx:521`).
- Loading: skeleton rows with a status text for screen readers; any action >1s shows progress.
- Confirmation flows: destructive actions (remove from history, delete command/preset) use the same dialog with the verb as the primary label ("Delete preset"), Cancel focused.

### G10. Accessibility and desktop usability checks (design-time commitments)

- Landmarks: sidebar `<nav>`, one `<main>`, result pane `<aside aria-label>`; skip link to main.
- Focus: after navigation, focus the page `<h1>` (already done for sections, `App.tsx:72-75`); after closing dialogs return focus to trigger (already tested).
- Tabs follow the ARIA tab pattern everywhere (arrow keys, Home/End), replacing `aria-pressed` pseudo-tabs.
- Status updates announced via `role="status"`; errors via `role="alert"` only for blocking failures.
- Contrast numbers in E2; focus ring ≥ 3:1 against adjacent colours.
- Keyboard: every action reachable; shortcuts (Ctrl/Cmd+N new project, Ctrl/Cmd+, settings) optional, platform-aware, never the only path.
- Platform conventions: menu shortcuts use ⌘ on macOS; window chrome unchanged; scrollbars native-styled.

---

## H. User journeys

### H1. Beginner creating a local repository (no Git identity)

1. Install and launch → Screen 0 detects → Screen 1: Git ✓; identity needs a name/email. Optional items are quiet.
2. Expands "Your commit identity": reads the plain explanation, enters name and email, keeps "Use for Repo Creator projects only", presses **Save**. Sees "✓ Tested: commits will be signed as …". Required items all ✓.
3. Skips GitHub ("Skip for now"). Presses **Create my first project**.
4. New Project: types "Learning Notes" → sees "Will be created at `C:\Users\…\Documents\learning-notes`", picks the "Experiment" preset, leaves assistant as None, sees 3 files in the Result pane.
5. Presses **Create project** (local needs no confirm). Progress stages, success screen → **Open project**.
6. Lands in the workspace Overview. The friend's failure case (A1) is now caught at step 2 with specific wording, or inline at step 5 via the checklist if they skipped.

### H2. Experienced developer creating a GitHub repository

1. Launch: everything already configured → one-screen confirmation "You're set up — Ada <ada@…> · @ada" → **Create a project**.
2. Chooses Tauri preset; Customize → adds technologies; **Destination → Publish to GitHub**; owner (user or org list from `check_environment`), Private; topics under Customize.
3. **Create project** → confirmation sheet "Create `ada/river-workbench` (Private) and push `main`". Confirm.
4. Stage list completes; success shows the repo URL, **Open on GitHub**, **Open project**. If the push fails, stage list shows the failing stage, "Your local project is safe", **Retry publishing** (existing behaviour).

### H3. Importing an existing project

1. From Setup → **Add an existing project**, or Projects → **Add existing project**; native folder picker (`add_existing_project`).
2. Workspace opens with technologies detected and evidence expandable; user accepts or removes items; **Discover commands** suggests commands (`suggest_project_commands`) which the user reviews before saving.
3. Readiness tab offers **Run checks**; nothing runs until the user presses it. **[V]** consistent with "Run only when you choose" in the current UI.
4. No GitHub requirement; remote shown if one is found.

---

## I. Implementation architecture

### I1. Frontend mapping

| Proposed change           | Existing code                                                                                                                                                                  | Action                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell + sidebar       | `App.tsx` (629 lines, owns `page`, `section`, nav)                                                                                                                             | Extract `AppShell`, `Sidebar`; reduce `App.tsx` state; **no router dependency** — keep local state (existing convention), add a small typed `route` reducer. **[Q]** A router is unnecessary unless deep links are wanted; do not add a dependency. |
| Tabs                      | Settings tablist exists (`WorkspaceFields.tsx:592`)                                                                                                                            | Extract a shared `Tabs` component from it; adopt in workspace and settings.                                                                                                                                                                         |
| New Project recipe        | `App.tsx` form + `WorkspaceFields.tsx` (`Overview`, `ProjectSummary`, `Context`), `ConfigurationPanels.tsx`, `AgentStudio.tsx`, `StudioAdvanced.tsx`, `TechnologySelector.tsx` | Recompose existing panels into sections; leave field logic and validation (`validation.ts`) untouched.                                                                                                                                              |
| Result pane               | `Context`, `FilePreview`, `FocusedFilePreview`, `GeneratedFilesDialog`                                                                                                         | Merge into a `ResultPane` reusing `creator.files`.                                                                                                                                                                                                  |
| Setup checklist           | `SetupPanel` (`WorkspaceFields.tsx:521-836`)                                                                                                                                   | New `SetupChecklist` + `SetupRow`; reuse environment state, `connect()`, `refresh()`, `action('open_setup_resource')`.                                                                                                                              |
| Blocker popover           | `blocking` logic `App.tsx:54-65`, `setupReady`/`ready` in `useCreator.ts:273-290`                                                                                              | Replace the string with a typed list of `Blocker { id, title, fix }`.                                                                                                                                                                               |
| Project library/workspace | `ProjectWorkspace.tsx` (1,839 lines)                                                                                                                                           | Split by tab into files, no behaviour change; apply new tabs and rows.                                                                                                                                                                              |
| Tokens/CSS                | `styles.css`, `workspace.css`, `desktop-refinement.css`, `project-workspace.css`, etc.                                                                                         | New `tokens.css` first; migrate file by file; delete unused rules; add a lint script that fails on `font-size < 12px` and non-token radii.                                                                                                          |
| Icons                     | `icons.tsx`                                                                                                                                                                    | Extend; replace glyph pin.                                                                                                                                                                                                                          |

### I2. Backend (Rust) work

All additive; none touches generation.

1. **Richer environment report** — extend `check_environment` (or add `check_setup`) to return a typed tri-state per item:
   - `git: { state: ok|missing|tooOld, version, path }`
   - `identity: { name, email, nameSource, emailSource, scope }` via `git config --show-origin --show-scope --get` (Git ≥ 2.26 for `--show-scope` **[Q]**), plus `resolves: bool` from `git var GIT_AUTHOR_IDENT`.
   - `gh: { installed, version }`, `github: { state: signedIn|signedOut|unverified, login, owners, missingScopes? }` using `gh auth status --hostname github.com` first and `gh api user` second to distinguish signed-out from network failure. **[Q]** Parse stable output only (prefer `--json` fields if available; verify on supported `gh` versions).
2. **`set_git_identity(scope, name, email)`** — only `scope = global`, invoked on explicit confirmation; fixed argv (`git config --global user.name <value>`), validates name/email, returns old values and the config file path. Never invoked implicitly.
3. **Preferences** — additive `onboarding` and `identityOverride { name, email }` (applied as `--local` in `repository.rs:259-273`, replacing per-form state while still honouring it). Preserve file format via `serde(default)`; add tests for loading old files and the recovery/backup path. **[Q]** Review `SETTINGS_VERSION` policy.
4. **Setup commands** — reuse `open_setup_resource` (allowlist) and `connect_github`. Add install-command text as constants in the frontend (copy only, never executed). Optional later: capture the device code from `gh auth login --web` to display in-app (**not recommended for phase 1**; it requires piping an interactive CLI).
5. **Error copy** — fix `repository.rs:105` to name the real place; keep `AppError { message, guidance }` shape.
6. **Tests (Rust)** — use temporary repos and `GIT_CONFIG_GLOBAL`/`HOME` overrides to test identity detection without touching the real global config; GitHub states with the existing `Runner` trait mocks (`account_from`). No real GitHub calls.

### I3. Persistence and compatibility

- Existing keys (`experienceMode`, `defaults`, `customPresets`, accents) unchanged. `experienceMode` is reinterpreted as "show advanced options by default".
- `handoff.ts` uses `localStorage` for handoff templates **[V]** (`handoff.ts:320,363`); leave as is.
- Data and config formats are not altered, per AGENTS.md.

---

## J. Phased implementation plan

Each phase is one reviewable PR on a feature branch, none to `main` directly.

| Phase                                         | Scope                                                                                                                                                                                                                          | Depends on | Main risks                                        | Regression requirements                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **0. Baseline**                               | Run app; capture every screen/state in both themes at 820×580, 1100×740, 1440×900; add Playwright visual baselines; record the audit numbers (font sizes, radii)                                                               | —          | Fixture drift                                     | Existing 82+ browser tests, unit tests                                                                             |
| **1. Setup correctness (no visual redesign)** | Rust environment report; identity detection with sources; `gh` tri-state; fix error text; typed `Blocker` list shown in the existing footer; identity override persisted app-level; explicit global-write command with confirm | 0          | Git/gh version differences; parsing               | New Rust tests with isolated config; fixture tests for each state; existing `check_environment` consumers          |
| **2. Design tokens + primitives**             | `tokens.css`; `Button`, `Field`, `Tabs`, `StatusRow`, `Disclosure`, `Dialog` wrappers; type scale; lint                                                                                                                        | 0          | Visual regressions across 9 CSS files             | Visual baselines; keyboard and focus tests; contrast test of every accent                                          |
| **3. App shell + navigation**                 | Sidebar, page headers, tab unification, retire header nav/mode switch, update line                                                                                                                                             | 2          | Focus management, small windows                   | 820×580 layout tests, keyboard nav, `aria-current`/tab semantics tests                                             |
| **4. Onboarding**                             | Setup checklist page, first-run gating, Settings → Setup reuse, connecting flow with auto-recheck                                                                                                                              | 1, 3       | Interrupting existing users; false "signed out"   | Tests for all F4 states; upgrade-with-existing-projects test; no network in tests                                  |
| **5. New Project recomposition**              | Recipe sections, Result pane, bottom bar, blocker popover, publish confirmation, progress/success                                                                                                                              | 2, 3       | Largest behaviour surface; editor widths at 820   | Existing creation, file-editor, agent-studio, scrolling specs; native smoke with temp repos; preview equals output |
| **6. Projects, workspace, presets**           | Library rows, workspace header/Open-in, commands/readiness/handoff presentation                                                                                                                                                | 3          | `ProjectWorkspace.tsx` size; command-runner state | `project-workspace.spec.ts`, native workspace smoke                                                                |
| **7. Settings, appearance, updates, polish**  | Settings tabs, appearance preview, updates row, empty/error states, motion                                                                                                                                                     | 3          | Updater UX untouched in behaviour                 | `updates.spec.ts`, `appearance.spec.ts`; **no** updater signing or release config changes                          |
| **8. Accessibility and platform pass**        | Screen-reader pass (NVDA on Windows, VoiceOver on macOS), high-DPI, enlarged text, reduced motion                                                                                                                              | all        | macOS hardware availability                       | Manual checklist; record what was and was not tested per AGENTS.md                                                 |

Phase 1 is deliberately visual-free and independently valuable: it fixes the exact failure the friend hit before the redesign lands.

---

## K. Acceptance criteria

**Onboarding**

1. Fresh settings + Git installed + no identity: the first screen identifies "commit identity" as the missing item within 1 second of launch, in plain language, with a fix action on that same screen. No disabled control lacks adjacent visible reason text.
2. Fresh settings + Git missing: Git row shows an Open-official-page action; after installing and returning, focus-regain recheck turns it green without restarting the app **[Q verify]**.
3. Identity saved with "Repo Creator only" never modifies `git config --global --list` (test with isolated `GIT_CONFIG_GLOBAL`). Saving globally requires an explicit confirmation naming the file and exact values, and shows the replaced value if one existed.
4. Invalid email is rejected before save; a saved identity is verified with `git var GIT_AUTHOR_IDENT` and the result displayed.
5. Each combination of {Git ok/missing/old} × {identity ok/name-only/email-only/none} × {gh missing/signed out/signed in/unverifiable} renders the specified row states (table-driven test with mocked environment).
6. GitHub is optional: with GitHub rows unresolved or skipped, the user can create a local project without any GitHub call (assert no `gh` invocation in the creation path for local destination).
7. No input accepts a GitHub password or token anywhere (static test of onboarding fields).
8. Returning users (completed or having projects) never see the first-run page; Settings → Setup shows current state and can re-run detection.
9. "Unverifiable" GitHub is never displayed as "Not connected".

**Navigation and consistency** 10. Exactly one navigation component per level; all tab lists implement `role=tablist` with arrow/Home/End keys; no `aria-pressed` buttons used as navigation (lint/test). 11. Every page has one primary action in the defined position; at most one primary-styled button visible per view (visual test). 12. Style lint: no `font-size` < 12px, no radii outside {6, 8, 999}, no colours outside tokens, no nested bordered containers in new components. 13. Focus ring visible on every interactive element in both themes with ≥ 3:1 contrast.

**Creation and GitHub** 14. The preview file list and contents equal created output (existing native smoke assertion retained). 15. Local creation succeeds from a clean profile in a temp directory using only Git; publish to GitHub is covered with mocked `gh` only (no real repositories). 16. Create button activation when requirements are unmet opens the checklist listing each unmet item with a working fix. 17. GitHub destination or Public visibility shows a confirmation sheet naming owner, name, visibility; Cancel creates nothing. 18. Publish failure keeps local work and offers retry (existing behaviour unchanged).

**Accessibility and layout** 19. At 820×580, 1100×740, 1440×900, 125%/150% scale and enlarged text: no horizontal page scroll, no clipped controls, all regions reachable by keyboard and wheel. 20. Contrast: all text ≥ 4.5:1, UI components ≥ 3:1, for every accent in both themes (automated). 21. Long paths, names and output do not break layout and expose full values on focus/hover and copy. 22. `prefers-reduced-motion` disables non-essential transitions. 23. Screen-reader semantics: landmarks, headings order, tab roles, `role=status/alert` usage verified (axe in Playwright plus a manual pass; platforms actually tested are named in the PR).

**Compatibility** 24. Settings files from v1.5.2 load unchanged; new fields default safely; unknown/future versions follow the existing recovery path. 25. Windows and macOS suites pass in CI; macOS visual and hardware behaviour is not claimed unless tested.

---

## L. Decisions needed from you

**Decision 8 (maintainer, after reviewing the Phase 3 build):** selected states must not use a left accent bar. Earlier drafts of E4 and E5 specified one and it shipped in the Phase 3 sidebar; it is superseded by E4/E5 above. One selected/pressed/hover/focus grammar applies to every button, navigation item and list row in the application, old screens included (see Phase 7 in the phases spec).

**Decision log:** Decision 1 (visual direction "Quiet Workbench") and decisions 2–7 were approved by the maintainer as recommended: left sidebar; per-section "Customize" replacing the global Simple/Advanced switch; confirmation sheet only for GitHub/public creation; identity default "Repo Creator projects only"; handoff moves to the project workspace and stays on the success screen; Phase 1 (setup correctness) ships as its own PR before visual work. The brief is approved for implementation planning; no implementation has started.

1. **Direction:** approve "Quiet Workbench" (Document structure + workbench workspace), or pick Direction 1/3.
2. **Navigation:** left sidebar replacing header navigation. (Alternative: keep a slim top bar but unify styling; less change, but retains the layering problem.)
3. **Simple/Advanced:** replace the global switch with per-section "Customize" and a default-preference setting?
4. **Review step:** keep separate Review for all creations, or only a confirmation sheet for GitHub/public?
5. **Identity default:** is "Repo Creator projects only" the right recommended default over setting global Git config?
6. **Handoff:** move from the New Project rail to the project workspace (recommended), keeping it on the success screen?
7. **Scope of Phase 1:** ship the setup-correctness fix as its own PR before any visual work (recommended)?

## M. Items I could not verify

- Behaviour of the running application (not launched); all screenshots are fixture captures from v1.4.3 and may not reflect v1.5.2.
- `readiness.rs`, `handoff.rs`, AI studio and technology-picker internals beyond their public structure.
- Whether a newly installed Git/`gh` is found without an app restart (`process::executable_directories()` suggests known-directory probing; test on a clean machine).
- Official install command wording for Git/gh on each OS, minimum Git versions for `--initial-branch` and `--show-scope`, and `gh` token scope requirements. All must be checked against current official documentation during Phase 1.
- Any macOS behaviour.
