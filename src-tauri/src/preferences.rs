use crate::model::Destination;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub parent_path: PathBuf,
    #[serde(default)]
    pub destination: Destination,
}

impl Preferences {
    pub fn load(file: &Path, fallback: PathBuf) -> Self {
        fs::read(file)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Self>(&bytes).ok())
            .and_then(|mut value| {
                value.parent_path = value.parent_path.canonicalize().ok()?;
                value.parent_path.is_dir().then_some(value)
            })
            .unwrap_or(Self {
                parent_path: fallback,
                destination: Destination::Local,
            })
    }

    pub fn save(&self, file: &Path) -> Result<(), String> {
        let parent = file.parent().ok_or("Preference location is unavailable.")?;
        fs::create_dir_all(parent)
            .map_err(|_| "Could not save preferences. Check app data permissions.")?;
        let bytes = serde_json::to_vec_pretty(self).map_err(|_| "Could not encode preferences.")?;
        fs::write(file, bytes)
            .map_err(|_| "Could not save preferences. Check app data permissions.".into())
    }
}
