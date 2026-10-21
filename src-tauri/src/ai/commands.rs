use super::*;
use crate::{acquire, lock_error, preferences::Preferences, Runtime};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
    sync::Arc,
};
use tauri::State;

fn edit_preferences(
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
pub fn save_instruction_preset(
    name: String,
    profile: InstructionProfile,
    state: State<'_, Arc<Runtime>>,
) -> Result<Preferences, AppError> {
    edit_preferences(&state, |prefs| {
        prefs.save_instructions(name, profile)?;
        Ok(())
    })
}
#[tauri::command(async)]
pub fn delete_instruction_preset(
    id: String,
    state: State<'_, Arc<Runtime>>,
) -> Result<Preferences, AppError> {
    edit_preferences(&state, |prefs| {
        let index = prefs
            .instruction_presets
            .iter()
            .position(|p| p.id == id)
            .ok_or_else(|| error("This saved instruction preset is unavailable."))?;
        prefs.instruction_presets.remove(index);
        Ok(())
    })
}
#[tauri::command(async)]
pub fn save_specialist(
    role: Specialist,
    state: State<'_, Arc<Runtime>>,
) -> Result<Preferences, AppError> {
    validate_specialist(&role)?;
    if !role.id.starts_with("custom-") {
        return Err(error("Custom specialist IDs must start with custom-."));
    }
    edit_preferences(&state, |prefs| {
        if let Some(saved) = prefs
            .specialist_library
            .iter_mut()
            .find(|r| r.id == role.id)
        {
            *saved = role;
        } else if prefs.specialist_library.len() < 50 {
            prefs.specialist_library.push(role);
        } else {
            return Err(error("Up to 50 custom specialists can be saved."));
        }
        Ok(())
    })
}
#[tauri::command(async)]
pub fn delete_specialist(
    id: String,
    state: State<'_, Arc<Runtime>>,
) -> Result<Preferences, AppError> {
    edit_preferences(&state, |prefs| {
        let index = prefs
            .specialist_library
            .iter()
            .position(|r| r.id == id)
            .ok_or_else(|| error("This saved specialist is unavailable."))?;
        prefs.specialist_library.remove(index);
        Ok(())
    })
}

pub fn read_text(path: &Path, max: usize) -> Result<String, AppError> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .and_then(|file| file.take(max as u64 + 1).read_to_end(&mut bytes))
        .map_err(|_| error("Could not read the selected file."))?;
    let text = String::from_utf8(bytes).map_err(|_| error("Choose a UTF-8 text file."))?;
    if !text_valid(&text, max) {
        return Err(error(format!(
            "The selected file must be valid text up to {max} UTF-8 bytes."
        )));
    }
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_string())
}
#[tauri::command]
pub async fn import_instructions(
    state: State<'_, Arc<Runtime>>,
) -> Result<Option<String>, AppError> {
    let _guard = acquire(state.inner())?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("Import additional instructions")
        .add_filter("Markdown", &["md", "markdown"])
        .pick_file()
        .await;
    let Some(file) = file else {
        return Ok(None);
    };
    let path = file.path().to_path_buf();
    if !path
        .extension()
        .is_some_and(|e| ["md", "markdown"].iter().any(|v| e.eq_ignore_ascii_case(v)))
    {
        return Err(error("Choose a Markdown file (.md or .markdown)."));
    }
    tauri::async_runtime::spawn_blocking(move || read_text(&path, 65_536))
        .await
        .map_err(|_| lock_error())?
        .map(Some)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstructionExchange {
    pub schema_version: u32,
    pub name: String,
    pub profile: InstructionProfile,
}
pub fn decode_preset(text: &str) -> Result<InstructionExchange, AppError> {
    let preset: InstructionExchange = serde_json::from_str(text)
        .map_err(|_| error("This is not a valid instruction preset JSON file."))?;
    if preset.schema_version != 1
        || !single_line(&preset.name, 240)
        || preset.name.chars().count() > 60
    {
        return Err(error(
            "This instruction preset version or name is unsupported.",
        ));
    }
    validate_profile(&preset.profile)?;
    Ok(preset)
}
#[tauri::command]
pub async fn export_instruction_preset(
    name: String,
    profile: InstructionProfile,
    state: State<'_, Arc<Runtime>>,
) -> Result<bool, AppError> {
    let _guard = acquire(state.inner())?;
    validate_profile(&profile)?;
    if !single_line(&name, 240) || name.chars().count() > 60 {
        return Err(error(
            "Enter an instruction preset name of 1–60 characters.",
        ));
    }
    let exchange = InstructionExchange {
        schema_version: 1,
        name,
        profile,
    };
    let bytes = serde_json::to_vec_pretty(&exchange)
        .map_err(|_| error("Could not encode this instruction preset."))?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("Export instruction preset")
        .set_file_name("instructions.json")
        .add_filter("Instruction preset", &["json"])
        .save_file()
        .await;
    let Some(file) = file else {
        return Ok(false);
    };
    let path = file.path().to_path_buf();
    if !path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("json"))
    {
        return Err(error("Choose a .json filename for the instruction preset."));
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
            .map_err(|_| error("Could not save the instruction preset."))?;
        Ok(true)
    })
    .await
    .map_err(|_| lock_error())?
}
#[tauri::command]
pub async fn import_instruction_preset(
    state: State<'_, Arc<Runtime>>,
) -> Result<Option<Preferences>, AppError> {
    let _guard = acquire(state.inner())?;
    let file = rfd::AsyncFileDialog::new()
        .set_title("Import instruction preset")
        .add_filter("Instruction preset", &["json"])
        .pick_file()
        .await;
    let Some(file) = file else {
        return Ok(None);
    };
    let path = file.path().to_path_buf();
    let preset =
        tauri::async_runtime::spawn_blocking(move || decode_preset(&read_text(&path, 524_288)?))
            .await
            .map_err(|_| lock_error())??;
    edit_preferences(&state, |prefs| {
        prefs.save_instructions(preset.name, preset.profile)?;
        Ok(())
    })
    .map(Some)
}
