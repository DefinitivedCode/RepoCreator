use crate::process_tree;
use std::{
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Program {
    Git,
    Gh,
    // Readiness version probes. They run only after an explicit full check.
    Node,
    Rustc,
    Rustup,
    Python,
}

impl Program {
    pub(crate) fn executable(self) -> &'static str {
        match self {
            Self::Git => "git",
            Self::Gh => "gh",
            Self::Node => "node",
            Self::Rustc => "rustc",
            Self::Rustup => "rustup",
            Self::Python if cfg!(windows) => "python",
            Self::Python => "python3",
        }
    }
}
#[cfg(windows)]
pub(crate) fn windows_install_roots() -> Vec<PathBuf> {
    let mut roots = ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    if let Some(home) = std::env::var_os("USERPROFILE") {
        roots.push(PathBuf::from(home).join("AppData/Local"));
    }
    roots.retain(|root| root.is_absolute());
    let mut unique = Vec::new();
    for root in roots {
        if !unique.contains(&root) {
            unique.push(root);
        }
    }
    unique
}

/// Finder does not inherit a user's interactive shell PATH. Add documented common
/// install locations to this child process only; never source a shell profile.
pub fn executable_directories() -> Vec<PathBuf> {
    let mut directories = std::env::var_os("PATH")
        .map(|value| std::env::split_paths(&value).collect::<Vec<_>>())
        .unwrap_or_default();
    #[cfg(windows)]
    {
        for root in windows_install_roots() {
            directories.extend([
                root.join("Git/cmd"),
                root.join("Git/bin"),
                root.join("GitHub CLI"),
                root.join("Programs/Git/cmd"),
                root.join("Programs/GitHub CLI"),
                root.join("agy/bin"),
                root.join("Microsoft/WindowsApps"),
                root.join("Microsoft/WinGet/Links"),
                root.join("Programs/claude-code"),
                root.join("Programs/Microsoft VS Code/bin"),
                root.join("Microsoft VS Code/bin"),
            ]);
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
            ".bun/bin",
            "scoop/shims",
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
        let mut available = crate::launcher::find_executable(id).is_some();
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
    if matches!(program, Program::Rustc | Program::Rustup) {
        // A version probe must never download a toolchain named by a project file.
        command.env("RUSTUP_AUTO_INSTALL", "0");
    }
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
        // Existing Git and GitHub operations may leave helpers running after a
        // normal exit; only a timeout ends their whole process tree.
        run_bounded(program, args, cwd, Duration::from_secs(120), None, false)
    }
}

/// Bounded execution with a caller-chosen limit and optional cancellation. Every
/// descendant is ended when the run finishes, times out or is cancelled.
pub struct BoundedRunner {
    pub timeout: Duration,
    pub cancel: Option<Arc<AtomicBool>>,
}

impl Runner for BoundedRunner {
    fn run(&self, program: Program, args: &[String], cwd: &Path) -> Result<Output, String> {
        run_bounded(
            program,
            args,
            cwd,
            self.timeout,
            self.cancel.as_deref(),
            true,
        )
    }
}

const OUTPUT_LIMIT: usize = 1024 * 1024;

fn run_bounded(
    program: Program,
    args: &[String],
    cwd: &Path,
    timeout: Duration,
    cancel: Option<&AtomicBool>,
    end_descendants: bool,
) -> Result<Output, String> {
    if resolve_executable(program.executable()).is_none() {
        return Err("unavailable".into());
    }
    let cancelled = || cancel.is_some_and(|flag| flag.load(Ordering::Acquire));
    if cancelled() {
        return Err("cancelled".into());
    }
    let mut process = command(program, args, cwd);
    // The child and its descendants share a process group (Unix) or job (Windows).
    let (mut child, tree) =
        process_tree::spawn(&mut process).map_err(|_| "unavailable".to_string())?;
    let Some(mut stdout) = child.stdout.take() else {
        tree.terminate();
        let _ = child.wait();
        return Err("stdout unavailable".into());
    };
    // Output is collected incrementally so a descendant that keeps the pipe open
    // cannot hold the caller past its deadline.
    let collected = Arc::new(Mutex::new(Vec::new()));
    let (finished, closed) = mpsc::channel::<()>();
    {
        let collected = collected.clone();
        thread::spawn(move || {
            let mut chunk = [0u8; 8192];
            loop {
                match stdout.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => {
                        if let Ok(mut bytes) = collected.lock() {
                            let room = OUTPUT_LIMIT.saturating_sub(bytes.len());
                            bytes.extend_from_slice(&chunk[..count.min(room)]);
                        }
                    }
                }
            }
            let _ = finished.send(());
        });
    }
    let deadline = Instant::now() + timeout;
    let stop = |reason: &str| {
        tree.terminate();
        reason.to_string()
    };
    let status = loop {
        if cancelled() {
            let reason = stop("cancelled");
            let _ = child.wait();
            return Err(reason);
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(40)),
            _ => {
                let reason = stop("timed out");
                let _ = child.kill();
                let _ = child.wait();
                return Err(reason);
            }
        }
    };
    // The direct child has exited; its output is complete once every holder of
    // the pipe has closed it. A descendant still holding it is ended at the
    // deadline or on cancellation.
    loop {
        match closed.recv_timeout(Duration::from_millis(40)) {
            Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if cancelled() {
            return Err(stop("cancelled"));
        }
        if Instant::now() >= deadline {
            return Err(stop("timed out"));
        }
    }
    if end_descendants {
        tree.terminate();
    } else {
        tree.release();
    }
    let bytes = collected
        .lock()
        .map(|bytes| bytes.clone())
        .unwrap_or_default();
    Ok(Output {
        success: status.success(),
        stdout: String::from_utf8_lossy(&bytes).trim().to_string(),
    })
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

    // A Git shell alias exits at once while a background descendant keeps
    // stdout open, then writes `late` unless its process tree was ended.
    fn holding(delay: u32) -> Vec<String> {
        args(&[
            "-c",
            &format!("alias.hold=!(sleep {delay}; echo late > late) & echo held"),
            "hold",
        ])
    }
    fn assert_descendant_ended(dir: &Path, delay: u32) {
        thread::sleep(Duration::from_secs(u64::from(delay) + 1));
        assert!(
            !dir.join("late").exists(),
            "the descendant outlived the run"
        );
    }

    #[test]
    fn inherited_stdout_cannot_hold_a_run_past_its_deadline() {
        let dir = tempfile::tempdir().unwrap();
        let runner = BoundedRunner {
            timeout: Duration::from_secs(2),
            cancel: None,
        };
        let started = Instant::now();
        let result = runner.run(Program::Git, &holding(4), dir.path());
        assert_eq!(result.unwrap_err(), "timed out");
        assert!(started.elapsed() < Duration::from_secs(4));
        assert_descendant_ended(dir.path(), 4);
    }

    #[test]
    fn cancellation_ends_runs_and_descendants_holding_stdout() {
        let dir = tempfile::tempdir().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let runner = BoundedRunner {
            timeout: Duration::from_secs(30),
            cancel: Some(cancel.clone()),
        };
        let trigger = cancel.clone();
        let timer = thread::spawn(move || {
            thread::sleep(Duration::from_millis(600));
            trigger.store(true, Ordering::Release);
        });
        let started = Instant::now();
        let result = runner.run(Program::Git, &holding(4), dir.path());
        timer.join().unwrap();
        assert_eq!(result.unwrap_err(), "cancelled");
        assert!(started.elapsed() < Duration::from_secs(3));
        assert_descendant_ended(dir.path(), 4);
        assert_eq!(
            runner
                .run(Program::Git, &args(&["--version"]), dir.path())
                .unwrap_err(),
            "cancelled"
        );
        let finished = BoundedRunner {
            timeout: Duration::from_secs(30),
            cancel: None,
        }
        .run(Program::Git, &args(&["--version"]), dir.path())
        .unwrap();
        assert!(finished.success && finished.stdout.starts_with("git version"));
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
