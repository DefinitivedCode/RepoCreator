//! Shared technology catalogue and non-destructive legacy migration.
use crate::{
    config::ProjectOptions,
    model::{AppError, ProjectBrief},
};
use serde::{Deserialize, Deserializer, Serialize};
use std::{collections::HashSet, sync::OnceLock};

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTechnologies {
    pub ids: Vec<String>,
    pub custom: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub preset_ids: Vec<String>,
    // Missing legacy selections may migrate. Explicit empty selections never repopulate.
    #[serde(skip)]
    legacy: bool,
}
impl Default for ProjectTechnologies {
    fn default() -> Self {
        Self {
            ids: Vec::new(),
            custom: Vec::new(),
            preset_ids: Vec::new(),
            legacy: true,
        }
    }
}
impl<'de> Deserialize<'de> for ProjectTechnologies {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Default, Deserialize)]
        #[serde(default, rename_all = "camelCase", deny_unknown_fields)]
        struct Value {
            ids: Vec<String>,
            custom: Vec<String>,
            preset_ids: Vec<String>,
        }
        let value = Value::deserialize(deserializer)?;
        let mut result = Self::new(value.ids, value.custom);
        result.preset_ids = value.preset_ids;
        Ok(result)
    }
}
impl ProjectTechnologies {
    pub fn new(ids: Vec<String>, custom: Vec<String>) -> Self {
        Self {
            ids,
            custom,
            preset_ids: Vec::new(),
            legacy: false,
        }
    }
    pub fn from_ids(ids: &[&str]) -> Self {
        Self::new(ids.iter().map(|id| (*id).to_string()).collect(), Vec::new())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Technology {
    pub id: String,
    pub name: String,
    pub category: String,
    pub aliases: Vec<String>,
    pub ignore_presets: Vec<String>,
    pub related: Vec<String>,
    pub guidance: String,
}
pub fn catalog() -> &'static Vec<Technology> {
    static CATALOG: OnceLock<Vec<Technology>> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let entries: Vec<Technology> =
            serde_json::from_str(include_str!("../resources/technologies.json"))
                .expect("Valid technology catalogue");
        assert!(entries.iter().all(|technology| [
            "languages",
            "web",
            "applications",
            "backends",
            "databases",
            "infrastructure"
        ]
        .contains(&technology.category.as_str())
            && technology
                .related
                .iter()
                .all(|id| entries.iter().any(|entry| entry.id == *id))));
        entries
    })
}
fn find(label: &str) -> Option<&'static Technology> {
    catalog().iter().find(|technology| {
        technology.id.eq_ignore_ascii_case(label.trim())
            || technology.name.eq_ignore_ascii_case(label.trim())
            || technology
                .aliases
                .iter()
                .any(|alias| alias.eq_ignore_ascii_case(label.trim()))
    })
}
fn add(value: &mut ProjectTechnologies, label: &str) {
    let printable: String = label
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect();
    let label = printable.trim();
    if label.is_empty()
        || label.eq_ignore_ascii_case("other")
        || label.eq_ignore_ascii_case("not sure yet")
    {
        return;
    }
    if let Some(technology) = find(label) {
        if !value.ids.contains(&technology.id) {
            value.ids.push(technology.id.clone());
        }
    } else if !value
        .custom
        .iter()
        .any(|existing| existing.to_lowercase() == label.to_lowercase())
    {
        value.custom.push(label.into());
    }
}
pub fn effective(options: &ProjectOptions, brief: &ProjectBrief) -> ProjectTechnologies {
    if !options.technologies.legacy
        || !options.technologies.ids.is_empty()
        || !options.technologies.custom.is_empty()
    {
        return options.technologies.clone();
    }
    let mut value = ProjectTechnologies::new(Vec::new(), Vec::new());
    for label in brief.technologies.split([',', ';', '\n', '/']) {
        add(&mut value, label);
    }
    for id in &options.ai.instructions.technologies {
        add(&mut value, id);
    }
    if value.custom.len() > 30 {
        value.custom = vec![brief
            .technologies
            .chars()
            .map(|character| {
                if character.is_control() {
                    ' '
                } else {
                    character
                }
            })
            .collect::<String>()
            .trim()
            .to_string()];
    }
    value
}
pub fn summary(value: &ProjectTechnologies) -> String {
    value
        .ids
        .iter()
        .map(|id| find(id).map_or(id.as_str(), |technology| technology.name.as_str()))
        .chain(value.custom.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(", ")
}
pub fn validate(value: &ProjectTechnologies) -> Result<(), AppError> {
    let mut ids = HashSet::new();
    let mut labels = HashSet::new();
    let mut preset_ids = HashSet::new();
    if value.ids.len() > catalog().len()
        || value.custom.len() > 30
        || value
            .preset_ids
            .iter()
            .any(|id| !value.ids.contains(id) || !preset_ids.insert(id))
        || value
            .ids
            .iter()
            .any(|id| !catalog().iter().any(|technology| technology.id == *id) || !ids.insert(id))
        || value.custom.iter().any(|label| {
            label.trim().is_empty()
                || label.trim() != label
                || label.len() > 4096
                || label.chars().any(char::is_control)
                || find(label).is_some()
                || !labels.insert(label.to_lowercase())
        })
    {
        return Err(AppError::new("Project technologies are invalid.", "Choose known technologies or up to 30 unique custom labels of at most 4,096 UTF-8 bytes."));
    }
    Ok(())
}
pub fn recommended_ignores(value: &ProjectTechnologies) -> Vec<String> {
    let mut result = Vec::new();
    for technology in catalog()
        .iter()
        .filter(|technology| value.ids.contains(&technology.id))
    {
        for id in &technology.ignore_presets {
            if !result.contains(id) {
                result.push(id.clone());
            }
        }
    }
    result
}
pub fn migrate_configuration_value(value: &mut serde_json::Value) {
    if value["options"].get("technologies").is_some() {
        return;
    }
    if let Ok(configuration) = serde_json::from_value::<crate::config::Configuration>(value.clone())
    {
        let technologies = effective(&configuration.options, &configuration.brief);
        if value.get("options").is_none() {
            if let Some(object) = value.as_object_mut() {
                object.insert("options".into(), serde_json::json!({}));
            }
        }
        if let Some(options) = value["options"].as_object_mut() {
            options.insert(
                "technologies".into(),
                serde_json::to_value(technologies).expect("Serializable technologies"),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preset_provenance_roundtrips_and_rejects_unselected_or_duplicate_ids() {
        let mut value = ProjectTechnologies::from_ids(&["sqlite", "rust", "tauri"]);
        value.preset_ids = vec!["rust".into(), "tauri".into()];
        validate(&value).unwrap();
        let restored: ProjectTechnologies =
            serde_json::from_value(serde_json::to_value(&value).unwrap()).unwrap();
        assert_eq!(restored, value);
        value.preset_ids.push("unity".into());
        assert!(validate(&value).is_err());
        value.preset_ids = vec!["rust".into(), "rust".into()];
        assert!(validate(&value).is_err());
        for preset in crate::config::built_in_presets() {
            assert_eq!(
                preset.configuration.options.technologies.ids,
                preset.configuration.options.technologies.preset_ids
            );
        }
    }
    #[test]
    fn shared_catalogue_has_unique_stable_ids_and_valid_references() {
        let mut ids = HashSet::new();
        let ignore_ids: Vec<_> = crate::generation::ignore_catalog()
            .into_iter()
            .map(|preset| preset.id)
            .collect();
        for technology in catalog() {
            assert!(ids.insert(&technology.id));
            assert!([
                "languages",
                "web",
                "applications",
                "backends",
                "databases",
                "infrastructure"
            ]
            .contains(&technology.category.as_str()));
            assert!(technology
                .related
                .iter()
                .all(|id| catalog().iter().any(|entry| entry.id == *id)));
            assert!(technology
                .ignore_presets
                .iter()
                .all(|id| ignore_ids.contains(id)));
        }
    }
    #[test]
    fn legacy_brief_and_ai_selection_migrate_without_losing_custom_context() {
        let mut options = ProjectOptions::default();
        options.ai.instructions.technologies = vec!["react".into(), "rust".into()];
        let brief = ProjectBrief {
            technologies: "JavaScript / TypeScript, Rust; My framework".into(),
            ..Default::default()
        };
        let value = effective(&options, &brief);
        assert_eq!(value.ids, ["javascript", "typescript", "rust", "react"]);
        assert_eq!(value.custom, ["My framework"]);
        options.technologies = serde_json::from_str(r#"{"ids":[],"custom":[]}"#).unwrap();
        assert!(effective(&options, &brief).ids.is_empty());
    }
    #[test]
    fn multiple_technologies_roundtrip_and_suggest_matching_ignores() {
        let value = ProjectTechnologies::from_ids(&[
            "typescript",
            "react",
            "vite",
            "rust",
            "tauri",
            "sqlite",
            "cloudflare-workers",
        ]);
        validate(&value).unwrap();
        let restored: ProjectTechnologies =
            serde_json::from_value(serde_json::to_value(&value).unwrap()).unwrap();
        assert_eq!(restored, value);
        assert_eq!(
            summary(&value),
            "TypeScript, React, Vite, Rust, Tauri, SQLite, Cloudflare Workers"
        );
        let ignores = recommended_ignores(&value);
        assert!(
            ignores.contains(&"typescript".into())
                && ignores.contains(&"rust".into())
                && ignores.contains(&"tauri".into())
        );
        assert_eq!(ignores.iter().filter(|id| *id == "node").count(), 1);
    }
    #[test]
    fn validation_rejects_unknown_duplicate_or_control_labels() {
        for value in [
            ProjectTechnologies::from_ids(&["unknown"]),
            ProjectTechnologies::from_ids(&["rust", "rust"]),
            ProjectTechnologies::new(vec![], vec!["Rust".into()]),
            ProjectTechnologies::new(vec![], vec!["label\ncommand".into()]),
        ] {
            assert!(validate(&value).is_err());
        }
    }
    #[test]
    fn long_legacy_context_and_many_labels_remain_valid_without_losing_original_brief() {
        let options = ProjectOptions::default();
        for text in [
            format!("Custom toolkit {}", "é".repeat(1000)),
            (0..31)
                .map(|index| format!("Internal{index}"))
                .collect::<Vec<_>>()
                .join(", "),
            "Python\ttoolkit".into(),
        ] {
            let brief = ProjectBrief {
                technologies: text.clone(),
                ..Default::default()
            };
            let value = effective(&options, &brief);
            validate(&value).unwrap();
            assert!(!value.custom.is_empty());
            assert_eq!(brief.technologies, text);
        }
        let mut missing_options = serde_json::json!({"brief":{"technologies":"Rust"}});
        migrate_configuration_value(&mut missing_options);
        assert_eq!(
            missing_options["options"]["technologies"]["ids"],
            serde_json::json!(["rust"])
        );
    }
    #[test]
    fn malformed_persisted_technologies_back_up_the_original_before_recovery() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("preferences.json");
        let original = serde_json::json!({"schemaVersion":5,"defaults":{"options":{"technologies":{"ids":["unknown"],"custom":[]}}}}).to_string();
        std::fs::write(&file, &original).unwrap();
        let restored = crate::preferences::Preferences::load(&file, temp.path().into());
        assert!(restored.recovery_notice.is_some());
        restored.save(&file).unwrap();
        assert_eq!(
            std::fs::read_to_string(file.with_extension("json.bak")).unwrap(),
            original
        );
    }
    #[test]
    fn legacy_preferences_migrate_default_and_custom_presets_and_persist_clear_all() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("preferences.json");
        let mut configuration =
            serde_json::to_value(crate::config::Configuration::default()).unwrap();
        configuration["options"]
            .as_object_mut()
            .unwrap()
            .remove("technologies");
        configuration["brief"]["technologies"] =
            serde_json::json!("JavaScript / TypeScript, My toolkit");
        configuration["options"]["ai"]["instructions"]["technologies"] =
            serde_json::json!(["rust", "react"]);
        let value = serde_json::json!({"schemaVersion":4,"defaults":configuration,"customPresets":[{"id":"custom-legacy","name":"Legacy stack","configuration":configuration}]});
        std::fs::write(&file, serde_json::to_vec(&value).unwrap()).unwrap();
        let mut restored = crate::preferences::Preferences::load(&file, temp.path().into());
        assert_eq!(
            restored.defaults.options.technologies.ids,
            ["javascript", "typescript", "rust", "react"]
        );
        assert_eq!(
            restored.defaults.options.technologies.custom,
            ["My toolkit"]
        );
        assert_eq!(
            restored.custom_presets[0]
                .configuration
                .options
                .technologies,
            restored.defaults.options.technologies
        );
        assert!(restored
            .defaults
            .options
            .ai
            .instructions
            .technologies
            .contains(&"react".into()));
        restored.defaults.options.technologies = ProjectTechnologies::new(Vec::new(), Vec::new());
        restored.save(&file).unwrap();
        let cleared = crate::preferences::Preferences::load(&file, temp.path().into());
        assert!(
            effective(&cleared.defaults.options, &cleared.defaults.brief)
                .ids
                .is_empty()
        );
        assert!(cleared
            .defaults
            .options
            .ai
            .instructions
            .technologies
            .contains(&"react".into()));
    }
    #[test]
    fn selected_technology_guidance_is_unique_and_preserves_authored_wording() {
        let mut request = crate::model::CreateRequest {
            name: "multi-stack".into(),
            ..Default::default()
        };
        request.options.ai.enabled = true;
        request.options.ai.agents = vec![crate::ai::Agent::Codex];
        request.options.ai.instructions.technologies = vec!["react".into()];
        request.options.ai.instructions.technology_wording.insert(
            "react".into(),
            "Keep the existing component boundaries.".into(),
        );
        request.options.technologies = ProjectTechnologies::new(
            vec![
                "typescript".into(),
                "react".into(),
                "rust".into(),
                "tauri".into(),
                "sqlite".into(),
                "cloudflare-workers".into(),
            ],
            vec!["My toolkit".into()],
        );
        let files = crate::generation::generate_files(&request).unwrap();
        let content = &files
            .iter()
            .find(|file| file.path == "AGENTS.md")
            .unwrap()
            .content;
        assert!(content
            .contains("TypeScript, React, Rust, Tauri, SQLite, Cloudflare Workers, My toolkit"));
        assert!(content.contains("different components"));
        assert_eq!(content.matches("## React guidance").count(), 1);
        assert_eq!(
            content
                .matches("Keep the existing component boundaries.")
                .count(),
            1
        );
        assert_eq!(content.matches("## SQLite guidance").count(), 1);
        assert!(content.contains("## Cloudflare Workers guidance"));
    }
    #[test]
    fn preview_normalization_keeps_effective_legacy_technology_output_identical() {
        let mut actual = crate::model::CreateRequest {
            name: "multi-stack".into(),
            ..Default::default()
        };
        actual.options.ai.enabled = true;
        actual.options.ai.agents = vec![crate::ai::Agent::Claude];
        actual.brief.technologies = "Python, SQLite, My toolkit".into();
        let mut preview = actual.clone();
        preview.options.technologies = effective(&actual.options, &actual.brief);
        preview.brief = ProjectBrief::default();
        let files = crate::generation::generate_files(&actual).unwrap();
        let preview_files = crate::generation::generate_files(&preview).unwrap();
        assert_eq!(files.len(), preview_files.len());
        for (actual, preview) in files.iter().zip(preview_files.iter()) {
            assert_eq!(actual.path, preview.path);
            assert_eq!(actual.content, preview.content);
        }
    }
}
