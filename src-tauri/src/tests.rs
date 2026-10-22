use crate::{
    config::{Appearance, Configuration, License, ProjectOptions},
    generation::{generate_files, render_gitignore, render_readme},
    github,
    model::*,
    preferences::Preferences,
    process::{args, command, Output, Program, Runner, SystemRunner},
    repository,
};
use std::{fs, path::Path, sync::Mutex};

fn request(readme: Readme) -> CreateRequest {
    let mut request = CreateRequest {
        name: "test-project".into(),
        description: "A useful project.\nWith a second line.".into(),
        destination: Destination::Local,
        visibility: Visibility::Private,
        readme,
        ..Default::default()
    };
    request.options.ignore_presets.clear();
    request
}

pub(crate) struct IsolatedGit;
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
    assert!(general.starts_with("# test-project\n\n## Overview\n\nA useful project."));
    assert_eq!(
        general,
        "# test-project\n\n## Overview\n\nA useful project.\nWith a second line.\n"
    );
    let minimal = render_readme(&request(Readme::Minimal)).unwrap();
    assert_eq!(
        minimal,
        "# test-project\n\nA useful project.\nWith a second line.\n"
    );
    assert!(render_readme(&request(Readme::None)).is_none());
}

#[test]
fn built_in_readmes_omit_unwritten_sections_without_inventing_project_details() {
    for preset in crate::config::built_in_presets() {
        let mut value = request(preset.configuration.readme);
        value.options = preset.configuration.options;
        for description in ["An idea to explore.", ""] {
            value.description = description.into();
            let Some(readme) = render_readme(&value) else {
                assert_eq!(preset.id, "blank");
                continue;
            };
            for heading in [
                "Features",
                "Installation",
                "Usage",
                "Development",
                "Contributing",
            ] {
                assert!(!readme.contains(&format!("## {heading}")), "{}", preset.id);
            }
            assert!(!readme.contains("<!--"), "{}", preset.id);
            if preset.id.contains("experiment") {
                assert!(readme.contains("This is an experimental project"));
                assert_eq!(readme.matches("\n## ").count(), 1);
            } else if description.is_empty() {
                assert_eq!(readme, "# test-project\n");
            }
        }
    }
}

