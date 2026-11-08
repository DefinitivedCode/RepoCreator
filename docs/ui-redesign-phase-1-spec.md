# Phase 1 implementation spec — setup correctness

Parent: [UI/UX redesign brief](ui-redesign-brief.md) (approved; decisions 1–7 accepted). This spec is for an implementing agent (Claude Code or Codex). Follow `AGENTS.md`: feature branch, no commits to `main`, no merge, no release/updater changes, isolated temp dirs for tests, never touch the real global Git config, no real GitHub calls.

Tags: **[V]** verified in source while writing this spec; **[Q]** must be verified by the implementer before relying on it.

## Goal

Fix what a first-time user hits today: a missing Git commit identity (or GitHub sign-in) is poorly detected, poorly explained, and the error points to the wrong screen. **No visual redesign** in this phase: keep the existing header, rail, Settings tabs and footer layout; change only their content, data and wording.

## Non-goals

Sidebar/navigation, design tokens, first-run page, New Project recomposition, Simple/Advanced changes (all later phases). No change to the generator, preview, publishing flow, updater, release config, settings file format beyond additive fields.

## Verified starting point

- `check_environment` ([lib.rs:113](../src-tauri/src/lib.rs)) returns booleans: `gitInstalled`, `identityReady`, `ghInstalled`, `githubUser`, `identityName`, `githubOwners` **[V]**. Frontend type: `Environment` in [src/types.ts:112](../src/types.ts).
- `identityReady` = `git config --get user.name` and `user.email` both non-empty, cwd = save location **[V]**.
- GitHub: `gh api user` via `github::authenticated_account`; any failure → "not connected" **[V]** ([github.rs](../src-tauri/src/github.rs)).
- `process::Output` is `{ success, stdout }`; **stderr is deliberately discarded** and the exit code is not exposed **[V]** ([process.rs:201-207](../src-tauri/src/process.rs)). `Runner` is a mockable trait **[V]**.
- Identity override already exists: `options.commitAuthorName/Email`, validated natively (non-empty pair, ≤100/≤254 chars) in [config.rs:379-390](../src-tauri/src/config.rs) and applied with `git config --local` in [repository.rs:259-273](../src-tauri/src/repository.rs) **[V]**. It is per-form state, edited only in `SetupPanel` ([WorkspaceFields.tsx:668-713](../src/WorkspaceFields.tsx)).
- Misleading error: [repository.rs:105](../src-tauri/src/repository.rs) names "Project Files → Git Settings", which has no identity fields **[V]**.
- Generic blocker text: [App.tsx:54-65](../src/App.tsx); readiness booleans `setupReady`/`ready` in [useCreator.ts:273-290](../src/useCreator.ts) **[V]**.
- Browser tests mock `check_environment` in [tests/fixtures.ts:96-102](../tests/fixtures.ts) with defaults overridable by `window.testEnvironment` **[V]**.
- Preferences use `#[serde(default)]` for later additions; `SETTINGS_VERSION = 5` **[V]** ([preferences.rs:12](../src-tauri/src/preferences.rs)).

## Work items

### 1. Richer, backward-compatible environment report (Rust)

Extend `Environment` **additively**: keep every existing field and meaning so old frontend code and fixtures keep working, and add:

```rust
git_version: Option<String>,           // parsed from `git --version`
git_state: GitState,                   // Ok | Missing | TooOld
identity: IdentityReport,              // see below
github_state: GithubState,             // SignedIn | SignedOut | Unverified | NotChecked | CliMissing
```

`IdentityReport { name: Option<String>, email: Option<String>, name_scope: Option<String>, email_scope: Option<String>, resolves: bool, email_valid: bool }`

- Scope via `git config --show-scope --get user.name` (prints `scope<TAB>value`). **[Q]** `--show-scope` needs Git ≥ 2.26; on older Git, fall back to no scope (None) and never fail detection because of it.
- `resolves` = `git var GIT_AUTHOR_IDENT` succeeds in the save location (this is the same test creation uses, [repository.rs:282](../src-tauri/src/repository.rs)). `identityReady` stays exactly as today for compatibility; the new UI uses `resolves` plus per-field values.
- `email_valid`: a simple structural check (one `@`, non-empty local/domain part, no whitespace). It is advisory in detection, **enforced** for any value this app saves.
- `GitState::TooOld`: minimum version **[Q]** — `git init --initial-branch` needs 2.28; verify and choose the constant from the flag the code actually uses. If parsing fails, treat as `Ok` (never block on an unparseable version string).
- GitHub tri-state: keep `gh api user` for the login. To separate signed-out from unreachable, extend `Output` with `code: Option<i32>` (additive; existing constructors/mocks updated). **[Q]** Verify against current `gh` docs: exit code 4 means authentication required, other non-zero codes mean other failures. Map: success → `SignedIn`; code 4 → `SignedOut`; spawn "unavailable" → `CliMissing`; any other failure/timeout → `Unverified`. Do **not** parse stderr (it stays discarded by design). If exit codes prove unreliable on supported versions, default ambiguous failures to `Unverified`, never `SignedOut`.
- Preserve `include_github` semantics: when false, `github_state = NotChecked`. Preserve parallel execution and timeouts.
- Keep everything read-only. No config writes in this item.

