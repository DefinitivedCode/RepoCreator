use crate::{
    acquire,
    config::{self, Appearance, Configuration, ProjectPreset},
    generation::{self, GeneratedFile, IgnorePreset},
    lock_error,
    model::{AppError, CreateRequest},
    preferences::Preferences,
    Runtime,
};
use serde::Serialize;
use std::{path::PathBuf, sync::Arc};
use tauri::{Manager, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    ignore_presets: Vec<IgnorePreset>,
    built_in_presets: Vec<ProjectPreset>,
    default_configuration: Configuration,
}
#[tauri::command]
pub fn get_catalog() -> Catalog {
    Catalog {
        ignore_presets: generation::ignore_catalog(),
        built_in_presets: config::built_in_presets(),
        default_configuration: Configuration::default(),
    }
}

#[tauri::command]
pub async fn preview_files(request: CreateRequest) -> Result<Vec<GeneratedFile>, AppError> {
    generation::generate_files(&request)
}

fn persist(preferences: &Preferences, file: &std::path::Path) -> Result<(), AppError> {
    preferences.save(file).map_err(|message| {
        AppError::new(
            message,
            "Your project files are unaffected. Check settings-folder permissions.",
        )
    })
}

#[tauri::command(async)]
pub fn save_configuration(
    configuration: Configuration,
    state: State<'_, Arc<Runtime>>,
) -> Result<(), AppError> {
    config::validate_options(&configuration.options)?;
    let mut session = state.session.lock().map_err(|_| lock_error())?;
    let mut preferences = session.preferences.clone();
    preferences.defaults = configuration;
    persist(&preferences, &session.preference_file)?;
    session.preferences = preferences;
    Ok(())
}

pub fn theme(appearance: Appearance) -> Option<tauri::Theme> {
    match appearance {
        Appearance::System => None,
        Appearance::Light => Some(tauri::Theme::Light),
        Appearance::Dark => Some(tauri::Theme::Dark),
    }
}
#[tauri::command(async)]
pub fn set_appearance(
    appearance: Appearance,
    app: tauri::AppHandle,
    state: State<'_, Arc<Runtime>>,
) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_theme(theme(appearance));
    }
    let mut session = state.session.lock().map_err(|_| lock_error())?;
    session.preferences.appearance = appearance;
    persist(&session.preferences, &session.preference_file)
}

#[tauri::command(async)]
pub fn select_recent_location(
    index: usize,
    state: State<'_, Arc<Runtime>>,
) -> Result<Preferences, AppError> {
    let _guard = acquire(state.inner())?;
    let mut session = state.session.lock().map_err(|_| lock_error())?;
    let path = session
        .preferences
        .recent_locations
        .get(index)
        .and_then(|p| p.canonicalize().ok())
        .filter(|p| p.is_dir())
        .ok_or_else(|| {
            AppError::new(
                "This recent location is unavailable.",
                "Use Browse to choose an accessible folder.",
            )
        })?;
    session.preferences.remember_location(path);
    persist(&session.preferences, &session.preference_file)?;
    Ok(session.preferences.clone())
}

#[tauri::command(async)]
pub fn save_custom_preset(
    name: String,
    configuration: Configuration,
    state: State<'_, Arc<Runtime>>,
) -> Result<Vec<ProjectPreset>, AppError> {
    let mut session = state.session.lock().map_err(|_| lock_error())?;
    let mut preferences = session.preferences.clone();
    preferences.save_preset(name, configuration)?;
    persist(&preferences, &session.preference_file)?;
    session.preferences = preferences;
    Ok(session.preferences.custom_presets.clone())
}
#[tauri::command(async)]
pub fn rename_custom_preset(
    id: String,
    name: String,
    state: State<'_, Arc<Runtime>>,
) -> Result<Vec<ProjectPreset>, AppError> {
    let mut session = state.session.lock().map_err(|_| lock_error())?;
    let mut preferences = session.preferences.clone();
    preferences.rename_preset(&id, &name)?;
    persist(&preferences, &session.preference_file)?;
    session.preferences = preferences;
    Ok(session.preferences.custom_presets.clone())
}
#[tauri::command(async)]
pub fn delete_custom_preset(
    id: String,
    state: State<'_, Arc<Runtime>>,
) -> Result<Vec<ProjectPreset>, AppError> {
    let mut session = state.session.lock().map_err(|_| lock_error())?;
    let mut preferences = session.preferences.clone();
    preferences.delete_preset(&id)?;
    persist(&preferences, &session.preference_file)?;
    session.preferences = preferences;
    Ok(session.preferences.custom_presets.clone())
}

#[tauri::command]
pub async fn open_vscode(state: State<'_, Arc<Runtime>>) -> Result<(), AppError> {
    let path = {
        let session = state.session.lock().map_err(|_| lock_error())?;
        session
            .pending
            .as_ref()
            .map(|p| p.path.clone())
            .or_else(|| session.result.as_ref().map(|r| PathBuf::from(&r.path)))
    }
    .ok_or_else(|| AppError::new("No project is available.", "Create a repository first."))?;
    tauri::async_runtime::spawn_blocking(move || crate::desktop::open_vscode(&path))
        .await
        .map_err(|_| lock_error())?
}
