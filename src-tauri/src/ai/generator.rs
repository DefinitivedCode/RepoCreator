use super::*;
use crate::{generation::GeneratedFile, model::CreateRequest};
use serde_json::{json, Value};

pub fn shared_instructions(request: &CreateRequest) -> String {
    let profile = &request.options.ai.instructions;
    let mut blocks = vec![format!("# {} — development instructions", request.name)];
    if !request.description.trim().is_empty() {
        blocks.push(request.description.clone());
    }
    blocks.push("This is a newly initialized repository. Implementation details, toolchain versions and build commands are not yet established. Treat selected technologies as intended direction; inspect the actual files before making assumptions.".into());
    for (title, text) in [
        ("Technology stack", &profile.stack),
        ("Architecture expectations", &profile.architecture),
        ("Coding conventions", &profile.conventions),
        ("Verification context", &profile.verification),
    ] {
        if !text.trim().is_empty() {
            blocks.push(format!("## {title}\n\n{text}"));
        }
    }
    match profile.workflow {
        Workflow::Balanced => {},
        Workflow::Autonomous => blocks.push("## Working approach\n\nComplete the authorized task through implementation and focused verification. Resolve ordinary decisions by inspecting available evidence, continue after recoverable errors, and report genuine blockers. Autonomy does not expand the task’s scope or bypass permissions.".into()),
        Workflow::ReviewFirst => blocks.push("## Working approach\n\nUnderstand the requested change, identify affected components and compatibility risks, and propose an implementation approach before substantial changes. Verify the result against the original requirements.".into()),
    }
    let mut seen = HashSet::new();
    for group in [
        "Implementation",
        "Verification",
        "Git",
        "Documentation",
        "Safety",
        "Communication",
    ] {
        let lines: Vec<_> = catalog()
            .rules
            .iter()
            .filter(|r| r.group == group && profile.rules.contains(&r.id))
            .map(|r| profile.wording.get(&r.id).unwrap_or(&r.text))
            .filter(|text| seen.insert(text.trim().to_string()))
            .map(|text| format!("- {}", text.replace('\n', "\n  ")))
            .collect();
        if !lines.is_empty() {
            blocks.push(format!("## {group}\n\n{}", lines.join("\n")));
        }
    }
    for technology in &catalog().technologies {
        if profile.technologies.contains(&technology.id) {
            let text = profile
                .technology_wording
                .get(&technology.id)
                .unwrap_or(&technology.instructions);
            blocks.push(format!("## {} guidance\n\n{text}", technology.name));
        }
    }
    if !profile.custom_text.is_empty() {
        blocks.push(format!(
            "## User-authored instructions\n\n{}",
            profile.custom_text
        ));
    }
    format!("{}\n", blocks.join("\n\n"))
}

fn yaml_document(metadata: Value, body: &str) -> Result<String, AppError> {
    let yaml = serde_yaml_ng::to_string(&metadata)
        .map_err(|_| error("Could not encode agent metadata."))?;
    Ok(format!(
        "---\n{}---\n\n{body}\n",
        yaml.trim_start_matches("---\n")
    ))
}
fn toml_document(metadata: Value) -> Result<String, AppError> {
    toml::to_string_pretty(&metadata).map_err(|_| error("Could not encode agent TOML."))
}
fn json_document(metadata: Value) -> Result<String, AppError> {
    serde_json::to_string_pretty(&metadata)
        .map(|s| format!("{s}\n"))
        .map_err(|_| error("Could not encode agent JSON."))
}

