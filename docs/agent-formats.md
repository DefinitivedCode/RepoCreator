# AI Agent Studio format contract

Verified against official documentation on 21 October 2026. The app generates local files offline; generation tests validate syntax and structure without invoking provider models.

## Shared source

`InstructionProfile` is the canonical structured model. The bundled `agent-studio.json` contains editable starting rules, presets, intended technology suggestions, specialist definitions and task skills. Rust produces one shared Markdown document and small provider adapters. Preview and repository creation call the same generator.

Project identity comes from the entered name/description. Context and custom instructions come only from user input. Generated guidance explicitly acknowledges that a new repository has no established implementation, commands or toolchain versions. Preset selection changes rule IDs and one working-approach value; it does not stack competing preset bodies. Identical enabled rule wording is emitted once. User-authored additions are preserved as a separate section, without semantic rewriting.

## Provider adapters

| Provider | Verified contract | Source |
| --- | --- | --- |
| Codex | Root `AGENTS.md`. Standalone project `.codex/agents/*.toml` requires `name`, `description`, `developer_instructions`; model settings are omitted so they inherit. Optional root project TOML uses `approval_policy`, `sandbox_mode` and, for workspace-write only, `sandbox_workspace_write.network_access`. | [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| Claude Code | A real `CLAUDE.md` with `@AGENTS.md`, without symlinks. Path rules use YAML `paths`. Specialist Markdown uses `name`, `description`, and optional explicit read/search tools. Optional project settings select `permissions.defaultMode` only. | [Memory and imports](https://code.claude.com/docs/en/memory), [subagents](https://code.claude.com/docs/en/sub-agents), [settings](https://code.claude.com/docs/en/settings) |
| Copilot | Repository-wide instructions are self-contained Markdown. Scoped files end in `.instructions.md` and use YAML `applyTo`. Specialist files end in `.agent.md`; `description` is required, and `read`/`search` are documented tool aliases. No retired `infer`, model or MCP metadata is generated. | [Repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions), [agent configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration) |
| Cursor | `.cursor/rules/*.mdc` uses `alwaysApply`, `description`, and file-pattern `globs` where applicable. Requested rules omit globs and set `alwaysApply: false`. The small always-applied adapter references root `AGENTS.md`, which current Cursor also discovers. No legacy `.cursorrules`. | [Rules](https://cursor.com/docs/rules) |
| Gemini CLI | Default `GEMINI.md` imports `@./AGENTS.md`. The explicit optional setting instead selects `context.fileName: ["AGENTS.md"]` and omits the redundant import file. | [Project context and imports](https://geminicli.com/docs/cli/gemini-md/), [settings locations](https://geminicli.com/docs/cli/settings/) |
| OpenCode | Root `AGENTS.md`; optional `opencode.json` asks for edit/shell approval. Specialist Markdown in `.opencode/agents` uses `description`, `mode: subagent`, and optional restrictive `permission` metadata. | [Rules](https://opencode.ai/docs/rules/), [agents](https://opencode.ai/docs/agents/), [configuration](https://opencode.ai/docs/config/) |

Claude's import remains useful across versions and configurations where automatic `AGENTS.md` discovery is unavailable. Current documented loading avoids loading the same imported file twice. No symlink privileges are required on Windows.

Copilot surfaces differ in shared-file and import support, so its native repository instruction file repeats the canonical text for reliable loading. Native scoped-rule and specialist definitions also repeat their scoped payload where each platform requires it. These files are generated from the same model, not maintained independently. Cursor's file reference requests tool-based reading; its root `AGENTS.md` also supplies shared instructions directly.

## Capabilities and limits

- Specialists are generated only for Codex, Claude, Copilot and OpenCode. Read-only intent is explicit in role instructions. Claude/Copilot use read/search tool allowlists; OpenCode denies edit/shell access. Codex disables its shell feature for review roles but **inherits parent permissions**, so this is not a separate enforced read-only sandbox.
- File-scoped rules target Claude, Copilot and Cursor. Agent-requested rules target Cursor only. Other providers retain the global shared guidance; the UI states these boundaries.
- Skills are generated once in `.agents/skills/<name>/SKILL.md`, with valid name/description metadata. This release limits discovery claims to [Codex](https://learn.chatgpt.com/docs/build-skills) and [OpenCode](https://opencode.ai/docs/skills/). Skills describe on-demand task workflows, not always-on policies. No remote installation occurs.
- Models, providers, credentials, service endpoints and MCP servers are not generated. Optional settings require user selection and remain project-local. Tool trust requirements, managed policies, account access and context limits still apply.
- Native Markdown imports are limited to 64 KiB of UTF-8 text. Portable instruction preset JSON is versioned and bounded at 512 KiB, with field-level validation. JSON export is atomic and requires a native user-selected destination.

## Generation and persistence guarantees

Configuration validation and complete generation run before directory creation. File paths are project-relative, reject traversal, Windows reserved/invalid names and case-insensitive collisions, and cannot target `.git`. Nested output directories reject symlinks/reparse points. Files are created exclusively, then exactly the selected generated paths are staged and committed. Instructions are never executed by Repo Creator.

JSON, TOML and generated YAML frontmatter are parsed before output is accepted. Configuration fields and specialist metadata are produced through serializers, so quotes, Unicode and Markdown separators in user text cannot inject metadata keys. Syntax highlighting escapes source text and preserves carriage returns in preview text.

Preferences schema v3 and AI schema v1 preserve v1.1 presets with AI disabled. Complete project presets embed custom specialists and all AI choices, plus destination and visibility. Instruction presets and the specialist library are reusable independently. Malformed AI sections can be isolated while keeping valid legacy options; original settings receive an atomic recovery backup before replacement. Unsupported future preference versions remain read-only.

Automated verification covers format parsing, adapter contracts, combinations, migrations, paths, UI flows and real local Git repositories. The production WebView smoke test checks all six integrations together, every output file and the actual initial commit. It does not execute live model sessions or create remote GitHub repositories.
