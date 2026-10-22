//! Local project preferences and explicit, reviewed command definitions.
use crate::{
    handoff::{self, RecentProject},
    launcher::LauncherPreferences,
    model::AppError,
    process::{args, Program, Runner, SystemRunner},
    technologies::ProjectTechnologies,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectCommand {
    pub id: String,
    pub name: String,
    pub category: String,
    pub mode: String,
    pub executable: String,
    pub args: Vec<String>,
    pub shell_command: String,
    pub working_directory: String,
    pub environment: BTreeMap<String, String>,
    pub description: String,
    pub enabled: bool,
    pub imported: bool,
}
impl Default for ProjectCommand {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            category: "custom".into(),
            mode: "executable".into(),
            executable: String::new(),
            args: Vec::new(),
            shell_command: String::new(),
            working_directory: ".".into(),
            environment: BTreeMap::new(),
            description: String::new(),
            enabled: true,
            imported: false,
        }
    }
}
pub(crate) fn error(message: impl Into<String>) -> AppError {
    AppError::new(
        message,
        "Review this project's settings and try again. No command ran automatically.",
    )
}
fn bounded(value: &str, maximum: usize) -> bool {
    value.len() <= maximum && !value.contains('\0')
}
pub fn validate_commands(commands: &[ProjectCommand]) -> Result<(), AppError> {
    if commands.len() > 64 {
        return Err(error("A project supports up to 64 commands."));
    }
    let mut ids = HashSet::new();
    for command in commands {
        if command.id.is_empty()
            || command.id.len() > 80
            || !command
                .id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c))
            || !ids.insert(&command.id)
            || command.name.trim().is_empty()
            || !bounded(&command.name, 120)
            || ![
                "setup",
                "development",
                "build",
                "test",
                "lint",
                "deploy",
                "custom",
            ]
            .contains(&command.category.as_str())
            || !["executable", "shell"].contains(&command.mode.as_str())
            || !bounded(&command.executable, 32000)
            || !bounded(&command.shell_command, 16000)
            || !bounded(&command.working_directory, 32000)
            || !bounded(&command.description, 2000)
            || command.args.len() > 128
            || command.args.iter().any(|value| !bounded(value, 8000))
            || command.environment.len() > 32
        {
            return Err(error(
                "A command contains invalid or oversized fields, or a duplicate ID.",
            ));
        }
        if command.mode == "executable"
            && (command.executable.trim().is_empty()
                || command.executable.starts_with('-')
                || command.executable.contains(['\r', '\n']))
        {
            return Err(error(
                "Choose an executable and put each argument in the arguments list.",
            ));
        }
        if command.mode == "shell" && command.shell_command.trim().is_empty() {
            return Err(error("Enter the shell command to run."));
        }
        for (key, value) in &command.environment {
            let upper = key.to_ascii_uppercase();
            if key.is_empty()
                || key.len() > 120
                || !key.bytes().enumerate().all(|(i, c)| {
                    c.is_ascii_alphabetic() || c == b'_' || (i > 0 && c.is_ascii_digit())
                })
                || !bounded(value, 4000)
            {
                return Err(error(
                    "Environment names must be identifiers and values must be bounded text.",
                ));
            }
            if [
                "TOKEN",
                "PASSWORD",
                "SECRET",
                "CREDENTIAL",
                "PRIVATE_KEY",
                "API_KEY",
                "ACCESS_KEY",
                "AUTHORIZATION",
            ]
            .iter()
            .any(|part| upper.contains(part))
            {
                return Err(error("Keep credentials in your operating-system environment; secret overrides are not saved."));
            }
        }
    }
    Ok(())
}
pub fn portable_commands(commands: &[ProjectCommand]) -> Vec<ProjectCommand> {
    commands
        .iter()
        .cloned()
        .map(|mut command| {
            command.environment.clear();
            command.imported = true;
            if portable_absolute(&command.working_directory) {
                command.working_directory = ".".into();
            }
            command
        })
        .collect()
}
fn portable_absolute(value: &str) -> bool {
    value.starts_with(['/', '\\']) || value.as_bytes().get(1) == Some(&b':')
}
pub fn mark_imported(commands: &mut [ProjectCommand]) {
    for command in commands {
        command.imported = true;
        command.environment.clear();
    }
}
pub(crate) fn project_directory(project: &RecentProject) -> Result<PathBuf, AppError> {
    handoff::existing_project_folder(&project.context.local_path)
}
pub(crate) fn command_directory(
    project: &Path,
    command: &ProjectCommand,
) -> Result<PathBuf, AppError> {
    let requested = Path::new(&command.working_directory);
    let path = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        project.join(requested)
    };
    path.canonicalize()
        .ok()
        .filter(|p| p.is_dir())
        .ok_or_else(|| error("The command working directory does not exist or cannot be accessed."))
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorkspace {
    project: RecentProject,
    exists: bool,
    git_status: String,
    branch: String,
}

