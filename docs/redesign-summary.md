# Redesign summary

Maps the brief's acceptance criteria (section K, 1–25) to evidence. Status words: **Covered** (automated test or inspection exists), **Partial**, **Untested**, **Unmet**. All verification was on Windows 11 with Chromium (Playwright) and, for earlier phases, a native Windows debug build. Nothing was tested on macOS, with a screen reader, or against live GitHub.

| #   | Criterion                                            | Status   | Evidence / gap                                                                                                                                              |
| --- | ---------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Missing identity named on first screen with a fix    | Covered  | `onboarding.spec.ts`, `setup-correctness.spec.ts`; Phase 4 manual real-app check (the 1-second timing was not measured)                                     |
| 2   | Git missing: official page, focus-regain recheck     | Partial  | Recheck on focus is implemented and tested in browser fixtures; not tested with a real Git install                                                          |
| 3   | "This project only" never touches global config      | Covered  | Rust tests with isolated `GIT_CONFIG_GLOBAL`; Phase 4 manual check (global config stayed empty)                                                             |
| 4   | Invalid email rejected; identity verified            | Covered  | Rust tests and `setup-correctness.spec.ts`                                                                                                                  |
| 5   | Setup state matrix renders specified rows            | Partial  | Main combinations covered by Phase 1 and 4 specs; the full matrix is not exhaustively asserted                                                              |
| 6   | GitHub optional; local creation makes no GitHub call | Covered  | `setup-correctness.spec.ts` ("creating a local project makes no GitHub call")                                                                               |
| 7   | No token or password inputs                          | Partial  | Onboarding fields reviewed; no static test added                                                                                                            |
| 8   | Returning users skip first run; Settings → Setup     | Covered  | `onboarding.spec.ts`                                                                                                                                        |
| 9   | "Unverifiable" never shown as "Not connected"        | Covered  | Phase 1 Rust and UI tests                                                                                                                                   |
| 10  | One navigation per level; real tabs; no pressed nav  | Partial  | `shell.spec.ts`, `accessibility.spec.ts`, style gate rule. The Technology category list still uses `aria-pressed` filter buttons                            |
| 11  | One primary action per view                          | Untested | Not asserted by a visual test                                                                                                                               |
| 12  | Style lint                                           | Partial  | Repo-wide gate: font size, radii, colours outside custom properties, side stripes, all-caps, pressed navigation. The nested-container rule is not automated |
| 13  | Focus ring ≥ 3:1 in both themes                      | Partial  | `accessibility.spec.ts` asserts a ≥2px ring on tabbed controls in both themes; the ring's contrast ratio was not measured                                   |
| 14  | Preview equals created output                        | Covered  | Existing native smoke assertion retained (last run in Phase 6)                                                                                              |
| 15  | Local creation from a clean profile; mocked publish  | Covered  | Native smoke with empty `HOME`; no real GitHub calls                                                                                                        |
| 16  | Create with unmet requirements opens fix list        | Covered  | `create-flow.spec.ts`                                                                                                                                       |
| 17  | GitHub confirmation sheet; Cancel creates nothing    | Covered  | `create-flow.spec.ts` (GitHub destinations only; local projects have no public visibility)                                                                  |
| 18  | Publish failure keeps local work, offers retry       | Covered  | Existing behaviour and tests unchanged                                                                                                                      |
| 19  | Layout at 3 sizes, 125/150%, enlarged text           | Partial  | `accessibility.spec.ts` (3 sizes, both themes, no horizontal scroll) plus existing enlarged-text tests; real 125/150% hardware scaling not tested           |
| 20  | Contrast for every accent in both themes             | Covered  | `src/tokens.test.ts`                                                                                                                                        |
| 21  | Long paths/names/output                              | Covered  | `project-workspace.spec.ts`, `ui.spec.ts`, middle-truncation tests                                                                                          |
| 22  | Reduced motion                                       | Covered  | `accessibility.spec.ts` (no transitions or animations under `reduce`)                                                                                       |
| 23  | Screen-reader semantics                              | Partial  | DOM checks for names, labels, ids, tabs, landmarks, heading order, `aria-describedby`. No axe; **no manual screen-reader pass** (see checklist)             |
| 24  | v1.5.2 settings load unchanged                       | Partial  | `SETTINGS_VERSION` stays 5 with additive `serde(default)` fields and Rust tests from Phase 4; not re-run in Phases 7–8 (no Rust change)                     |
| 25  | Windows and macOS suites pass in CI                  | Untested | Local Windows only; CI results are the maintainers' to read; macOS untested                                                                                 |

See [accessibility-checklist.md](accessibility-checklist.md) for the manual pass, all of which is not yet performed.

Group 1 adds browser evidence for criteria 14 and 19. The preset tests compare generation-relevant fields before saving and at creation. The result tree tests compare selected preview content across both viewers. The editor and tree tests run in both themes at all three supported sizes. The current native preview-to-disk smoke could not attach to WebView2. See the [progress log](ui-redesign-progress.md#group-1--new-project-leftovers).

## Not done

- Refreshed screenshots and the README rewrite: they come from the native release build and belong to release preparation (the release checklist lists them). `getting-started.md` and `project-workspace.md` were updated for the new UI.
- Phase 6 remainder: the Handoff tab, definition-list Overview with technology evidence, run-history list and Presets Edit opening a specific preset. See the progress log.
- Phase 7 remainder: removing the legacy alias variables, G9 loading skeletons and inline error placement, the button-variant audit.
- A full Tab-order and keyboard-trap audit of every dialog beyond the existing dialog tests.
