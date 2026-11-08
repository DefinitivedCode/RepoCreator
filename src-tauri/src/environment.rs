//! Read-only detection of the local Git and GitHub setup.
//!
//! Everything here runs through the mockable [`Runner`] and never writes
//! configuration. Failure classes are deliberately coarse: stderr is not
//! available (see `process::Runner`), so only documented exit codes are used.
use crate::{
    github,
    process::{args, Output, Program, Runner},
};
use serde::Serialize;
use std::path::Path;

/// `git init --initial-branch` (used by project creation) was added in Git 2.28.
pub const MINIMUM_GIT: (u32, u32) = (2, 28);
/// `gh` documents exit code 4 as "the command requires authentication".
const GH_AUTH_REQUIRED: i32 = 4;
/// Git exits with 129 for an unknown option such as `--show-scope` before 2.26.
const GIT_USAGE_ERROR: i32 = 129;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GitState {
    Ok,
    Missing,
    TooOld,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GithubState {
    SignedIn,
    SignedOut,
    /// The sign-in could not be confirmed (network, rate limit, timeout, expired token).
    Unverified,
    NotChecked,
    CliMissing,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityReport {
    pub name: Option<String>,
    pub email: Option<String>,
    pub name_scope: Option<String>,
    pub email_scope: Option<String>,
    /// `git var GIT_AUTHOR_IDENT` succeeds here: the same test creation uses.
    pub resolves: bool,
    pub email_valid: bool,
    /// The file `git config --global` writes to, when Git can name it.
    pub global_config_path: Option<String>,
}

#[derive(Debug)]
pub struct Detected {
    pub git_installed: bool,
    pub git_version: Option<String>,
    pub git_state: GitState,
    pub identity_ready: bool,
    pub identity_name: Option<String>,
    pub identity: IdentityReport,
    pub gh_installed: bool,
    pub github_state: GithubState,
    pub github_user: Option<String>,
    pub github_owners: Vec<String>,
}

/// Parses `git version 2.45.1.windows.1` or `git version 2.39.3 (Apple Git-145)`.
pub fn parse_git_version(output: &str) -> Option<(u32, u32, u32)> {
    let version = output.trim().strip_prefix("git version ")?;
    let mut parts = version
        .split(|c: char| !c.is_ascii_digit())
        .filter(|p| !p.is_empty());
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    Some((major, minor, patch))
}

/// A simple structural check: one `@`, non-empty local and domain parts, no whitespace.
pub fn valid_email(email: &str) -> bool {
    email.split_once('@').is_some_and(|(local, domain)| {
        !local.is_empty()
            && !domain.is_empty()
            && !domain.contains('@')
            && !email.contains(char::is_whitespace)
    })
}

fn git_state(installed: bool, version: Option<(u32, u32, u32)>) -> GitState {
    if !installed {
        GitState::Missing
    } else if version.is_some_and(|(major, minor, _)| (major, minor) < MINIMUM_GIT) {
        // An unparseable version never blocks: only a known-old Git does.
        GitState::TooOld
    } else {
        GitState::Ok
    }
}

/// Reads one setting and, when Git supports it, the scope it comes from.
fn config_value(runner: &dyn Runner, cwd: &Path, key: &str) -> (Option<String>, Option<String>) {
    let scoped = runner.run(
        Program::Git,
        &args(&["config", "--show-scope", "--get", key]),
        cwd,
    );
    match scoped {
        Ok(Output {
            success: true,
            stdout,
            ..
        }) => {
            return match stdout.split_once('\t') {
                Some((scope, value)) if !value.trim().is_empty() => {
                    (Some(value.trim().to_string()), Some(scope.to_string()))
                }
                _ => (None, None),
            };
        }
        // Git older than 2.26 rejects --show-scope: read the value without a scope.
        Ok(Output {
            code: Some(GIT_USAGE_ERROR),
            ..
        }) => {}
        _ => return (None, None),
    }
    let value = runner
        .run(Program::Git, &args(&["config", "--get", key]), cwd)
        .ok()
        .filter(|o| o.success && !o.stdout.trim().is_empty())
        .map(|o| o.stdout.trim().to_string());
    (value, None)
}

pub(crate) fn global_config_path(runner: &dyn Runner, cwd: &Path) -> Option<String> {
    let output = runner
        .run(
            Program::Git,
            &args(&[
                "-c",
                "core.quotePath=false",
                "config",
                "--global",
                "--list",
                "--show-origin",
            ]),
            cwd,
        )
        .ok()
        .filter(|o| o.success)?;
    let (origin, _) = output.stdout.lines().next()?.split_once('\t')?;
    let path = origin.strip_prefix("file:")?;
    unquote_git_path(path)
}

/// Git C-quotes names containing a backslash or a quote. Only the two escapes that
/// can occur in a path are decoded; anything else is omitted rather than guessed.
fn unquote_git_path(path: &str) -> Option<String> {
    let Some(inner) = path.strip_prefix('"') else {
        return (!path.is_empty()).then(|| path.to_string());
    };
    let mut result = String::new();
    let mut chars = inner.strip_suffix('"')?.chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => match chars.next()? {
                escaped @ ('\\' | '"') => result.push(escaped),
                _ => return None,
            },
            c => result.push(c),
        }
    }
    (!result.is_empty()).then_some(result)
}

