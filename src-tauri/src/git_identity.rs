//! Commit identity handled by Repo Creator itself.
//!
//! * [`IdentityOverride`] is the saved "use only for Repo Creator projects" identity.
//!   It is applied to a new project with `git config --local` and never touches the
//!   global Git configuration.
//! * [`set_global`] is the only code in the application that writes global Git
//!   configuration. It requires an explicit confirmation and is never called by an
//!   automatic path.
use crate::{
    config::validate_saved_identity,
    environment,
    model::{AppError, CreateRequest},
    process::{args, Program, Runner},
};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdentityOverride {
    pub name: String,
    pub email: String,
}

impl IdentityOverride {
    pub fn validated(name: String, email: String) -> Result<Self, AppError> {
        let (name, email) = (name.trim().to_string(), email.trim().to_string());
        validate_saved_identity(&name, &email)?;
        Ok(Self { name, email })
    }
    pub fn is_valid(&self) -> bool {
        validate_saved_identity(&self.name, &self.email).is_ok()
    }
}

/// Fills in the saved identity when the request carries no per-project identity.
/// A per-request value always wins. Returns whether the saved identity was applied.
pub fn apply_override(request: &mut CreateRequest, saved: Option<&IdentityOverride>) -> bool {
    let options = &mut request.options;
    match saved {
        Some(saved)
            if options.commit_author_name.is_empty() && options.commit_author_email.is_empty() =>
        {
            options.commit_author_name = saved.name.clone();
            options.commit_author_email = saved.email.clone();
            true
        }
        _ => false,
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GlobalIdentityResult {
    pub previous_name: Option<String>,
    pub previous_email: Option<String>,
    pub config_path: Option<String>,
    /// The identity Git resolves after the write, e.g. `Ada <ada@example.com>`.
    pub resolved_identity: String,
}

fn global_value(runner: &dyn Runner, cwd: &Path, key: &str) -> Option<String> {
    runner
        .run(
            Program::Git,
            &args(&["config", "--global", "--get", key]),
            cwd,
        )
        .ok()
        .filter(|o| o.success && !o.stdout.trim().is_empty())
        .map(|o| o.stdout.trim().to_string())
}

fn write_failure() -> AppError {
    AppError::new(
        "Could not save to your Git configuration.",
        "Check that your global Git configuration file can be written, then try again. Repo Creator projects are unaffected.",
    )
}

/// Writes `user.name` and `user.email` to the global Git configuration.
///
/// Fixed argument lists only: each value is its own argument and no shell is
/// involved. The previous values are returned so the caller can show what was
/// replaced, and the result is verified with `git var GIT_AUTHOR_IDENT`.
pub fn set_global(
    runner: &dyn Runner,
    cwd: &Path,
    name: &str,
    email: &str,
    confirm: bool,
) -> Result<GlobalIdentityResult, AppError> {
    if !confirm {
        return Err(AppError::new(
            "Confirm before changing your Git configuration.",
            "Choose Save to my Git configuration to confirm. Nothing was changed.",
        ));
    }
    let (name, email) = (name.trim(), email.trim());
    validate_saved_identity(name, email)?;
    let previous_name = global_value(runner, cwd, "user.name");
    let previous_email = global_value(runner, cwd, "user.email");
    let set = |key: &str, value: &str| {
        runner
            .run(
                Program::Git,
                &args(&["config", "--global", key, value]),
                cwd,
            )
            .is_ok_and(|o| o.success)
    };
    if !set("user.name", name) {
        return Err(write_failure());
    }
    if !set("user.email", email) {
        // Do not leave a half-written identity behind: restore the previous name.
        match &previous_name {
            Some(previous) => {
                set("user.name", previous);
            }
            None => {
                let _ = runner.run(
                    Program::Git,
                    &args(&["config", "--global", "--unset", "user.name"]),
                    cwd,
                );
            }
        }
        return Err(write_failure());
    }
    let resolved = runner
        .run(Program::Git, &args(&["var", "GIT_AUTHOR_IDENT"]), cwd)
        .ok()
        .filter(|o| o.success)
        // `Name <email> 1700000000 +0000`: keep the part a person recognises.
        .and_then(|o| {
            o.stdout
                .rfind('>')
                .map(|end| o.stdout[..=end].trim().to_string())
        })
        .ok_or_else(|| {
            AppError::new(
                "Saved, but Git could not confirm the identity.",
                "Open Settings → Git & identity and select Recheck. A project-level Git setting may be overriding it.",
            )
        })?;
    Ok(GlobalIdentityResult {
        previous_name,
        previous_email,
        config_path: environment::global_config_path(runner, cwd),
        resolved_identity: resolved,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        model::{Destination, Readme},
        preferences::Preferences,
        process::{Output, Runner},
        repository,
        tests::ConfigSandbox,
    };
    use std::fs;

    fn saved() -> IdentityOverride {
        IdentityOverride {
            name: "Saved Author".into(),
            email: "saved@example.invalid".into(),
        }
    }
    fn request() -> CreateRequest {
        let mut request = CreateRequest {
            name: "identity-project".into(),
            description: "Identity test.".into(),
            readme: Readme::None,
            ..Default::default()
        };
        request.options.ignore_presets.clear();
        request
    }
    fn local_value(sandbox: &ConfigSandbox, path: &Path, key: &str) -> String {
        sandbox
            .git(path, &["config", "--local", "--get", key])
            .stdout
    }

    #[test]
    fn global_write_requires_confirmation_and_valid_values() {
        let sandbox = ConfigSandbox::new();
        let work = sandbox.work();
        let denied = set_global(&sandbox, &work, "Ada", "ada@example.invalid", false)
            .expect_err("an unconfirmed write must be rejected");
        assert!(denied.message.contains("Confirm"));
        for (name, email) in [
            ("-Ada", "ada@example.invalid"),
            ("Ada", "-ada@example.invalid"),
            ("Ada\nInjected", "ada@example.invalid"),
            ("Ada", "ada@example.invalid\n[core]"),
            ("Ada <x>", "ada@example.invalid"),
            ("", "ada@example.invalid"),
            ("Ada", ""),
            ("Ada", "not-an-email"),
            ("Ada", "a b@example.invalid"),
            ("Ada", "a@b@example.invalid"),
            (&"x".repeat(101), "ada@example.invalid"),
        ] {
            assert!(
                set_global(&sandbox, &work, name, email, true).is_err(),
                "{name:?} {email:?}"
            );
        }
        // Rejected requests never reach Git: the isolated global file was not even created.
        assert!(!sandbox.global_file().exists());
    }

    #[test]
    fn global_write_changes_only_the_isolated_file_and_verifies_the_result() {
        let sandbox = ConfigSandbox::new();
        let work = sandbox.work();
        let first = set_global(
            &sandbox,
            &work,
            " Ada Lovelace ",
            "ada@example.invalid",
            true,
        )
        .expect("the isolated write succeeds");
        assert_eq!(first.previous_name, None);
        assert_eq!(first.previous_email, None);
        assert_eq!(
            first.resolved_identity,
            "Ada Lovelace <ada@example.invalid>"
        );
        let path = first
            .config_path
            .expect("the file is named after the write");
        assert!(
            path.replace('\\', "/").ends_with("home/.gitconfig"),
            "{path}"
        );
        let text = fs::read_to_string(sandbox.global_file()).unwrap();
        assert!(
            text.contains("name = Ada Lovelace") && text.contains("email = ada@example.invalid")
        );

        // A second write reports the values it replaced.
        let second = set_global(&sandbox, &work, "Ada L", "ada2@example.invalid", true).unwrap();
        assert_eq!(second.previous_name.as_deref(), Some("Ada Lovelace"));
        assert_eq!(
            second.previous_email.as_deref(),
            Some("ada@example.invalid")
        );
        assert_eq!(second.resolved_identity, "Ada L <ada2@example.invalid>");
        assert!(!fs::read_to_string(sandbox.global_file())
            .unwrap()
            .contains("Lovelace"));
    }

    #[test]
    fn a_failed_email_write_restores_the_previous_name() {
        struct RefuseEmail<'a>(&'a ConfigSandbox);
        impl Runner for RefuseEmail<'_> {
            fn run(
                &self,
                program: Program,
                values: &[String],
                cwd: &Path,
            ) -> Result<Output, String> {
                if values.iter().any(|v| v == "user.email")
                    && values.iter().any(|v| v == "--global")
                    && !values.iter().any(|v| v == "--get")
                {
                    return Ok(Output {
                        success: false,
                        stdout: String::new(),
                        code: Some(1),
                    });
                }
                self.0.run(program, values, cwd)
            }
        }
        let sandbox = ConfigSandbox::new();
        sandbox.write_global("[user]\n\tname = Before\n\temail = before@example.invalid\n");
        let work = sandbox.work();
        assert!(set_global(
            &RefuseEmail(&sandbox),
            &work,
            "After",
            "after@example.invalid",
            true
        )
        .is_err());
        let name = sandbox.git(&work, &["config", "--global", "--get", "user.name"]);
        assert_eq!(name.stdout, "Before");
        // With nothing configured before, a failed write leaves no stray name.
        let fresh = ConfigSandbox::new();
        assert!(set_global(
            &RefuseEmail(&fresh),
            &fresh.work(),
            "After",
            "after@example.invalid",
            true
        )
        .is_err());
        let name = fresh.git(&fresh.work(), &["config", "--global", "--get", "user.name"]);
        assert!(!name.success);
    }

    #[test]
    fn saved_identity_fills_in_only_when_the_request_has_none() {
        let mut empty = request();
        assert!(apply_override(&mut empty, Some(&saved())));
        assert_eq!(empty.options.commit_author_name, "Saved Author");
        assert_eq!(empty.options.commit_author_email, "saved@example.invalid");

        let mut own = request();
        own.options.commit_author_name = "Request Author".into();
        own.options.commit_author_email = "request@example.invalid".into();
        assert!(!apply_override(&mut own, Some(&saved())));
        assert_eq!(own.options.commit_author_name, "Request Author");

        let mut none = request();
        assert!(!apply_override(&mut none, None));
        assert!(none.options.commit_author_name.is_empty());
    }

    #[test]
    fn creation_applies_the_saved_identity_locally_and_leaves_global_config_alone() {
        let sandbox = ConfigSandbox::new();
        sandbox.write_global("[init]\n\tdefaultBranch = trunk\n");
        let before = fs::read_to_string(sandbox.global_file()).unwrap();
        let parent = sandbox.work();
        let mut value = request();
        apply_override(&mut value, Some(&saved()));
        let mut pending = repository::begin(&sandbox, &parent, value).unwrap();
        repository::create_local(&sandbox, &mut pending, &|_| {}).unwrap();
        assert_eq!(
            local_value(&sandbox, &pending.path, "user.name"),
            "Saved Author"
        );
        assert_eq!(
            local_value(&sandbox, &pending.path, "user.email"),
            "saved@example.invalid"
        );
        let author = sandbox.git(&pending.path, &["log", "-1", "--format=%an <%ae>"]);
        assert_eq!(author.stdout, "Saved Author <saved@example.invalid>");
        assert_eq!(fs::read_to_string(sandbox.global_file()).unwrap(), before);
    }

    #[test]
    fn a_per_request_identity_wins_over_the_saved_one() {
        let sandbox = ConfigSandbox::new();
        let mut value = request();
        value.options.commit_author_name = "Request Author".into();
        value.options.commit_author_email = "request@example.invalid".into();
        apply_override(&mut value, Some(&saved()));
        let mut pending = repository::begin(&sandbox, &sandbox.work(), value).unwrap();
        repository::create_local(&sandbox, &mut pending, &|_| {}).unwrap();
        assert_eq!(
            local_value(&sandbox, &pending.path, "user.name"),
            "Request Author"
        );
        assert_eq!(
            local_value(&sandbox, &pending.path, "user.email"),
            "request@example.invalid"
        );
    }

    #[test]
    fn github_projects_keep_the_account_noreply_email_with_the_saved_name() {
        struct Octocat<'a>(&'a ConfigSandbox);
        impl Runner for Octocat<'_> {
            fn run(
                &self,
                program: Program,
                values: &[String],
                cwd: &Path,
            ) -> Result<Output, String> {
                if program == Program::Gh {
                    assert_eq!(values, args(&crate::github::ACCOUNT_ARGS));
                    return Ok(Output {
                        success: true,
                        stdout: r#"{"login":"octocat","id":123}"#.into(),
                        code: Some(0),
                    });
                }
                self.0.run(program, values, cwd)
            }
        }
        let sandbox = ConfigSandbox::new();
        let mut value = request();
        value.destination = Destination::Github;
        apply_override(&mut value, Some(&saved()));
        let runner = Octocat(&sandbox);
        let mut pending = repository::begin(&runner, &sandbox.work(), value).unwrap();
        repository::create_local(&runner, &mut pending, &|_| {}).unwrap();
        assert_eq!(
            local_value(&sandbox, &pending.path, "user.name"),
            "Saved Author"
        );
        assert_eq!(
            local_value(&sandbox, &pending.path, "user.email"),
            "123+octocat@users.noreply.github.com"
        );
    }

    #[test]
    fn preferences_round_trip_the_identity_and_still_load_older_files() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("preferences.json");
        let mut preferences = Preferences::new(temp.path().into());
        assert!(preferences.identity_override.is_none());
        preferences.identity_override = Some(saved());
        preferences.save(&file).unwrap();
        assert!(fs::read_to_string(&file)
            .unwrap()
            .contains("\"identityOverride\""));
        let loaded = Preferences::load(&file, temp.path().into());
        assert_eq!(loaded.identity_override, Some(saved()));
        assert!(loaded.recovery_notice.is_none() && !loaded.needs_backup);

        // A version 5 file written before this field existed loads unchanged.
        let older = temp.path().join("older.json");
        fs::write(
            &older,
            serde_json::json!({"schemaVersion":5,"appearance":"dark"}).to_string(),
        )
        .unwrap();
        let loaded = Preferences::load(&older, temp.path().into());
        assert!(loaded.identity_override.is_none());
        assert!(loaded.recovery_notice.is_none() && !loaded.needs_backup && !loaded.future_version);
        assert_eq!(loaded.schema_version, crate::preferences::SETTINGS_VERSION);
    }

    #[test]
    fn an_invalid_saved_identity_is_dropped_with_the_usual_backup_recovery() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("preferences.json");
        let original = serde_json::json!({
            "schemaVersion": 5,
            "appearance": "dark",
            "identityOverride": {"name": "-bad", "email": "nope"}
        })
        .to_string();
        fs::write(&file, &original).unwrap();
        let loaded = Preferences::load(&file, temp.path().into());
        assert!(loaded.identity_override.is_none());
        assert!(loaded.needs_backup && loaded.recovery_notice.is_some());
        loaded.save(&file).unwrap();
        assert_eq!(
            fs::read_to_string(temp.path().join("preferences.json.bak")).unwrap(),
            original
        );
    }
}
