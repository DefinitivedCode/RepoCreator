//! Local prompt dialogs and the single bounded project-library store.
use crate::model::{AppError, CreateRequest, CreatedRepo, ProjectBrief, Visibility};
use crate::{
    launcher::LauncherPreferences, technologies::ProjectTechnologies, workspace::ProjectCommand,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

const HISTORY_VERSION: u32 = 2;
const MAX_HISTORY_BYTES: usize = 4 * 1024 * 1024;
const MAX_PROJECTS: usize = 100;
static HISTORY_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HandoffContext {
    pub(crate) project_name: String,
    pub(crate) description: String,
    pub(crate) project_type: String,
    pub(crate) language: String,
    pub(crate) brief: ProjectBrief,
    pub(crate) local_path: String,
    pub(crate) repository_url: Option<String>,
    pub(crate) branch: String,
    pub(crate) agents: Vec<String>,
    pub(crate) files: Vec<String>,
    pub(crate) preset_name: String,
    pub(crate) visibility: Visibility,
    pub(crate) status: String,
    pub(crate) commit: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecentProject {
    pub(crate) id: String,
    pub(crate) created_at: u64,
    pub(crate) context: HandoffContext,
    #[serde(default)]
    pub(crate) handoff_template: Option<String>,
    #[serde(default)]
    pub(crate) last_opened_at: u64,
    #[serde(default)]
    pub(crate) pinned: bool,
    #[serde(default)]
    pub(crate) technologies: ProjectTechnologies,
    #[serde(default)]
    pub(crate) commands: Vec<ProjectCommand>,
    #[serde(default)]
    pub(crate) launcher: LauncherPreferences,
}
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct History {
    schema_version: u32,
    projects: Vec<RecentProject>,
}
fn error(message: impl Into<String>) -> AppError {
    AppError::new(
        message,
        "Your project files are unchanged. Recheck the selected location or file.",
    )
}
fn history_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    crate::data_dir(app)
        .map(|path| path.join("history.json"))
        .map_err(|_| error("The local history folder is unavailable."))
}
fn read_bounded(path: &Path, max: usize) -> Result<String, AppError> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .and_then(|file| file.take(max as u64 + 1).read_to_end(&mut bytes))
        .map_err(|_| error("Could not read the selected local file."))?;
    if bytes.len() > max || bytes.contains(&0) {
        return Err(error(format!(
            "The selected file must be text no larger than {max} bytes."
        )));
    }
    String::from_utf8(bytes).map_err(|_| error("Choose a UTF-8 text file."))
}
fn read_history(file: &Path) -> Result<History, AppError> {
    if !file.exists() {
        return Ok(History {
            schema_version: HISTORY_VERSION,
            projects: Vec::new(),
        });
    }
    let mut history: History = serde_json::from_str(&read_bounded(file, MAX_HISTORY_BYTES)?)
        .map_err(|_| {
            error("Recent-project history could not be read. The existing file was kept.")
        })?;
    if ![1, HISTORY_VERSION].contains(&history.schema_version)
        || history.projects.len() > MAX_PROJECTS
    {
        return Err(error("Recent-project history uses an unsupported version or exceeds its limit. The existing file was kept."));
    }
    if history.schema_version == 1 {
        for project in &mut history.projects {
            project.last_opened_at = project.created_at;
            let mut brief = project.context.brief.clone();
            if brief.technologies.is_empty() {
                brief.technologies = project.context.language.clone();
            }
            project.technologies =
                crate::technologies::effective(&crate::config::ProjectOptions::default(), &brief);
        }
        history.schema_version = HISTORY_VERSION;
    }
    let mut seen_ids = std::collections::HashSet::new();
    if history.projects.iter().any(|project| {
        project.id.is_empty()
            || project.id.len() > 80
            || !project
                .id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"-_".contains(&byte))
            || !seen_ids.insert(project.id.clone())
            || !["created", "imported"].contains(&project.context.status.as_str())
            || project.context.local_path.is_empty()
            || project.context.local_path.len() > 32000
            || project.context.local_path.contains('\0')
            || project.context.project_name.chars().count() > 100
            || project.context.description.len() > 1400
            || project.context.preset_name.len() > 240
            || crate::technologies::validate(&project.technologies).is_err()
            || crate::workspace::validate_commands(&project.commands).is_err()
            || crate::launcher::validate_stored(&project.launcher).is_err()
            || project.context.agents.len() > 6
            || project.context.agents.iter().any(|agent| {
                !["codex", "claude", "copilot", "cursor", "gemini", "opencode"]
                    .contains(&agent.as_str())
            })
            || project
                .context
                .repository_url
                .as_ref()
                .is_some_and(|url| !valid_repository_url(url))
            || crate::model::validate_brief(
                &project.context.brief,
                project.handoff_template.as_deref().unwrap_or("discovery"),
            )
            .is_err()
            || project.context.files.len() > 1000
            || project.context.files.iter().any(|file| {
                file.len() > 1000
                    || file.contains('\0')
                    || Path::new(file).is_absolute()
                    || file
                        .split(['/', '\\'])
                        .any(|part| part == ".." || part.is_empty())
            })
    }) {
        return Err(error(
            "Recent-project history contains invalid entries. The existing file was kept.",
        ));
    }
    Ok(history)
}
fn write_history(file: &Path, history: &History) -> Result<(), AppError> {
    let parent = file
        .parent()
        .ok_or_else(|| error("The local history folder is unavailable."))?;
    fs::create_dir_all(parent).map_err(|_| error("Could not create the local history folder."))?;
    let bytes = serde_json::to_vec_pretty(history)
        .map_err(|_| error("Could not encode project history."))?;
    if bytes.len() > MAX_HISTORY_BYTES {
        return Err(error("Project history exceeds its 4 MiB storage limit."));
    }
    // Keep the exact pre-upgrade history before the first v2 write. Unsupported
    // and malformed files never reach this function through a mutation.
    if file.exists() {
        let old = read_bounded(file, MAX_HISTORY_BYTES)?;
        if serde_json::from_str::<serde_json::Value>(&old)
            .ok()
            .and_then(|v| v.get("schemaVersion").and_then(|n| n.as_u64()))
            == Some(1)
        {
            let backup = file.with_extension("v1.backup.json");
            if !backup.exists() {
                let mut saved = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&backup)
                    .map_err(|_| {
                        error(
                            "Could not back up legacy project history. The existing file was kept.",
                        )
                    })?;
                saved
                    .write_all(old.as_bytes())
                    .and_then(|_| saved.sync_all())
                    .map_err(|_| {
                        error("Could not finish the history backup. The existing file was kept.")
                    })?;
            }
        }
    }
    let mut temp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|_| error("Could not create a history file."))?;
    temp.write_all(&bytes)
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|_| error("Could not finish saving project history."))?;
    temp.persist(file).map_err(|failure| {
        error(format!(
            "Could not replace project history: {}",
            failure.error
        ))
    })?;
    Ok(())
}

