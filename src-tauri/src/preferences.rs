use crate::{
    config::{validate_options, Appearance, Configuration, ProjectPreset},
    model::{AppError, Destination},
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub const SETTINGS_VERSION: u32 = 2;
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub schema_version: u32,
    pub parent_path: PathBuf,
    pub destination: Destination,
    pub appearance: Appearance,
    pub recent_locations: Vec<PathBuf>,
    pub defaults: Configuration,
    pub custom_presets: Vec<ProjectPreset>,
    #[serde(skip)]
    pub future_version: bool,
    #[serde(skip)]
    pub needs_backup: bool,
}
impl Preferences {
    pub fn new(parent_path: PathBuf) -> Self {
        Self {
            schema_version: SETTINGS_VERSION,
            parent_path,
            destination: Destination::Local,
            appearance: Appearance::System,
            recent_locations: Vec::new(),
            defaults: Configuration::default(),
            custom_presets: Vec::new(),
            future_version: false,
            needs_backup: false,
        }
    }
    pub fn load(file: &Path, fallback: PathBuf) -> Self {
        let mut result = Self::new(fallback);
        let bytes = match fs::read(file) {
            Ok(bytes) if bytes.len() <= 8 * 1024 * 1024 => bytes,
            Ok(_) => {
                result.needs_backup = true;
                return result;
            }
            Err(_) => return result,
        };
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
        if let Ok(defaults) = serde_json::from_value::<Configuration>(value["defaults"].clone()) {
            if validate_options(&defaults.options).is_ok() {
                result.defaults = defaults;
            }
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
                if let Ok(preset) = serde_json::from_value::<ProjectPreset>(preset.clone()) {
                    if preset.id.starts_with("custom-")
                        && preset.id.len() < 80
                        && valid_preset_name(&preset.name)
                        && validate_options(&preset.configuration.options).is_ok()
                        && !result.custom_presets.iter().any(|p| p.id == preset.id)
                    {
                        result.custom_presets.push(preset);
                    }
                }
            }
        }
        result
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
        let parent = file.parent().ok_or("Preference location is unavailable.")?;
        fs::create_dir_all(parent)
            .map_err(|_| "Could not save preferences. Check app data permissions.")?;
        if self.needs_backup && file.exists() {
            if let Ok(mut backup) = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(file.with_extension("json.bak"))
            {
                if let Ok(bytes) = fs::read(file) {
                    let _ = backup.write_all(&bytes);
                }
            }
        }
        let bytes = serde_json::to_vec_pretty(self).map_err(|_| "Could not encode preferences.")?;
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
        validate_options(&configuration.options)?;
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
fn preset_error(message: &str) -> AppError {
    AppError::new(message, "Update the preset and try again.")
}
