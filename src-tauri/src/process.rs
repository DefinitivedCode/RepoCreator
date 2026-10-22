use std::{
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Program {
    Git,
    Gh,
}

impl Program {
    fn executable(self) -> &'static str {
        match self {
            Self::Git => "git",
            Self::Gh => "gh",
        }
    }
}

/// Finder does not inherit a user's interactive shell PATH. Add documented common
/// install locations to this child process only; never source a shell profile.
pub fn executable_directories() -> Vec<PathBuf> {
    let mut directories = std::env::var_os("PATH")
        .map(|value| std::env::split_paths(&value).collect::<Vec<_>>())
        .unwrap_or_default();
    #[cfg(windows)]
    {
        for key in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            if let Some(root) = std::env::var_os(key) {
                let root = PathBuf::from(root);
                directories.extend([
                    root.join("Git/cmd"),
                    root.join("Git/bin"),
                    root.join("GitHub CLI"),
                    root.join("Programs/Git/cmd"),
                    root.join("Programs/GitHub CLI"),
                ]);
            }
        }
        if let Some(root) = std::env::var_os("APPDATA") {
            directories.push(PathBuf::from(root).join("npm"));
        }
        if let Some(root) = std::env::var_os("LOCALAPPDATA") {
            let root = PathBuf::from(root);
            directories.extend([root.join("agy/bin"), root.join("Microsoft/WindowsApps")]);
        }
    }
    #[cfg(not(windows))]
    {
        directories.extend([
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/bin"),
        ]);
    }
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        let home = PathBuf::from(home);
        for relative in [
            ".local/bin",
            ".cargo/bin",
            ".opencode/bin",
            ".claude/local",
            ".npm-global/bin",
            ".volta/bin",
        ] {
            directories.push(home.join(relative));
        }
    }
    // Ignore relative PATH entries so a newly created project cannot shadow tools.
    directories.retain(|path| path.is_absolute());
    let mut unique = Vec::new();
    for directory in directories {
        if !unique.contains(&directory) {
            unique.push(directory);
        }
    }
    unique
}

pub fn executable_file(path: &Path) -> bool {
    if !path.is_absolute() || !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .is_ok_and(|metadata| metadata.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    true
}

pub fn resolve_executable(name: &str) -> Option<PathBuf> {
    let filename = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.into()
    };
    executable_directories()
        .iter()
        .map(|directory| directory.join(&filename))
        .find(|path| executable_file(path))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub id: &'static str,
    pub name: &'static str,
    pub status: &'static str,
}

pub fn optional_tools() -> Vec<ToolStatus> {
    [
        ("claude", "Claude Code"),
        ("codex", "Codex"),
        ("copilot", "GitHub Copilot CLI"),
        ("cursor", "Cursor"),
        ("gemini", "Gemini CLI"),
        ("opencode", "OpenCode"),
    ]
    .into_iter()
    .map(|(id, name)| {
        let mut available = resolve_executable(id).is_some()
            || (cfg!(windows)
                && executable_directories()
                    .iter()
                    .any(|directory| directory.join(format!("{id}.cmd")).is_file()));
        if id == "cursor" {
            #[cfg(windows)]
            if let Some(root) = std::env::var_os("LOCALAPPDATA") {
                available |=
                    executable_file(&PathBuf::from(root).join("Programs/cursor/Cursor.exe"));
            }
            #[cfg(target_os = "macos")]
            {
                available |=
                    executable_file(Path::new("/Applications/Cursor.app/Contents/MacOS/Cursor"));
                if let Some(home) = std::env::var_os("HOME") {
                    available |= executable_file(
                        &PathBuf::from(home).join("Applications/Cursor.app/Contents/MacOS/Cursor"),
                    );
                }
            }
        }
        ToolStatus {
            id,
            name,
            status: if available {
                "available"
            } else {
                "unavailable"
            },
        }
    })
    .collect()
}

#[derive(Debug)]
pub struct Output {
    pub success: bool,
    pub stdout: String,
}

// Stderr is deliberately discarded: CLI failures can include credentials or remote URLs.
// Present fixed, actionable guidance instead of forwarding untrusted diagnostics to the UI.
pub trait Runner: Send + Sync {
    fn run(&self, program: Program, args: &[String], cwd: &Path) -> Result<Output, String>;
}

pub struct SystemRunner;

pub fn command(program: Program, args: &[String], cwd: &Path) -> Command {
    let executable = resolve_executable(program.executable())
        .unwrap_or_else(|| PathBuf::from(program.executable()));
    let mut command = Command::new(executable);
    command
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    if let Ok(path) = std::env::join_paths(executable_directories()) {
        command.env("PATH", path);
    }
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .env("GH_HOST", "github.com")
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_NO_UPDATE_NOTIFIER", "1");
    // A desktop launch must not inherit a caller's repository or injected Git config.
    for (key, _) in std::env::vars_os() {
        let name = key.to_string_lossy();
        if name.starts_with("GIT_") && name != "GIT_TERMINAL_PROMPT" {
            command.env_remove(key);
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    command
}

impl Runner for SystemRunner {
    fn run(&self, program: Program, args: &[String], cwd: &Path) -> Result<Output, String> {
        if resolve_executable(program.executable()).is_none() {
            return Err("unavailable".into());
        }
        let mut child = command(program, args, cwd)
            .spawn()
            .map_err(|_| "unavailable".to_string())?;
        let stdout = child.stdout.take().ok_or("stdout unavailable")?;
        let reader = thread::spawn(move || {
            let mut bytes = Vec::new();
            // Bound output memory. All commands in this app return small, structured output.
            let _ = stdout.take(1024 * 1024).read_to_end(&mut bytes);
            String::from_utf8_lossy(&bytes).trim().to_string()
        });
        let started = Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if started.elapsed() < Duration::from_secs(120) => {
                    thread::sleep(Duration::from_millis(40))
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("timed out".into());
                }
            }
        };
        Ok(Output {
            success: status.success(),
            stdout: reader.join().unwrap_or_default(),
        })
    }
}

pub fn args(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn executable_search_uses_absolute_directories_and_direct_git_binary() {
        let directories = executable_directories();
        assert!(directories.iter().all(|path| path.is_absolute()));
        for (index, directory) in directories.iter().enumerate() {
            assert!(!directories[..index].contains(directory));
        }
        let git = resolve_executable("git").expect("Git is required for the integration suite");
        assert!(executable_file(&git));
        let command = command(Program::Git, &args(&["--version"]), Path::new("."));
        assert_eq!(Path::new(command.get_program()), git);
        assert!(!command
            .get_args()
            .any(|arg| arg.to_string_lossy().contains("-Command")));
        assert!(resolve_executable("repo-creator-nonexistent-optional-tool").is_none());
    }

    #[test]
    fn optional_tools_have_explicit_status_without_running_them() {
        let tools = optional_tools();
        assert_eq!(tools.len(), 6);
        assert!(tools.iter().all(|tool| {
            !tool.id.is_empty()
                && !tool.name.is_empty()
                && matches!(tool.status, "available" | "unavailable" | "not-checked")
        }));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn finder_search_includes_both_homebrew_locations() {
        let directories = executable_directories();
        assert!(directories.contains(&PathBuf::from("/opt/homebrew/bin")));
        assert!(directories.contains(&PathBuf::from("/usr/local/bin")));
        assert!(directories.contains(&PathBuf::from("/usr/bin")));
    }
}
