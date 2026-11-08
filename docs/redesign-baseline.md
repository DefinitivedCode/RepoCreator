# Redesign baseline (Phase 0)

A recorded "before" for the redesign. Measured on `redesign/phase-0-baseline` (v1.5.2), Windows 11. Text only; the screenshots are generated locally and not committed.

## How the app was run

| Command                                                                                          | Result                                                                                                                                                |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` (via Playwright `webServer`, port 1421) with the IPC mock from `tests/fixtures.ts` | Works; used for every browser screenshot and test                                                                                                     |
| `npm run desktop:build -- --ci --debug --no-bundle`                                              | Built a debug executable; the opt-in Windows production smoke (`tests/native-smoke.mjs`) passed against it with isolated app data and an empty `HOME` |
| `npm run desktop:dev`                                                                            | Not run interactively in this baseline; the built debug executable was exercised instead                                                              |

## Visual baseline

```sh
REPO_CREATOR_BASELINE=1 npx playwright test tests/baseline.spec.ts
```

Writes PNGs to `artifacts/redesign-baseline/<dark|light>/<size>/<screen>.png` plus `manifest.json` (captured and failed screens). Set `REPO_CREATOR_BASELINE_DIR` to capture a later phase to a different folder and compare. Sizes: 820×580, 1100×740, 1440×900. Animations are disabled and data is fictional. The spec is skipped unless `REPO_CREATOR_BASELINE=1`, so `npm run test:ui` is unchanged.

Captured per theme and size: New Project (Overview, each Project Files tab, each AI Agents tab, Review, AI Handoff), Presets, preset dialog, Projects (empty and populated), project workspace (Overview, Open, Commands with a failed run and output, Readiness with an attention item, Project Settings), command editor dialog, Settings (each tab), the update-available banner (visible at the top of every screen), and Success (1440×900 and the first size only).

Known gaps in the baseline: the generated-files dialog is captured at 820×580 only (at wider sizes the trigger lives in the context panel and was not located); the success screen is captured at one size.

## Style audit

```sh
npm run audit:styles    # counts
npm run lint:styles     # violations; report-only, always exits 0
```

Measured over 47 files in `src/`:

| Measure                           | Value                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Distinct `font-size` values       | 21 (12px ×141, 11px ×62, 13px ×28, 10px ×21, 14px ×12, 10.5px ×6, 15px ×6, and 14 others used 1–4 times) |
| Declarations below 12px           | 94                                                                                                       |
| `border-radius` values            | 3px ×27, 4px ×16, 0px ×9, 5px ×9, 2px ×5, 6px ×2, 8px ×1, 9px ×1                                         |
| Distinct colour literals in CSS   | 106                                                                                                      |
| `aria-pressed` occurrences in TSX | 16                                                                                                       |
| `role="tab"` occurrences in TSX   | 1 (one mapped tablist)                                                                                   |

The brief estimated about 15 font sizes and about 90 declarations under 12px; the audit counts fractional sizes separately, hence 21.

## Accessibility tooling

`@axe-core/playwright` is **not** a dependency and is not added here. The gap is recorded: automated axe checks do not exist yet. Phase 8 will use DOM-based checks (names, roles, label associations, heading order, duplicate ids, tab semantics, `aria-describedby` targets) instead of adding a dependency.

## Test status at baseline

Unchanged by this phase. See [the progress log](ui-redesign-progress.md) for pass counts.