/// Called only after successful local creation and, when requested, confirmed publishing.
/// A failure to remember history must be reported as a warning, never creation failure.
pub fn record_recent(
    app: &tauri::AppHandle,
    result: &CreatedRepo,
    request: &CreateRequest,
    preset_name: &str,
) -> Result<(), String> {
    let _guard = HISTORY_LOCK
        .lock()
        .map_err(|_| "Could not access project history.".to_string())?;
    let file = history_path(app).map_err(|e| e.message)?;
    let mut history = read_history(&file).map_err(|e| e.message)?;
    ensure_library_capacity(&history, Path::new(&result.path)).map_err(|e| e.message)?;
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    remember_result(&mut history, result, request, preset_name, time);
    write_history(&file, &history).map_err(|e| e.message)
}

fn remember_result(
    history: &mut History,
    result: &CreatedRepo,
    request: &CreateRequest,
    preset_name: &str,
    time: std::time::Duration,
) {
    let technologies = crate::technologies::effective(&request.options, &request.brief);
    let mut brief = request.brief.clone();
    brief.technologies = crate::technologies::summary(&technologies);
    let context = HandoffContext {
        project_name: result.name.clone(),
        description: request.description.clone(),
        project_type: if preset_name.is_empty() {
            "Not specified".into()
        } else {
            preset_name.into()
        },
        language: crate::technologies::summary(&technologies),
        brief,
        local_path: result.path.clone(),
        repository_url: result.github_url.clone(),
        branch: result.branch.clone(),
        agents: if request.options.ai.enabled {
            request
                .options
                .ai
                .agents
                .iter()
                .map(|agent| format!("{agent:?}").to_lowercase())
                .collect()
        } else {
            Vec::new()
        },
        files: result.files.clone(),
        preset_name: preset_name.into(),
        visibility: request.visibility,
        status: "created".into(),
        commit: Some(result.commit.clone()),
    };
    history.projects.retain(|entry| {
        path_identity(Path::new(&entry.context.local_path))
            != path_identity(Path::new(&context.local_path))
    });
    history.projects.insert(
        0,
        RecentProject {
            id: format!("project-{}", time.as_nanos()),
            created_at: time.as_secs(),
            context,
            handoff_template: Some(request.handoff_template.clone()),
            last_opened_at: time.as_secs(),
            pinned: false,
            technologies,
            commands: request.options.commands.clone(),
            launcher: LauncherPreferences::default(),
        },
    );
    trim_history(history);
}