#[test]
fn readme_keeps_explicit_sections_and_authored_text_but_omits_empty_expanded_content() {
    let mut value = request(Readme::Custom);
    value.options.readme_sections = vec!["overview".into(), "installation".into(), "usage".into()];
    value.options.section_content.insert(
        "usage".into(),
        "Keep café and 日本語 exact.\n\n```text\nuser-provided-command\n```".into(),
    );
    let readme = render_readme(&value).unwrap();
    assert!(readme.contains(
        "## Installation\n\n<!-- Add the prerequisites and actual installation steps. -->"
    ));
    assert!(readme.contains(
        "## Usage\n\nKeep café and 日本語 exact.\n\n```text\nuser-provided-command\n```"
    ));
    // A saved list of explicit sections is still honored by General as well as Custom.
    value.readme = Readme::General;
    assert_eq!(render_readme(&value).unwrap(), readme);
    value.description.clear();
    value
        .options
        .section_content
        .insert("usage".into(), " {{description}} \n ".into());
    let readme = render_readme(&value).unwrap();
    assert!(!readme.contains("## Overview"));
    assert!(!readme.contains("## Usage"));
    assert!(readme.contains("## Installation"));
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
    fail_default_branch: bool,
    branch: Option<String>,
}
impl Runner for FakeGithub {
    fn run(&self, program: Program, values: &[String], _: &Path) -> Result<Output, String> {
        self.calls.lock().unwrap().push((program, values.to_vec()));
        let (success, stdout) = if program == Program::Gh
            && values.starts_with(&args(&["api", "user"]))
        {
            (true, r#"{"login":"octocat","id":123}"#.into())
        } else if program == Program::Gh && values.starts_with(&args(&["repo", "create"])) {
            (!self.fail_create, String::new())
        } else if program == Program::Gh && values.starts_with(&args(&["repo", "view"])) {
            (
                true,
                serde_json::json!({"url": format!("https://github.com/{}", values[2])}).to_string(),
            )
        } else if program == Program::Gh && values.contains(&"--default-branch".into()) {
            (!self.fail_default_branch, String::new())
        } else if values.starts_with(&args(&["rev-parse"])) {
            (true, "a".repeat(40))
        } else if values.starts_with(&args(&["branch"])) {
            (true, self.branch.clone().unwrap_or_else(|| "main".into()))
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
        authenticated_user: Some("octocat".into()),
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
    let executable = crate::process::resolve_executable("gh").unwrap_or_else(|| "gh".into());
    assert_eq!(command.get_program(), executable.as_os_str());
    assert!(matches!(
        executable.file_name().and_then(|name| name.to_str()),
        Some("gh" | "gh.exe")
    ));
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
        ..Preferences::new(temp.path().into())
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
                success: values == args(&["--version"])
                    || values.starts_with(&args(&["check-ref-format"])),
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
fn github_account_check_distinguishes_missing_cli_from_timeouts_without_exposing_diagnostics() {
    struct FailingGithub(&'static str);
    impl Runner for FailingGithub {
        fn run(&self, program: Program, _: &[String], _: &Path) -> Result<Output, String> {
            assert_eq!(program, Program::Gh);
            Err(self.0.into())
        }
    }
    let missing = github::authenticated_account(&FailingGithub("unavailable"), Path::new("."))
        .err()
        .expect("A missing CLI cannot verify the account");
    assert_eq!(missing.message, "GitHub CLI is unavailable.");
    assert!(missing.guidance.contains("Install GitHub CLI"));
    for reason in ["timed out", "untrusted private process diagnostic"] {
        let failure = github::authenticated_account(&FailingGithub(reason), Path::new("."))
            .err()
            .expect("An interrupted check cannot verify the account");
        assert_eq!(
            failure.message,
            "GitHub account verification did not finish."
        );
        assert!(failure.guidance.contains("Check your connection"));
        assert!(!failure.guidance.contains("Install"));
        assert!(!format!("{} {}", failure.message, failure.guidance).contains(reason));
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
                ..Preferences::new(temp.path().into())
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

#[test]
fn generated_files_match_preview_with_custom_readme_license_branch_and_commit() {
    let temp = tempfile::tempdir().unwrap();
    let mut value = request(Readme::Custom);
    value.options = ProjectOptions {
        initial_branch: "feature/start".into(),
        commit_message: "Start the configured project".into(),
        license: License::Mit,
        copyright_name: "Test Author".into(),
        copyright_year: "2026".into(),
        editorconfig: true,
        gitattributes: true,
        ..Default::default()
    };
    value.options.readme_sections.push("usage".into());
    value.options.section_content.insert(
        "usage".into(),
        "Actual usage goes here.\n\n```text\nexample\n```".into(),
    );
    let expected = generate_files(&value).unwrap();
    let mut pending = repository::begin(&IsolatedGit, temp.path(), value).unwrap();
    repository::create_local(&IsolatedGit, &mut pending, &|_| {}).unwrap();
    for file in expected {
        assert_eq!(
            fs::read_to_string(pending.path.join(file.path)).unwrap(),
            file.content
        );
    }
    for (values, expected) in [
        (args(&["branch", "--show-current"]), "feature/start"),
        (
            args(&["log", "-1", "--format=%s"]),
            "Start the configured project",
        ),
        (args(&["status", "--porcelain"]), ""),
    ] {
        let output = IsolatedGit
            .run(Program::Git, &values, &pending.path)
            .unwrap();
        assert!(output.success);
        assert_eq!(output.stdout, expected);
    }
    let readme = fs::read_to_string(pending.path.join("README.md")).unwrap();
    assert!(readme.contains("Actual usage goes here."));
    assert!(readme.contains("See [LICENSE](LICENSE)"));
    assert!(pending.result().files.contains(&".editorconfig".into()));
}

#[test]
fn every_license_has_canonical_text_and_correct_project_copyright() {
    for license in [
        License::Mit,
        License::Apache,
        License::Gpl,
        License::Bsd,
        License::Unlicense,
    ] {
        let mut value = request(Readme::General);
        value.options.license = license;
        value.options.copyright_name = "Alex Example".into();
        value.options.copyright_year = "2025".into();
        let files = generate_files(&value).unwrap();
        let text = &files
            .iter()
            .find(|file| file.path == "LICENSE")
            .unwrap()
            .content;
        assert!(text.len() > 500);
        if license.requires_author() {
            assert!(text.contains("2025 Alex Example"));
        }
        match license {
            License::Mit => {
                assert!(text.contains("Permission is hereby granted"));
                assert!(!text.contains("<year>"));
            }
            License::Bsd => {
                assert!(text.contains("Redistribution and use"));
                assert!(!text.contains("<owner>"));
            }
            License::Apache => {
                assert!(text.contains(include_str!("../resources/licenses/Apache-2.0.txt").trim()))
            }
            License::Gpl => {
                assert!(text.contains(include_str!("../resources/licenses/GPL-3.0-only.txt").trim()))
            }
            License::Unlicense => assert_eq!(
                text.trim(),
                include_str!("../resources/licenses/Unlicense.txt").trim()
            ),
            _ => unreachable!(),
        }
    }
    assert!(!generate_files(&request(Readme::None))
        .unwrap()
        .iter()
        .any(|f| f.path == "LICENSE"));
}

#[test]
fn ignore_rules_preserve_negation_and_keep_secrets_and_generated_files_out_of_git() {
    let temp = tempfile::tempdir().unwrap();
    let mut value = request(Readme::None);
    value.options.ignore_presets = args(&[
        "os", "secrets", "node", "vite", "frontend", "python", "rust", "unity",
    ]);
    value.options.custom_patterns = args(&[
        "scratch/*",
        "!scratch/keep.txt",
        "scratch/*.tmp",
        "scratch/*",
        "!scratch/keep.txt",
    ]);
    let text = render_gitignore(&value.options).unwrap();
    assert_eq!(text.lines().filter(|line| *line == "/dist/").count(), 1);
    assert_eq!(
        text.lines().filter(|line| *line == "scratch/*").count(),
        2,
        "A re-ignore after a negation must not be deduplicated"
    );
    let mut pending = repository::begin(&IsolatedGit, temp.path(), value).unwrap();
    repository::create_local(&IsolatedGit, &mut pending, &|_| {}).unwrap();
    let ignored = [
        ".env",
        ".env.local",
        "node_modules/pkg/index.js",
        "dist/app.js",
        ".venv/config",
        "__pycache__/app.pyc",
        "target/debug/app",
        "Library/cache",
        "scratch/temp.tmp",
    ];
    let tracked = [
        ".env.example",
        "src/index.ts",
        "Assets/player.cs",
        "Assets/player.cs.meta",
        "Packages/manifest.json",
        "ProjectSettings/settings.asset",
        "Cargo.lock",
        "scratch/keep.txt",
    ];
    for file in ignored.iter().chain(tracked.iter()) {
        let path = pending.path.join(file);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "test").unwrap();
    }
    let stage = IsolatedGit
        .run(Program::Git, &args(&["add", "--all"]), &pending.path)
        .unwrap();
    assert!(stage.success);
    let output = IsolatedGit
        .run(
            Program::Git,
            &args(&["diff", "--cached", "--name-only"]),
            &pending.path,
        )
        .unwrap();
    assert!(output.success);
    let paths = output.stdout.lines().collect::<Vec<_>>();
    for file in ignored {
        assert!(!paths.contains(&file), "{file} must stay ignored");
    }
    for file in tracked {
        assert!(paths.contains(&file), "{file} must remain available to Git");
    }
}

#[test]
fn configuration_validation_rejects_unsafe_values_before_creating_files() {
    let base = request(Readme::General);
    let mut invalid = Vec::new();
    for (name, email) in [
        (" ", ""),
        (" ", "author@example.invalid"),
        ("Author <alias>", "author@example.invalid"),
        ("Author", "author@example.invalid>"),
        ("Author", "author@@example.invalid"),
        ("Author\u{85}", "author@example.invalid"),
        (&"é".repeat(51), "author@example.invalid"),
    ] {
        let mut value = base.clone();
        value.options.commit_author_name = name.into();
        value.options.commit_author_email = email.into();
        invalid.push(value);
    }
    for branch in [
        "-flag",
        "../escape",
        "HEAD",
        "a..b",
        "with space",
        "hidden/.branch",
        "branch.lock",
        "x@{y",
    ] {
        let mut value = base.clone();
        value.options.initial_branch = branch.into();
        invalid.push(value);
    }
    let mut empty_commit = base.clone();
    empty_commit.options.commit_message.clear();
    invalid.push(empty_commit);
    let mut pattern = base.clone();
    pattern.options.custom_patterns.push("a\nb".into());
    invalid.push(pattern);
    let mut license = base.clone();
    license.options.license = License::Mit;
    invalid.push(license);
    let mut unknown = base.clone();
    unknown.options.ignore_presets.push("nonexistent".into());
    invalid.push(unknown);
    let mut homepage = base.clone();
    homepage.destination = Destination::Github;
    homepage.homepage = "https://user:secret@example.com".into();
    invalid.push(homepage);
    for request in invalid {
        assert!(generate_files(&request).is_err());
    }
    let mut local = base;
    local.homepage = "not a URL".into();
    local.topics = args(&["Not a topic"]);
    assert!(
        generate_files(&local).is_ok(),
        "Hidden GitHub fields must not block local creation"
    );
}

#[test]
fn presets_can_be_saved_loaded_renamed_and_deleted_with_atomic_persistence() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("preferences.json");
    let mut preferences = Preferences::new(temp.path().canonicalize().unwrap());
    preferences.appearance = Appearance::Dark;
    let configuration = Configuration {
        readme: Readme::Custom,
        options: ProjectOptions {
            initial_branch: "develop".into(),
            ignore_presets: args(&["python", "secrets"]),
            ..Default::default()
        },
        ..Default::default()
    };
    let id = preferences
        .save_preset("Python tools".into(), configuration)
        .unwrap();
    preferences.save(&file).unwrap();
    let mut loaded = Preferences::load(&file, temp.path().into());
    assert_eq!(loaded.appearance, Appearance::Dark);
    assert_eq!(
        loaded.custom_presets[0]
            .configuration
            .options
            .initial_branch,
        "develop"
    );
    loaded.rename_preset(&id, "Python utilities").unwrap();
    assert_eq!(loaded.custom_presets[0].name, "Python utilities");
    assert!(loaded
        .save_preset("Python utilities".into(), Configuration::default())
        .is_err());
    loaded.delete_preset(&id).unwrap();
    loaded.save(&file).unwrap();
    assert!(Preferences::load(&file, temp.path().into())
        .custom_presets
        .is_empty());
    assert!(
        loaded.delete_preset("default").is_err(),
        "Built-ins must not be deleted"
    );
}

#[test]
fn fresh_ignore_defaults_are_safe_without_overriding_saved_choices() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("preferences.json");
    let fresh = Preferences::load(&file, temp.path().into());
    assert_eq!(
        fresh.defaults.options.ignore_presets,
        args(&["os", "secrets"])
    );
    let rules = render_gitignore(&fresh.defaults.options).unwrap();
    for pattern in [
        ".DS_Store",
        "Thumbs.db",
        "Desktop.ini",
        ".env",
        ".env.*",
        "!.env.example",
        "!.env.sample",
        "!.env.template",
    ] {
        assert!(
            rules.lines().any(|line| line == pattern),
            "Missing {pattern}"
        );
    }
    let missing: Configuration = serde_json::from_str(r#"{"options":{}}"#).unwrap();
    assert_eq!(missing.options.ignore_presets, args(&["os", "secrets"]));
    let explicit: Configuration =
        serde_json::from_str(r#"{"options":{"ignorePresets":[]}}"#).unwrap();
    assert!(explicit.options.ignore_presets.is_empty());

    for choice in [vec![], args(&["rust"])] {
        let mut preferences = Preferences::new(temp.path().into());
        preferences.defaults.options.ignore_presets = choice.clone();
        preferences
            .save_preset("My explicit choices".into(), preferences.defaults.clone())
            .unwrap();
        preferences.save(&file).unwrap();
        let restored = Preferences::load(&file, temp.path().into());
        assert_eq!(restored.defaults.options.ignore_presets, choice);
        assert_eq!(
            restored.custom_presets[0]
                .configuration
                .options
                .ignore_presets,
            choice
        );
    }
}

#[test]
fn settings_migrate_v1_and_survive_malformed_fields_and_future_versions() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("preferences.json");
    fs::write(
        &file,
        serde_json::json!({ "parentPath": temp.path(), "destination": "github" }).to_string(),
    )
    .unwrap();
    let legacy = Preferences::load(&file, temp.path().into());
    assert_eq!(legacy.destination, Destination::Github);
    assert_eq!(legacy.parent_path, temp.path().canonicalize().unwrap());
    assert_eq!(legacy.schema_version, 5);
    assert_eq!(legacy.defaults.options.initial_branch, "main");
    fs::write(&file, serde_json::json!({ "schemaVersion": 2, "parentPath": temp.path(), "destination": "github", "appearance": 50, "customPresets": [ {"id":"bad"} ], "defaults": { "options": {"initialBranch":"-unsafe"} } }).to_string()).unwrap();
    let partial = Preferences::load(&file, temp.path().into());
    assert_eq!(partial.destination, Destination::Github);
    assert_eq!(partial.appearance, Appearance::System);
    assert!(partial.custom_presets.is_empty());
    assert_eq!(partial.defaults.options.initial_branch, "main");
    fs::write(&file, "broken json").unwrap();
    let broken = Preferences::load(&file, temp.path().into());
    broken.save(&file).unwrap();
    assert_eq!(
        fs::read_to_string(file.with_extension("json.bak")).unwrap(),
        "broken json"
    );
    fs::write(&file, "{\"schemaVersion\":999}").unwrap();
    let future = Preferences::load(&file, temp.path().into());
    assert!(future.save(&file).is_err());
    assert_eq!(
        fs::read_to_string(&file).unwrap(),
        "{\"schemaVersion\":999}"
    );
}

#[test]
fn built_in_presets_and_github_metadata_are_conservative_and_argument_safe() {
    let presets = crate::config::built_in_presets();
    let tauri = presets.iter().find(|p| p.id == "tauri").unwrap();
    assert!(tauri
        .configuration
        .options
        .ignore_presets
        .contains(&"node".into()));
    assert!(tauri
        .configuration
        .options
        .ignore_presets
        .contains(&"rust".into()));
    let blank = presets.iter().find(|p| p.id == "blank").unwrap();
    assert_eq!(blank.configuration.readme, Readme::None);
    assert!(blank.configuration.options.ignore_presets.is_empty());
    let mut request = request(Readme::None);
    request.homepage = "https://example.com/path?q=1&b=2".into();
    request.topics = args(&["desktop", "developer-tools"]);
    assert_eq!(
        github::metadata_args(&request, "example-org"),
        args(&[
            "repo",
            "edit",
            "example-org/test-project",
            "--homepage",
            "https://example.com/path?q=1&b=2",
            "--add-topic",
            "desktop",
            "--add-topic",
            "developer-tools"
        ])
    );
    assert_eq!(
        github::push_args("feature/start")
            .last()
            .map(String::as_str),
        Some("feature/start")
    );
}

#[test]
fn organisation_publication_sets_custom_remote_default_branch_and_preserves_account() {
    let temp = tempfile::tempdir().unwrap();
    let mut pending = pending(&temp);
    pending.owner = Some("example-org".into());
    pending.request.options.initial_branch = "work/start".into();
    let runner = FakeGithub {
        branch: Some("work/start".into()),
        ..Default::default()
    };
    repository::publish(&runner, &mut pending, &|_| {}).unwrap();
    let calls = runner.calls.lock().unwrap();
    assert!(calls
        .iter()
        .any(|(_, a)| a == &github::default_branch_args(&pending.request, "example-org")));
    assert!(calls
        .iter()
        .any(|(_, a)| a.contains(&"refs/heads/work/start".into())));
    assert_eq!(
        pending.result().github_url.as_deref(),
        Some("https://github.com/example-org/test-project")
    );
    assert_eq!(pending.authenticated_user.as_deref(), Some("octocat"));
}

#[test]
fn default_branch_configuration_failure_remains_recoverable_after_a_verified_push() {
    let temp = tempfile::tempdir().unwrap();
    let mut pending = pending(&temp);
    let error = repository::publish(
        &FakeGithub {
            fail_default_branch: true,
            ..Default::default()
        },
        &mut pending,
        &|_| {},
    )
    .unwrap_err();
    let failure = pending.failure(error);
    assert!(failure.message.contains("default branch"));
    assert!(failure.can_retry && failure.local_ready && failure.github_url.is_some());
    repository::publish(&FakeGithub::default(), &mut pending, &|_| {}).unwrap();
}
