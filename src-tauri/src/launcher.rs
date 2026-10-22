//! Native development-tool launching. CLI assistants retain normal interactive
//! authentication and approval settings; no model or permission flags are added.
use crate::{handoff, model::AppError, process, workspace};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct LauncherPreferences {
    #[serde(default = "auto_terminal")]
    pub terminal: String,
    pub executables: BTreeMap<String, String>,
}
fn auto_terminal() -> String {
    "auto".into()
}
impl Default for LauncherPreferences {
    fn default() -> Self {
        Self {
            terminal: auto_terminal(),
            executables: BTreeMap::new(),
        }
    }
}
const TOOL_IDS: &[&str] = &[
    "vscode",
    "claude",
    "codex",
    "agy",
    "antigravity-ide",
    "powershell",
    "windows-terminal",
    "terminal",
];
pub(crate) fn validate_stored(preferences: &LauncherPreferences) -> Result<(), AppError> {
    if !["", "auto", "windows-terminal", "powershell", "terminal"]
        .contains(&preferences.terminal.as_str())
        || preferences.executables.len() > TOOL_IDS.len()
    {
        return Err(workspace::error("Choose a supported terminal preference."));
    }
    for (tool, path) in &preferences.executables {
        if !TOOL_IDS.contains(&tool.as_str())
            || path.len() > 32000
            || path.contains(['\0', '\r', '\n'])
            || (!path.is_empty() && !Path::new(path).is_absolute())
        {
            return Err(workspace::error(
                "Tool overrides must be absolute executable paths without arguments.",
            ));
        }
    }
    Ok(())
}
pub(crate) fn validate(preferences: &LauncherPreferences) -> Result<(), AppError> {
    validate_stored(preferences)?;
    for path in preferences
        .executables
        .values()
        .filter(|path| !path.is_empty())
    {
        if !process::executable_file(Path::new(path)) {
            return Err(workspace::error("A tool override is not an accessible executable file. Select the executable inside an application bundle where appropriate."));
        }
        #[cfg(windows)]
        if !Path::new(path).extension().is_some_and(|ext| {
            ["exe", "cmd", "bat", "com"]
                .iter()
                .any(|allowed| ext.eq_ignore_ascii_case(allowed))
        }) {
            return Err(workspace::error(
                "On Windows, choose an .exe, .cmd, .bat or .com executable.",
            ));
        }
    }
    Ok(())
}
pub(crate) fn find_executable(name: &str) -> Option<PathBuf> {
    executable_candidates(name)
        .into_iter()
        .find(|path| executable_path(path))
}
fn executable_candidates(name: &str) -> Vec<PathBuf> {
    if name.is_empty()
        || Path::new(name).components().count() != 1
        || name.contains(['/', '\\', '\0'])
    {
        return Vec::new();
    }
    let filenames = if cfg!(windows) {
        if Path::new(name).extension().is_some() {
            vec![name.to_string()]
        } else {
            vec![
                format!("{name}.exe"),
                format!("{name}.cmd"),
                format!("{name}.bat"),
                format!("{name}.com"),
            ]
        }
    } else {
        vec![name.to_string()]
    };
    process::executable_directories()
        .iter()
        .flat_map(|dir| filenames.iter().map(move |name| dir.join(name)))
        .collect()
}
#[cfg(windows)]
pub(crate) fn powershell_path() -> Option<PathBuf> {
    find_executable("pwsh")
        .or_else(|| find_executable("powershell"))
        .or_else(|| {
            std::env::var_os("SystemRoot")
                .map(PathBuf::from)
                .map(|root| root.join("System32/WindowsPowerShell/v1.0/powershell.exe"))
                .filter(|path| process::executable_file(path))
        })
}
fn override_path(preferences: &LauncherPreferences, tool: &str) -> Option<PathBuf> {
    preferences
        .executables
        .get(tool)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}