pub(crate) fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn path_identity(path: &Path) -> String {
    let path = path
        .canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .into_owned();
    if cfg!(windows) {
        path.to_lowercase()
    } else {
        path
    }
}
fn trim_history(history: &mut History) {
    while history.projects.len() > MAX_PROJECTS {
        let index = history
            .projects
            .iter()
            .rposition(|project| !project.pinned)
            .unwrap_or(history.projects.len() - 1);
        history.projects.remove(index);
    }
}
fn ensure_library_capacity(history: &History, directory: &Path) -> Result<(), AppError> {
    if history.projects.len() >= MAX_PROJECTS
        && history.projects.iter().all(|project| project.pinned)
        && !history.projects.iter().any(|project| {
            path_identity(Path::new(&project.context.local_path)) == path_identity(directory)
        })
    {
        return Err(error("The project library is full of pinned projects. Unpin or remove an entry before adding another; existing project folders are unchanged."));
    }
    Ok(())
}
pub(crate) fn find_project(app: &tauri::AppHandle, id: &str) -> Result<RecentProject, AppError> {
    let _guard = HISTORY_LOCK
        .lock()
        .map_err(|_| error("Could not access project history."))?;
    read_history(&history_path(app)?)?
        .projects
        .into_iter()
        .find(|project| project.id == id)
        .ok_or_else(|| error("This project is unavailable in the local library."))
}
pub(crate) fn update_project(
    app: &tauri::AppHandle,
    id: &str,
    update: impl FnOnce(&mut RecentProject) -> Result<(), AppError>,
) -> Result<RecentProject, AppError> {
    let _guard = HISTORY_LOCK
        .lock()
        .map_err(|_| error("Could not access project history."))?;
    let file = history_path(app)?;
    let mut history = read_history(&file)?;
    let project = history
        .projects
        .iter_mut()
        .find(|project| project.id == id)
        .ok_or_else(|| error("This project is unavailable in the local library."))?;
    update(project)?;
    let project = project.clone();
    write_history(&file, &history)?;
    Ok(project)
}
fn inspect_repository(path: &Path) -> Result<(PathBuf, String, Option<String>), AppError> {
    use crate::process::{args, Program, Runner, SystemRunner};
    if !path.is_absolute() {
        return Err(error(
            "Choose the absolute path of an existing Git repository.",
        ));
    }
    let path = existing_project_folder(
        path.to_str()
            .ok_or_else(|| error("Choose a UTF-8 project path."))?,
    )?;
    let output = SystemRunner
        .run(
            Program::Git,
            &args(&["rev-parse", "--show-toplevel"]),
            &path,
        )
        .ok()
        .filter(|output| output.success)
        .ok_or_else(|| error("Choose an existing local Git working directory."))?;
    let root = Path::new(&output.stdout)
        .canonicalize()
        .map_err(|_| error("Could not locate this Git repository."))?;
    if path_identity(&root) != path_identity(&path) {
        return Err(error(
            "Choose the repository root, rather than one of its subdirectories.",
        ));
    }
    let branch = SystemRunner
        .run(Program::Git, &args(&["branch", "--show-current"]), &path)
        .ok()
        .filter(|o| o.success)
        .map_or_else(String::new, |o| o.stdout);
    let remote = SystemRunner
        .run(Program::Git, &args(&["remote", "get-url", "origin"]), &path)
        .ok()
        .filter(|o| o.success)
        .and_then(|o| github_remote(&o.stdout));
    Ok((path, branch, remote))
}
fn github_remote(value: &str) -> Option<String> {
    let value = value.strip_suffix(".git").unwrap_or(value);
    let value = value.strip_prefix("git@github.com:").map_or_else(
        || value.to_string(),
        |path| format!("https://github.com/{path}"),
    );
    valid_repository_url(&value).then_some(value)
}
pub(crate) fn add_existing(app: &tauri::AppHandle, path: &Path) -> Result<RecentProject, AppError> {
    let (path, branch, repository_url) = inspect_repository(path)?;
    let _guard = HISTORY_LOCK
        .lock()
        .map_err(|_| error("Could not access project history."))?;
    let file = history_path(app)?;
    let mut history = read_history(&file)?;
    ensure_library_capacity(&history, &path)?;
    let project = import_repository(&mut history, &path, branch, repository_url);
    write_history(&file, &history)?;
    Ok(project)
}
fn import_repository(
    history: &mut History,
    path: &Path,
    branch: String,
    repository_url: Option<String>,
) -> RecentProject {
    if let Some(project) = history.projects.iter_mut().find(|project| {
        path_identity(Path::new(&project.context.local_path)) == path_identity(path)
    }) {
        project.last_opened_at = now_seconds();
        return project.clone();
    }
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let project = RecentProject {
        id: format!("project-{}", time.as_nanos()),
        created_at: time.as_secs(),
        last_opened_at: time.as_secs(),
        pinned: false,
        technologies: ProjectTechnologies::default(),
        commands: Vec::new(),
        launcher: LauncherPreferences::default(),
        handoff_template: None,
        context: HandoffContext {
            project_name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .chars()
                .take(100)
                .collect(),
            description: String::new(),
            project_type: "Existing repository".into(),
            language: String::new(),
            brief: ProjectBrief::default(),
            local_path: path.to_string_lossy().into_owned(),
            repository_url,
            branch,
            agents: Vec::new(),
            files: Vec::new(),
            preset_name: String::new(),
            visibility: Visibility::Private,
            status: "imported".into(),
            commit: None,
        },
    };
    history.projects.insert(0, project.clone());
    trim_history(history);
    project
}
pub(crate) fn relocate(
    app: &tauri::AppHandle,
    id: &str,
    path: &Path,
) -> Result<RecentProject, AppError> {
    let (path, branch, repository_url) = inspect_repository(path)?;
    let _guard = HISTORY_LOCK
        .lock()
        .map_err(|_| error("Could not access project history."))?;
    let file = history_path(app)?;
    let mut history = read_history(&file)?;
    if history.projects.iter().any(|project| {
        project.id != id
            && path_identity(Path::new(&project.context.local_path)) == path_identity(&path)
    }) {
        return Err(error("This directory is already in the project library."));
    }
    let project = history
        .projects
        .iter_mut()
        .find(|project| project.id == id)
        .ok_or_else(|| error("This project is unavailable."))?;
    project.context.local_path = path.to_string_lossy().into_owned();
    project.context.branch = branch;
    project.context.repository_url = repository_url;
    project.last_opened_at = now_seconds();
    let project = project.clone();
    write_history(&file, &history)?;
    Ok(project)
}

