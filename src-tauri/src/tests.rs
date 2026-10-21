use crate::{
    github,
    model::*,
    preferences::Preferences,
    process::{args, command, Output, Program, Runner, SystemRunner},
    repository,
};
use std::{fs, path::Path, sync::Mutex};

fn request(readme: Readme) -> CreateRequest {
    CreateRequest {
        name: "test-project".into(),
        description: "A useful project.\nWith a second line.".into(),
        destination: Destination::Local,
        visibility: Visibility::Private,
        readme,
    }
}

struct IsolatedGit;
impl Runner for IsolatedGit {
    fn run(&self, program: Program, values: &[String], cwd: &Path) -> Result<Output, String> {
        assert_eq!(program, Program::Git, "Local mode must never invoke GitHub");
        let mut prefixed = args(&[
            "-c",
            "user.name=Repo Creator Test",
            "-c",
            "user.email=repo-creator@example.invalid",
        ]);
        prefixed.extend_from_slice(values);
        SystemRunner.run(program, &prefixed, cwd)
    }
}

#[test]
fn validates_names_at_the_native_boundary() {
    for value in ["a", "Repo_2.0", "my-project", "com10", &"x".repeat(100)] {
        assert!(validate_name(value).is_ok(), "{value}");
    }
    for value in [
        "",
        "../escape",
        "a/b",
        "a\\b",
        "-flag",
        ".git",
        "NUL",
        "con.txt",
        "LPT1.md",
        "repo.git",
        "trailing.",
        "x;echo",
        "a b",
        "é",
        &"x".repeat(101),
    ] {
        assert!(validate_name(value).is_err(), "{value}");
    }
    let mut value = request(Readme::None);
    value.description = "x".repeat(351);
    assert!(validate_request(&value).is_err());
    value.description = "hello\0world".into();
    assert!(validate_request(&value).is_err());
}

#[test]
fn templates_have_expected_content_and_none_means_no_file() {
    let general = render_readme(&request(Readme::General)).unwrap();
    assert!(general.starts_with("# test-project\n\nA useful project."));
    assert!(general.contains("## Getting started"));
    let minimal = render_readme(&request(Readme::Minimal)).unwrap();
    assert_eq!(
        minimal,
        "# test-project\n\nA useful project.\nWith a second line.\n"
    );
    assert!(render_readme(&request(Readme::None)).is_none());
}

#[test]
fn creates_real_local_repositories_for_all_templates() {
    for template in [Readme::General, Readme::Minimal, Readme::None] {
        let temp = tempfile::tempdir().unwrap();
        let mut pending = repository::begin(&IsolatedGit, temp.path(), request(template)).unwrap();
        let stages = Mutex::new(Vec::new());
        repository::create_local(&IsolatedGit, &mut pending, &|stage| {
            stages.lock().unwrap().push(stage.to_string())
        })
        .unwrap();
        let output = |values: &[&str]| {
            let result = IsolatedGit
                .run(Program::Git, &args(values), &pending.path)
                .unwrap();
            assert!(result.success);
            result.stdout
        };
        assert_eq!(output(&["branch", "--show-current"]), "main");
        assert_eq!(output(&["log", "-1", "--format=%s"]), "Initial commit");
        assert_eq!(output(&["rev-list", "--count", "HEAD"]), "1");
        assert_eq!(output(&["status", "--porcelain"]), "");
        assert_eq!(output(&["remote"]), "");
        assert_eq!(output(&["rev-parse", "HEAD"]), pending.result().commit);
        assert_eq!(
            pending.path.join("README.md").exists(),
            template != Readme::None
        );
        if template == Readme::None {
            assert_eq!(output(&["ls-tree", "--name-only", "HEAD"]), "");
        }
        assert_eq!(*stages.lock().unwrap(), ["readme", "git", "commit"]);
    }
}

#[test]
fn refuses_existing_directories_and_files_without_changing_them() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("test-project");
    fs::create_dir(&path).unwrap();
    fs::write(path.join("precious.txt"), "preserve me").unwrap();
    assert!(repository::begin(&IsolatedGit, temp.path(), request(Readme::General)).is_err());
    assert_eq!(
        fs::read_to_string(path.join("precious.txt")).unwrap(),
        "preserve me"
    );
    assert!(!path.join(".git").exists());
    let mut file_request = request(Readme::General);
    file_request.name = "existing-file".into();
    fs::write(temp.path().join("existing-file"), "keep").unwrap();
    assert!(repository::begin(&IsolatedGit, temp.path(), file_request).is_err());
    assert_eq!(
        fs::read_to_string(temp.path().join("existing-file")).unwrap(),
        "keep"
    );
}

#[test]
fn rejects_traversal_before_any_files_are_written() {
    let temp = tempfile::tempdir().unwrap();
    let mut value = request(Readme::None);
    value.name = "../escaped".into();
    assert!(repository::begin(&IsolatedGit, temp.path(), value).is_err());
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 0);
}