fn terminal_path(preferences: &LauncherPreferences) -> Option<PathBuf> {
    if (cfg!(windows) && preferences.terminal == "terminal")
        || (cfg!(target_os = "macos")
            && ["powershell", "windows-terminal"].contains(&preferences.terminal.as_str()))
    {
        return None;
    }
    if let Some(path) = configured_path(preferences, "terminal") {
        return executable_path(&path).then_some(path);
    }
    #[cfg(windows)]
    {
        let wt = || match override_path(preferences, "windows-terminal") {
            Some(path) => executable_path(&path).then_some(path),
            None => find_executable("wt"),
        };
        let ps = || match override_path(preferences, "powershell") {
            Some(path) => executable_path(&path).then_some(path),
            None => powershell_path(),
        };
        match preferences.terminal.as_str() {
            "windows-terminal" => wt(),
            "terminal" => None,
            "powershell" => ps(),
            _ => wt().or_else(ps),
        }
    }
    #[cfg(target_os = "macos")]
    {
        if ["powershell", "windows-terminal"].contains(&preferences.terminal.as_str()) {
            return None;
        }
        override_path(preferences, "terminal")
            .or_else(|| {
                Some(PathBuf::from(
                    "/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal",
                ))
            })
            .filter(|path| process::executable_file(path))
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = preferences;
        None
    }
}
fn ide_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    #[cfg(windows)]
    {
        for root in process::windows_install_roots() {
            candidates.extend([
                root.join("Programs/Antigravity/Antigravity.exe"),
                root.join("Antigravity/Antigravity.exe"),
                root.join("Programs/Antigravity IDE/Antigravity.exe"),
                root.join("Antigravity IDE/Antigravity.exe"),
            ]);
        }
    }
    #[cfg(target_os = "macos")]
    {
        for name in ["Antigravity", "Antigravity IDE"] {
            candidates.push(PathBuf::from(format!(
                "/Applications/{name}.app/Contents/MacOS/Electron"
            )));
            if let Some(home) = std::env::var_os("HOME") {
                candidates.push(
                    PathBuf::from(home)
                        .join(format!("Applications/{name}.app/Contents/MacOS/Electron")),
                );
            }
        }
    }
    candidates
}
fn tool_path(preferences: &LauncherPreferences, tool: &str) -> Option<PathBuf> {
    if let Some(path) = override_path(preferences, tool) {
        return executable_path(&path).then_some(path);
    }
    match tool {
        "vscode" => crate::desktop::vscode_path().or_else(|| {
            editor_candidates("Microsoft VS Code", "Code")
                .into_iter()
                .find(|path| executable_path(path))
        }),
        "claude" | "codex" | "agy" => find_executable(tool),
        "terminal" => terminal_path(preferences),
        "antigravity-ide" => ide_candidates()
            .into_iter()
            .find(|path| process::executable_file(path)),
        _ => None,
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTool {
    id: &'static str,
    name: &'static str,
    available: bool,
    path: Option<String>,
    documentation: &'static str,
    status: &'static str,
    detail: String,
    platform: &'static str,
}
pub(crate) fn platform() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "other"
    }
}
fn executable_path(path: &Path) -> bool {
    process::executable_file(path)
        && (!cfg!(windows)
            || path.extension().is_some_and(|ext| {
                ["exe", "cmd", "bat", "com"]
                    .iter()
                    .any(|allowed| ext.eq_ignore_ascii_case(allowed))
            }))
}
fn editor_candidates(folder: &str, executable: &str) -> Vec<PathBuf> {
    #[cfg(windows)]
    let mut candidates = Vec::new();
    #[cfg(not(windows))]
    let candidates = Vec::new();
    #[cfg(windows)]
    for root in process::windows_install_roots() {
        candidates.extend([
            root.join(format!("Programs/{folder}/{executable}.exe")),
            root.join(format!("{folder}/{executable}.exe")),
        ]);
    }
    #[cfg(not(windows))]
    let _ = (folder, executable);
    candidates
}
fn tool_details(tool: &str) -> Option<(&'static str, &'static str)> {
    match tool {
        "folder" => Some(("Open Folder", "https://support.microsoft.com/windows")),
        "terminal" => Some((
            "Terminal",
            if cfg!(windows) {
                "https://learn.microsoft.com/windows/terminal/"
            } else {
                "https://support.apple.com/guide/terminal/welcome/mac"
            },
        )),
        "vscode" => Some((
            "VS Code",
            "https://code.visualstudio.com/docs/setup/setup-overview",
        )),
        "claude" => Some((
            "Claude Code CLI",
            "https://code.claude.com/docs/en/quickstart",
        )),
        "codex" => Some(("Codex CLI", "https://developers.openai.com/codex/cli/")),
        "agy" => Some((
            "Antigravity CLI",
            "https://antigravity.google/docs/getting-started?tab=cli",
        )),
        "antigravity-ide" => Some((
            "Antigravity IDE",
            "https://antigravity.google/docs/getting-started?tab=ide",
        )),
        _ => None,
    }
}
// A short, bounded cache avoids repeated filesystem walks while switching pages.
// Its key includes overrides and search directories, so changed preferences and
// inherited PATH values invalidate naturally. Explicit refresh bypasses it.
struct ToolCacheEntry {
    key: String,
    checked: Instant,
    tools: Vec<ProjectTool>,
}
const CACHE_LIFETIME: Duration = Duration::from_secs(3);
const MAX_CACHE_ENTRIES: usize = 16;
static TOOL_CACHE: OnceLock<Mutex<Vec<ToolCacheEntry>>> = OnceLock::new();

