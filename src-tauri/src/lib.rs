mod github;
mod model;
mod preferences;
mod process;
mod repository;
#[cfg(test)]
mod tests;

use model::{AppError, CreateRequest, CreatedRepo, Destination};
use preferences::Preferences;
use process::{args, Program, Runner, SystemRunner};
use repository::PendingRepo;
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, Manager, State};

struct Session {
    preferences: Preferences,
    preference_file: PathBuf,
    pending: Option<PendingRepo>,
    result: Option<CreatedRepo>,
}
struct Runtime {
    session: Mutex<Session>,
    busy: AtomicBool,
}
struct BusyGuard(Arc<Runtime>);
impl Drop for BusyGuard {
    fn drop(&mut self) {
        self.0.busy.store(false, Ordering::Release);
    }
}
fn acquire(runtime: &Arc<Runtime>) -> Result<BusyGuard, AppError> {
    runtime
        .busy
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| {
            AppError::new(
                "An operation is already running.",
                "Wait for it to finish before starting another.",
            )
        })?;
    Ok(BusyGuard(runtime.clone()))
}
fn lock_error() -> AppError {
    AppError::new(
        "The application could not access its state.",
        "Reopen Repo Creator. Existing projects are safe.",
    )
}

#[tauri::command]
fn get_preferences(state: State<'_, Arc<Runtime>>) -> Result<Preferences, AppError> {
    Ok(state
        .session
        .lock()
        .map_err(|_| lock_error())?
        .preferences
        .clone())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Environment {
    git_installed: bool,
    identity_ready: bool,
    gh_installed: bool,
    github_user: Option<String>,
}

#[tauri::command]
async fn check_environment(state: State<'_, Arc<Runtime>>) -> Result<Environment, AppError> {
    let parent = state
        .session
        .lock()
        .map_err(|_| lock_error())?
        .preferences
        .parent_path
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        let runner = SystemRunner;
        let success = |program, values: &[&str]| {
            runner
                .run(program, &args(values), &parent)
                .is_ok_and(|r| r.success)
        };
        let git_installed = success(Program::Git, &["--version"]);
        let identity_ready = git_installed
            && ["user.name", "user.email"].iter().all(|key| {
                runner
                    .run(Program::Git, &args(&["config", "--get", key]), &parent)
                    .is_ok_and(|r| r.success && !r.stdout.is_empty())
            });
        let gh_installed = success(Program::Gh, &["--version"]);
        let github_user = if gh_installed {
            github::authenticated_owner(&runner, &parent).ok()
        } else {
            None
        };
        Environment {
            git_installed,
            identity_ready,
            gh_installed,
            github_user,
        }
    })
    .await
    .map_err(|_| lock_error())
}

#[tauri::command]
async fn choose_parent(state: State<'_, Arc<Runtime>>) -> Result<Option<String>, AppError> {
    let runtime = state.inner().clone();
    let _guard = acquire(&runtime)?;
    let current = runtime
        .session
        .lock()
        .map_err(|_| lock_error())?
        .preferences
        .parent_path
        .clone();
    let selection = rfd::AsyncFileDialog::new()
        .set_title("Choose a home for your repositories")
        .set_directory(current)
        .pick_folder()
        .await;
    let Some(folder) = selection else {
        return Ok(None);
    };
    let path = folder.path().canonicalize().map_err(|_| {
        AppError::new(
            "Could not access this folder.",
            "Choose an accessible local folder.",
        )
    })?;
    if !path.is_dir() {
        return Err(AppError::new(
            "Select an existing folder.",
            "Choose a parent folder for your projects.",
        ));
    }
    let mut session = runtime.session.lock().map_err(|_| lock_error())?;
    session.preferences.parent_path = path.clone();
    // Preference failures do not prevent creating a repository in the selected location.
    let _ = session.preferences.save(&session.preference_file);
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn set_destination(
    destination: Destination,
    state: State<'_, Arc<Runtime>>,
) -> Result<(), AppError> {
    let mut session = state.session.lock().map_err(|_| lock_error())?;
    session.preferences.destination = destination;
    let _ = session.preferences.save(&session.preference_file);
    Ok(())
}

#[tauri::command]
async fn create_repository(
    request: CreateRequest,
    app: tauri::AppHandle,
    state: State<'_, Arc<Runtime>>,
) -> Result<CreatedRepo, AppError> {
    let runtime = state.inner().clone();
    let guard = acquire(&runtime)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let mut session = runtime.session.lock().map_err(|_| lock_error())?;
        session.pending = None;
        session.result = None;
        let progress = |stage: &str| {
            let _ = app.emit_to("main", "repo-progress", stage);
        };
        progress("folder");
        let mut pending =
            repository::begin(&SystemRunner, &session.preferences.parent_path, request)?;
        let outcome =
            repository::create_local(&SystemRunner, &mut pending, &progress).and_then(|_| {
                if pending.request.destination == Destination::Github {
                    repository::publish(&SystemRunner, &mut pending, &progress)
                } else {
                    Ok(())
                }
            });
        match outcome {
            Ok(()) => {
                let result = pending.result();
                session.result = Some(result.clone());
                progress("complete");
                Ok(result)
            }
            Err(error) => {
                let error = pending.failure(error);
                session.pending = Some(pending);
                Err(error)
            }
        }
    })
    .await
    .map_err(|_| lock_error())?
}