#[derive(Default)]
struct FakeGithub {
    calls: Mutex<Vec<(Program, Vec<String>)>>,
    fail_push: bool,
    mismatch: bool,
    fail_create: bool,
}
impl Runner for FakeGithub {
    fn run(&self, program: Program, values: &[String], _: &Path) -> Result<Output, String> {
        self.calls.lock().unwrap().push((program, values.to_vec()));
        let (success, stdout) =
            if program == Program::Gh && values.starts_with(&args(&["api", "user"])) {
                (true, r#"{"login":"octocat","id":123}"#.into())
            } else if program == Program::Gh && values.starts_with(&args(&["repo", "create"])) {
                (!self.fail_create, String::new())
            } else if program == Program::Gh && values.starts_with(&args(&["repo", "view"])) {
                (
                    true,
                    r#"{"url":"https://github.com/octocat/test-project"}"#.into(),
                )
            } else if values.starts_with(&args(&["rev-parse"])) {
                (true, "a".repeat(40))
            } else if values.starts_with(&args(&["branch"])) {
                (true, "main".into())
            } else if values.starts_with(&args(&["remote", "get-url"])) {
                (true, "git@github.com:octocat/test-project.git".into())
            } else if values.contains(&"push".into()) {
                (!self.fail_push, String::new())
            } else if values.contains(&"ls-remote".into()) {
                (
                    true,
                    format!(
                        "{}\trefs/heads/main",
                        if self.mismatch {
                            "b".repeat(40)
                        } else {
                            "a".repeat(40)
                        }
                    ),
                )
            } else {
                (true, String::new())
            };
        Ok(Output { success, stdout })
    }
}

fn pending(temp: &tempfile::TempDir) -> repository::PendingRepo {
    let mut value = request(Readme::Minimal);
    value.destination = Destination::Github;
    repository::PendingRepo {
        request: value,
        path: temp.path().canonicalize().unwrap(),
        owner: Some("octocat".into()),
        author_email: Some("123+octocat@users.noreply.github.com".into()),
        commit: Some("a".repeat(40)),
        remote_created: false,
        github_url: None,
    }
}

#[test]
fn github_creation_uses_safe_arguments_and_never_seeds_remote_files() {
    let mut value = request(Readme::Minimal);
    value.description = "quotes \"here\"; $(danger) & more\ntext".into();
    let values = github::create_args(
        &value,
        "octocat",
        Path::new("C:\\Projects with spaces\\test-project"),
    );
    assert_eq!(
        values,
        args(&[
            "repo",
            "create",
            "octocat/test-project",
            "--source",
            "C:\\Projects with spaces\\test-project",
            "--remote",
            "origin",
            "--private",
            "--description",
            "quotes \"here\"; $(danger) & more text"
        ])
    );
    assert!(!values.contains(&"--add-readme".into()));
    value.visibility = Visibility::Public;
    assert!(github::create_args(&value, "octocat", Path::new(".")).contains(&"--public".into()));
    let command = command(Program::Gh, &values, Path::new("."));
    assert_eq!(command.get_program(), "gh");
    assert_eq!(
        command
            .get_args()
            .map(|v| v.to_string_lossy().into_owned())
            .collect::<Vec<_>>(),
        values
    );
}

#[test]
fn publish_checks_remote_commit_before_reporting_success() {
    let temp = tempfile::tempdir().unwrap();
    let runner = FakeGithub::default();
    let mut pending = pending(&temp);
    repository::publish(&runner, &mut pending, &|_| {}).unwrap();
    assert_eq!(
        pending.result().github_url.as_deref(),
        Some("https://github.com/octocat/test-project")
    );
    let calls = runner.calls.lock().unwrap();
    let push = calls
        .iter()
        .position(|(_, a)| a.contains(&"push".into()))
        .unwrap();
    let verify = calls
        .iter()
        .position(|(_, a)| a.contains(&"ls-remote".into()))
        .unwrap();
    assert!(verify > push);
    assert!(calls[push]
        .1
        .contains(&"credential.https://github.com.helper=!gh auth git-credential".into()));
}

#[test]
fn failed_push_preserves_work_and_retry_does_not_create_a_second_remote() {
    let temp = tempfile::tempdir().unwrap();
    let mut pending = pending(&temp);
    let error = repository::publish(
        &FakeGithub {
            fail_push: true,
            ..Default::default()
        },
        &mut pending,
        &|_| {},
    )
    .unwrap_err();
    let failure = pending.failure(error);
    assert!(failure.local_ready && failure.can_retry);
    assert!(pending.remote_created);
    assert!(failure.github_url.is_some());
    let retry = FakeGithub::default();
    repository::publish(&retry, &mut pending, &|_| {}).unwrap();
    assert!(!retry
        .calls
        .lock()
        .unwrap()
        .iter()
        .any(|(_, a)| a.starts_with(&args(&["repo", "create"]))));
}

#[test]
fn remote_mismatch_is_a_partial_failure() {
    let temp = tempfile::tempdir().unwrap();
    let mut pending = pending(&temp);
    assert!(repository::publish(
        &FakeGithub {
            mismatch: true,
            ..Default::default()
        },
        &mut pending,
        &|_| {}
    )
    .is_err());
    assert!(pending.commit.is_some());
}

#[test]
fn existing_github_name_is_never_adopted_or_pushed_to() {
    let temp = tempfile::tempdir().unwrap();
    let runner = FakeGithub {
        fail_create: true,
        ..Default::default()
    };
    let mut pending = pending(&temp);
    assert!(repository::publish(&runner, &mut pending, &|_| {}).is_err());
    assert!(!pending.remote_created);
    assert!(!runner
        .calls
        .lock()
        .unwrap()
        .iter()
        .any(|(_, a)| a.contains(&"push".into()) || a.contains(&"delete".into())));
}

#[test]
fn preferences_round_trip_and_corrupt_data_falls_back() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("config").join("preferences.json");
    let prefs = Preferences {
        parent_path: temp.path().canonicalize().unwrap(),
        destination: Destination::Github,
    };
    prefs.save(&file).unwrap();
    let loaded = Preferences::load(&file, temp.path().into());
    assert_eq!(loaded.destination, Destination::Github);
    assert_eq!(loaded.parent_path, prefs.parent_path);
    fs::write(&file, "invalid json").unwrap();
    assert_eq!(
        Preferences::load(&file, temp.path().into()).destination,
        Destination::Local
    );
}

