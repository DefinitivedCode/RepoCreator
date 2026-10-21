use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Destination {
    #[default]
    Local,
    Github,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    #[default]
    Private,
    Public,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Readme {
    #[default]
    General,
    Minimal,
    None,
    Custom,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateRequest {
    pub name: String,
    pub description: String,
    pub destination: Destination,
    pub visibility: Visibility,
    pub readme: Readme,
    #[serde(default)]
    pub options: crate::config::ProjectOptions,
    #[serde(default)]
    pub github_owner: String,
    #[serde(default)]
    pub topics: Vec<String>,
    #[serde(default)]
    pub homepage: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedRepo {
    pub name: String,
    pub path: String,
    pub github_url: Option<String>,
    pub commit: String,
    pub branch: String,
    pub commit_message: String,
    pub files: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub message: String,
    pub guidance: String,
    pub local_path: Option<String>,
    pub local_ready: bool,
    pub can_retry: bool,
    pub github_url: Option<String>,
}

impl AppError {
    pub fn new(message: impl Into<String>, guidance: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            guidance: guidance.into(),
            local_path: None,
            local_ready: false,
            can_retry: false,
            github_url: None,
        }
    }
}

pub fn validate_name(name: &str) -> Result<(), AppError> {
    let invalid = |message| {
        Err(AppError::new(message, "Use 1–100 letters, numbers, dots, hyphens or underscores. Start with a letter or number."))
    };
    if name.is_empty() || name.len() > 100 {
        return invalid("Enter a project name between 1 and 100 characters.");
    }
    if !name.as_bytes()[0].is_ascii_alphanumeric()
        || !name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
    {
        return invalid("Use a valid repository name.");
    }
    if name.ends_with('.') || name.to_ascii_lowercase().ends_with(".git") {
        return invalid("Names cannot end in a dot or .git.");
    }
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    if [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]
    .contains(&stem.as_str())
    {
        return invalid("This name is reserved by Windows.");
    }
    Ok(())
}

pub fn validate_request(request: &CreateRequest) -> Result<(), AppError> {
    validate_name(&request.name)?;
    if request.description.chars().count() > 350 || request.description.contains('\0') {
        return Err(AppError::new(
            "Description must be 350 characters or fewer.",
            "Remove any null characters and shorten the description.",
        ));
    }
    crate::config::validate_options(&request.options)?;
    if request.destination == Destination::Local {
        return Ok(());
    }
    let owner = &request.github_owner;
    if owner.len() > 39
        || (!owner.is_empty()
            && (owner.starts_with('-')
                || owner.ends_with('-')
                || !owner
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'-')))
    {
        return Err(AppError::new(
            "Choose a valid GitHub owner.",
            "Select your account or an organisation from the owner list.",
        ));
    }
    if request.topics.len() > 20
        || request.topics.iter().any(|t| {
            t.is_empty()
                || t.len() > 50
                || !t
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
                || t.starts_with('-')
        })
    {
        return Err(AppError::new(
            "GitHub topics are invalid.",
            "Use up to 20 topics, each with 1–50 lowercase letters, numbers or hyphens.",
        ));
    }
    if !request.homepage.is_empty() {
        let valid = tauri::Url::parse(&request.homepage).is_ok_and(|url| {
            matches!(url.scheme(), "https" | "http")
                && url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none()
        });
        if !valid || request.homepage.len() > 2000 {
            return Err(AppError::new(
                "Enter a valid homepage URL.",
                "Use an http:// or https:// address without embedded credentials.",
            ));
        }
    }
    Ok(())
}