#[tauri::command]
async fn retry_publish(
    app: tauri::AppHandle,
    state: State<'_, Arc<Runtime>>,
) -> Result<CreatedRepo, AppError> {
    let runtime = state.inner().clone();
    let guard = acquire(&runtime)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let mut session = runtime.session.lock().map_err(|_| lock_error())?;
        let pending = session.pending.as_mut().ok_or_else(|| {
            AppError::new(
                "There is no publication to retry.",
                "Create a repository first.",
            )
        })?;
        if pending.commit.is_none() || pending.request.destination != Destination::Github {
            return Err(AppError::new(
                "This project cannot be retried here.",
                "Open the preserved folder to inspect the Git setup.",
            ));
        }
        let progress = |stage: &str| {
            let _ = app.emit_to("main", "repo-progress", stage);
        };
        repository::publish(&SystemRunner, pending, &progress)
            .map_err(|error| pending.failure(error))?;
        let result = pending.result();
        session.result = Some(result.clone());
        session.pending = None;
        progress("complete");
        Ok(result)
    })
    .await
    .map_err(|_| lock_error())?
}

#[tauri::command]
async fn open_project(state: State<'_, Arc<Runtime>>) -> Result<(), AppError> {
    let path = {
        let session = state.session.lock().map_err(|_| lock_error())?;
        session
            .pending
            .as_ref()
            .map(|p| p.path.clone())
            .or_else(|| session.result.as_ref().map(|r| PathBuf::from(&r.path)))
    }
    .ok_or_else(|| {
        AppError::new(
            "No project folder is available.",
            "Create a repository first.",
        )
    })?;
    tauri::async_runtime::spawn_blocking(move || {
        open::that(path).map_err(|_| {
            AppError::new(
                "Could not open the folder.",
                "Find the project in File Explorer using the displayed path.",
            )
        })
    })
    .await
    .map_err(|_| lock_error())?
}

#[tauri::command]
async fn open_github(state: State<'_, Arc<Runtime>>) -> Result<(), AppError> {
    let url = {
        let session = state.session.lock().map_err(|_| lock_error())?;
        session
            .pending
            .as_ref()
            .and_then(|p| p.github_url.clone())
            .or_else(|| session.result.as_ref().and_then(|r| r.github_url.clone()))
    }
    .ok_or_else(|| {
        AppError::new(
            "No verified GitHub link is available.",
            "Finish publishing to GitHub first.",
        )
    })?;
    tauri::async_runtime::spawn_blocking(move || {
        open::that(url).map_err(|_| {
            AppError::new(
                "Could not open your browser.",
                "Use the displayed GitHub URL.",
            )
        })
    })
    .await
    .map_err(|_| lock_error())?
}

#[tauri::command]
async fn open_setup_resource(resource: String) -> Result<(), AppError> {
    let url = match resource.as_str() {
        "git" => "https://git-scm.com/downloads/win",
        "gh" => "https://cli.github.com/",
        _ => {
            return Err(AppError::new(
                "Unknown setup resource.",
                "Choose a setup action in Repo Creator.",
            ))
        }
    };
    tauri::async_runtime::spawn_blocking(move || {
        open::that(url).map_err(|_| {
            AppError::new(
                "Could not open your browser.",
                "Visit the official download page in your browser.",
            )
        })
    })
    .await
    .map_err(|_| lock_error())?
}

#[tauri::command]
fn connect_github() -> Result<(), AppError> {
    // This action intentionally opens an interactive terminal for gh's official device flow.
    // The command is constant, contains no user input, and gh handles all credentials.
    #[cfg(windows)]
    {
        use std::{os::windows::process::CommandExt, process::Command};
        Command::new("powershell.exe").args(["-NoProfile", "-NoExit", "-Command",
            "& gh auth login --hostname github.com --git-protocol https --web; if ($LASTEXITCODE -eq 0) { exit }"])
            .creation_flags(0x00000010).spawn().map_err(|_| AppError::new("Could not open GitHub sign-in.", "Open a terminal and run: gh auth login --hostname github.com --web"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err(AppError::new(
            "Use GitHub CLI to connect.",
            "In a terminal, run: gh auth login --hostname github.com --web",
        ))
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let fallback = app.path().home_dir()?.canonicalize()?;
            let preference_file = app.path().app_config_dir()?.join("preferences.json");
            let preferences = Preferences::load(&preference_file, fallback);
            app.manage(Arc::new(Runtime {
                session: Mutex::new(Session {
                    preferences,
                    preference_file,
                    pending: None,
                    result: None,
                }),
                busy: AtomicBool::new(false),
            }));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<Arc<Runtime>>().busy.load(Ordering::Acquire) {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_preferences,
            check_environment,
            choose_parent,
            set_destination,
            create_repository,
            retry_publish,
            open_project,
            open_github,
            open_setup_resource,
            connect_github
        ])
        .run(tauri::generate_context!())
        .expect("Could not start Repo Creator");
}
