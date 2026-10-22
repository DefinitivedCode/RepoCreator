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
    studio: crate::ai::StudioCatalog,
    ignore_presets: Vec<IgnorePreset>,
    built_in_presets: Vec<ProjectPreset>,
    default_configuration: Configuration,
}
#[tauri::command]
pub fn get_catalog() -> Catalog {
    Catalog {
        studio: crate::ai::catalog().clone(),
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
    config::validate_configuration(&configuration)?;
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

fn save_accent(
    preferences: &mut Preferences,
    file: &std::path::Path,
    accent: String,
    custom_accent: String,
) -> Result<(), AppError> {
    let normalized = crate::preferences::validate_accent(&accent, &custom_accent)?;
    let mut updated = preferences.clone();
    updated.accent = accent;
    updated.custom_accent = normalized;
    persist(&updated, file)?;
    *preferences = updated;
    Ok(())
}
#[tauri::command(async)]
pub fn set_accent(
    accent: String,
    custom_accent: String,
    state: State<'_, Arc<Runtime>>,
) -> Result<(), AppError> {
    let mut session = state.session.lock().map_err(|_| lock_error())?;
    let file = session.preference_file.clone();
    save_accent(&mut session.preferences, &file, accent, custom_accent)
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
    description: Option<String>,
    state: State<'_, Arc<Runtime>>,
) -> Result<Vec<ProjectPreset>, AppError> {
    let mut session = state.session.lock().map_err(|_| lock_error())?;
    let mut preferences = session.preferences.clone();
    let id = preferences.save_preset(name.clone(), configuration.clone())?;
    if let Some(description) = description {
        preferences.update_preset(&id, &name, &description, configuration)?;
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accent_updates_are_validated_normalized_and_atomic() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("preferences.json");
        let mut preferences = Preferences::new(directory.path().into());
        preferences.appearance = Appearance::Dark;
        preferences.save(&file).unwrap();
        save_accent(&mut preferences, &file, "custom".into(), "#ab34cd".into()).unwrap();
        assert_eq!(preferences.accent, "custom");
        assert_eq!(preferences.custom_accent, "#AB34CD");
        let loaded = Preferences::load(&file, directory.path().into());
        assert_eq!(loaded.accent, "custom");
        assert_eq!(loaded.custom_accent, "#AB34CD");
        assert_eq!(loaded.appearance, Appearance::Dark);
        let saved = std::fs::read(&file).unwrap();
        for (accent, custom) in [
            ("purple", "#123456"),
            ("teal", "#123"),
            ("teal", "123456"),
            ("teal", "#GG0000"),
            ("teal", "#12345678"),
            ("custom", "#12345\n"),
        ] {
            assert!(save_accent(&mut preferences, &file, accent.into(), custom.into()).is_err());
            assert_eq!(preferences.accent, "custom");
            assert_eq!(preferences.custom_accent, "#AB34CD");
            assert_eq!(std::fs::read(&file).unwrap(), saved);
        }
        let unavailable = directory.path().join("occupied");
        std::fs::create_dir(&unavailable).unwrap();
        assert!(save_accent(
            &mut preferences,
            &unavailable,
            "gold".into(),
            "#112233".into()
        )
        .is_err());
        assert_eq!(preferences.accent, "custom");
        assert_eq!(preferences.custom_accent, "#AB34CD");
    }
    #[test]
    fn newer_settings_are_never_replaced_by_an_accent_change() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("preferences.json");
        let original = r##"{"schemaVersion":999,"appearance":"light","accent":"custom","customAccent":"#AABBCC","futureField":"preserved"}"##;
        std::fs::write(&file, original).unwrap();
        let mut preferences = Preferences::load(&file, directory.path().into());
        assert!(save_accent(&mut preferences, &file, "teal".into(), "#4FA69B".into()).is_err());
        assert_eq!(preferences.accent, "custom");
        assert_eq!(preferences.custom_accent, "#AABBCC");
        assert_eq!(preferences.appearance, Appearance::Light);
        assert_eq!(std::fs::read_to_string(&file).unwrap(), original);
    }
}
