use crate::model::{AppError, Readme};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const SECTION_IDS: &[&str] = &[
    "overview",
    "features",
    "installation",
    "usage",
    "development",
    "contributing",
    "license",
];
pub fn current_year() -> String {
    time::OffsetDateTime::now_utc().year().to_string()
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExperienceMode {
    #[default]
    Simple,
    Advanced,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub enum License {
    #[default]
    #[serde(rename = "none")]
    None,
    #[serde(rename = "MIT")]
    Mit,
    #[serde(rename = "Apache-2.0")]
    Apache,
    #[serde(rename = "GPL-3.0")]
    Gpl,
    #[serde(rename = "BSD-3-Clause")]
    Bsd,
    Unlicense,
}
impl License {
    pub fn id(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Mit => "MIT",
            Self::Apache => "Apache-2.0",
            Self::Gpl => "GPL-3.0-only",
            Self::Bsd => "BSD-3-Clause",
            Self::Unlicense => "Unlicense",
        }
    }
    pub fn requires_author(self) -> bool {
        !matches!(self, Self::None | Self::Unlicense)
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct PostActions {
    pub folder: bool,
    pub vscode: bool,
    pub github: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectOptions {
    pub ai: crate::ai::AiStudio,
    pub readme_sections: Vec<String>,
    pub section_content: BTreeMap<String, String>,
    pub ignore_presets: Vec<String>,
    pub custom_patterns: Vec<String>,
    pub license: License,
    pub copyright_name: String,
    pub copyright_year: String,
    pub initial_branch: String,
    pub commit_message: String,
    pub commit_author_name: String,
    pub commit_author_email: String,
    pub editorconfig: bool,
    pub gitattributes: bool,
    pub post_actions: PostActions,
}
impl Default for ProjectOptions {
    fn default() -> Self {
        Self {
            ai: crate::ai::AiStudio::default(),
            readme_sections: vec!["overview".into(), "license".into()],
            section_content: BTreeMap::new(),
            ignore_presets: vec!["os".into(), "secrets".into()],
            custom_patterns: Vec::new(),
            license: License::None,
            copyright_name: String::new(),
            copyright_year: current_year(),
            initial_branch: "main".into(),
            commit_message: "Initial commit".into(),
            commit_author_name: String::new(),
            commit_author_email: String::new(),
            editorconfig: false,
            gitattributes: false,
            post_actions: PostActions::default(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Configuration {
    pub readme: Readme,
    pub options: ProjectOptions,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub destination: Option<crate::model::Destination>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<crate::model::Visibility>,
    pub brief: crate::model::ProjectBrief,
    #[serde(default = "crate::model::discovery_template")]
    pub handoff_template: String,
}

impl Default for Configuration {
    fn default() -> Self {
        Self {
            readme: Readme::default(),
            options: ProjectOptions::default(),
            destination: None,
            visibility: None,
            brief: crate::model::ProjectBrief::default(),
            handoff_template: crate::model::discovery_template(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPreset {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub configuration: Configuration,
}

pub fn built_in_presets() -> Vec<ProjectPreset> {
    let definitions: &[(&str, &str, &[&str], bool, bool)] = &[
        ("default", "Default", &["os", "secrets"], false, false),
        ("blank", "Blank repository", &[], false, false),
        (
            "web",
            "Web application",
            &["os", "secrets", "node", "frontend"],
            true,
            false,
        ),
        (
            "react-vite",
            "React / Vite",
            &["os", "secrets", "node", "react", "vite", "typescript"],
            true,
            false,
        ),
        (
            "python",
            "Python project",
            &["os", "secrets", "python"],
            true,
            false,
        ),
        (
            "rust",
            "Rust project",
            &["os", "secrets", "rust"],
            false,
            true,
        ),
        (
            "tauri",
            "Tauri application",
            &[
                "os",
                "secrets",
                "node",
                "vite",
                "typescript",
                "rust",
                "tauri",
            ],
            true,
            true,
        ),
        (
            "unity",
            "Unity project",
            &["os", "secrets", "unity", "csharp"],
            false,
            true,
        ),
    ];
    let mut presets: Vec<ProjectPreset> = definitions
        .iter()
        .map(|(id, name, ignores, editorconfig, attributes)| {
            let mut options = ProjectOptions {
                ignore_presets: ignores.iter().map(|s| (*s).into()).collect(),
                editorconfig: *editorconfig,
                gitattributes: *attributes,
                readme_sections: if *id == "blank" {
                    Vec::new()
                } else {
                    ProjectOptions::default().readme_sections
                },
                ..Default::default()
            };
            options.ai.instructions.technologies = crate::ai::catalog()
                .technologies
                .iter()
                .filter(|t| t.project_presets.iter().any(|p| p == id))
                .map(|t| t.id.clone())
                .collect();
            ProjectPreset {
                id: (*id).into(),
                name: (*name).into(),
                description: match *id {
                    "blank" => "An almost empty repository, ready for your own files.",
                    "default" => "A balanced project with documentation and safe ignore rules.",
                    "web" => "Web development conventions without installing a framework.",
                    _ => "Technology guidance, documentation and matching ignore rules.",
                }
                .into(),
                configuration: Configuration {
                    readme: if *id == "blank" {
                        Readme::None
                    } else {
                        Readme::General
                    },
                    options,
                    ..Default::default()
                },
            }
        })
        .collect();
    // Keep the original IDs so existing saved selections remain compatible.
    for (id, name, description, ignores) in [
        (
            "standard",
            "Standard",
            "A maintainable software project with balanced documentation and safe defaults.",
            vec!["os", "secrets"],
        ),
        (
            "experiment",
            "Experiment",
            "A small private experiment with lightweight notes and a Discovery handoff.",
            vec!["os", "secrets"],
        ),
        (
            "website",
            "Website",
            "Frontend guidance and web ignore rules; choose your framework later.",
            vec!["os", "secrets", "node", "frontend"],
        ),
        (
            "desktop",
            "Desktop Application",
            "A platform-neutral desktop starting point with no assumed language or framework.",
            vec!["os", "secrets"],
        ),
        (
            "claude-experiment",
            "Claude Experiment",
            "A beginner-friendly experiment with Claude instructions and a Discovery handoff.",
            vec!["os", "secrets"],
        ),
    ] {
        let experiment = id == "experiment" || id == "claude-experiment";
        let mut configuration = Configuration {
            readme: if experiment {
                Readme::Custom
            } else {
                Readme::General
            },
            visibility: Some(crate::model::Visibility::Private),
            ..Default::default()
        };
        configuration.options.ignore_presets = ignores.into_iter().map(str::to_string).collect();
        if experiment {
            configuration.options.readme_sections = vec!["overview".into()];
            configuration.options.section_content.insert("overview".into(), "{{description}}\n\nThis is an experimental project for exploring ideas, testing concepts and evaluating possible approaches. Its design and implementation may change during development.".into());
            configuration.options.ai.instructions.custom_text = "Explore the idea with the user. Explain choices in plain language, keep the first version small, and verify meaningful changes. Ask focused questions when requirements are unclear.".into();
        }
        if id == "website" {
            configuration.options.editorconfig = true;
            configuration.options.ai.instructions.technologies = crate::ai::catalog()
                .technologies
                .iter()
                .filter(|t| t.project_presets.iter().any(|p| p == "web"))
                .map(|t| t.id.clone())
                .collect();
            configuration.handoff_template = "architecture".into();
        }
        if id == "claude-experiment" {
            configuration.options.ai.enabled = true;
            configuration.options.ai.agents = vec![crate::ai::Agent::Claude];
        }
        presets.push(ProjectPreset {
            id: id.into(),
            name: name.into(),
            description: description.into(),
            configuration,
        });
    }
    presets
}

pub fn validate_branch(branch: &str) -> Result<(), AppError> {
    let invalid = branch.is_empty()
        || branch.len() > 200
        || branch == "@"
        || branch == "HEAD"
        || branch.starts_with(['-', '/'])
        || branch.ends_with(['/', '.'])
        || branch.contains("..")
        || branch.contains("@{")
        || branch.contains("//")
        || branch
            .chars()
            .any(|c| c.is_control() || " ~^:?*[\\".contains(c))
        || branch
            .split('/')
            .any(|part| part.starts_with('.') || part.to_ascii_lowercase().ends_with(".lock"));
    if invalid {
        return Err(AppError::new("Enter a valid initial branch.", "Use a branch such as main or feature/start. Avoid spaces, control characters, consecutive dots and .lock endings."));
    }
    Ok(())
}

pub fn validate_options(options: &ProjectOptions) -> Result<(), AppError> {
    crate::ai::validate(&options.ai)?;
    let fail = |message| {
        AppError::new(
            message,
            "Update the highlighted configuration and try again.",
        )
    };
    validate_branch(&options.initial_branch)?;
    let identity_supplied =
        !options.commit_author_name.is_empty() || !options.commit_author_email.is_empty();
    let valid_email = options
        .commit_author_email
        .split_once('@')
        .is_some_and(|(local, domain)| {
            !local.is_empty() && !domain.is_empty() && !domain.contains('@')
        });
    if identity_supplied
        && (options.commit_author_name.trim().is_empty()
            || options.commit_author_email.trim().is_empty()
            || options.commit_author_name.len() > 100
            || options.commit_author_email.len() > 254
            || options
                .commit_author_name
                .chars()
                .chain(options.commit_author_email.chars())
                .any(|c| c.is_control() || matches!(c, '<' | '>'))
            || !valid_email
            || options.commit_author_email.contains(char::is_whitespace))
    {
        return Err(fail("Enter both a project Git author name and a valid email address, or leave both empty to use your existing Git identity."));
    }
    if options.commit_message.trim().is_empty()
        || options.commit_message.len() > 2000
        || options.commit_message.contains('\0')
    {
        return Err(fail("Enter an initial commit message of 1–2000 bytes."));
    }
    if options.readme_sections.len() > SECTION_IDS.len()
        || options
            .readme_sections
            .iter()
            .any(|s| !SECTION_IDS.contains(&s.as_str()))
        || options.section_content.len() > SECTION_IDS.len()
        || options.section_content.iter().any(|(k, v)| {
            !SECTION_IDS.contains(&k.as_str()) || v.len() > 20_000 || v.contains('\0')
        })
    {
        return Err(fail("README sections are invalid or too long."));
    }
    if options.custom_patterns.len() > 100
        || options
            .custom_patterns
            .iter()
            .any(|s| s.len() > 500 || s.contains(['\0', '\n', '\r']) || s.trim().is_empty())
    {
        return Err(fail(
            "Use up to 100 custom ignore patterns, each on one line and at most 500 bytes.",
        ));
    }
    let catalog = crate::generation::ignore_catalog();
    if options.ignore_presets.len() > catalog.len()
        || options
            .ignore_presets
            .iter()
            .any(|id| !catalog.iter().any(|item| &item.id == id))
    {
        return Err(fail(
            "An ignore preset is unavailable. Choose a current preset.",
        ));
    }
    if options.license.requires_author()
        && (options.copyright_name.trim().is_empty()
            || options.copyright_name.len() > 160
            || options.copyright_name.chars().any(|c| c.is_control())
            || options.copyright_year.len() != 4
            || !options.copyright_year.bytes().all(|b| b.is_ascii_digit())
            || options.copyright_year.parse::<u32>().unwrap_or(0) < 1900)
    {
        return Err(fail(
            "Enter a copyright holder and a four-digit year from 1900 onward.",
        ));
    }
    Ok(())
}

pub fn validate_configuration(configuration: &Configuration) -> Result<(), AppError> {
    validate_options(&configuration.options)?;
    crate::model::validate_brief(&configuration.brief, &configuration.handoff_template)
}
