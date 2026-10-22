use super::*;
use crate::{
    config::Configuration,
    generation::{generate_files, GeneratedFile},
    model::{CreateRequest, Readme},
    preferences::Preferences,
    process::{args, Program, Runner},
    repository,
};
use std::fs;

fn request(agents: Vec<Agent>) -> CreateRequest {
    let mut request = CreateRequest {
        name: "agent-project".into(),
        description: "A configured project.".into(),
        ..Default::default()
    };
    request.options.ai.enabled = !agents.is_empty();
    request.options.ai.agents = agents;
    request
}
fn content<'a>(files: &'a [GeneratedFile], path: &str) -> &'a str {
    &files
        .iter()
        .find(|f| f.path == path)
        .unwrap_or_else(|| panic!("Missing {path}"))
        .content
}
fn metadata(text: &str) -> serde_yaml_ng::Value {
    serde_yaml_ng::from_str(
        text.strip_prefix("---\n")
            .unwrap()
            .split_once("\n---\n")
            .unwrap()
            .0,
    )
    .unwrap()
}

#[test]
fn all_six_basic_integrations_have_valid_native_entry_points() {
    for (agent, path) in [
        (Agent::Codex, "AGENTS.md"),
        (Agent::Claude, "CLAUDE.md"),
        (Agent::Copilot, ".github/copilot-instructions.md"),
        (Agent::Cursor, ".cursor/rules/project.mdc"),
        (Agent::Gemini, "GEMINI.md"),
        (Agent::Opencode, "AGENTS.md"),
    ] {
        let files = generate_files(&request(vec![agent])).unwrap();
        assert!(!content(&files, path).is_empty());
        assert!(content(&files, "AGENTS.md").contains(
            "Implementation details, toolchain versions and build commands are not yet established"
        ));
        generator::validate_files(&files).unwrap();
        assert!(!files.iter().any(|f| f.path.contains("agents/")
            || f.path.ends_with("config.toml")
            || f.path.ends_with("settings.json")));
    }
}
#[test]
fn shared_instructions_use_native_imports_and_copilot_compatibility_copy() {
    let files = generate_files(&request(vec![
        Agent::Codex,
        Agent::Claude,
        Agent::Copilot,
        Agent::Cursor,
        Agent::Gemini,
        Agent::Opencode,
    ]))
    .unwrap();
    assert_eq!(files.iter().filter(|f| f.path == "AGENTS.md").count(), 1);
    assert_eq!(content(&files, "CLAUDE.md"), "@AGENTS.md\n");
    assert_eq!(content(&files, "GEMINI.md"), "@./AGENTS.md\n");
    assert_eq!(
        content(&files, "AGENTS.md"),
        content(&files, ".github/copilot-instructions.md")
    );
    let cursor = content(&files, ".cursor/rules/project.mdc");
    assert_eq!(metadata(cursor)["alwaysApply"].as_bool(), Some(true));
    assert!(cursor.contains("@AGENTS.md"));
    assert!(!files.iter().any(|f| f.path == ".cursorrules"));
}
#[test]
fn every_instruction_preset_and_individual_toggle_changes_the_shared_document() {
    for preset in &catalog().presets {
        let mut request = request(vec![Agent::Codex]);
        request.options.ai.instructions.preset = preset.id.clone();
        request.options.ai.instructions.workflow = preset.workflow;
        request.options.ai.instructions.rules = preset.rules.clone();
        let text = generator::shared_instructions(&request);
        for rule in &catalog().rules {
            assert_eq!(
                text.contains(&rule.text),
                preset.rules.contains(&rule.id),
                "{} / {}",
                preset.id,
                rule.id
            );
        }
        assert_eq!(
            text.contains("Complete the authorized task"),
            preset.workflow == Workflow::Autonomous
        );
        assert_eq!(
            text.contains("propose an implementation approach"),
            preset.workflow == Workflow::ReviewFirst
        );
    }
    for rule in &catalog().rules {
        let mut request = request(vec![Agent::Codex]);
        request.options.ai.instructions.rules = vec![rule.id.clone()];
        assert!(generator::shared_instructions(&request).contains(&rule.text));
        request.options.ai.instructions.rules.clear();
        assert!(!generator::shared_instructions(&request).contains(&rule.text));
    }
}
#[test]
fn wording_custom_text_unicode_and_technology_guidance_are_preserved() {
    let mut request = request(vec![Agent::Codex]);
    let profile = &mut request.options.ai.instructions;
    profile.custom_text =
        "Keep this exact text: café 日本語 🦀\r\n\r\n```text\n<script>data</script>\n```\n".into();
    profile.stack = "Intended Rust application.".into();
    profile.architecture = "Keep native inputs validated.".into();
    profile.rules = vec!["inspect".into(), "focused".into()];
    profile
        .wording
        .insert("inspect".into(), "Read the affected code first.".into());
    profile
        .wording
        .insert("focused".into(), "Read the affected code first.".into());
    profile.technologies = vec!["tauri".into(), "react".into()];
    profile.technology_wording.insert(
        "tauri".into(),
        "Keep project-defined IPC contracts intact.".into(),
    );
    let text = generator::shared_instructions(&request);
    assert!(text.contains(&request.options.ai.instructions.custom_text));
    assert!(text.contains("Keep native inputs validated."));
    assert!(text.contains("Keep project-defined IPC contracts intact."));
    assert!(text.contains("Avoid duplicated state"));
    assert_eq!(text.matches("Read the affected code first.").count(), 1);
    assert!(!text.contains("Read the relevant code and trace"));
}
#[test]
fn all_built_in_specialists_use_current_formats_and_inherit_models() {
    let mut request = request(vec![
        Agent::Codex,
        Agent::Claude,
        Agent::Copilot,
        Agent::Opencode,
    ]);
    request.options.ai.specialists = catalog().specialists.iter().map(|r| r.id.clone()).collect();
    let files = generate_files(&request).unwrap();
    for role in &catalog().specialists {
        let codex: toml::Table =
            toml::from_str(content(&files, &format!(".codex/agents/{}.toml", role.id))).unwrap();
        assert_eq!(codex["name"].as_str(), Some(role.id.as_str()));
        assert!(codex["developer_instructions"]
            .as_str()
            .unwrap()
            .contains(&role.instructions));
        assert!(
            !codex.contains_key("model")
                && !codex.contains_key("sandbox_mode")
                && !codex.contains_key("approval_policy")
        );
        let claude = metadata(content(&files, &format!(".claude/agents/{}.md", role.id)));
        let copilot = metadata(content(
            &files,
            &format!(".github/agents/{}.agent.md", role.id),
        ));
        let opencode = metadata(content(&files, &format!(".opencode/agents/{}.md", role.id)));
        assert_eq!(claude["name"].as_str(), Some(role.id.as_str()));
        assert_eq!(
            copilot["description"].as_str(),
            Some(role.description.as_str())
        );
        assert_eq!(opencode["mode"].as_str(), Some("subagent"));
        if role.read_only {
            assert_eq!(codex["features"]["shell_tool"].as_bool(), Some(false));
            assert_eq!(claude["tools"][0].as_str(), Some("Read"));
            assert_eq!(copilot["tools"][0].as_str(), Some("read"));
            assert_eq!(opencode["permission"]["edit"].as_str(), Some("deny"));
        }
        assert!(
            claude.get("model").is_none()
                && copilot.get("model").is_none()
                && opencode.get("model").is_none()
        );
    }
}
#[test]
fn custom_specialists_scope_targets_and_round_trip_safely() {
    let mut request = request(vec![
        Agent::Codex,
        Agent::Claude,
        Agent::Copilot,
        Agent::Opencode,
    ]);
    let mut role = catalog().specialists[0].clone();
    role.id = "custom-team-reviewer".into();
    role.name = "Team reviewer 日本語".into();
    role.description = "Review: quoted \"contracts\" # carefully".into();
    role.instructions = "Preserve user text.\n---\nname: not-metadata\n".into();
    role.agents = vec![Agent::Codex, Agent::Claude];
    request.options.ai.specialists.push(role.id.clone());
    request.options.ai.custom_specialists.push(role.clone());
    let files = generate_files(&request).unwrap();
    assert_eq!(
        files
            .iter()
            .filter(|f| f.path.contains("custom-team-reviewer"))
            .count(),
        2
    );
    let claude = content(&files, ".claude/agents/custom-team-reviewer.md");
    assert_eq!(
        metadata(claude)["description"].as_str(),
        Some(role.description.as_str())
    );
    assert!(claude.contains(&role.instructions));
}
#[test]
fn scoped_rules_have_valid_provider_metadata_without_fake_agent_profiles() {
    let mut request = request(vec![
        Agent::Codex,
        Agent::Claude,
        Agent::Copilot,
        Agent::Cursor,
        Agent::Gemini,
        Agent::Opencode,
    ]);
    request.options.ai.scoped_rules = vec![
        ScopedRule {
            id: "source".into(),
            name: "Source guidance".into(),
            patterns: vec!["**/*.ts".into(), "**/*.tsx".into()],
            content: "Preserve the existing component contracts.".into(),
            mode: RuleMode::Files,
        },
        ScopedRule {
            id: "migration".into(),
            name: "Use when designing a migration".into(),
            content: "Inspect data compatibility first.".into(),
            mode: RuleMode::Requested,
            ..Default::default()
        },
    ];
    let files = generate_files(&request).unwrap();
    assert_eq!(
        metadata(content(&files, ".claude/rules/source.md"))["paths"][0].as_str(),
        Some("**/*.ts")
    );
    assert_eq!(
        metadata(content(
            &files,
            ".github/instructions/source.instructions.md"
        ))["applyTo"]
            .as_str(),
        Some("**/*.ts,**/*.tsx")
    );
    let cursor = metadata(content(&files, ".cursor/rules/source.mdc"));
    assert_eq!(cursor["alwaysApply"].as_bool(), Some(false));
    assert_eq!(cursor["globs"].as_str(), Some("**/*.ts,**/*.tsx"));
    let requested = metadata(content(&files, ".cursor/rules/migration.mdc"));
    assert!(requested.get("globs").is_none());
    assert_eq!(
        files
            .iter()
            .filter(|f| f.path.contains("migration"))
            .count(),
        1
    );
    assert!(!files
        .iter()
        .any(|f| f.path.contains("agents/") || f.path.contains(".gemini/rules")));
}
#[test]
fn optional_configs_are_safe_meaningful_and_only_for_enabled_tools() {
    let mut request = request(vec![
        Agent::Codex,
        Agent::Claude,
        Agent::Gemini,
        Agent::Opencode,
    ]);
    request.options.ai.optional_config = OptionalConfig {
        codex: true,
        claude: true,
        gemini: true,
        opencode: true,
        ..Default::default()
    };
    let files = generate_files(&request).unwrap();
    let codex: toml::Table = toml::from_str(content(&files, ".codex/config.toml")).unwrap();
    assert_eq!(codex["approval_policy"].as_str(), Some("on-request"));
    assert_eq!(codex["sandbox_mode"].as_str(), Some("workspace-write"));
    assert_eq!(
        codex["sandbox_workspace_write"]["network_access"].as_bool(),
        Some(false)
    );
    assert!(!codex.contains_key("model"));
    let claude: serde_json::Value =
        serde_json::from_str(content(&files, ".claude/settings.json")).unwrap();
    assert_eq!(claude["permissions"]["defaultMode"], "default");
    assert!(claude["permissions"].get("allow").is_none());
    let gemini: serde_json::Value =
        serde_json::from_str(content(&files, ".gemini/settings.json")).unwrap();
    assert_eq!(
        gemini["context"]["fileName"],
        serde_json::json!(["AGENTS.md"])
    );
    assert!(!files.iter().any(|f| f.path == "GEMINI.md"));
    let opencode: serde_json::Value =
        serde_json::from_str(content(&files, "opencode.json")).unwrap();
    assert_eq!(opencode["permission"]["edit"], "ask");
    assert_eq!(opencode["permission"]["shell"], "ask");
    request.options.ai.agents = vec![Agent::Copilot];
    let files = generate_files(&request).unwrap();
    assert!(!files
        .iter()
        .any(|f| f.path.ends_with(".json") || f.path.ends_with(".toml")));
}
#[test]
fn skills_are_on_demand_and_shared_only_by_verified_integrations() {
    let mut request = request(vec![Agent::Codex, Agent::Opencode]);
    request.options.ai.skills = catalog().skills.iter().map(|s| s.id.clone()).collect();
    let files = generate_files(&request).unwrap();
    assert_eq!(
        files
            .iter()
            .filter(|f| f.path.ends_with("SKILL.md"))
            .count(),
        4
    );
    for skill in &catalog().skills {
        let text = content(&files, &format!(".agents/skills/{}/SKILL.md", skill.id));
        let meta = metadata(text);
        assert_eq!(meta["name"].as_str(), Some(skill.id.as_str()));
        assert_eq!(
            meta["description"].as_str(),
            Some(skill.description.as_str())
        );
        assert!(text.contains(&skill.instructions));
    }
    request.options.ai.agents = vec![Agent::Claude, Agent::Gemini, Agent::Cursor, Agent::Copilot];
    assert!(!generate_files(&request)
        .unwrap()
        .iter()
        .any(|f| f.path.ends_with("SKILL.md")));
}
#[test]
fn ai_enabled_and_disabled_repositories_match_previews_and_initial_commit() {
    for enabled in [false, true] {
        let temp = tempfile::tempdir().unwrap();
        let mut request = request(vec![Agent::Codex, Agent::Claude, Agent::Copilot]);
        request.options.ai.enabled = enabled;
        request.options.custom_patterns = vec!["AGENTS.md".into(), ".codex/".into()];
        request.options.ai.specialists = vec!["code-reviewer".into()];
        request.options.ai.skills = vec!["focused-code-review".into()];
        let preview = generate_files(&request).unwrap();
        let second = generate_files(&request).unwrap();
        assert_eq!(
            serde_json::to_string(&preview).unwrap(),
            serde_json::to_string(&second).unwrap()
        );
        let mut pending =
            repository::begin(&crate::tests::IsolatedGit, temp.path(), request).unwrap();
        repository::create_local(&crate::tests::IsolatedGit, &mut pending, &|_| {}).unwrap();
        for file in &preview {
            assert_eq!(
                fs::read(pending.path.join(&file.path)).unwrap(),
                file.content.as_bytes()
            );
        }
        let tree = crate::tests::IsolatedGit
            .run(
                Program::Git,
                &args(&["ls-tree", "-r", "--name-only", "HEAD"]),
                &pending.path,
            )
            .unwrap();
        assert!(tree.success);
        let mut expected: Vec<_> = preview.iter().map(|f| f.path.as_str()).collect();
        expected.sort();
        let mut actual: Vec<_> = tree.stdout.lines().collect();
        actual.sort();
        assert_eq!(actual, expected);
        assert_eq!(pending.path.join("AGENTS.md").exists(), enabled);
        assert!(repository::begin(
            &crate::tests::IsolatedGit,
            temp.path(),
            pending.request.clone()
        )
        .is_err());
    }
}
#[test]
fn configuration_validation_rejects_paths_duplicates_and_invalid_formats() {
    for id in [
        "../escape",
        "C:\\escape",
        "custom/escape",
        "con",
        "custom-review.",
        "custom-foo\nbar",
    ] {
        let mut request = request(vec![Agent::Codex]);
        let mut role = catalog().specialists[0].clone();
        role.id = id.into();
        request.options.ai.custom_specialists.push(role);
        let temp = tempfile::tempdir().unwrap();
        assert!(repository::begin(&crate::tests::IsolatedGit, temp.path(), request).is_err());
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 0);
    }
    for path in [
        "../escape",
        "C:/escape",
        ".git/config",
        "CON.txt",
        "foo/../bar",
        "foo\\bar",
        "invalid?.md",
        "invalid|name.md",
        "invalid*.json",
    ] {
        assert!(generator::validate_files(&[GeneratedFile {
            path: path.into(),
            content: String::new()
        }])
        .is_err());
    }
    for (path, text) in [
        ("config.json", "{"),
        ("config.toml", "a = ["),
        ("rule.mdc", "---\npaths: [\n---\nx"),
    ] {
        assert!(generator::validate_files(&[GeneratedFile {
            path: path.into(),
            content: text.into()
        }])
        .is_err());
    }
    assert!(generator::validate_files(&[
        GeneratedFile {
            path: "A.md".into(),
            content: String::new()
        },
        GeneratedFile {
            path: "a.md".into(),
            content: String::new()
        }
    ])
    .is_err());
    let mut request = request(vec![Agent::Codex]);
    request.options.ai.instructions.rules.push("unknown".into());
    assert!(generate_files(&request).is_err());
    request.options.ai = AiStudio::default();
    request.options.ai.enabled = true;
    assert!(generate_files(&request).is_err());
    request.options.ai.agents = vec![Agent::Codex];
    request.options.ai.instructions.custom_text = "\0".into();
    assert!(generate_files(&request).is_err());
    request.options.ai.instructions.custom_text = "é".repeat(32769);
    assert!(generate_files(&request).is_err());
}
#[test]
fn v11_presets_migrate_without_enabling_ai_or_losing_existing_choices() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("preferences.json");
    fs::write(&file,serde_json::json!({"schemaVersion":2,"parentPath":temp.path(),"appearance":"dark","defaults":{"readme":"custom","options":{"ignorePresets":[],"initialBranch":"develop"}},"customPresets":[{"id":"custom-old","name":"Old tools","configuration":{"readme":"none","options":{"ignorePresets":["python"],"initialBranch":"old-branch"}}}]}).to_string()).unwrap();
    let migrated = Preferences::load(&file, temp.path().into());
    assert_eq!(migrated.schema_version, 5);
    assert_eq!(migrated.defaults.readme, Readme::Custom);
    assert!(!migrated.defaults.options.ai.enabled);
    assert!(migrated.defaults.options.ignore_presets.is_empty());
    assert_eq!(migrated.defaults.options.initial_branch, "develop");
    assert_eq!(migrated.custom_presets.len(), 1);
    assert!(!migrated.custom_presets[0].configuration.options.ai.enabled);
    assert_eq!(
        migrated.custom_presets[0]
            .configuration
            .options
            .ignore_presets,
        vec!["python"]
    );
}
#[test]
fn complete_project_and_instruction_presets_round_trip_with_embedded_specialists() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("preferences.json");
    let mut prefs = Preferences::new(temp.path().into());
    let mut value = request(vec![Agent::Codex, Agent::Claude, Agent::Copilot]);
    value.options.ai.instructions.custom_text = "Keep Unicode 🦀 and user wording.".into();
    let mut role = catalog().specialists[0].clone();
    role.id = "custom-contract-reviewer".into();
    value.options.ai.custom_specialists.push(role.clone());
    value.options.ai.specialists.push(role.id.clone());
    let configuration = Configuration {
        readme: Readme::Custom,
        options: value.options.clone(),
        destination: Some(crate::model::Destination::Github),
        visibility: Some(crate::model::Visibility::Public),
        ..Default::default()
    };
    prefs
        .save_preset("Tauri + Codex + Claude".into(), configuration)
        .unwrap();
    prefs
        .save_instructions(
            "My instructions".into(),
            value.options.ai.instructions.clone(),
        )
        .unwrap();
    assert!(prefs
        .save_instructions(
            "my instructions".into(),
            value.options.ai.instructions.clone()
        )
        .is_err());
    prefs.specialist_library.push(role);
    prefs.save(&file).unwrap();
    let restored = Preferences::load(&file, temp.path().into());
    let loaded = &restored.custom_presets[0].configuration;
    assert_eq!(loaded.destination, Some(crate::model::Destination::Github));
    assert_eq!(loaded.visibility, Some(crate::model::Visibility::Public));
    assert_eq!(
        loaded.options.ai.agents,
        vec![Agent::Codex, Agent::Claude, Agent::Copilot]
    );
    assert_eq!(loaded.options.ai.custom_specialists.len(), 1);
    assert_eq!(restored.specialist_library.len(), 1);
    assert_eq!(
        restored.instruction_presets[0].profile.custom_text,
        value.options.ai.instructions.custom_text
    );
    let exchange = commands::InstructionExchange {
        schema_version: 1,
        name: "Portable".into(),
        profile: value.options.ai.instructions,
    };
    let encoded = serde_json::to_string(&exchange).unwrap();
    assert_eq!(commands::decode_preset(&encoded).unwrap().name, "Portable");
    assert!(commands::decode_preset("{\"schemaVersion\":99}").is_err());
}
#[test]
fn malformed_ai_settings_recover_file_preferences_and_back_up_original_data() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("preferences.json");
    let original=serde_json::json!({"schemaVersion":3,"defaults":{"options":{"initialBranch":"work","ai":{"enabled":"broken","instructions":{"customText":"Preserve original text"}}}},"customPresets":[{"id":"custom-broken-ai","name":"Recoverable","configuration":{"options":{"initialBranch":"saved-work","ai":{"schemaVersion":100}}}}],"specialistLibrary":[{"id":"../bad"}]}).to_string();
    fs::write(&file, &original).unwrap();
    let prefs = Preferences::load(&file, temp.path().into());
    assert_eq!(prefs.defaults.options.initial_branch, "work");
    assert!(!prefs.defaults.options.ai.enabled);
    assert_eq!(
        prefs.custom_presets[0].configuration.options.initial_branch,
        "saved-work"
    );
    assert!(prefs.recovery_notice.is_some());
    prefs.save(&file).unwrap();
    assert_eq!(
        fs::read_to_string(file.with_extension("json.bak")).unwrap(),
        original
    );
    prefs.save(&file).unwrap();
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 2);
}
#[test]
fn local_markdown_import_is_bounded_utf8_data() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("instructions.md");
    fs::write(&file, "\u{feff}User text 🦀\r\n@not-executed\n").unwrap();
    assert_eq!(
        commands::read_text(&file, 65536).unwrap(),
        "User text 🦀\r\n@not-executed\n"
    );
    fs::write(&file, [0xff, 0xfe]).unwrap();
    assert!(commands::read_text(&file, 65536).is_err());
    fs::write(&file, "\0").unwrap();
    assert!(commands::read_text(&file, 65536).is_err());
    fs::write(&file, "x".repeat(65537)).unwrap();
    assert!(commands::read_text(&file, 65536).is_err());
}
#[test]
fn disabling_ai_preserves_an_unfinished_draft_without_generating_or_executing_it() {
    let mut request = request(vec![Agent::Codex]);
    request.options.ai.scoped_rules.push(ScopedRule {
        id: "../unfinished".into(),
        ..Default::default()
    });
    assert!(generate_files(&request).is_err());
    request.options.ai.enabled = false;
    let files = generate_files(&request).unwrap();
    assert!(!files
        .iter()
        .any(|file| file.path.contains("AGENTS") || file.path.contains("unfinished")));
    assert_eq!(request.options.ai.scoped_rules[0].id, "../unfinished");
}

#[test]
fn project_presets_recommend_technologies_without_inventing_scaffolding() {
    for preset in crate::config::built_in_presets() {
        if preset.id == "claude-experiment" {
            assert!(preset.configuration.options.ai.enabled);
            assert_eq!(preset.configuration.options.ai.agents, vec![Agent::Claude]);
        } else {
            assert!(!preset.configuration.options.ai.enabled);
        }
        let technologies = &preset.configuration.options.ai.instructions.technologies;
        if preset.id == "blank" {
            assert!(technologies.is_empty());
        }
        if preset.id == "tauri" {
            assert!(
                technologies.contains(&"tauri".into())
                    && technologies.contains(&"rust".into())
                    && technologies.contains(&"react".into())
            );
        }
        if preset.id == "unity" {
            assert!(
                technologies.contains(&"unity".into()) && technologies.contains(&"csharp".into())
            );
        }
    }
}