#[tauri::command(async)]
pub fn list_recent_projects(app: tauri::AppHandle) -> Result<Vec<RecentProject>, AppError> {
    let _guard = HISTORY_LOCK
        .lock()
        .map_err(|_| error("Could not access project history."))?;
    Ok(read_history(&history_path(&app)?)?.projects)
}
#[tauri::command(async)]
pub fn remove_recent_project(
    id: String,
    app: tauri::AppHandle,
) -> Result<Vec<RecentProject>, AppError> {
    let _guard = HISTORY_LOCK
        .lock()
        .map_err(|_| error("Could not access project history."))?;
    let file = history_path(&app)?;
    let mut history = read_history(&file)?;
    history.projects.retain(|entry| entry.id != id);
    write_history(&file, &history)?;
    Ok(history.projects)
}
#[tauri::command(async)]
pub fn open_recent_project(
    id: String,
    target: String,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    let entry = {
        let _guard = HISTORY_LOCK
            .lock()
            .map_err(|_| error("Could not access project history."))?;
        read_history(&history_path(&app)?)?
            .projects
            .into_iter()
            .find(|entry| entry.id == id)
            .ok_or_else(|| error("This recent project is unavailable."))?
    };
    let result = match target.as_str() {
        "folder" => {
            let path = existing_project_folder(&entry.context.local_path)?;
            open::that(path).map_err(|_| error("Could not open the project folder."))
        }
        "github" => {
            let url = entry
                .context
                .repository_url
                .filter(|value| valid_repository_url(value))
                .ok_or_else(|| error("No confirmed GitHub URL is available for this project."))?;
            open::that(url).map_err(|_| error("Could not open the repository page."))
        }
        _ => Err(error("Choose the project folder or GitHub page.")),
    };
    if result.is_ok() {
        let _ = update_project(&app, &id, |project| {
            project.last_opened_at = now_seconds();
            Ok(())
        });
    }
    result
}
pub(crate) fn existing_project_folder(value: &str) -> Result<PathBuf, AppError> {
    Path::new(value)
        .canonicalize()
        .ok()
        .filter(|path| path.is_dir())
        .ok_or_else(|| {
            error("This project folder was moved or deleted. The history entry can be removed.")
        })
}
fn valid_repository_url(value: &str) -> bool {
    tauri::Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str() == Some("github.com")
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none()
            && url.port().is_none()
            && url.path_segments().is_some_and(|parts| {
                let parts: Vec<_> = parts.collect();
                parts.len() == 2
                    && parts.iter().all(|part| {
                        !part.is_empty()
                            && part
                                .bytes()
                                .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
                    })
            })
    })
}
#[tauri::command(async)]
pub fn import_handoff_template() -> Result<Option<String>, AppError> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("Import prompt template")
        .add_filter("Prompt template", &["json"])
        .pick_file()
    else {
        return Ok(None);
    };
    read_bounded(&path, 256 * 1024).map(Some)
}
#[tauri::command(async)]
pub fn export_handoff_text(content: String, kind: String) -> Result<bool, AppError> {
    let max_bytes = if kind == "template" {
        256 * 1024
    } else {
        128 * 1024
    };
    if content.len() > max_bytes || content.contains('\0') {
        return Err(error(
            "The selected text exceeds its file size limit or contains null characters.",
        ));
    }
    let (name, label, extension) = match kind.as_str() {
        "markdown" => ("project-handoff.md", "Markdown", "md"),
        "text" => ("project-handoff.txt", "Text", "txt"),
        "template" => ("prompt-template.json", "Prompt template", "json"),
        _ => return Err(error("Choose Markdown, text or a prompt template.")),
    };
    let Some(path) = rfd::FileDialog::new()
        .set_title("Save project handoff")
        .set_file_name(name)
        .add_filter(label, &[extension])
        .save_file()
    else {
        return Ok(false);
    };
    // The native save dialog requests explicit overwrite confirmation for an existing file.
    fs::write(path, content.as_bytes()).map_err(|_| error("Could not save the selected file."))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_full_pinned_library_rejects_new_entries_without_losing_existing_projects() {
        let directory = tempfile::tempdir().unwrap();
        let mut history = History {
            schema_version: HISTORY_VERSION,
            projects: Vec::new(),
        };
        for index in 0..MAX_PROJECTS {
            import_repository(
                &mut history,
                &directory.path().join(format!("project-{index}")),
                "main".into(),
                None,
            );
            history.projects[0].pinned = true;
        }
        assert!(
            ensure_library_capacity(&history, &directory.path().join("another-project")).is_err()
        );
        assert!(ensure_library_capacity(
            &history,
            Path::new(&history.projects[0].context.local_path)
        )
        .is_ok());
        assert_eq!(history.projects.len(), MAX_PROJECTS);
        history.projects[0].pinned = false;
        assert!(
            ensure_library_capacity(&history, &directory.path().join("another-project")).is_ok()
        );
    }
    #[test]
    fn recent_metadata_round_trips_without_retaining_configuration_or_prompt_bodies() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("history.json");
        let mut history = History {
            schema_version: HISTORY_VERSION,
            projects: Vec::new(),
        };
        let mut request = CreateRequest {
            description: "A learning experiment".into(),
            ..CreateRequest::default()
        };
        request.brief.idea = "Try an idea".into();
        request.options.ai.instructions.custom_text =
            "Full private instruction text must not be stored in history".into();
        for index in 0..(MAX_PROJECTS as u64 + 2) {
            let result = CreatedRepo {
                name: format!("project-{index}"),
                path: format!("/Users/test/Projects/project-{index}"),
                github_url: None,
                commit: format!("commit-{index}"),
                branch: "main".into(),
                commit_message: "Initial commit".into(),
                files: vec!["README.md".into()],
                warnings: Vec::new(),
            };
            remember_result(
                &mut history,
                &result,
                &request,
                "Experiment",
                std::time::Duration::from_secs(index + 1),
            );
        }
        assert_eq!(history.projects.len(), MAX_PROJECTS);
        assert_eq!(
            history.projects[0].context.project_name,
            format!("project-{}", MAX_PROJECTS + 1)
        );
        write_history(&file, &history).unwrap();
        let saved = fs::read_to_string(&file).unwrap();
        assert!(!saved.contains("Full private instruction text"));
        let loaded = read_history(&file).unwrap();
        assert_eq!(loaded.projects[0].context.brief.idea, "Try an idea");
        assert!(loaded.projects[0].context.repository_url.is_none());
        assert_eq!(loaded.projects[0].context.files, ["README.md"]);
        assert_eq!(loaded.projects[0].context.preset_name, "Experiment");
    }
    #[test]
    fn history_is_versioned_bounded_and_preserves_unsupported_files() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("history.json");
        assert!(read_history(&file).unwrap().projects.is_empty());
        write_history(
            &file,
            &History {
                schema_version: 1,
                projects: Vec::new(),
            },
        )
        .unwrap();
        assert!(read_history(&file).unwrap().projects.is_empty());
        fs::write(&file, r#"{"schemaVersion":3,"projects":[]}"#).unwrap();
        assert!(read_history(&file).is_err());
        assert!(fs::read_to_string(file)
            .unwrap()
            .contains("\"schemaVersion\":3"));
    }
    #[test]
    fn local_text_and_repository_links_are_validated() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("template.json");
        fs::write(&file, "abcdef").unwrap();
        assert!(read_bounded(&file, 5).is_err());
        fs::write(&file, "bad\0text").unwrap();
        assert!(read_bounded(&file, 100).is_err());
        assert!(valid_repository_url(
            "https://github.com/owner/private-repo"
        ));
        assert!(!valid_repository_url("https://token@github.com/owner/repo"));
        assert!(!valid_repository_url(
            "https://github.com/owner/repo?token=private"
        ));
        assert!(!valid_repository_url("file:///tmp/project"));
        assert!(!valid_repository_url(
            "https://github.com.evil.example/owner/repo"
        ));
        let folder = directory.path().join("project with spaces 🦀");
        fs::create_dir(&folder).unwrap();
        assert!(existing_project_folder(folder.to_str().unwrap()).is_ok());
        assert!(
            existing_project_folder(directory.path().join("moved-project").to_str().unwrap())
                .unwrap_err()
                .message
                .contains("moved or deleted")
        );
        assert!(existing_project_folder(file.to_str().unwrap()).is_err());
    }
    #[test]
    fn legacy_history_migrates_once_and_keeps_an_exact_backup() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("history.json");
        let mut history = History {
            schema_version: 1,
            projects: Vec::new(),
        };
        import_repository(&mut history, directory.path(), "main".into(), None);
        history.projects[0].context.brief.technologies = "TypeScript, Rust".into();
        let original_id = history.projects[0].id.clone();
        let mut legacy = serde_json::to_value(&history).unwrap();
        for field in [
            "lastOpenedAt",
            "pinned",
            "technologies",
            "commands",
            "launcher",
        ] {
            legacy["projects"][0].as_object_mut().unwrap().remove(field);
        }
        let original = serde_json::to_string_pretty(&legacy).unwrap();
        fs::write(&file, &original).unwrap();
        let migrated = read_history(&file).unwrap();
        assert_eq!(migrated.schema_version, HISTORY_VERSION);
        assert_eq!(migrated.projects[0].id, original_id);
        assert_eq!(
            migrated.projects[0].technologies.ids,
            ["typescript", "rust"]
        );
        assert_eq!(
            migrated.projects[0].last_opened_at,
            migrated.projects[0].created_at
        );
        write_history(&file, &migrated).unwrap();
        assert_eq!(
            fs::read_to_string(file.with_extension("v1.backup.json")).unwrap(),
            original
        );
        assert_eq!(read_history(&file).unwrap().projects[0].id, original_id);
    }
    #[test]
    fn canonical_import_identity_and_local_settings_survive_missing_directories() {
        let directory = tempfile::tempdir().unwrap();
        let folder = directory
            .path()
            .join(format!("project spaces {}", "日本語".repeat(15)));
        fs::create_dir(&folder).unwrap();
        let mut history = History {
            schema_version: HISTORY_VERSION,
            projects: Vec::new(),
        };
        let project = import_repository(&mut history, &folder, "main".into(), None);
        history.projects[0].pinned = true;
        let same = import_repository(&mut history, &folder.join("."), "main".into(), None);
        assert_eq!(project.id, same.id);
        assert_eq!(history.projects.len(), 1);
        assert!(same.pinned);
        fs::remove_dir(&folder).unwrap();
        let file = directory.path().join("history.json");
        write_history(&file, &history).unwrap();
        let loaded = read_history(&file).unwrap();
        assert_eq!(loaded.projects[0].id, project.id);
        assert!(loaded.projects[0].pinned);
        assert!(crate::workspace::project_directory(&loaded.projects[0]).is_err());
    }
    #[test]
    fn importing_validates_repository_root_without_executing_project_scripts() {
        use crate::process::{args, Program, Runner, SystemRunner};
        let directory = tempfile::tempdir().unwrap();
        let folder = directory.path().join("existing Git project 日本語");
        fs::create_dir(&folder).unwrap();
        assert!(inspect_repository(&folder).is_err());
        assert!(
            SystemRunner
                .run(
                    Program::Git,
                    &args(&["init", "--initial-branch=main"]),
                    &folder
                )
                .unwrap()
                .success
        );
        fs::write(
            folder.join("package.json"),
            r#"{"scripts":{"setup":"unexpected script"}}"#,
        )
        .unwrap();
        let (root, branch, remote) = inspect_repository(&folder).unwrap();
        assert_eq!(root, folder.canonicalize().unwrap());
        assert_eq!(branch, "main");
        assert!(remote.is_none());
        let child = folder.join("nested");
        fs::create_dir(&child).unwrap();
        assert!(inspect_repository(&child).is_err());
        assert_eq!(
            github_remote("git@github.com:example/demo.git"),
            Some("https://github.com/example/demo".into())
        );
        assert!(github_remote("https://private@github.com/example/demo").is_none());
    }
}
