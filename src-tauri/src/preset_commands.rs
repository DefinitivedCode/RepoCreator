//! Portable project presets are strictly validated data. Import never applies settings or runs tools.
use crate::{
    acquire,
    config::{self, Configuration, ExperienceMode, ProjectPreset},
    lock_error,
    model::AppError,
    preferences::{valid_description, Preferences},
    Runtime,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    sync::Arc,
};
use tauri::State;

const LIMIT: usize = 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectPresetExchange {
    pub schema_version: u32,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub configuration: Configuration,
}

fn error(message: impl Into<String>) -> AppError {
    AppError::new(message, "Use a supported Repo Creator project preset JSON file. Existing presets and project files are unchanged.")
}

pub fn validate_exchange(preset: &ProjectPresetExchange) -> Result<(), AppError> {
    if preset.schema_version != 1 {
        return Err(error(format!(
            "Project preset schema {} is unsupported; this app supports schema 1.",
            preset.schema_version
        )));
    }
    if preset.name.trim().is_empty()
        || preset.name.chars().count() > 60
        || preset.name.chars().any(|c| c.is_control())
        || !valid_description(&preset.description)
    {
        return Err(error(
            "Use a preset name of 1–60 characters and description of at most 500 characters.",
        ));
    }
    config::validate_configuration(&preset.configuration)?;
    // Imported disabled drafts must pass the same path and instruction checks as enabled data.
    let mut ai = preset.configuration.options.ai.clone();
    ai.enabled = true;
    if ai.agents.is_empty() {
        ai.agents.push(crate::ai::Agent::Codex);
    }
    crate::ai::validate(&ai)?;
    if serde_json::to_vec(preset)
        .map_err(|_| error("Could not encode preset."))?
        .len()
        > LIMIT
    {
        return Err(error("Project presets must be no larger than 1 MiB."));
    }
    Ok(())
}

pub fn decode_project_preset(text: &str) -> Result<ProjectPresetExchange, AppError> {
    if text.len() > LIMIT {
        return Err(error("Project presets must be no larger than 1 MiB."));
    }
    let mut value: serde_json::Value =
        serde_json::from_str(text).map_err(|_| error("The selected file is not valid JSON."))?;
    if let Some(version) = value["schemaVersion"].as_u64() {
        if version != 1 {
            return Err(error(format!(
                "Project preset schema {version} is unsupported; this app supports schema 1."
            )));
        }
    }
    if let Some(configuration) = value.get_mut("configuration") {
        crate::technologies::migrate_configuration_value(configuration);
    }
    let mut preset: ProjectPresetExchange = serde_json::from_value(value).map_err(|e| {
        error(format!(
            "This preset contains invalid or unsupported fields: {e}"
        ))
    })?;
    crate::workspace::mark_imported(&mut preset.configuration.options.commands);
    validate_exchange(&preset)?;
    Ok(preset)
}

fn persist_edit(
    state: &State<'_, Arc<Runtime>>,
    edit: impl FnOnce(&mut Preferences) -> Result<(), AppError>,
) -> Result<Preferences, AppError> {
    let mut session = state.session.lock().map_err(|_| lock_error())?;
    let mut preferences = session.preferences.clone();
    edit(&mut preferences)?;
    preferences.save(&session.preference_file).map_err(error)?;
    session.preferences = preferences.clone();
    Ok(preferences)
}

#[tauri::command(async)]
pub fn set_experience_mode(
    mode: ExperienceMode,
    state: State<'_, Arc<Runtime>>,
) -> Result<Preferences, AppError> {
    persist_edit(&state, |prefs| {
        prefs.experience_mode = mode;
        Ok(())
    })
}

#[tauri::command(async)]
pub fn update_custom_preset(
    id: String,
    name: String,
    description: String,
    configuration: Configuration,
    state: State<'_, Arc<Runtime>>,
) -> Result<Vec<ProjectPreset>, AppError> {
    Ok(persist_edit(&state, |prefs| {
        prefs.update_preset(&id, &name, &description, configuration)
    })?
    .custom_presets)
}

