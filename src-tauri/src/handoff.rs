//! Local prompt file dialogs and a bounded history of confirmed project creations.
//! Prompt templates are data; this module never invokes a coding assistant.
use crate::model::{AppError, CreateRequest, CreatedRepo, ProjectBrief, Visibility};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

const HISTORY_VERSION: u32 = 1;
const MAX_HISTORY_BYTES: usize = 1024 * 1024;
static HISTORY_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HandoffContext {
    project_name: String,
    description: String,
    project_type: String,
    language: String,
    brief: ProjectBrief,
    local_path: String,
    repository_url: Option<String>,
    branch: String,
    agents: Vec<String>,
    files: Vec<String>,
    preset_name: String,
    visibility: Visibility,
    status: String,
    commit: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecentProject {
    id: String,
    created_at: u64,
    context: HandoffContext,
    #[serde(default)]
    handoff_template: Option<String>,
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
    let history: History =
        serde_json::from_str(&read_bounded(file, MAX_HISTORY_BYTES)?).map_err(|_| {
            error("Recent-project history could not be read. The existing file was kept.")
        })?;
    if history.schema_version != HISTORY_VERSION || history.projects.len() > 20 {
        return Err(error("Recent-project history uses an unsupported version or exceeds its limit. The existing file was kept."));
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
            || project.context.status != "created"
            || project.context.local_path.is_empty()
            || project.context.local_path.len() > 32000
            || project.context.local_path.contains('\0')
            || project.context.project_name.len() > 100
            || project.context.description.len() > 1400
            || project.context.preset_name.len() > 240
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
        return Err(error("Project history exceeds its 1 MiB storage limit."));
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
    let context = HandoffContext {
        project_name: result.name.clone(),
        description: request.description.clone(),
        project_type: if preset_name.is_empty() {
            "Not specified".into()
        } else {
            preset_name.into()
        },
        language: if !request.brief.technologies.is_empty() {
            request.brief.technologies.clone()
        } else {
            request.options.ai.instructions.stack.clone()
        },
        brief: request.brief.clone(),
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
    history
        .projects
        .retain(|entry| entry.context.local_path != context.local_path);
    history.projects.insert(
        0,
        RecentProject {
            id: format!("project-{}", time.as_nanos()),
            created_at: time.as_secs(),
            context,
            handoff_template: Some(request.handoff_template.clone()),
        },
    );
    history.projects.truncate(20);
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
    match target.as_str() {
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
    }
}
fn existing_project_folder(value: &str) -> Result<PathBuf, AppError> {
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
        for index in 0..22 {
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
        assert_eq!(history.projects.len(), 20);
        assert_eq!(history.projects[0].context.project_name, "project-21");
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
        fs::write(&file, r#"{"schemaVersion":2,"projects":[]}"#).unwrap();
        assert!(read_history(&file).is_err());
        assert!(fs::read_to_string(file)
            .unwrap()
            .contains("\"schemaVersion\":2"));
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
}
