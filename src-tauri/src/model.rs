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
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateRequest {
    pub name: String,
    pub description: String,
    pub destination: Destination,
    pub visibility: Visibility,
    pub readme: Readme,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedRepo {
    pub name: String,
    pub path: String,
    pub github_url: Option<String>,
    pub commit: String,
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
    Ok(())
}

pub fn render_readme(request: &CreateRequest) -> Option<String> {
    if request.readme == Readme::None {
        return None;
    }
    let mut result = format!("# {}\n", request.name);
    if !request.description.trim().is_empty() {
        result.push_str(&format!("\n{}\n", request.description.trim()));
    }
    if request.readme == Readme::General {
        result.push_str("\n## Getting started\n\nAdd installation instructions and the steps needed to run this project.\n\n## Usage\n\nDescribe how to use the project, with a short example.\n\n## Development\n\nDocument the local setup and how to run checks and tests.\n\n## Contributing\n\nIssues and pull requests are welcome. Open an issue to discuss substantial changes first.\n");
    }
    Some(result)
}