#[tauri::command(async)]
pub fn confirm_project_preset_import(
    mut preset: ProjectPresetExchange,
    state: State<'_, Arc<Runtime>>,
) -> Result<Vec<ProjectPreset>, AppError> {
    crate::workspace::mark_imported(&mut preset.configuration.options.commands);
    validate_exchange(&preset)?;
    Ok(persist_edit(&state, |prefs| {
        let id = prefs.save_preset(preset.name.clone(), preset.configuration.clone())?;
        prefs.update_preset(&id, &preset.name, &preset.description, preset.configuration)
    })?
    .custom_presets)
}

#[tauri::command]
pub async fn preview_project_preset_import(
    state: State<'_, Arc<Runtime>>,
) -> Result<Option<ProjectPresetExchange>, AppError> {
    let _guard = acquire(state.inner())?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("Preview project preset import")
        .add_filter("Project preset JSON", &["json"])
        .pick_file()
        .await;
    let Some(file) = file else {
        return Ok(None);
    };
    let path = file.path().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        let mut bytes = Vec::new();
        fs::File::open(path)
            .and_then(|f| f.take((LIMIT + 1) as u64).read_to_end(&mut bytes))
            .map_err(|_| error("Could not read this preset. Check file permissions."))?;
        if bytes.len() > LIMIT {
            return Err(error("Project presets must be no larger than 1 MiB."));
        }
        let text = std::str::from_utf8(&bytes)
            .map_err(|_| error("Project preset JSON must use UTF-8 text."))?;
        decode_project_preset(text).map(Some)
    })
    .await
    .map_err(|_| lock_error())?
}