fn read_only_status_arguments(runner: &dyn Runner, directory: &Path) -> Option<Vec<String>> {
    // Hashing tracked content can invoke clean/process filters. Read key names
    // only: effective configuration values may contain credentials.
    let configuration = runner
        .run(
            Program::Git,
            &args(&["config", "--null", "--name-only", "--includes", "--list"]),
            directory,
        )
        .ok()?;
    if !configuration.success
        || configuration.stdout.len() >= 1024 * 1024
        || (!configuration.stdout.is_empty() && !configuration.stdout.ends_with('\0'))
    {
        return None;
    }
    let mut drivers = BTreeSet::new();
    for key in configuration
        .stdout
        .split('\0')
        .filter(|key| !key.is_empty())
    {
        if let Some(key) = key.strip_prefix("filter.") {
            let (driver, _) = key.rsplit_once('.')?;
            // Fail closed when a subsection cannot be represented unambiguously
            // in a structured Git -c key. No configuration value is evaluated.
            if driver.is_empty()
                || driver.len() > 512
                || !driver
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"-_./".contains(&c))
            {
                return None;
            }
            drivers.insert(driver);
        }
    }
    if drivers.len() > 128 {
        return None;
    }
    let mut arguments = args(&["--no-optional-locks", "-c", "core.fsmonitor=false"]);
    for driver in drivers {
        for setting in ["clean=", "process=", "required=false"] {
            arguments.extend(["-c".into(), format!("filter.{driver}.{setting}")]);
        }
    }
    // Submodules have separate local configuration, outside this enumeration.
    arguments.extend(args(&[
        "status",
        "--porcelain=v1",
        "--untracked-files=normal",
        "--ignore-submodules=all",
    ]));
    Some(arguments)
}
fn read_only_status(runner: &dyn Runner, directory: &Path) -> Option<crate::process::Output> {
    runner
        .run(
            Program::Git,
            &read_only_status_arguments(runner, directory)?,
            directory,
        )
        .ok()
}

#[tauri::command(async)]
pub fn get_project_workspace(
    id: String,
    app: tauri::AppHandle,
) -> Result<ProjectWorkspace, AppError> {
    let project = handoff::find_project(&app, &id)?;
    let Ok(path) = project_directory(&project) else {
        return Ok(ProjectWorkspace {
            branch: project.context.branch.clone(),
            project,
            exists: false,
            git_status: "missing".into(),
        });
    };
    let status = read_only_status(&SystemRunner, &path);
    let git_status = match status {
        Some(value) if value.success => {
            if value.stdout.is_empty() {
                "clean"
            } else {
                "changes"
            }
        }
        _ => "unavailable",
    }
    .into();
    let branch = SystemRunner
        .run(Program::Git, &args(&["branch", "--show-current"]), &path)
        .ok()
        .filter(|o| o.success)
        .map_or_else(
            || project.context.branch.clone(),
            |o| {
                if o.stdout.is_empty() {
                    "detached HEAD".into()
                } else {
                    o.stdout
                }
            },
        );
    let project = handoff::update_project(&app, &id, |project| {
        project.last_opened_at = handoff::now_seconds();
        project.context.branch = branch.clone();
        Ok(())
    })?;
    Ok(ProjectWorkspace {
        project,
        exists: true,
        git_status,
        branch,
    })
}