fn identity(runner: &dyn Runner, cwd: &Path) -> IdentityReport {
    let (name, email, resolves, path) = std::thread::scope(|scope| {
        let name = scope.spawn(|| config_value(runner, cwd, "user.name"));
        let email = scope.spawn(|| config_value(runner, cwd, "user.email"));
        let path = scope.spawn(|| global_config_path(runner, cwd));
        let resolves = runner
            .run(Program::Git, &args(&["var", "GIT_AUTHOR_IDENT"]), cwd)
            .is_ok_and(|o| o.success);
        (
            name.join().unwrap_or_default(),
            email.join().unwrap_or_default(),
            resolves,
            path.join().unwrap_or_default(),
        )
    });
    IdentityReport {
        email_valid: email.0.as_deref().is_some_and(valid_email),
        name: name.0,
        name_scope: name.1,
        email: email.0,
        email_scope: email.1,
        resolves,
        global_config_path: path,
    }
}

/// GitHub state for an installed CLI, derived from `gh api user`.
pub fn github_account(
    runner: &dyn Runner,
    cwd: &Path,
) -> (GithubState, Option<github::GithubAccount>) {
    match runner.run(Program::Gh, &args(&github::ACCOUNT_ARGS), cwd) {
        Err(reason) if reason == "unavailable" => (GithubState::CliMissing, None),
        // Timeouts and cancellations may be network failures, never a sign-out.
        Err(_) => (GithubState::Unverified, None),
        Ok(output) => {
            let signed_out = !output.success && output.code == Some(GH_AUTH_REQUIRED);
            match github::account_from(Ok(output)) {
                Ok(account) => (GithubState::SignedIn, Some(account)),
                Err(_) if signed_out => (GithubState::SignedOut, None),
                Err(_) => (GithubState::Unverified, None),
            }
        }
    }
}

