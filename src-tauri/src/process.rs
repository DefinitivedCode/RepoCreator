use std::{
    io::Read,
    path::Path,
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
    let mut command = Command::new(program.executable());
    command
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
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