#[tauri::command]
pub async fn add_existing_project(
    path: Option<String>,
    app: tauri::AppHandle,
) -> Result<Option<RecentProject>, AppError> {
    let path = match path {
        Some(path) => PathBuf::from(path),
        None => {
            let Some(folder) = rfd::AsyncFileDialog::new()
                .set_title("Add an existing Git repository")
                .pick_folder()
                .await
            else {
                return Ok(None);
            };
            folder.path().to_path_buf()
        }
    };
    tauri::async_runtime::spawn_blocking(move || handoff::add_existing(&app, &path).map(Some))
        .await
        .map_err(|_| error("Could not inspect this repository."))?
}
#[tauri::command]
pub async fn relocate_project(
    id: String,
    app: tauri::AppHandle,
) -> Result<Option<RecentProject>, AppError> {
    let project = handoff::find_project(&app, &id)?;
    let Some(folder) = rfd::AsyncFileDialog::new()
        .set_title("Find the moved Git repository")
        .set_directory(&project.context.local_path)
        .pick_folder()
        .await
    else {
        return Ok(None);
    };
    let path = folder.path().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || handoff::relocate(&app, &id, &path).map(Some))
        .await
        .map_err(|_| error("Could not inspect this repository."))?
}
#[tauri::command(async)]
pub fn save_project_settings(
    id: String,
    pinned: bool,
    technologies: ProjectTechnologies,
    launcher: LauncherPreferences,
    app: tauri::AppHandle,
) -> Result<RecentProject, AppError> {
    crate::technologies::validate(&technologies)?;
    crate::launcher::validate(&launcher)?;
    handoff::update_project(&app, &id, |project| {
        project.pinned = pinned;
        project.context.language = crate::technologies::summary(&technologies);
        project.context.brief.technologies = project.context.language.clone();
        project.technologies = technologies;
        project.launcher = launcher;
        Ok(())
    })
}
#[tauri::command(async)]
pub fn save_project_commands(
    id: String,
    mut commands: Vec<ProjectCommand>,
    app: tauri::AppHandle,
) -> Result<RecentProject, AppError> {
    validate_commands(&commands)?;
    handoff::update_project(&app, &id, |project| {
        for command in &mut commands {
            if project
                .commands
                .iter()
                .any(|old| old.id == command.id && old.imported)
            {
                command.imported = true;
            }
            if project_directory(project).is_ok() {
                command_directory(&project_directory(project)?, command)?;
            }
        }
        project.commands = commands;
        Ok(())
    })
}
fn manifest(path: &Path) -> Option<String> {
    let mut content = String::new();
    fs::File::open(path)
        .ok()?
        .take(1024 * 1024 + 1)
        .read_to_string(&mut content)
        .ok()?;
    (content.len() <= 1024 * 1024).then_some(content)
}
pub(crate) fn suggestions(directory: &Path) -> Vec<ProjectCommand> {
    let mut commands = Vec::new();
    if let Some(value) = manifest(&directory.join("package.json"))
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
    {
        if let Some(scripts) = value.get("scripts").and_then(|value| value.as_object()) {
            let manager = if directory.join("pnpm-lock.yaml").is_file() {
                "pnpm"
            } else if directory.join("yarn.lock").is_file() {
                "yarn"
            } else if directory.join("bun.lock").is_file() || directory.join("bun.lockb").is_file()
            {
                "bun"
            } else {
                "npm"
            };
            for (index, (name, value)) in scripts
                .iter()
                .filter(|(name, value)| {
                    name.len() <= 100 && !name.starts_with('-') && value.is_string()
                })
                .take(48)
                .enumerate()
            {
                commands.push(ProjectCommand {
                    id: format!("package-{index}"),
                    name: format!("{manager} run {name}"),
                    category: match name.as_str() {
                        "dev" | "start" | "serve" | "preview" => "development",
                        "build" => "build",
                        "test" => "test",
                        "lint" | "check" | "format" => "lint",
                        "deploy" | "publish" => "deploy",
                        _ => "custom",
                    }
                    .into(),
                    executable: manager.into(),
                    args: vec!["run".into(), name.clone()],
                    imported: true,
                    description: value
                        .as_str()
                        .unwrap_or_default()
                        .chars()
                        .take(1000)
                        .collect(),
                    ..ProjectCommand::default()
                });
            }
        }
    }
    if manifest(&directory.join("Cargo.toml"))
        .and_then(|text| toml::from_str::<toml::Value>(&text).ok())
        .is_some_and(|value| value.get("package").is_some() || value.get("workspace").is_some())
    {
        for name in ["build", "test", "check"] {
            commands.push(ProjectCommand {
                id: format!("cargo-{name}"),
                name: format!("cargo {name}"),
                category: if name == "check" { "lint" } else { name }.into(),
                executable: "cargo".into(),
                args: vec![name.into()],
                imported: true,
                ..ProjectCommand::default()
            });
        }
    }
    if manifest(&directory.join("pyproject.toml"))
        .and_then(|text| toml::from_str::<toml::Value>(&text).ok())
        .is_some_and(|value| {
            value
                .get("tool")
                .and_then(|tool| tool.get("pytest"))
                .is_some()
        })
        || directory.join("pytest.ini").is_file()
    {
        commands.push(ProjectCommand {
            id: "python-pytest".into(),
            name: "Python tests".into(),
            category: "test".into(),
            executable: if cfg!(windows) { "python" } else { "python3" }.into(),
            args: vec!["-m".into(), "pytest".into()],
            imported: true,
            ..ProjectCommand::default()
        });
    }
    commands
}
#[tauri::command(async)]
pub fn suggest_project_commands(
    id: String,
    app: tauri::AppHandle,
) -> Result<Vec<ProjectCommand>, AppError> {
    let project = handoff::find_project(&app, &id)?;
    Ok(suggestions(&project_directory(&project)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn example() -> ProjectCommand {
        ProjectCommand {
            id: "test".into(),
            name: "Run test".into(),
            executable: "git".into(),
            ..ProjectCommand::default()
        }
    }
    #[test]
    fn definitions_are_bounded_and_exports_omit_environment() {
        let mut command = example();
        command.environment.insert("NODE_ENV".into(), "test".into());
        assert!(validate_commands(&[command.clone()]).is_ok());
        assert!(portable_commands(&[command.clone()])[0]
            .environment
            .is_empty());
        assert!(portable_commands(&[command.clone()])[0].imported);
        command
            .environment
            .insert("API_TOKEN".into(), "sensitive".into());
        assert!(validate_commands(&[command]).is_err());
        assert!(validate_commands(&[example(), example()]).is_err());
    }
    #[test]
    fn discovery_reads_manifests_without_execution_or_invented_scripts() {
        let dir = tempfile::tempdir().unwrap();
        assert!(suggestions(dir.path()).is_empty());
        fs::write(
            dir.path().join("package.json"),
            r#"{"scripts":{"dev":"echo no execution","build":"vite build"}}"#,
        )
        .unwrap();
        fs::write(
            dir.path().join("Cargo.toml"),
            "[package]\nname = 'example'\nversion = '0.1.0'\n",
        )
        .unwrap();
        let values = suggestions(dir.path());
        assert_eq!(values.len(), 5);
        assert!(values.iter().all(|command| command.imported));
        assert_eq!(values[0].args, ["run", "build"]);
        assert!(validate_commands(&values).is_ok());
    }
    #[test]
    fn directories_support_unicode_and_reject_missing_paths() {
        let dir = tempfile::tempdir().unwrap();
        let child = dir.path().join("project spaces 🦀");
        fs::create_dir(&child).unwrap();
        let mut command = example();
        command.working_directory = "project spaces 🦀".into();
        assert_eq!(
            command_directory(dir.path(), &command).unwrap(),
            child.canonicalize().unwrap()
        );
        command.working_directory = "missing".into();
        assert!(command_directory(dir.path(), &command).is_err());
    }
    #[test]
    fn workspace_status_never_runs_repository_filters_or_writes_the_index() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        let git = |values: &[&str]| {
            let output = SystemRunner.run(Program::Git, &args(values), root).unwrap();
            assert!(output.success);
            output
        };
        git(&["init", "--initial-branch=main"]);
        fs::write(
            root.join(".gitattributes"),
            "tracked.txt filter=untrusted\n",
        )
        .unwrap();
        fs::write(root.join("tracked.txt"), "original\n").unwrap();
        git(&["add", "--all"]);
        let index = fs::read(root.join(".git/index")).unwrap();
        // Equal byte length forces content hashing rather than the fast
        // size-change check. Establish a positive control for the fixture.
        fs::write(root.join("tracked.txt"), "modified\n").unwrap();
        git(&[
            "config",
            "filter.untrusted.clean",
            "touch clean-filter-ran; cat",
        ]);
        git(&["config", "filter.untrusted.required", "true"]);
        git(&[
            "--no-optional-locks",
            "-c",
            "core.fsmonitor=false",
            "status",
            "--porcelain=v1",
            "--ignore-submodules=all",
        ]);
        assert!(
            root.join("clean-filter-ran").exists(),
            "the control status must actually exercise Git's clean filter"
        );
        fs::remove_file(root.join("clean-filter-ran")).unwrap();
        git(&[
            "config",
            "filter.untrusted.process",
            "touch process-filter-ran; cat",
        ]);
        git(&["config", "core.fsmonitor", "touch fsmonitor-ran"]);
        let output = read_only_status(&SystemRunner, root).unwrap();
        assert!(output.success);
        assert!(output.stdout.contains("tracked.txt"));
        assert!(!root.join("clean-filter-ran").exists());
        assert!(!root.join("process-filter-ran").exists());
        assert!(!root.join("fsmonitor-ran").exists());
        assert_eq!(fs::read(root.join(".git/index")).unwrap(), index);
        git(&["config", "--unset", "filter.untrusted.process"]);
        assert!(read_only_status(&SystemRunner, root).unwrap().success);
        assert!(!root.join("clean-filter-ran").exists());
    }
    #[test]
    fn unsafe_or_incomplete_filter_configuration_fails_closed() {
        struct Fixture(&'static str);
        impl Runner for Fixture {
            fn run(
                &self,
                _: Program,
                _: &[String],
                _: &Path,
            ) -> Result<crate::process::Output, String> {
                Ok(crate::process::Output {
                    success: true,
                    stdout: self.0.into(),
                })
            }
        }
        assert!(read_only_status_arguments(
            &Fixture("filter.unsafe=driver.clean\0"),
            Path::new(".")
        )
        .is_none());
        assert!(
            read_only_status_arguments(&Fixture("filter.incomplete.clean"), Path::new("."))
                .is_none()
        );
        let arguments = read_only_status_arguments(
            &Fixture("filter.lfs.clean\0filter.lfs.process\0"),
            Path::new("."),
        )
        .unwrap();
        assert!(arguments.contains(&"filter.lfs.clean=".into()));
        assert!(arguments.contains(&"filter.lfs.process=".into()));
        assert!(arguments.contains(&"--ignore-submodules=all".into()));
    }
}