fn candidates_for(tool: &str) -> Vec<PathBuf> {
    match tool {
        "antigravity-ide" => ide_candidates(),
        "vscode" => editor_candidates("Microsoft VS Code", "Code"),
        "claude" | "codex" | "agy" => executable_candidates(tool),
        "terminal" => {
            #[cfg(windows)]
            {
                let mut paths = executable_candidates("wt");
                paths.extend(executable_candidates("powershell"));
                paths.extend(executable_candidates("pwsh"));
                paths
            }
            #[cfg(target_os = "macos")]
            {
                vec![PathBuf::from(
                    "/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal",
                )]
            }
            #[cfg(not(any(windows, target_os = "macos")))]
            {
                Vec::new()
            }
        }
        _ => Vec::new(),
    }
}
fn configured_path(preferences: &LauncherPreferences, tool: &str) -> Option<PathBuf> {
    if tool != "terminal" {
        return override_path(preferences, tool);
    }
    let selected = match preferences.terminal.as_str() {
        "windows-terminal" => "windows-terminal",
        "powershell" => "powershell",
        "terminal" => "terminal",
        _ if cfg!(windows) => {
            if preferences
                .executables
                .get("windows-terminal")
                .is_some_and(|value| !value.is_empty())
            {
                "windows-terminal"
            } else {
                "powershell"
            }
        }
        _ => "terminal",
    };
    override_path(preferences, selected)
}
fn discovery(preferences: &LauncherPreferences) -> Vec<ProjectTool> {
    ["folder","terminal","vscode","claude","codex","agy","antigravity-ide"].into_iter().map(|id| {
        let (name,documentation) = tool_details(id).unwrap();
        let configured = configured_path(preferences,id);
        let path = if configured.is_some() { configured.clone().filter(|path| executable_path(path)) } else { tool_path(preferences,id) };
        let unsupported_terminal = id == "terminal" && ((cfg!(windows) && preferences.terminal == "terminal") || (cfg!(target_os = "macos") && ["powershell","windows-terminal"].contains(&preferences.terminal.as_str())) || !cfg!(any(windows,target_os = "macos")));
        let inaccessible = configured.iter().chain(candidates_for(id).iter()).any(|path| path.metadata().is_err_and(|error| error.kind() == std::io::ErrorKind::PermissionDenied));
        let (status,detail) = if id == "folder" {
            ("available", "Open the project in your file manager.")
        } else if unsupported_terminal {
            ("unknown", "This terminal preference belongs to another platform. Choose Automatic or a terminal supported here.")
        } else if path.is_some() {
            ("available", if configured.is_some() { "Using your configured executable." } else { "Found an executable in PATH or a known installation location." })
        } else if inaccessible {
            ("unknown", "An executable location could not be inspected. Check its permissions or configure an accessible executable.")
        } else if configured.is_some() {
            ("invalid", "The configured path is missing or is not an executable. Update it or clear the override to use automatic detection.")
        } else {
            ("missing", "No executable was found in PATH or known locations. If installed elsewhere, configure its path in Project Settings.")
        };
        ProjectTool { id,name,available:status == "available",path:path.or(configured).map(|path| path.to_string_lossy().into_owned()),documentation,status,detail:detail.into(),platform:platform() }
    }).collect()
}
fn cached_tools(preferences: &LauncherPreferences, refresh: bool) -> Vec<ProjectTool> {
    let key = format!(
        "{}|{:?}",
        serde_json::to_string(preferences).unwrap_or_default(),
        process::executable_directories()
    );
    let cache = TOOL_CACHE.get_or_init(Mutex::default);
    if !refresh {
        if let Ok(entries) = cache.lock() {
            if let Some(entry) = entries
                .iter()
                .find(|entry| entry.key == key && entry.checked.elapsed() < CACHE_LIFETIME)
            {
                return entry.tools.clone();
            }
        }
    }
    // This call and every helper above only inspect filesystem metadata. They
    // never run --help/--version, open a GUI, authenticate or launch a terminal.
    let result = discovery(preferences);
    if let Ok(mut entries) = cache.lock() {
        entries.retain(|entry| entry.key != key && entry.checked.elapsed() < CACHE_LIFETIME);
        if entries.len() >= MAX_CACHE_ENTRIES {
            entries.remove(0);
        }
        entries.push(ToolCacheEntry {
            key,
            checked: Instant::now(),
            tools: result.clone(),
        });
    }
    result
}
pub(crate) fn tools(preferences: &LauncherPreferences) -> Vec<ProjectTool> {
    cached_tools(preferences, false)
}
#[cfg(any(windows, test))]
fn powershell_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}
#[cfg(any(target_os = "macos", test))]
fn shell_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
#[cfg(any(target_os = "macos", test))]
fn applescript_literal(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}
#[cfg(any(windows, test))]
fn encoded_powershell(value: &str) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes: Vec<u8> = value.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let mut result = String::new();
    for chunk in bytes.chunks(3) {
        let bits = ((chunk[0] as u32) << 16)
            | ((chunk.get(1).copied().unwrap_or(0) as u32) << 8)
            | chunk.get(2).copied().unwrap_or(0) as u32;
        result.push(ALPHABET[((bits >> 18) & 63) as usize] as char);
        result.push(ALPHABET[((bits >> 12) & 63) as usize] as char);
        result.push(if chunk.len() > 1 {
            ALPHABET[((bits >> 6) & 63) as usize] as char
        } else {
            '='
        });
        result.push(if chunk.len() > 2 {
            ALPHABET[(bits & 63) as usize] as char
        } else {
            '='
        });
    }
    result
}
fn launch_terminal(
    preferences: &LauncherPreferences,
    cwd: &Path,
    tool: Option<&Path>,
) -> Result<(), AppError> {
    let terminal = terminal_path(preferences).ok_or_else(|| workspace::error("The selected terminal is unavailable. Choose an installed terminal in Project Settings."))?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let powershell = override_path(preferences, "powershell")
            .or_else(powershell_path)
            .ok_or_else(|| {
                workspace::error("PowerShell is required to open interactive tools on Windows.")
            })?;
        // Encode the script so Windows Terminal cannot interpret semicolons or
        // quotes in user paths as its own tab-control command syntax. Every data
        // value is a PowerShell single-quoted literal with embedded quotes escaped.
        let path = std::env::join_paths(process::executable_directories())
            .map_err(|_| workspace::error("Could not prepare the development-tool PATH."))?;
        let mut script = format!(
            "$env:PATH = {}; Set-Location -LiteralPath {};",
            powershell_literal(&path.to_string_lossy()),
            powershell_literal(&cwd.to_string_lossy())
        );
        if let Some(tool) = tool {
            script.push_str(&format!(
                " & {};",
                powershell_literal(&tool.to_string_lossy())
            ));
        }
        let encoded = encoded_powershell(&script);
        let use_wt = preferences.terminal == "windows-terminal"
            || terminal
                .file_stem()
                .is_some_and(|stem| stem.eq_ignore_ascii_case("wt"));
        let mut command = Command::new(if use_wt { &terminal } else { &powershell });
        if use_wt {
            command.args(["-w", "new", "new-tab"]).arg(&powershell);
        }
        command
            .args(["-NoProfile", "-NoExit", "-EncodedCommand", &encoded])
            .current_dir(cwd)
            .creation_flags(if use_wt { 0x08000000 } else { 0x00000010 });
        command
            .spawn()
            .map_err(|_| workspace::error("Could not open the chosen terminal."))?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        let path = std::env::join_paths(process::executable_directories())
            .map_err(|_| workspace::error("Could not prepare the development-tool PATH."))?;
        let mut script = format!(
            "export PATH={}; cd -- {}",
            shell_literal(&path.to_string_lossy()),
            shell_literal(&cwd.to_string_lossy())
        );
        if let Some(tool) = tool {
            script.push_str(&format!(" && {}", shell_literal(&tool.to_string_lossy())));
        }
        // Use Terminal's bundle ID through its verified application path. The
        // shell command is data inside a separately escaped AppleScript literal.
        let application = terminal
            .ancestors()
            .find(|path| path.extension().is_some_and(|ext| ext == "app"))
            .ok_or_else(|| {
                workspace::error("Select the Terminal executable inside Terminal.app.")
            })?;
        let statement = format!(
            "tell application {} to do script {}",
            applescript_literal(&application.to_string_lossy()),
            applescript_literal(&script)
        );
        let status = Command::new("/usr/bin/osascript")
            .args([
                "-e",
                &statement,
                "-e",
                &format!(
                    "tell application {} to activate",
                    applescript_literal(&application.to_string_lossy())
                ),
            ])
            .status()
            .map_err(|_| {
                workspace::error("Could not open macOS Terminal. Check its automation permission.")
            })?;
        if status.success() {
            Ok(())
        } else {
            Err(workspace::error(
                "macOS Terminal declined the launch. Check its automation permission.",
            ))
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (terminal, cwd, tool);
        Err(workspace::error(
            "Interactive launching supports Windows and macOS.",
        ))
    }
}
pub(crate) fn launch(
    preferences: &LauncherPreferences,
    tool: &str,
    cwd: &Path,
) -> Result<(), AppError> {
    if tool_details(tool).is_none() {
        return Err(workspace::error("Choose a supported project tool."));
    }
    if tool == "folder" {
        return open::that(cwd).map_err(|_| workspace::error("Could not open the project folder."));
    }
    if tool == "terminal" {
        return launch_terminal(preferences, cwd, None);
    }
    let path = tool_path(preferences,tool).ok_or_else(|| workspace::error("This development tool is unavailable. Install it or set its executable path in Project Settings."))?;
    if ["claude", "codex", "agy"].contains(&tool) {
        return launch_terminal(preferences, cwd, Some(&path));
    }
    // IDE discovery is passive. Only this explicit user action starts its normal
    // folder-opening command; no additional help/version process is launched.
    let mut command = Command::new(path);
    command.arg("--new-window").arg(cwd).current_dir(cwd);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
        .spawn()
        .map_err(|_| workspace::error("Could not open the development editor."))?;
    Ok(())
}
#[tauri::command(async)]
pub fn get_project_tools(
    id: String,
    refresh: Option<bool>,
    app: tauri::AppHandle,
) -> Result<Vec<ProjectTool>, AppError> {
    let project = handoff::find_project(&app, &id)?;
    Ok(if refresh.unwrap_or(false) {
        cached_tools(&project.launcher, true)
    } else {
        tools(&project.launcher)
    })
}
#[tauri::command(async)]
pub fn launch_project_tool(
    id: String,
    tool: String,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    let project = handoff::find_project(&app, &id)?;
    let path = workspace::project_directory(&project)?;
    launch(&project.launcher, &tool, &path)?;
    let _ = handoff::update_project(&app, &id, |project| {
        project.last_opened_at = handoff::now_seconds();
        Ok(())
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn overrides_are_files_and_commands_cannot_be_supplied_as_paths() {
        let mut preferences = LauncherPreferences {
            terminal: "auto".into(),
            executables: BTreeMap::new(),
        };
        preferences.executables.insert(
            "claude".into(),
            "claude --dangerously-skip-permissions".into(),
        );
        assert!(validate(&preferences).is_err());
        preferences.executables.insert(
            "claude".into(),
            std::env::current_exe()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
        );
        assert!(validate(&preferences).is_ok());
        preferences
            .executables
            .insert("unknown".into(), "/fake/tool".into());
        assert!(validate(&preferences).is_err());
    }
    #[test]
    fn both_shell_layers_preserve_spaces_quotes_and_unicode() {
        assert_eq!(powershell_literal("a ' $(); 🦀"), "'a '' $(); 🦀'");
        assert_eq!(shell_literal("a ' $(); 🦀"), "'a '\\'' $(); 🦀'");
        assert_eq!(applescript_literal("a \\\" b"), "\"a \\\\\\\" b\"");
        assert_eq!(encoded_powershell("a"), "YQA=");
    }
    #[test]
    fn missing_tools_have_documentation_and_cli_is_distinct_from_ide() {
        assert!(find_executable("repo-creator-no-such-cli").is_none());
        assert!(find_executable("cmd /c arbitrary").is_none());
        assert_ne!(tool_details("agy"), tool_details("antigravity-ide"));
        let tools = tools(&LauncherPreferences {
            terminal: "auto".into(),
            executables: BTreeMap::new(),
        });
        assert_eq!(tools.len(), 7);
        assert!(tools
            .iter()
            .all(|tool| tool.documentation.starts_with("https://")));
    }
    fn fixture_executable(directory: &Path) -> (PathBuf, PathBuf) {
        let marker = directory.join("unexpected-discovery-launch.txt");
        #[cfg(windows)]
        let path = directory.join("fake GUI 日本語.cmd");
        #[cfg(windows)]
        std::fs::write(
            &path,
            format!("@echo off\r\necho unexpected>\"{}\"\r\n", marker.display()),
        )
        .unwrap();
        #[cfg(unix)]
        let path = directory.join("fake GUI 日本語");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::write(
                &path,
                format!(
                    "#!/bin/sh\nprintf unexpected > {}\n",
                    shell_literal(&marker.to_string_lossy())
                ),
            )
            .unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        (path, marker)
    }
    #[test]
    fn passive_discovery_and_refresh_never_start_gui_or_cli_executables() {
        let directory = tempfile::tempdir().unwrap();
        let (path, marker) = fixture_executable(directory.path());
        let mut preferences = LauncherPreferences::default();
        for id in ["vscode", "claude", "codex", "agy", "antigravity-ide"] {
            preferences
                .executables
                .insert(id.into(), path.to_string_lossy().into_owned());
        }
        for refresh in [true, false, true] {
            let tools = cached_tools(&preferences, refresh);
            for id in ["vscode", "claude", "codex", "agy", "antigravity-ide"] {
                let tool = tools.iter().find(|tool| tool.id == id).unwrap();
                assert_eq!(tool.status, "available");
                assert_eq!(tool.platform, platform());
                assert!(tool.available);
            }
            assert!(
                !marker.exists(),
                "passive discovery started an external program"
            );
        }
    }
    #[test]
    fn cli_and_ide_are_independent_and_invalid_overrides_never_fall_back() {
        let directory = tempfile::tempdir().unwrap();
        let (path, marker) = fixture_executable(directory.path());
        let missing = directory
            .path()
            .join("missing.exe")
            .to_string_lossy()
            .into_owned();
        let mut preferences = LauncherPreferences::default();
        preferences.executables.insert(
            "antigravity-ide".into(),
            path.to_string_lossy().into_owned(),
        );
        preferences
            .executables
            .insert("agy".into(), missing.clone());
        preferences
            .executables
            .insert("vscode".into(), missing.clone());
        let tools = discovery(&preferences);
        assert_eq!(
            tools
                .iter()
                .find(|tool| tool.id == "antigravity-ide")
                .unwrap()
                .status,
            "available"
        );
        for id in ["agy", "vscode"] {
            let tool = tools.iter().find(|tool| tool.id == id).unwrap();
            assert_eq!(tool.status, "invalid");
            assert!(!tool.available);
            assert_eq!(tool.path.as_deref(), Some(missing.as_str()));
            assert!(tool_path(&preferences, id).is_none());
        }
        preferences
            .executables
            .insert("agy".into(), path.to_string_lossy().into_owned());
        preferences
            .executables
            .insert("antigravity-ide".into(), missing.clone());
        let tools = discovery(&preferences);
        assert_eq!(
            tools.iter().find(|tool| tool.id == "agy").unwrap().status,
            "available"
        );
        assert_eq!(
            tools
                .iter()
                .find(|tool| tool.id == "antigravity-ide")
                .unwrap()
                .status,
            "invalid"
        );
        preferences.executables.insert(
            if cfg!(windows) {
                "windows-terminal"
            } else {
                "terminal"
            }
            .into(),
            missing,
        );
        assert!(terminal_path(&preferences).is_none());
        assert!(!marker.exists());
    }
    #[test]
    fn availability_cache_is_short_bounded_and_explicitly_refreshable() {
        let directory = tempfile::tempdir().unwrap();
        let (path, marker) = fixture_executable(directory.path());
        let mut preferences = LauncherPreferences::default();
        preferences.executables.insert(
            "antigravity-ide".into(),
            path.to_string_lossy().into_owned(),
        );
        assert!(
            cached_tools(&preferences, true)
                .iter()
                .find(|tool| tool.id == "antigravity-ide")
                .unwrap()
                .available
        );
        std::fs::remove_file(&path).unwrap();
        assert!(
            cached_tools(&preferences, false)
                .iter()
                .find(|tool| tool.id == "antigravity-ide")
                .unwrap()
                .available
        );
        assert_eq!(
            cached_tools(&preferences, true)
                .iter()
                .find(|tool| tool.id == "antigravity-ide")
                .unwrap()
                .status,
            "invalid"
        );
        let (path, _) = fixture_executable(directory.path());
        preferences
            .executables
            .insert("agy".into(), path.to_string_lossy().into_owned());
        assert!(
            cached_tools(&preferences, false)
                .iter()
                .find(|tool| tool.id == "agy")
                .unwrap()
                .available,
            "changed overrides must use a different cache key"
        );
        let cache = TOOL_CACHE.get().unwrap().lock().unwrap();
        assert!(cache.len() <= MAX_CACHE_ENTRIES);
        assert!(!marker.exists());
    }
}