pub fn generate(request: &CreateRequest) -> Result<Vec<GeneratedFile>, AppError> {
    let studio = &request.options.ai;
    validate(studio)?;
    if !studio.enabled {
        return Ok(Vec::new());
    }
    let enabled = |agent| studio.agents.contains(&agent);
    let shared = shared_instructions(request);
    let mut files = vec![GeneratedFile {
        path: "AGENTS.md".into(),
        content: shared.clone(),
    }];
    let mut add = |path: String, content: String| {
        files.push(GeneratedFile { path, content });
    };
    if enabled(Agent::Claude) {
        // An import works on Windows and on versions without native AGENTS.md discovery.
        add("CLAUDE.md".into(), "@AGENTS.md\n".into());
    }
    if enabled(Agent::Copilot) {
        // Copilot surfaces differ in AGENTS.md/import support. Keep their native file self-contained.
        add(".github/copilot-instructions.md".into(), shared);
    }
    if enabled(Agent::Cursor) {
        add(".cursor/rules/project.mdc".into(), yaml_document(json!({"description":"Shared project development guidance", "alwaysApply":true}),
            "Use the shared project instructions in @AGENTS.md. Keep project-wide guidance there; this rule adds no conflicting instructions.")?);
    }
    if enabled(Agent::Gemini) {
        if studio.optional_config.gemini {
            add(
                ".gemini/settings.json".into(),
                json_document(json!({"context":{"fileName":["AGENTS.md"]}}))?,
            );
        } else {
            add("GEMINI.md".into(), "@./AGENTS.md\n".into());
        }
    }
    if enabled(Agent::Codex) && studio.optional_config.codex {
        let mut config = json!({ "approval_policy":"on-request", "sandbox_mode":studio.optional_config.codex_sandbox });
        if matches!(
            studio.optional_config.codex_sandbox,
            CodexSandbox::WorkspaceWrite
        ) {
            config["sandbox_workspace_write"] = json!({"network_access":false});
        }
        add(".codex/config.toml".into(), toml_document(config)?);
    }
    if enabled(Agent::Claude) && studio.optional_config.claude {
        add(
            ".claude/settings.json".into(),
            json_document(
                json!({"permissions":{"defaultMode":studio.optional_config.claude_mode}}),
            )?,
        );
    }
    if enabled(Agent::Opencode) && studio.optional_config.opencode {
        add(
            "opencode.json".into(),
            json_document(
                json!({"$schema":"https://opencode.ai/config.json", "permission":{"edit":"ask","shell":"ask"}}),
            )?,
        );
    }
    for rule in &studio.scoped_rules {
        let body = format!("# {}\n\n{}", rule.name, rule.content);
        if rule.mode == RuleMode::Files {
            if enabled(Agent::Claude) {
                add(
                    format!(".claude/rules/{}.md", rule.id),
                    yaml_document(json!({"paths":rule.patterns}), &body)?,
                );
            }
            if enabled(Agent::Copilot) {
                add(
                    format!(".github/instructions/{}.instructions.md", rule.id),
                    yaml_document(json!({"applyTo":rule.patterns.join(",")}), &body)?,
                );
            }
        }
        if enabled(Agent::Cursor) {
            let mut metadata = json!({"description":rule.name, "alwaysApply":false});
            if rule.mode == RuleMode::Files {
                metadata["globs"] = json!(rule.patterns.join(","));
            }
            add(
                format!(".cursor/rules/{}.mdc", rule.id),
                yaml_document(metadata, &body)?,
            );
        }
    }
    for role in catalog()
        .specialists
        .iter()
        .chain(&studio.custom_specialists)
        .filter(|r| studio.specialists.contains(&r.id))
    {
        let mut body = format!("Read AGENTS.md from the repository root before starting. Apply this role only within the assigned task.\n\n## Purpose\n\n{}\n\n## Instructions\n\n{}", role.purpose, role.instructions);
        if role.read_only {
            body.push_str("\n\nDo not edit files, run mutating commands, commit or push. Report findings only.");
        }
        for agent in [Agent::Codex, Agent::Claude, Agent::Copilot, Agent::Opencode] {
            if !enabled(agent) || !role.agents.contains(&agent) {
                continue;
            }
            match agent {
                Agent::Codex => {
                    let mut data = json!({"name":role.id,"description":role.description,"developer_instructions":body});
                    // Current custom agents inherit permissions; this reduces shell capability only.
                    if role.read_only {
                        data["features"] = json!({"shell_tool":false});
                    }
                    add(
                        format!(".codex/agents/{}.toml", role.id),
                        toml_document(data)?,
                    );
                }
                Agent::Claude => {
                    let mut data = json!({"name":role.id,"description":role.description});
                    if role.read_only {
                        data["tools"] = json!(["Read", "Grep", "Glob"]);
                    }
                    add(
                        format!(".claude/agents/{}.md", role.id),
                        yaml_document(data, &body)?,
                    );
                }
                Agent::Copilot => {
                    let mut data = json!({"name":role.name,"description":role.description});
                    if role.read_only {
                        data["tools"] = json!(["read", "search"]);
                    }
                    add(
                        format!(".github/agents/{}.agent.md", role.id),
                        yaml_document(data, &body)?,
                    );
                }
                Agent::Opencode => {
                    let mut data = json!({"description":role.description,"mode":"subagent"});
                    if role.read_only {
                        data["permission"] = json!({"edit":"deny","shell":"deny"});
                    }
                    add(
                        format!(".opencode/agents/{}.md", role.id),
                        yaml_document(data, &body)?,
                    );
                }
                _ => unreachable!(),
            }
        }
    }
    // One shared project skill directory, limited to integrations verified to discover it.
    if enabled(Agent::Codex) || enabled(Agent::Opencode) {
        for skill in &catalog().skills {
            if studio.skills.contains(&skill.id) {
                add(
                    format!(".agents/skills/{}/SKILL.md", skill.id),
                    yaml_document(
                        json!({"name":skill.id,"description":skill.description}),
                        &format!("# {}\n\n{}", skill.name, skill.instructions),
                    )?,
                );
            }
        }
    }
    Ok(files)
}