#[tauri::command]
pub async fn export_project_preset(
    mut preset: ProjectPresetExchange,
    state: State<'_, Arc<Runtime>>,
) -> Result<bool, AppError> {
    let _guard = acquire(state.inner())?;
    // A Git identity belongs to the current machine/user, not a portable workflow.
    preset.configuration.options.commit_author_name.clear();
    preset.configuration.options.commit_author_email.clear();
    preset.configuration.options.commands =
        crate::workspace::portable_commands(&preset.configuration.options.commands);
    validate_exchange(&preset)?;
    let bytes =
        serde_json::to_vec_pretty(&preset).map_err(|_| error("Could not encode this preset."))?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("Export project preset")
        .set_file_name("project-preset.json")
        .add_filter("Project preset JSON", &["json"])
        .save_file()
        .await;
    let Some(file) = file else {
        return Ok(false);
    };
    let path = file.path().to_path_buf();
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
    {
        return Err(error("Choose a .json filename."));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let parent = path
            .parent()
            .ok_or_else(|| error("Choose an export folder."))?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)
            .map_err(|_| error("Could not create the export file."))?;
        temporary
            .write_all(&bytes)
            .and_then(|_| temporary.as_file().sync_all())
            .map_err(|_| error("Could not finish writing the preset."))?;
        temporary
            .persist(path)
            .map_err(|_| error("Could not save the preset."))?;
        Ok(true)
    })
    .await
    .map_err(|_| lock_error())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn exchange() -> ProjectPresetExchange {
        ProjectPresetExchange {
            schema_version: 1,
            name: "Portable workflow".into(),
            description: "Across Windows and macOS".into(),
            configuration: Configuration::default(),
        }
    }
    #[test]
    fn command_templates_roundtrip_as_untrusted_without_exported_environment() {
        let mut preset = exchange();
        preset
            .configuration
            .options
            .commands
            .push(crate::workspace::ProjectCommand {
                id: "build-web".into(),
                name: "Build frontend".into(),
                category: "build".into(),
                executable: "npm".into(),
                args: vec!["run".into(), "build".into()],
                environment: [("BUILD_MODE".into(), "production".into())].into(),
                ..Default::default()
            });
        let imported = decode_project_preset(&serde_json::to_string(&preset).unwrap()).unwrap();
        let command = &imported.configuration.options.commands[0];
        assert!(command.imported);
        assert!(command.environment.is_empty());
        assert_eq!(command.args, ["run", "build"]);
        let portable = crate::workspace::portable_commands(&preset.configuration.options.commands);
        assert!(portable[0].environment.is_empty());
        assert!(portable[0].imported);
        assert!(!preset.configuration.options.commands[0]
            .environment
            .is_empty());
    }
    #[test]
    fn portable_roundtrip_preserves_ai_and_rejects_unknown_or_future_data() {
        let mut preset = exchange();
        preset.configuration.options.ai.enabled = true;
        preset.configuration.options.ai.agents =
            vec![crate::ai::Agent::Claude, crate::ai::Agent::Codex];
        preset.configuration.brief.technologies = "Rust".into();
        preset.configuration.handoff_template = "development".into();
        let json = serde_json::to_string(&preset).unwrap();
        let restored = decode_project_preset(&json).unwrap();
        assert_eq!(restored.configuration.options.ai.agents.len(), 2);
        assert_eq!(restored.configuration.brief.technologies, "Rust");
        assert_eq!(restored.configuration.handoff_template, "development");
        assert!(decode_project_preset(&json.replace(
            "\"schemaVersion\":1,\"name\"",
            "\"schemaVersion\":99,\"name\""
        ))
        .unwrap_err()
        .message
        .contains("unsupported"));
        let mut value = serde_json::to_value(&preset).unwrap();
        value["configuration"]["token"] = "not-allowed".into();
        assert!(decode_project_preset(&value.to_string()).is_err());
        assert!(decode_project_preset(&" ".repeat(LIMIT + 1)).is_err());
    }
    #[test]
    fn imports_reject_traversal_even_when_ai_is_disabled() {
        let mut preset = exchange();
        preset
            .configuration
            .options
            .ai
            .scoped_rules
            .push(crate::ai::ScopedRule {
                id: "unsafe-rule".into(),
                name: "Unsafe rule".into(),
                patterns: vec!["../../outside/**".into()],
                content: "Rule data".into(),
                ..Default::default()
            });
        assert!(decode_project_preset(&serde_json::to_string(&preset).unwrap()).is_err());
        let temp = tempfile::tempdir().unwrap();
        let mut preferences = Preferences::new(temp.path().into());
        preferences
            .save_preset("Unfinished local draft".into(), preset.configuration)
            .unwrap();
        assert_eq!(preferences.custom_presets.len(), 1, "Disabled local drafts remain editable, while imported data must always pass full validation");
        assert!(decode_project_preset("not-json").is_err());
        assert!(decode_project_preset("[]").is_err());
        assert!(decode_project_preset("null").is_err());
    }
    #[test]
    fn v12_preferences_migrate_without_changing_configuration_and_fresh_mode_is_simple() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("settings.json");
        assert_eq!(
            Preferences::load(&file, temp.path().into()).experience_mode,
            ExperienceMode::Simple
        );
        fs::write(&file, serde_json::json!({"schemaVersion":3,"defaults":{"readme":"none","options":{"ignorePresets":[],"initialBranch":"develop"}},"customPresets":[{"id":"custom-old","name":"Old preset","configuration":{"readme":"minimal","options":{}}}]}).to_string()).unwrap();
        let migrated = Preferences::load(&file, temp.path().into());
        assert_eq!(migrated.schema_version, 5);
        assert_eq!(migrated.experience_mode, ExperienceMode::Advanced);
        assert_eq!(migrated.defaults.options.initial_branch, "develop");
        assert!(migrated.defaults.options.ignore_presets.is_empty());
        assert_eq!(migrated.defaults.handoff_template, "discovery");
        assert_eq!(migrated.custom_presets.len(), 1);
        assert_eq!(migrated.custom_presets[0].description, "");
    }
    #[test]
    fn built_ins_and_custom_overwrite_remain_valid() {
        let presets = config::built_in_presets();
        for id in [
            "blank",
            "experiment",
            "standard",
            "website",
            "desktop",
            "claude-experiment",
            "tauri",
            "python",
        ] {
            let preset = presets.iter().find(|p| p.id == id).unwrap();
            config::validate_configuration(&preset.configuration).unwrap();
        }
        let temp = tempfile::tempdir().unwrap();
        let mut preferences = Preferences::new(temp.path().into());
        let id = preferences
            .save_preset("Workflow".into(), Configuration::default())
            .unwrap();
        let mut updated = Configuration::default();
        updated.options.initial_branch = "develop".into();
        preferences
            .update_preset(&id, "Renamed workflow", "Updated description", updated)
            .unwrap();
        assert_eq!(
            preferences.custom_presets[0]
                .configuration
                .options
                .initial_branch,
            "develop"
        );
        assert!(preferences
            .update_preset("standard", "Built in", "", Configuration::default())
            .is_err());
    }
}