#[test]
fn missing_git_or_identity_is_reported_before_creating_a_folder() {
    struct MissingSetup {
        git_missing: bool,
    }
    impl Runner for MissingSetup {
        fn run(&self, _: Program, values: &[String], _: &Path) -> Result<Output, String> {
            if self.git_missing {
                return Err("unavailable".into());
            }
            Ok(Output {
                success: values == args(&["--version"]),
                stdout: "git version".into(),
            })
        }
    }
    for git_missing in [true, false] {
        let temp = tempfile::tempdir().unwrap();
        let error = match repository::begin(
            &MissingSetup { git_missing },
            temp.path(),
            request(Readme::None),
        ) {
            Ok(_) => panic!("Missing setup should fail"),
            Err(error) => error,
        };
        assert!(!error.guidance.is_empty());
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 0);
    }
}

#[test]
fn native_operation_guard_rejects_duplicates_and_releases_on_drop() {
    use std::sync::{atomic::AtomicBool, Arc};
    let temp = tempfile::tempdir().unwrap();
    let runtime = Arc::new(crate::Runtime {
        busy: AtomicBool::new(false),
        session: Mutex::new(crate::Session {
            preferences: Preferences {
                parent_path: temp.path().into(),
                destination: Destination::Local,
            },
            preference_file: temp.path().join("preferences.json"),
            pending: None,
            result: None,
        }),
    });
    let guard = crate::acquire(&runtime).unwrap();
    assert!(crate::acquire(&runtime).is_err());
    drop(guard);
    assert!(crate::acquire(&runtime).is_ok());
}

#[test]
fn github_initial_commit_uses_verified_noreply_address_without_global_changes() {
    struct AuthenticatedGit;
    impl Runner for AuthenticatedGit {
        fn run(&self, program: Program, values: &[String], cwd: &Path) -> Result<Output, String> {
            if program == Program::Gh {
                assert_eq!(
                    values,
                    args(&["api", "user", "--jq", "{login: .login, id: .id}"])
                );
                return Ok(Output {
                    success: true,
                    stdout: r#"{"login":"octocat","id":123}"#.into(),
                });
            }
            if values == args(&["config", "--get", "user.email"]) {
                return Ok(Output {
                    success: true,
                    stdout: "private@example.invalid".into(),
                });
            }
            let mut prefixed = args(&["-c", "user.name=Repo Creator Test"]);
            prefixed.extend_from_slice(values);
            SystemRunner.run(program, &prefixed, cwd)
        }
    }
    let temp = tempfile::tempdir().unwrap();
    let mut value = request(Readme::None);
    value.destination = Destination::Github;
    let mut pending = repository::begin(&AuthenticatedGit, temp.path(), value).unwrap();
    repository::create_local(&AuthenticatedGit, &mut pending, &|_| {}).unwrap();
    let author = SystemRunner
        .run(
            Program::Git,
            &args(&["log", "-1", "--format=%ae"]),
            &pending.path,
        )
        .unwrap();
    assert!(author.success);
    assert_eq!(author.stdout, "123+octocat@users.noreply.github.com");
    let config = fs::read_to_string(pending.path.join(".git").join("config")).unwrap();
    assert!(config.contains("123+octocat@users.noreply.github.com"));
    assert!(!config.contains("private@example.invalid"));
}
