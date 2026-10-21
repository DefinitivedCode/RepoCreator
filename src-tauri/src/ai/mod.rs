pub mod commands;
pub mod generator;
#[cfg(test)]
mod tests;

use crate::model::AppError;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    sync::OnceLock,
};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Agent {
    Codex,
    Claude,
    Copilot,
    Cursor,
    Gemini,
    Opencode,
}
impl Agent {
    pub fn specialist(self) -> bool {
        matches!(
            self,
            Self::Codex | Self::Claude | Self::Copilot | Self::Opencode
        )
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Workflow {
    #[default]
    Balanced,
    Autonomous,
    ReviewFirst,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub group: String,
    pub label: String,
    pub text: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub workflow: Workflow,
    pub rules: Vec<String>,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Specialist {
    pub id: String,
    pub name: String,
    pub description: String,
    pub purpose: String,
    pub instructions: String,
    pub agents: Vec<Agent>,
    pub read_only: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Technology {
    pub id: String,
    pub name: String,
    pub project_presets: Vec<String>,
    pub instructions: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub instructions: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AgentInfo {
    pub id: Agent,
    pub name: String,
    pub specialists: bool,
    pub description: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudioCatalog {
    pub schema_version: u32,
    pub agents: Vec<AgentInfo>,
    pub rules: Vec<Rule>,
    pub presets: Vec<InstructionPreset>,
    pub specialists: Vec<Specialist>,
    pub technologies: Vec<Technology>,
    pub skills: Vec<Skill>,
}
pub fn catalog() -> &'static StudioCatalog {
    static CATALOG: OnceLock<StudioCatalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../../resources/agent-studio.json"))
            .expect("Valid bundled agent catalog")
    })
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct InstructionProfile {
    pub preset: String,
    pub workflow: Workflow,
    pub rules: Vec<String>,
    pub wording: BTreeMap<String, String>,
    pub custom_text: String,
    pub technologies: Vec<String>,
    pub technology_wording: BTreeMap<String, String>,
    pub stack: String,
    pub architecture: String,
    pub conventions: String,
    pub verification: String,
}
impl Default for InstructionProfile {
    fn default() -> Self {
        Self {
            preset: "practical".into(),
            workflow: Workflow::Balanced,
            rules: catalog()
                .presets
                .iter()
                .find(|p| p.id == "practical")
                .unwrap()
                .rules
                .clone(),
            wording: BTreeMap::new(),
            custom_text: String::new(),
            technologies: Vec::new(),
            technology_wording: BTreeMap::new(),
            stack: String::new(),
            architecture: String::new(),
            conventions: String::new(),
            verification: String::new(),
        }
    }
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuleMode {
    #[default]
    Files,
    Requested,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct ScopedRule {
    pub id: String,
    pub name: String,
    pub patterns: Vec<String>,
    pub content: String,
    pub mode: RuleMode,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CodexSandbox {
    ReadOnly,
    #[default]
    WorkspaceWrite,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ClaudeMode {
    #[default]
    Default,
    Plan,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct OptionalConfig {
    pub codex: bool,
    pub codex_sandbox: CodexSandbox,
    pub claude: bool,
    pub claude_mode: ClaudeMode,
    pub gemini: bool,
    pub opencode: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct AiStudio {
    pub schema_version: u32,
    pub enabled: bool,
    pub agents: Vec<Agent>,
    pub instructions: InstructionProfile,
    pub specialists: Vec<String>,
    pub custom_specialists: Vec<Specialist>,
    pub scoped_rules: Vec<ScopedRule>,
    pub skills: Vec<String>,
    pub optional_config: OptionalConfig,
}
impl Default for AiStudio {
    fn default() -> Self {
        Self {
            schema_version: 1,
            enabled: false,
            agents: Vec::new(),
            instructions: InstructionProfile::default(),
            specialists: Vec::new(),
            custom_specialists: Vec::new(),
            scoped_rules: Vec::new(),
            skills: Vec::new(),
            optional_config: OptionalConfig::default(),
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedInstructions {
    pub id: String,
    pub name: String,
    pub profile: InstructionProfile,
}

pub fn error(message: impl Into<String>) -> AppError {
    AppError::new(message, "Update AI Agents settings and try again.")
}
pub fn text_valid(value: &str, max: usize) -> bool {
    value.len() <= max
        && !value
            .chars()
            .any(|c| c.is_control() && !['\n', '\r', '\t'].contains(&c))
}
pub fn single_line(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.len() <= max && !value.chars().any(|c| c.is_control())
}
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 48
        && id.as_bytes()[0].is_ascii_lowercase()
        && id.as_bytes().last().is_some_and(u8::is_ascii_alphanumeric)
        && id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        && !matches!(
            id,
            "con"
                | "prn"
                | "aux"
                | "nul"
                | "com1"
                | "com2"
                | "com3"
                | "com4"
                | "com5"
                | "com6"
                | "com7"
                | "com8"
                | "com9"
                | "lpt1"
                | "lpt2"
                | "lpt3"
                | "lpt4"
                | "lpt5"
                | "lpt6"
                | "lpt7"
                | "lpt8"
                | "lpt9"
        )
}
fn unique<T: std::hash::Hash + Eq>(values: &[T]) -> bool {
    values.iter().collect::<HashSet<_>>().len() == values.len()
}
pub fn validate_profile(profile: &InstructionProfile) -> Result<(), AppError> {
    let catalog = catalog();
    if !single_line(&profile.preset, 80)
        || profile.rules.len() > catalog.rules.len()
        || !unique(&profile.rules)
        || profile
            .rules
            .iter()
            .any(|id| !catalog.rules.iter().any(|r| &r.id == id))
        || profile.wording.len() > catalog.rules.len()
        || profile.wording.iter().any(|(id, text)| {
            !catalog.rules.iter().any(|r| &r.id == id)
                || !text_valid(text, 2048)
                || text.trim().is_empty()
        })
    {
        return Err(error("Development rules are invalid. Use non-empty wording of up to 2,048 UTF-8 bytes per rule."));
    }
    if profile.technologies.len() > catalog.technologies.len()
        || !unique(&profile.technologies)
        || profile
            .technologies
            .iter()
            .any(|id| !catalog.technologies.iter().any(|t| &t.id == id))
        || profile.technology_wording.len() > catalog.technologies.len()
        || profile.technology_wording.iter().any(|(id, text)| {
            !catalog.technologies.iter().any(|t| &t.id == id)
                || !text_valid(text, 4096)
                || text.trim().is_empty()
        })
    {
        return Err(error("Technology guidance is invalid. Use non-empty wording of up to 4,096 bytes per technology."));
    }
    if !text_valid(&profile.custom_text, 65_536)
        || [
            &profile.stack,
            &profile.architecture,
            &profile.conventions,
            &profile.verification,
        ]
        .iter()
        .any(|v| !text_valid(v, 4096))
    {
        return Err(error("Custom instructions must be valid text up to 64 KiB; project context fields allow 4,096 bytes each."));
    }
    Ok(())
}
pub fn validate_specialist(role: &Specialist) -> Result<(), AppError> {
    if !valid_id(&role.id)
        || !single_line(&role.name, 100)
        || !single_line(&role.description, 512)
        || !text_valid(&role.purpose, 2048)
        || role.purpose.trim().is_empty()
        || !text_valid(&role.instructions, 12_000)
        || role.instructions.trim().is_empty()
        || role.agents.is_empty()
        || role.agents.len() > 4
        || !unique(&role.agents)
        || role.agents.iter().any(|a| !a.specialist())
    {
        return Err(error("Use a safe lowercase specialist ID, a name, description, purpose, instructions (up to 12,000 bytes), and supported targets."));
    }
    Ok(())
}
pub fn validate(studio: &AiStudio) -> Result<(), AppError> {
    if studio.schema_version != 1 {
        return Err(error("This AI configuration version is unsupported."));
    }
    if serde_json::to_vec(studio)
        .map_err(|_| error("Could not encode the AI configuration."))?
        .len()
        > 1024 * 1024
    {
        return Err(error("Keep the saved AI configuration under 1 MiB."));
    }
    // Disabled Studio drafts are data only. Keep them editable without blocking the v1.1 workflow.
    if !studio.enabled {
        return Ok(());
    }
    validate_profile(&studio.instructions)?;
    if studio.agents.len() > 6
        || !unique(&studio.agents)
        || (studio.enabled && studio.agents.is_empty())
    {
        return Err(error(
            "Select at least one coding agent, or disable AI Agents.",
        ));
    }
    if studio.custom_specialists.len() > 12 {
        return Err(error("Use up to 12 custom specialists per configuration."));
    }
    let mut ids: HashSet<String> = catalog().specialists.iter().map(|r| r.id.clone()).collect();
    for role in &studio.custom_specialists {
        validate_specialist(role)?;
        if !role.id.starts_with("custom-") || !ids.insert(role.id.clone()) {
            return Err(error(
                "Custom specialist IDs must be unique and start with custom-.",
            ));
        }
    }
    if studio.specialists.len() > 19
        || !unique(&studio.specialists)
        || studio.specialists.iter().any(|id| !ids.contains(id))
    {
        return Err(error("A selected specialist is missing or duplicated."));
    }
    if studio.skills.len() > catalog().skills.len()
        || !unique(&studio.skills)
        || studio
            .skills
            .iter()
            .any(|id| !catalog().skills.iter().any(|s| &s.id == id))
    {
        return Err(error("A selected skill is unavailable or duplicated."));
    }
    if studio.scoped_rules.len() > 12 {
        return Err(error("Use up to 12 scoped rules."));
    }
    let mut rule_ids = HashSet::new();
    for rule in &studio.scoped_rules {
        if !valid_id(&rule.id)
            || rule.id == "project"
            || !rule_ids.insert(&rule.id)
            || !single_line(&rule.name, 120)
            || !text_valid(&rule.content, 8192)
            || rule.content.trim().is_empty()
            || rule.patterns.len() > 8
            || (rule.mode == RuleMode::Files && rule.patterns.is_empty())
            || rule.patterns.iter().any(|p| {
                p.len() > 256
                    || p.is_empty()
                    || p.starts_with(['/', '!', '~'])
                    || p.contains(['\\', ':', '\n', '\r', '\0'])
                    || p.split('/').any(|s| s == "..")
            })
        {
            return Err(error("Scoped rules need a unique safe ID, title, text (up to 8,192 bytes), and relative file globs."));
        }
    }
    Ok(())
}