pub fn validate_files(files: &[GeneratedFile]) -> Result<(), AppError> {
    let mut paths = HashSet::new();
    let total: usize = files.iter().map(|f| f.content.len()).sum();
    if files.len() > 160 || total > 8 * 1024 * 1024 {
        return Err(error("The generated configuration is too large."));
    }
    for file in files {
        let path = &file.path;
        if path.is_empty()
            || path.len() > 220
            || path.contains(['\\', ':', '<', '>', '"', '|', '?', '*'])
            || path.chars().any(|c| c.is_control())
            || path.split('/').any(|part| {
                part.is_empty()
                    || [".", "..", ".git"].contains(&part.to_ascii_lowercase().as_str())
                    || part.ends_with(['.', ' '])
                    || matches!(
                        part.split('.')
                            .next()
                            .unwrap_or("")
                            .to_ascii_lowercase()
                            .as_str(),
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
            })
            || !paths.insert(path.to_ascii_lowercase())
        {
            return Err(error("A generated path is unsafe or duplicated."));
        }
        let fail = || {
            error(format!(
                "Generated configuration syntax is invalid: {path}."
            ))
        };
        if path.ends_with(".json") {
            serde_json::from_str::<Value>(&file.content).map_err(|_| fail())?;
        }
        if path.ends_with(".toml") {
            toml::from_str::<toml::Table>(&file.content).map_err(|_| fail())?;
        }
        if file.content.starts_with("---\n") && (path.ends_with(".md") || path.ends_with(".mdc")) {
            let (yaml, _) = file.content[4..].split_once("\n---\n").ok_or_else(fail)?;
            let metadata: serde_yaml_ng::Value =
                serde_yaml_ng::from_str(yaml).map_err(|_| fail())?;
            if !metadata.is_mapping() {
                return Err(fail());
            }
        }
    }
    for path in &paths {
        let parts: Vec<_> = path.split('/').collect();
        for end in 1..parts.len() {
            if paths.contains(&parts[..end].join("/")) {
                return Err(error("A generated file conflicts with a directory."));
            }
        }
    }
    Ok(())
}