pub fn detect(runner: &dyn Runner, cwd: &Path, include_github: bool) -> Detected {
    std::thread::scope(|scope| {
        // Git identity and GitHub checks are independent: keep their I/O concurrent.
        let git = scope.spawn(|| {
            let version = runner
                .run(Program::Git, &args(&["--version"]), cwd)
                .ok()
                .filter(|o| o.success);
            let installed = version.is_some();
            let parsed = version.as_ref().and_then(|o| parse_git_version(&o.stdout));
            let report = if installed {
                identity(runner, cwd)
            } else {
                IdentityReport::default()
            };
            (installed, version.map(|o| o.stdout), parsed, report)
        });
        let gh_installed = runner
            .run(Program::Gh, &args(&["--version"]), cwd)
            .is_ok_and(|o| o.success);
        let (github_state, account) = if !include_github {
            (GithubState::NotChecked, None)
        } else if !gh_installed {
            (GithubState::CliMissing, None)
        } else {
            github_account(runner, cwd)
        };
        let github_user = account.map(|account| account.login);
        let mut github_owners = github_user.iter().cloned().collect::<Vec<_>>();
        if github_user.is_some() {
            github_owners.extend(github::organisations(runner, cwd));
        }
        let (git_installed, version_text, parsed, identity) = git
            .join()
            .unwrap_or_else(|_| (false, None, None, IdentityReport::default()));
        Detected {
            git_installed,
            git_version: parsed
                .map(|(major, minor, patch)| format!("{major}.{minor}.{patch}"))
                .or_else(|| {
                    version_text.and_then(|text| {
                        text.strip_prefix("git version ")
                            .map(|v| v.trim().to_string())
                    })
                }),
            git_state: git_state(git_installed, parsed),
            identity_ready: identity.name.is_some() && identity.email.is_some(),
            identity_name: identity.name.clone(),
            identity,
            gh_installed,
            github_state,
            github_user,
            github_owners,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::ConfigSandbox;
    use std::fs;

    type Reply = Result<Output, String>;
    /// Scripted runner: answers by program and arguments, never starts a process.
    type Answer = Box<dyn Fn(Program, &[String]) -> Reply + Send + Sync>;
    struct Script(Answer);
    impl Runner for Script {
        fn run(&self, program: Program, values: &[String], _: &Path) -> Reply {
            (self.0)(program, values)
        }
    }
    fn reply(success: bool, stdout: &str, code: i32) -> Reply {
        Ok(Output {
            success,
            stdout: stdout.into(),
            code: Some(code),
        })
    }
    fn gh_only(answer: impl Fn() -> Reply + Send + Sync + 'static) -> Script {
        Script(Box::new(move |program, _| {
            assert_eq!(program, Program::Gh);
            answer()
        }))
    }

    #[test]
    fn parses_common_git_version_strings() {
        for (text, expected) in [
            ("git version 2.45.1.windows.1", Some((2, 45, 1))),
            ("git version 2.39.3 (Apple Git-145)", Some((2, 39, 3))),
            ("git version 2.28.0", Some((2, 28, 0))),
            ("git version 2.20", Some((2, 20, 0))),
            ("git version banana", None),
            ("something else", None),
            ("", None),
        ] {
            assert_eq!(parse_git_version(text), expected, "{text}");
        }
    }

    #[test]
    fn git_state_is_ok_missing_too_old_or_unparseable() {
        let git = |version: &'static str| {
            Script(Box::new(move |program, values| {
                if program != Program::Git {
                    return Err("unavailable".into());
                }
                if values == args(&["--version"]) {
                    reply(true, version, 0)
                } else {
                    reply(false, "", 1)
                }
            }))
        };
        let dir = Path::new(".");
        for (version, state) in [
            ("git version 2.45.1.windows.1", GitState::Ok),
            ("git version 2.28.0", GitState::Ok),
            ("git version 2.27.1", GitState::TooOld),
            ("git version 2.20.0", GitState::TooOld),
            ("git version 1.9.5", GitState::TooOld),
            ("git version banana", GitState::Ok),
        ] {
            let found = detect(&git(version), dir, false);
            assert!(found.git_installed, "{version}");
            assert_eq!(found.git_state, state, "{version}");
        }
        let missing = Script(Box::new(|_, _| Err("unavailable".into())));
        let found = detect(&missing, dir, true);
        assert!(!found.git_installed && !found.gh_installed);
        assert_eq!(found.git_state, GitState::Missing);
        assert_eq!(found.github_state, GithubState::CliMissing);
        assert_eq!(found.identity, IdentityReport::default());
        assert!(!found.identity_ready);
    }

    #[test]
    fn old_git_without_show_scope_still_reports_values_without_a_scope() {
        let old = Script(Box::new(|_, values| {
            if values.contains(&"--show-scope".to_string()) {
                return reply(false, "", 129);
            }
            match values.last().map(String::as_str) {
                Some("--version") => reply(true, "git version 2.20.0", 0),
                Some("user.name") => reply(true, "Ada", 0),
                Some("user.email") => reply(true, "ada@example.invalid", 0),
                _ => reply(false, "", 1),
            }
        }));
        let found = detect(&old, Path::new("."), false);
        assert_eq!(found.identity.name.as_deref(), Some("Ada"));
        assert_eq!(found.identity.name_scope, None);
        assert_eq!(found.identity.email_scope, None);
        assert!(found.identity_ready && found.identity.email_valid);
        // A missing key (exit 1) on a Git that supports scopes is simply absent.
        let missing = Script(Box::new(|_, values| {
            match values.last().map(String::as_str) {
                Some("--version") => reply(true, "git version 2.45.1", 0),
                _ => reply(false, "", 1),
            }
        }));
        let found = detect(&missing, Path::new("."), false);
        assert_eq!(found.identity.name, None);
        assert!(!found.identity_ready && !found.identity.resolves);
    }

    #[test]
    fn email_validation_is_structural_and_advisory() {
        for good in [
            "a@b",
            "ada@example.com",
            "123+octocat@users.noreply.github.com",
        ] {
            assert!(valid_email(good), "{good}");
        }
        for bad in [
            "",
            "ada",
            "@example.com",
            "ada@",
            "a@b@c",
            "a b@example.com",
            "ada@ex ample",
        ] {
            assert!(!valid_email(bad), "{bad}");
        }
    }

    #[test]
    fn identity_detection_reports_values_scopes_and_resolution() {
        let sandbox = ConfigSandbox::new();
        let work = sandbox.work();
        let detect_here = |dir: &Path| detect(&sandbox, dir, false);

        // Nothing configured anywhere.
        let none = detect_here(&work);
        assert!(none.git_installed);
        assert_eq!(none.git_state, GitState::Ok);
        assert_eq!(none.identity.name, None);
        assert_eq!(none.identity.email, None);
        assert!(!none.identity_ready && !none.identity.resolves && !none.identity.email_valid);
        assert_eq!(none.identity.global_config_path, None);

        // Name only: reported, but it does not resolve and is not "ready".
        sandbox.write_global("[user]\n\tname = Ada Test\n");
        let name_only = detect_here(&work);
        assert_eq!(name_only.identity.name.as_deref(), Some("Ada Test"));
        assert_eq!(name_only.identity.name_scope.as_deref(), Some("global"));
        assert_eq!(name_only.identity.email, None);
        assert_eq!(name_only.identity_name.as_deref(), Some("Ada Test"));
        assert!(!name_only.identity_ready && !name_only.identity.resolves);
        let path = name_only.identity.global_config_path.expect("global path");
        assert!(
            path.replace('\\', "/").ends_with("home/.gitconfig"),
            "{path}"
        );

        // Email only.
        sandbox.write_global("[user]\n\temail = ada@example.invalid\n");
        let email_only = detect_here(&work);
        assert_eq!(email_only.identity.name, None);
        assert_eq!(email_only.identity.email_scope.as_deref(), Some("global"));
        assert!(email_only.identity.email_valid);
        assert!(!email_only.identity_ready && !email_only.identity.resolves);

        // Both: ready, resolves, valid.
        sandbox.write_global("[user]\n\tname = Ada Test\n\temail = ada@example.invalid\n");
        let both = detect_here(&work);
        assert!(both.identity_ready && both.identity.resolves && both.identity.email_valid);

        // An invalid email is advisory: values are still reported and Git resolves.
        sandbox.write_global("[user]\n\tname = Ada Test\n\temail = not-an-email\n");
        let invalid = detect_here(&work);
        assert_eq!(invalid.identity.email.as_deref(), Some("not-an-email"));
        assert!(invalid.identity_ready && !invalid.identity.email_valid);
    }

    #[test]
    fn local_scope_values_are_reported_from_the_save_location_only() {
        let sandbox = ConfigSandbox::new();
        let repository = sandbox.work().join("project");
        fs::create_dir(&repository).unwrap();
        sandbox.git(&repository, &["init", "-q", "."]);
        sandbox.git(
            &repository,
            &["config", "--local", "user.name", "Local Ada"],
        );
        sandbox.git(
            &repository,
            &["config", "--local", "user.email", "local@example.invalid"],
        );
        let inside = detect(&sandbox, &repository, false);
        assert_eq!(inside.identity.name_scope.as_deref(), Some("local"));
        assert_eq!(inside.identity.email_scope.as_deref(), Some("local"));
        assert!(inside.identity.resolves);
        let outside = detect(&sandbox, &sandbox.work(), false);
        assert_eq!(outside.identity.name, None);
        assert!(!outside.identity.resolves);
        // Only the sandbox could have been consulted: its global file was never created.
        assert!(!sandbox.global_file().exists());
    }

    #[test]
    fn github_states_follow_exit_codes_and_never_guess_signed_out() {
        let dir = Path::new(".");
        let signed_in = gh_only(|| reply(true, r#"{"login":"octocat","id":123}"#, 0));
        let (state, account) = github_account(&signed_in, dir);
        assert_eq!(state, GithubState::SignedIn);
        assert_eq!(account.unwrap().login, "octocat");

        // Documented exit code 4 means authentication is required.
        let (state, account) = github_account(&gh_only(|| reply(false, "", 4)), dir);
        assert_eq!((state, account.is_none()), (GithubState::SignedOut, true));

        // Every other failure, and success with unusable output, stays unverified.
        let ambiguous: [(bool, &str, Option<i32>); 7] = [
            (false, "", Some(1)),
            (false, "", Some(2)),
            (false, "", Some(0)),
            (false, "", None),
            (true, "not json", Some(0)),
            (true, r#"{"login":"","id":0}"#, Some(0)),
            (true, "", Some(4)),
        ];
        for (success, stdout, code) in ambiguous {
            let runner = gh_only(move || {
                Ok(Output {
                    success,
                    stdout: stdout.into(),
                    code,
                })
            });
            let (state, _) = github_account(&runner, dir);
            assert_eq!(
                state,
                GithubState::Unverified,
                "{success} {stdout} {code:?}"
            );
        }
        for reason in ["timed out", "cancelled", "stdout unavailable"] {
            let (state, _) = github_account(&gh_only(move || Err(reason.into())), dir);
            assert_eq!(state, GithubState::Unverified, "{reason}");
        }
        let (state, _) = github_account(&gh_only(|| Err("unavailable".into())), dir);
        assert_eq!(state, GithubState::CliMissing);
    }

    #[test]
    fn github_is_checked_only_on_request_and_only_with_an_installed_cli() {
        let calls = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
        let recorder = calls.clone();
        let runner = Script(Box::new(move |program, values| {
            recorder
                .lock()
                .unwrap()
                .push(format!("{program:?} {}", values.join(" ")));
            match (program, values.first().map(String::as_str)) {
                (Program::Gh, Some("--version")) => reply(true, "gh version 2.97.0", 0),
                (Program::Gh, Some("api")) if values[1] == "user" => {
                    reply(true, r#"{"login":"octocat","id":123}"#, 0)
                }
                (Program::Gh, Some("api")) => reply(true, "sample-org", 0),
                _ => reply(false, "", 1),
            }
        }));
        let local = detect(&runner, Path::new("."), false);
        assert_eq!(local.github_state, GithubState::NotChecked);
        assert!(local.gh_installed && local.github_user.is_none());
        assert!(!calls.lock().unwrap().iter().any(|c| c.contains("api")));
        let published = detect(&runner, Path::new("."), true);
        assert_eq!(published.github_state, GithubState::SignedIn);
        assert_eq!(published.github_owners, vec!["octocat", "sample-org"]);
    }
}

#[cfg(test)]
mod path_tests {
    use super::unquote_git_path;

    #[test]
    fn git_quoted_paths_are_decoded_or_omitted() {
        assert_eq!(
            unquote_git_path("C:/Users/ada/.gitconfig").as_deref(),
            Some("C:/Users/ada/.gitconfig")
        );
        assert_eq!(
            unquote_git_path(r#""C:\\Users\\ada\\.gitconfig""#).as_deref(),
            Some(r"C:\Users\ada\.gitconfig")
        );
        assert_eq!(unquote_git_path(r#""a\"b""#).as_deref(), Some("a\"b"));
        // Octal or control escapes are never guessed; unterminated quotes are rejected.
        for odd in [r#""caf\303\251""#, r#""a\tb""#, r#""open"#, "", r#""""#] {
            assert_eq!(unquote_git_path(odd), None, "{odd}");
        }
    }
}