### 2. Backend identity preference and explicit global write (Rust)

a. **Preferences (additive):** `identity_override: Option<{ name, email }>` with `#[serde(default)]`. Validate with the existing config validators (reuse, don't duplicate). Add a command `set_identity_override(name, email | null)` that validates, saves, and returns updated preferences. **[Q]** Confirm whether the `SETTINGS_VERSION` stays 5 (additive default fields do not require a bump elsewhere in this file; check how earlier additions such as `updates` and `instruction_presets` were handled and follow that precedent). Old settings files must load unchanged, and the recovery/backup path must be unaffected.

b. **Creation uses it:** in the create path, when the request carries no per-project override and the preferences hold `identity_override`, apply it with `git config --local` exactly as the per-request override is applied today. A per-request value wins. Global Git config is never written on this path. GitHub destinations keep their account no-reply email behaviour (`pending.author_email`) unchanged.

c. **`set_git_identity_global(name, email, confirm: bool)`:** the only command that writes global Git config.

- Rejects unless `confirm == true` and both values pass validation (also reject leading `-`, control characters, newlines).
- Runs fixed argv only: `git config --global user.name <name>` then `user.email <email>` (values are separate args, never in a shell).
- Before writing, `git config --global --get` for each key; returns `{ previousName, previousEmail, configPath }` so the UI can show what was replaced. Path from `git config --global --list --show-origin` first line or `git config --global --list --show-origin --name-only`; **[Q]** pick a method that works on supported Git versions, fall back to omitting the path.
- After writing, verifies with `git var GIT_AUTHOR_IDENT` and returns the resolved identity.
- Not invoked by any automatic path. Register in `invoke_handler` and add it to the busy/lock conventions used by other commands.

### 3. Corrected, specific messages (Rust + TS)

- [repository.rs:105](../src-tauri/src/repository.rs): replace with `AppError::new("Git needs your name and email to record commits.", "Open Settings → Git & identity and add them, either for Repo Creator projects only or as your Git default.")`. Keep `AppError { message, guidance }`.
- Add a test asserting the guidance names a screen that contains the fields.

### 4. Typed blockers replacing the generic string (Frontend)

In `useCreator.ts` (or a small new `src/blockers.ts`), derive `Blocker[]` from form + environment + preferences:

```ts
type Blocker = {
  id:
    | 'git-missing'
    | 'git-old'
    | 'identity-name'
    | 'identity-email'
    | 'identity-invalid'
    | 'github-cli'
    | 'github-signin'
    | 'github-unverified'
    | 'location'
    | 'form'
    | 'preview'
    | 'busy';
  title: string; // plain language
  fix?: {
    label: string;
    target: 'settings-git' | 'settings-github' | 'choose-location' | 'switch-local';
  };
  required: boolean;
};
```

- `ready` becomes `blockers.length === 0 && …existing conditions` (no behaviour change for currently-ready states).
- `setupReady` must remain true in exactly the same cases as today **except** these deliberate changes: GitHub `Unverified` blocks only a GitHub-destination project and is worded as "Couldn't reach GitHub to check your sign-in" with a Retry fix.
- Footer ([App.tsx:555-581](../src/App.tsx)): replace "Setup required" and "Complete the required setup." with the first blocker's title and an inline fix button (text button, existing styles). If several blockers exist, show "N things to fix" and list them in the existing `error-banner`-style area beneath the form heading. No new component library, reuse existing classes.
- The Create/Review button keeps its current `disabled` behaviour in this phase (accessibility improvement is Phase 5), but the reason text must be visible and associated: add `aria-describedby` pointing at the blocker text element.
- "Review" section's "Complete required setup" button ([App.tsx:494-498](../src/App.tsx)) becomes the first blocker's fix action, labelled by its title.

### 5. Settings → Git & identity content (Frontend, same layout)

Same tab and fields, clearer content:

- Heading explanation (plain text, always visible): _"Git records a name and email with every commit. They identify the author of the changes."_
- Show detected values and their source when present, e.g. "Name: Ada (global Git settings)". Show a specific message per state: nothing set / name only / email only / email invalid / Git too old / ready.
- Replace "Your name for this project" with a radio group:
  - **Use only for Repo Creator projects** (default; calls `set_identity_override`). Helper: "Saved in Repo Creator and applied inside each new project. Your global Git settings are not changed."
  - **Set as my Git default** → reveals the exact command text and the file path, shows any existing value that will be replaced, and a button **Save to my Git configuration** (initially unfocused; a **Cancel** exists). Calls `set_git_identity_global` with `confirm: true` only from this button.
- Inline email validation before save; after save show "Tested: commits will be signed as Name <email>" from the returned resolved identity.
- Keep the Recheck button and "Git identity help" link. Keep the per-project override fields' data flow working for existing saved configs (`options.commitAuthorName/Email` still honoured).
- GitHub tab: show the five states (not installed, signed out, connecting message, signed in, couldn't verify). Before launching sign-in, show: "A terminal window will open and show a one-time code. Enter it on github.com, then return here." Add automatic recheck on window focus while the GitHub tab is open and `github_state` is `SignedOut` or `Unverified` (debounced, max once per 3 s; stop after sign-in succeeds). Do **not** add token/password inputs.
- "Not checked for this local project" is replaced with a real state: when the GitHub tab is open, always check (`include_github = true`), as it already does on the Recheck path **[V]** (`creator.refresh(tab === 'github' || …)`).

### 6. Tests

Rust (isolated, no real global config — set `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, `HOME`/`USERPROFILE` to temp dirs; assert the real global file is untouched):

- Identity detection: none / name only / email only / both / invalid email / local-scope-only; scope reporting; `resolves` true/false.
- `git_state`: ok, missing (mock `Runner`), too old (mock output `git version 2.20.0`), unparseable.
- GitHub: mock `Runner` for signed in, exit 4, other failure, timeout, `unavailable`.
- `set_git_identity_global`: rejects without `confirm`, rejects invalid values and leading `-`, writes only to the isolated global file, returns previous values, verifies identity.
- `identity_override`: preferences round-trip; loading a v5 file without the field; recovery/backup behaviour unchanged; creation applies override as `--local` and leaves global config untouched; per-request override wins; GitHub no-reply email still wins for email.
- Error text test from item 3.

Frontend unit/browser (extend `tests/fixtures.ts` additively with the new fields; keep old defaults so existing specs pass unchanged):

- Table-driven blocker derivation over {git ok/missing/old} × {identity ok/name-only/email-only/none/invalid} × {destination local/github} × {github signed in/out/unverified/cli missing}.
- Footer and Review show the specific blocker and its fix opens the right Settings tab.
- Identity radio: project-only path calls `set_identity_override`; global path requires clicking the explicit button and shows previous value; no call happens on selecting the radio.
- `Unverified` never renders the words "Not connected".
- No password/token input exists in setup UI.
- Local project creation makes no GitHub call.
- Existing specs (`ui`, `creation-refinement`, `ui-consistency`, scrolling at 820×580, enlarged text) pass unmodified except for intentionally changed strings, which are updated in the same PR with a note.

### 7. Docs

Update `docs/getting-started.md` ("Check Git"), `docs/troubleshooting.md` and `docs/development.md` only where behaviour changed. Do not touch release notes or version numbers.

## Verification checklist (report each result honestly)

```sh
npm run check
npm run format:check
npm test
npm run test:ui
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Also run the Windows native smoke with isolated settings and a temp repository **if the environment allows**. State plainly which platforms were and were not tested; do not claim macOS coverage from Windows runs. Manual check on a profile with no Git identity (use `GIT_CONFIG_GLOBAL` pointing to an empty temp file) to reproduce the original failure and confirm the new messages and fixes.

## Risks and mitigations

| Risk                                                  | Mitigation                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `gh` exit codes differ across versions                | Ambiguity → `Unverified` (never `SignedOut`); document tested `gh` version(s)             |
| `--show-scope`/`--show-origin` unavailable on old Git | Treat scope/path as optional; `TooOld` message covers the common case                     |
| Global write surprises the user                       | Explicit confirm, exact command and path shown, previous value displayed, never automatic |
| Fixtures/specs break from new fields                  | Additive fields; defaults preserved in `tests/fixtures.ts`                                |
| Preferences compatibility                             | `serde(default)`; test old-file load and backup path                                      |
| Scope creep into visual redesign                      | Reuse existing components/classes; no new tokens, nav or layout                           |

## Definition of done

The original failure (fresh Git profile with no identity) is explained on the first screen the user needs, names the missing item(s), offers an in-place fix, and never changes global Git config without a labelled confirmation. GitHub unreachable is never shown as signed out. All checks above pass or any failure is reported with output. PR targets `main` from a feature branch, is left unmerged, and contains no release, updater or version changes.
