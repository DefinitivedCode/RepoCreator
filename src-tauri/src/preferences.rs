use crate::{
    config::{validate_configuration, Appearance, Configuration, ExperienceMode, ProjectPreset},
    model::{AppError, Destination},
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub const SETTINGS_VERSION: u32 = 5;
fn legacy_accent() -> String {
    "copper".into()
}
fn default_custom_accent() -> String {
    "#4FA69B".into()
}
pub(crate) fn validate_accent(accent: &str, custom_accent: &str) -> Result<String, AppError> {
    if !["slate", "teal", "gold", "copper", "monochrome", "custom"].contains(&accent)
        || custom_accent.len() != 7
        || !custom_accent.starts_with('#')
        || !custom_accent.as_bytes()[1..]
            .iter()
            .all(u8::is_ascii_hexdigit)
    {
        return Err(AppError::new(
            "The accent colour is invalid.",
            "Choose a supported accent and enter a custom colour in #RRGGBB format.",
        ));
    }
    Ok(custom_accent.to_ascii_uppercase())
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub schema_version: u32,
    pub parent_path: PathBuf,
    pub destination: Destination,
    pub appearance: Appearance,
    #[serde(default = "legacy_accent")]
    pub accent: String,
    #[serde(default = "default_custom_accent")]
    pub custom_accent: String,
    #[serde(default)]
    pub updates: crate::updates::UpdatePreferences,
    #[serde(default)]
    pub experience_mode: ExperienceMode,
    pub recent_locations: Vec<PathBuf>,
    pub defaults: Configuration,
    pub custom_presets: Vec<ProjectPreset>,
    #[serde(default)]
    pub instruction_presets: Vec<crate::ai::SavedInstructions>,
    #[serde(default)]
    pub specialist_library: Vec<crate::ai::Specialist>,
    #[serde(default, skip_deserializing)]
    pub recovery_notice: Option<String>,
    #[serde(skip)]
    pub future_version: bool,
    #[serde(skip)]
    pub needs_backup: bool,
    #[serde(skip)]
    pub(crate) backup_file: Option<PathBuf>,
}
impl Preferences {
    pub fn new(parent_path: PathBuf) -> Self {
        Self {
            schema_version: SETTINGS_VERSION,
            parent_path,
            destination: Destination::Local,
            appearance: Appearance::System,
            accent: "teal".into(),
            custom_accent: default_custom_accent(),
            updates: crate::updates::UpdatePreferences::default(),
            experience_mode: ExperienceMode::Simple,
            recent_locations: Vec::new(),
            defaults: Configuration::default(),
            custom_presets: Vec::new(),
            instruction_presets: Vec::new(),
            specialist_library: Vec::new(),
            recovery_notice: None,
            future_version: false,
            needs_backup: false,
            backup_file: None,
        }
    }
    pub fn load(file: &Path, fallback: PathBuf) -> Self {
        let mut result = Self::new(fallback);
        let original_backup = file.with_extension("json.bak");
        result.backup_file = Some(if original_backup.exists() {
            file.with_extension(format!(
                "json.{}.bak",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            ))
        } else {
            original_backup
        });
        let mut bytes = Vec::new();
        match fs::File::open(file).and_then(|f| f.take(8 * 1024 * 1024 + 1).read_to_end(&mut bytes))
        {
            Ok(_) if bytes.len() <= 8 * 1024 * 1024 => {}
            Ok(_) => {
                result.needs_backup = true;
                return result;
            }
            Err(_) => return result,
        }
        let value = match serde_json::from_slice::<serde_json::Value>(&bytes) {
            Ok(value) if value.is_object() => value,
            _ => {
                result.needs_backup = true;
                return result;
            }
        };
        result.future_version = value["schemaVersion"]
            .as_u64()
            .is_some_and(|version| version > SETTINGS_VERSION as u64);
        result.experience_mode = serde_json::from_value(value["experienceMode"].clone())
            .unwrap_or(ExperienceMode::Advanced);
        if let Some(path) = value["parentPath"]
            .as_str()
            .and_then(|p| Path::new(p).canonicalize().ok())
            .filter(|p| p.is_dir())
        {
            result.parent_path = path;
        }
        result.destination =
            serde_json::from_value(value["destination"].clone()).unwrap_or_default();
        result.appearance = serde_json::from_value(value["appearance"].clone()).unwrap_or_default();
        if let Some(updates) = value.get("updates") {
            match serde_json::from_value(updates.clone()) {
                Ok(updates) => result.updates = updates,
                Err(_) => result.recover_notice(),
            }
        }
        // An existing installation keeps its established copper appearance.
        // These additive fields do not alter the independent theme preference.
        result.accent = legacy_accent();
        if let Some(accent) = value.get("accent") {
            if let Some(accent) = accent
                .as_str()
                .filter(|accent| validate_accent(accent, &default_custom_accent()).is_ok())
            {
                result.accent = accent.into();
            } else {
                result.recover_notice();
            }
        }
        if let Some(custom_accent) = value.get("customAccent") {
            if let Some(normalized) = custom_accent
                .as_str()
                .and_then(|custom| validate_accent(&result.accent, custom).ok())
            {
                result.custom_accent = normalized;
            } else {
                result.recover_notice();
            }
        }
        if let Some(defaults) = result.read_configuration(&value["defaults"]) {
            result.defaults = defaults;
        }
        if let Some(locations) = value["recentLocations"].as_array() {
            for location in locations.iter().take(20) {
                if let Some(path) = location
                    .as_str()
                    .and_then(|p| Path::new(p).canonicalize().ok())
                    .filter(|p| p.is_dir())
                {
                    if !result.recent_locations.contains(&path) {
                        result.recent_locations.push(path);
                    }
                }
            }
            result.recent_locations.truncate(5);
        }
        if let Some(presets) = value["customPresets"].as_array() {
            for preset in presets.iter().take(50) {
                if let Some(configuration) = result.read_configuration(&preset["configuration"]) {
                    if let (Some(id), Some(name)) = (preset["id"].as_str(), preset["name"].as_str())
                    {
                        if id.starts_with("custom-")
                            && id.len() < 80
                            && valid_preset_name(name)
                            && !result.custom_presets.iter().any(|p| p.id == id)
                        {
                            result.custom_presets.push(ProjectPreset {
                                id: id.into(),
                                name: name.into(),
                                description: preset["description"]
                                    .as_str()
                                    .filter(|s| valid_description(s))
                                    .unwrap_or_default()
                                    .into(),
                                configuration,
                            });
                        }
                    }
                }
            }
        }
        if let Some(presets) = value["instructionPresets"].as_array() {
            for value in presets.iter().take(50) {
                if let Ok(preset) =
                    serde_json::from_value::<crate::ai::SavedInstructions>(value.clone())
                {
                    if preset.id.starts_with("instructions-")
                        && preset.id.len() < 80
                        && valid_preset_name(&preset.name)
                        && crate::ai::validate_profile(&preset.profile).is_ok()
                        && !result
                            .instruction_presets
                            .iter()
                            .any(|p| p.id == preset.id || p.name.eq_ignore_ascii_case(&preset.name))
                    {
                        result.instruction_presets.push(preset);
                        continue;
                    }
                }
                result.recover_notice();
            }
        }
        if let Some(roles) = value["specialistLibrary"].as_array() {
            for value in roles.iter().take(50) {
                if let Ok(role) = serde_json::from_value::<crate::ai::Specialist>(value.clone()) {
                    if role.id.starts_with("custom-")
                        && crate::ai::validate_specialist(&role).is_ok()
                        && !result.specialist_library.iter().any(|r| r.id == role.id)
                    {
                        result.specialist_library.push(role);
                        continue;
                    }
                }
                result.recover_notice();
            }
        }
        result
    }
    fn recover_notice(&mut self) {
        self.needs_backup = true;
        self.recovery_notice = Some("Some saved settings could not be loaded. Supported settings were kept; the original settings will be backed up before saving.".into());
    }
    fn read_configuration(&mut self, value: &serde_json::Value) -> Option<Configuration> {
        let mut migrated = value.clone();
        crate::technologies::migrate_configuration_value(&mut migrated);
        if let Ok(configuration) = serde_json::from_value::<Configuration>(migrated.clone()) {
            if validate_configuration(&configuration).is_ok() {
                return Some(configuration);
            }
        }
        let mut legacy = migrated;
        if legacy["options"].get("ai").is_some() {
            legacy["options"].as_object_mut()?.remove("ai");
            crate::technologies::migrate_configuration_value(&mut legacy);
            if let Ok(configuration) = serde_json::from_value::<Configuration>(legacy) {
                if validate_configuration(&configuration).is_ok() {
                    self.recover_notice();
                    return Some(configuration);
                }
            }
        }
        if value["options"].get("technologies").is_some() {
            self.recover_notice();
        }
        None
    }
    pub fn remember_location(&mut self, path: PathBuf) {
        self.recent_locations.retain(|p| p != &path);
        self.recent_locations.insert(0, path.clone());
        self.recent_locations.truncate(5);
        self.parent_path = path;
    }
    pub fn save(&self, file: &Path) -> Result<(), String> {
        if self.future_version {
            return Err("These settings were written by a newer app. Preferences will apply for this session only.".into());
        }
        validate_accent(&self.accent, &self.custom_accent).map_err(|error| error.message)?;
        let parent = file.parent().ok_or("Preference location is unavailable.")?;
        fs::create_dir_all(parent)
            .map_err(|_| "Could not save preferences. Check app data permissions.")?;
        if self.needs_backup && file.exists() {
            let backup_path = self
                .backup_file
                .clone()
                .unwrap_or_else(|| file.with_extension("json.bak"));
            if !backup_path.exists() {
                let mut backup = tempfile::NamedTempFile::new_in(parent).map_err(|_| {
                    "Could not back up the original settings; they have not been replaced."
                })?;
                let mut original = fs::File::open(file)
                    .map_err(|_| "Could not read the original settings for backup.")?;
                std::io::copy(&mut original, &mut backup)
                    .and_then(|_| backup.as_file().sync_all())
                    .map_err(|_| "Could not finish the settings backup.")?;
                backup
                    .persist_noclobber(backup_path)
                    .map_err(|_| "Could not preserve the original settings backup.")?;
            }
        }
        let bytes = serde_json::to_vec_pretty(self).map_err(|_| "Could not encode preferences.")?;
        if bytes.len() > 8 * 1024 * 1024 {
            return Err(
                "Saved settings exceed 8 MiB. Remove unused large presets before saving.".into(),
            );
        }
        let mut temporary = tempfile::NamedTempFile::new_in(parent)
            .map_err(|_| "Could not create a settings file.")?;
        temporary
            .write_all(&bytes)
            .and_then(|_| temporary.as_file().sync_all())
            .map_err(|_| "Could not finish saving preferences.")?;
        temporary
            .persist(file)
            .map_err(|_| "Could not replace the preferences file.".to_string())?;
        Ok(())
    }
    pub fn save_preset(
        &mut self,
        name: String,
        configuration: Configuration,
    ) -> Result<String, AppError> {
        validate_configuration(&configuration)?;
        if !valid_preset_name(&name) || self.custom_presets.len() >= 50 {
            return Err(preset_error(
                "Use a name of 1–60 characters. Up to 50 custom presets can be saved.",
            ));
        }
        if self
            .custom_presets
            .iter()
            .any(|p| p.name.eq_ignore_ascii_case(name.trim()))
        {
            return Err(preset_error(
                "A custom preset with this name already exists.",
            ));
        }
        let base = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let id = format!("custom-{base}");
        self.custom_presets.push(ProjectPreset {
            id: id.clone(),
            name: name.trim().into(),
            description: String::new(),
            configuration,
        });
        Ok(id)
    }
    pub fn rename_preset(&mut self, id: &str, name: &str) -> Result<(), AppError> {
        if !valid_preset_name(name)
            || self
                .custom_presets
                .iter()
                .any(|p| p.id != id && p.name.eq_ignore_ascii_case(name.trim()))
        {
            return Err(preset_error(
                "Choose a unique preset name of 1–60 characters.",
            ));
        }
        let preset = self
            .custom_presets
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| preset_error("This custom preset is unavailable."))?;
        preset.name = name.trim().into();
        Ok(())
    }
    pub fn update_preset(
        &mut self,
        id: &str,
        name: &str,
        description: &str,
        configuration: Configuration,
    ) -> Result<(), AppError> {
        validate_configuration(&configuration)?;
        if !valid_description(description) {
            return Err(preset_error(
                "Use a description of at most 500 characters without control characters.",
            ));
        }
        self.rename_preset(id, name)?;
        let preset = self
            .custom_presets
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| preset_error("This custom preset is unavailable."))?;
        preset.description = description.trim().into();
        preset.configuration = configuration;
        Ok(())
    }
    pub fn save_instructions(
        &mut self,
        name: String,
        profile: crate::ai::InstructionProfile,
    ) -> Result<String, AppError> {
        crate::ai::validate_profile(&profile)?;
        if !valid_preset_name(&name)
            || self.instruction_presets.len() >= 50
            || self
                .instruction_presets
                .iter()
                .any(|p| p.name.eq_ignore_ascii_case(name.trim()))
        {
            return Err(preset_error("Choose a unique instruction preset name of 1–60 characters. Up to 50 can be saved."));
        }
        let id = format!(
            "instructions-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        self.instruction_presets.push(crate::ai::SavedInstructions {
            id: id.clone(),
            name: name.trim().into(),
            profile,
        });
        Ok(id)
    }
    pub fn delete_preset(&mut self, id: &str) -> Result<(), AppError> {
        let index = self
            .custom_presets
            .iter()
            .position(|p| p.id == id)
            .ok_or_else(|| preset_error("This custom preset is unavailable."))?;
        self.custom_presets.remove(index);
        Ok(())
    }
}
fn valid_preset_name(name: &str) -> bool {
    !name.trim().is_empty() && name.chars().count() <= 60 && !name.chars().any(|c| c.is_control())
}
pub fn valid_description(description: &str) -> bool {
    description.chars().count() <= 500 && !description.chars().any(|c| c.is_control())
}
fn preset_error(message: &str) -> AppError {
    AppError::new(message, "Update the preset and try again.")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accent_defaults_distinguish_new_installations_from_saved_themes() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("preferences.json");
        let fresh = Preferences::load(&file, directory.path().into());
        assert_eq!(fresh.accent, "teal");
        assert_eq!(fresh.custom_accent, "#4FA69B");
        assert_eq!(fresh.appearance, Appearance::System);
        for (theme, appearance) in [
            ("system", Appearance::System),
            ("light", Appearance::Light),
            ("dark", Appearance::Dark),
        ] {
            let legacy = serde_json::json!({"schemaVersion":5,"parentPath":directory.path(),"appearance":theme});
            fs::write(&file, serde_json::to_vec(&legacy).unwrap()).unwrap();
            let saved = Preferences::load(&file, directory.path().into());
            assert_eq!(saved.accent, "copper");
            assert_eq!(saved.custom_accent, "#4FA69B");
            assert_eq!(saved.appearance, appearance);
            assert!(!saved.needs_backup);
            saved.save(&file).unwrap();
            let restored = Preferences::load(&file, directory.path().into());
            assert_eq!(restored.accent, "copper");
            assert_eq!(restored.appearance, appearance);
        }
    }
    #[test]
    fn every_named_accent_and_custom_colour_round_trip_without_schema_changes() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("preferences.json");
        for accent in ["slate", "teal", "gold", "copper", "monochrome", "custom"] {
            let mut preferences = Preferences::new(directory.path().into());
            preferences.accent = accent.into();
            preferences.custom_accent = "#123ABC".into();
            preferences.save(&file).unwrap();
            let loaded = Preferences::load(&file, directory.path().into());
            assert_eq!(loaded.accent, accent);
            assert_eq!(loaded.custom_accent, "#123ABC");
            assert_eq!(loaded.schema_version, SETTINGS_VERSION);
        }
        fs::write(
            &file,
            r##"{"schemaVersion":5,"accent":"custom","customAccent":"#abcDEF"}"##,
        )
        .unwrap();
        assert_eq!(
            Preferences::load(&file, directory.path().into()).custom_accent,
            "#ABCDEF"
        );
    }
    #[test]
    fn malformed_accent_settings_keep_other_preferences_and_back_up_original_data() {
        for (accent, custom) in [
            (
                serde_json::json!("unsupported"),
                serde_json::json!("#123456"),
            ),
            (serde_json::json!(50), serde_json::json!("#123456")),
            (serde_json::json!("custom"), serde_json::json!("#GG0000")),
            (serde_json::json!("teal"), serde_json::json!(false)),
        ] {
            let directory = tempfile::tempdir().unwrap();
            let file = directory.path().join("preferences.json");
            let original = serde_json::json!({"schemaVersion":5,"appearance":"dark","destination":"github","accent":accent,"customAccent":custom}).to_string();
            fs::write(&file, &original).unwrap();
            let preferences = Preferences::load(&file, directory.path().into());
            assert!(preferences.needs_backup);
            assert!(preferences.recovery_notice.is_some());
            assert_eq!(preferences.appearance, Appearance::Dark);
            assert_eq!(preferences.destination, Destination::Github);
            assert!(validate_accent(&preferences.accent, &preferences.custom_accent).is_ok());
            preferences.save(&file).unwrap();
            assert_eq!(
                fs::read_to_string(file.with_extension("json.bak")).unwrap(),
                original
            );
        }
    }
}
