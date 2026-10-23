//! Bounded command snapshots, output readers and cancellable owned processes.
use crate::{
    handoff,
    model::AppError,
    process, process_tree,
    workspace::{self, ProjectCommand},
};
use serde::Serialize;
use std::{
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::State;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;
const MAX_RUNS: usize = 40;
const MAX_ACTIVE: usize = 8;
static NEXT_RUN: AtomicU64 = AtomicU64::new(1);
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommandRun {
    pub id: String,
    pub project_id: String,
    pub command_id: String,
    pub name: String,
    pub status: String,
    pub started_at: u64,
    pub finished_at: Option<u64>,
    pub exit_code: Option<i32>,
    pub output: String,
}
struct LiveRun {
    snapshot: Mutex<CommandRun>,
    stopped: AtomicBool,
}
#[derive(Default)]
pub struct CommandRunner {
    runs: Mutex<Vec<Arc<LiveRun>>>,
    closing: AtomicBool,
}
fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn state_error() -> AppError {
    workspace::error("Command state is unavailable. Reopen the application.")
}

pub(crate) fn executable(value: &str, cwd: &Path) -> Result<PathBuf, AppError> {
    let path = Path::new(value);
    let resolved = if path.is_absolute() {
        Some(path.to_path_buf())
    } else if path.components().count() > 1 {
        Some(cwd.join(path))
    } else {
        crate::launcher::find_executable(value)
    };
    resolved
        .filter(|path| process::executable_file(path))
        .ok_or_else(|| {
            workspace::error(
                "The executable was not found. Install it or choose its full executable path.",
            )
        })
}
fn build_command(command: &ProjectCommand, cwd: &Path) -> Result<Command, AppError> {
    let mut process = if command.mode == "shell" {
        #[cfg(windows)]
        let mut process = Command::new(
            crate::launcher::powershell_path()
                .ok_or_else(|| workspace::error("PowerShell is unavailable."))?,
        );
        #[cfg(windows)]
        process.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &command.shell_command,
        ]);
        #[cfg(unix)]
        let mut process = Command::new("/bin/sh");
        #[cfg(unix)]
        process.args(["-c", &command.shell_command]);
        process
    } else {
        let resolved = executable(&command.executable, cwd)?;
        #[cfg(windows)]
        let (resolved, prefix) = structured_windows_executable(resolved)?;
        let mut process = Command::new(resolved);
        #[cfg(windows)]
        process.args(prefix);
        process.args(&command.args);
        process
    };
    process
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Ok(path) = std::env::join_paths(process::executable_directories()) {
        process.env("PATH", path);
    }
    process.envs(&command.environment);
    Ok(process)
}
#[cfg(windows)]
pub(crate) fn structured_windows_executable(
    path: PathBuf,
) -> Result<(PathBuf, Vec<PathBuf>), AppError> {
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("cmd") || ext.eq_ignore_ascii_case("bat"))
    {
        return Ok((path, Vec::new()));
    }
    // npm installs Windows shell shims. Resolve recognized package-manager
    // shims to their Node entry point so arguments never pass through cmd.exe.
    // Arbitrary batch programs belong in the explicitly authored shell mode.
    let directory = path
        .parent()
        .ok_or_else(|| workspace::error("The batch executable has no parent directory."))?;
    let filename = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase();
    let script = match filename.as_str() {
        "npm" => "node_modules/npm/bin/npm-cli.js", "npx" => "node_modules/npm/bin/npx-cli.js",
        "pnpm" => "node_modules/pnpm/bin/pnpm.cjs", "yarn" => "node_modules/yarn/bin/yarn.js",
        _ => return Err(workspace::error("Batch files require explicit shell-command mode. Structured commands run native executables directly.")),
    };
    let script = [
        directory.join(script),
        directory.join(format!("node_modules/corepack/dist/{filename}.js")),
    ]
    .into_iter()
    .find(|path| path.is_file());
    let node = directory.join("node.exe");
    let node = if process::executable_file(&node) {
        Some(node)
    } else {
        crate::launcher::find_executable("node")
    };
    match (node,script) { (Some(node),Some(script)) => Ok((node,vec![script])), _ => Err(workspace::error("This package-manager shim has no verified Node entry point. Use its native executable or configure explicit shell-command mode.")) }
}
fn append_output(run: &LiveRun, text: &str, redactions: &[String]) {
    let mut text = text.to_string();
    for value in redactions {
        if value.len() >= 4 {
            text = text.replace(value, "[environment value]");
        }
    }
    if let Ok(mut snapshot) = run.snapshot.lock() {
        snapshot.output.push_str(&text);
        if snapshot.output.len() > MAX_OUTPUT_BYTES {
            let mut start = snapshot.output.len() - MAX_OUTPUT_BYTES;
            while !snapshot.output.is_char_boundary(start) {
                start += 1;
            }
            snapshot.output.drain(..start);
        }
    }
}
fn reader(
    mut stream: impl Read + Send + 'static,
    run: Arc<LiveRun>,
    redactions: Vec<String>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut chunk = [0u8; 4096];
        let mut pending = Vec::new();
        loop {
            match stream.read(&mut chunk) {
                Ok(0) | Err(_) => {
                    append_output(&run, &decode_utf8(&mut pending, &[], true), &redactions);
                    break;
                }
                Ok(count) => append_output(
                    &run,
                    &decode_utf8(&mut pending, &chunk[..count], false),
                    &redactions,
                ),
            }
        }
    })
}
fn decode_utf8(pending: &mut Vec<u8>, bytes: &[u8], finished: bool) -> String {
    pending.extend_from_slice(bytes);
    let mut output = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(text) => {
                output.push_str(text);
                pending.clear();
                break;
            }
            Err(error) => {
                let count = error.valid_up_to();
                output.push_str(std::str::from_utf8(&pending[..count]).unwrap_or_default());
                pending.drain(..count);
                if let Some(length) = error.error_len() {
                    output.push('\u{fffd}');
                    pending.drain(..length);
                } else {
                    if finished {
                        output.push('\u{fffd}');
                        pending.clear();
                    }
                    break;
                }
            }
        }
    }
    output
}
impl CommandRunner {
    pub(crate) fn start(
        &self,
        project_id: &str,
        command: &ProjectCommand,
        cwd: &Path,
        confirmed: bool,
    ) -> Result<CommandRun, AppError> {
        workspace::validate_commands(std::slice::from_ref(command))?;
        if !command.enabled {
            return Err(workspace::error("This command is disabled."));
        }
        if command.imported && !confirmed {
            return Err(workspace::error("Review the imported command and its working directory, then explicitly confirm its first run."));
        }
        let mut runs = self.runs.lock().map_err(|_| state_error())?;
        if self.closing.load(Ordering::Acquire) {
            return Err(workspace::error(
                "The application is closing. This command was not started.",
            ));
        }
        let mut active = 0;
        for run in runs.iter() {
            let snapshot = run.snapshot.lock().map_err(|_| state_error())?;
            if snapshot.status == "running" {
                active += 1;
                if snapshot.project_id == project_id && snapshot.command_id == command.id {
                    return Err(workspace::error(
                        "This command is already running. Stop it before starting it again.",
                    ));
                }
            }
        }
        if active >= MAX_ACTIVE {
            return Err(workspace::error(
                "Eight commands are already running. Stop one before starting another.",
            ));
        }
        let mut process = build_command(command, cwd)?;
        let (mut child, tree) = process_tree::spawn(&mut process).map_err(|_| workspace::error("Could not start and safely manage this command. Check the executable and directory."))?;
        let snapshot = CommandRun {
            id: format!(
                "run-{}-{}",
                timestamp(),
                NEXT_RUN.fetch_add(1, Ordering::Relaxed)
            ),
            project_id: project_id.into(),
            command_id: command.id.clone(),
            name: command.name.clone(),
            status: "running".into(),
            started_at: timestamp(),
            finished_at: None,
            exit_code: None,
            output: String::new(),
        };
        let run = Arc::new(LiveRun {
            snapshot: Mutex::new(snapshot.clone()),
            stopped: AtomicBool::new(false),
        });
        while runs.len() >= MAX_RUNS {
            let Some(index) = runs.iter().position(|run| {
                run.snapshot
                    .lock()
                    .is_ok_and(|snapshot| snapshot.status != "running")
            }) else {
                break;
            };
            runs.remove(index);
        }
        runs.push(run.clone());
        let redactions: Vec<String> = command.environment.values().cloned().collect();
        thread::spawn(move || {
            let stdout = child
                .stdout
                .take()
                .map(|stream| reader(stream, run.clone(), redactions.clone()));
            let stderr = child
                .stderr
                .take()
                .map(|stream| reader(stream, run.clone(), redactions));
            let status = loop {
                if run.stopped.load(Ordering::Acquire) {
                    tree.terminate();
                }
                match child.try_wait() {
                    Ok(Some(status)) => break Some(status),
                    Ok(None) => thread::sleep(Duration::from_millis(35)),
                    Err(_) => {
                        tree.terminate();
                        let _ = child.wait();
                        break None;
                    }
                }
            };
            // A finished parent does not leave orphaned servers or pipe writers.
            tree.terminate();
            drop(tree);
            if let Some(reader) = stdout {
                let _ = reader.join();
            }
            if let Some(reader) = stderr {
                let _ = reader.join();
            }
            if let Ok(mut snapshot) = run.snapshot.lock() {
                snapshot.status = if run.stopped.load(Ordering::Acquire) {
                    "stopped"
                } else if status.is_some_and(|s| s.success()) {
                    "succeeded"
                } else {
                    "failed"
                }
                .into();
                snapshot.exit_code = status.and_then(|s| s.code());
                snapshot.finished_at = Some(timestamp());
                if status.is_none() {
                    snapshot.output.push_str(
                        "\nThe command could not be monitored. Its process tree was stopped.\n",
                    );
                }
            }
        });
        Ok(snapshot)
    }
    pub(crate) fn list(&self, project_id: &str) -> Result<Vec<CommandRun>, AppError> {
        self.runs
            .lock()
            .map_err(|_| state_error())?
            .iter()
            .map(|run| {
                run.snapshot
                    .lock()
                    .map(|snapshot| snapshot.clone())
                    .map_err(|_| state_error())
            })
            .filter(|result| match result {
                Ok(run) => run.project_id == project_id,
                Err(_) => true,
            })
            .collect()
    }
    pub(crate) fn stop(&self, id: &str) -> Result<(), AppError> {
        for run in self.runs.lock().map_err(|_| state_error())?.iter() {
            if run.snapshot.lock().map_err(|_| state_error())?.id == id {
                run.stopped.store(true, Ordering::Release);
                return Ok(());
            }
        }
        Err(workspace::error("This command run is unavailable."))
    }
    pub(crate) fn shutdown(&self) {
        self.closing.store(true, Ordering::Release);
        if let Ok(runs) = self.runs.lock() {
            for run in runs.iter() {
                run.stopped.store(true, Ordering::Release);
            }
        }
        // Keep close responsive while giving workers enough time to close job
        // handles / process groups before the Tauri event loop exits.
        for _ in 0..40 {
            if self.runs.lock().is_ok_and(|runs| {
                runs.iter().all(|run| {
                    run.snapshot
                        .lock()
                        .is_ok_and(|snapshot| snapshot.status != "running")
                })
            }) {
                break;
            }
            thread::sleep(Duration::from_millis(25));
        }
    }
}
impl Drop for CommandRunner {
    fn drop(&mut self) {
        self.shutdown();
    }
}
#[tauri::command(async)]
pub fn run_project_command(
    project_id: String,
    command_id: String,
    confirmed: bool,
    app: tauri::AppHandle,
    state: State<'_, Arc<CommandRunner>>,
) -> Result<CommandRun, AppError> {
    let project = handoff::find_project(&app, &project_id)?;
    let command = project
        .commands
        .iter()
        .find(|command| command.id == command_id)
        .ok_or_else(|| workspace::error("This project command is unavailable."))?;
    let cwd = workspace::command_directory(&workspace::project_directory(&project)?, command)?;
    let run = state.start(&project_id, command, &cwd, confirmed)?;
    if command.imported {
        // Consent is remembered only for the exact definition that was reviewed.
        let _ = handoff::update_project(&app, &project_id, |project| {
            if let Some(saved) = project
                .commands
                .iter_mut()
                .find(|saved| **saved == *command)
            {
                saved.imported = false;
            }
            Ok(())
        });
    }
    Ok(run)
}
#[tauri::command(async)]
pub fn list_command_runs(
    project_id: String,
    state: State<'_, Arc<CommandRunner>>,
) -> Result<Vec<CommandRun>, AppError> {
    state.list(&project_id)
}
#[tauri::command(async)]
pub fn stop_project_command(
    run_id: String,
    state: State<'_, Arc<CommandRunner>>,
) -> Result<(), AppError> {
    state.stop(&run_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn command(id: &str, script: &str) -> ProjectCommand {
        ProjectCommand {
            id: id.into(),
            name: "Native fixture".into(),
            mode: "shell".into(),
            shell_command: script.into(),
            ..ProjectCommand::default()
        }
    }
    fn wait(runner: &CommandRunner) -> CommandRun {
        for _ in 0..200 {
            let value = runner.list("fixture").unwrap().pop().unwrap();
            if value.status != "running" {
                return value;
            }
            thread::sleep(Duration::from_millis(30));
        }
        panic!("command fixture did not finish");
    }
    #[test]
    fn native_success_failure_and_directory_with_spaces() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("project spaces 🦀");
        std::fs::create_dir(&path).unwrap();
        let runner = CommandRunner::default();
        #[cfg(windows)] let script = "[Console]::WriteLine((Get-Location).Path); [Console]::Error.WriteLine('stderr fixture'); exit 0";
        #[cfg(unix)]
        let script = "pwd; printf 'stderr fixture\\n' >&2; exit 0";
        runner
            .start("fixture", &command("success", script), &path, false)
            .unwrap();
        let run = wait(&runner);
        assert_eq!(run.status, "succeeded");
        assert_eq!(run.exit_code, Some(0));
        assert!(run.output.contains("project spaces"));
        assert!(run.output.contains("stderr fixture"));
        runner
            .start("fixture", &command("failure", "exit 7"), &path, false)
            .unwrap();
        let run = wait(&runner);
        assert_eq!(run.status, "failed");
        assert_eq!(run.exit_code, Some(7));
    }
    #[test]
    fn streaming_long_commands_duplicate_guard_and_closure_cleanup() {
        let dir = tempfile::tempdir().unwrap();
        let runner = CommandRunner::default();
        #[cfg(windows)] let script = "while ($true) { [Console]::WriteLine('stream fixture'); Start-Sleep -Milliseconds 20 }";
        #[cfg(unix)]
        let script = "while true; do printf 'stream fixture\\n'; sleep 0.02; done";
        let value = command("server", script);
        let run = runner.start("fixture", &value, dir.path(), false).unwrap();
        assert!(runner.start("fixture", &value, dir.path(), false).is_err());
        for _ in 0..100 {
            if !runner.list("fixture").unwrap()[0].output.is_empty() {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        assert!(runner.list("fixture").unwrap()[0]
            .output
            .contains("stream fixture"));
        runner.stop(&run.id).unwrap();
        assert_eq!(wait(&runner).status, "stopped");
        runner.start("fixture", &value, dir.path(), false).unwrap();
        runner.shutdown();
        assert_eq!(wait(&runner).status, "stopped");
        assert!(runner.start("fixture", &value, dir.path(), false).is_err());
    }
    #[test]
    fn imported_consent_is_required_and_output_is_bounded() {
        let dir = tempfile::tempdir().unwrap();
        let runner = CommandRunner::default();
        let mut value = command("imported", "exit 0");
        value.imported = true;
        assert!(runner.start("fixture", &value, dir.path(), false).is_err());
        let run = LiveRun {
            snapshot: Mutex::new(CommandRun {
                id: String::new(),
                project_id: String::new(),
                command_id: String::new(),
                name: String::new(),
                status: "running".into(),
                started_at: 0,
                finished_at: None,
                exit_code: None,
                output: String::new(),
            }),
            stopped: AtomicBool::new(false),
        };
        append_output(&run, &"🦀".repeat(MAX_OUTPUT_BYTES), &[]);
        assert!(run.snapshot.lock().unwrap().output.len() <= MAX_OUTPUT_BYTES);
    }
    #[test]
    fn split_unicode_output_preserves_complete_code_points() {
        let text = "日本語 🦀\n";
        let mut pending = Vec::new();
        let mut result = String::new();
        for byte in text.bytes() {
            result.push_str(&decode_utf8(&mut pending, &[byte], false));
        }
        result.push_str(&decode_utf8(&mut pending, &[], true));
        assert_eq!(result, text);
        assert_eq!(decode_utf8(&mut pending, &[0xff], true), "\u{fffd}");
    }
    #[cfg(windows)]
    #[test]
    fn node_package_shims_preserve_metacharacters_as_literal_arguments() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("package manager spaces 日本語");
        std::fs::create_dir_all(folder.join("node_modules/npm/bin")).unwrap();
        let shim = folder.join("npm.cmd");
        std::fs::write(&shim, "@echo off\nexit /b 99\n").unwrap();
        std::fs::write(
            folder.join("node_modules/npm/bin/npm-cli.js"),
            "process.stdout.write(JSON.stringify(process.argv.slice(2)))",
        )
        .unwrap();
        let arguments = vec![
            "literal & ; $(no execution) 日本語".to_string(),
            "%PATH% !variable! \"quotes\"".to_string(),
        ];
        let command = ProjectCommand {
            id: "literal".into(),
            name: "Literal arguments".into(),
            executable: shim.to_string_lossy().into_owned(),
            args: arguments.clone(),
            ..ProjectCommand::default()
        };
        let runner = CommandRunner::default();
        runner.start("fixture", &command, &folder, false).unwrap();
        let run = wait(&runner);
        assert_eq!(run.status, "succeeded");
        assert_eq!(
            serde_json::from_str::<Vec<String>>(&run.output).unwrap(),
            arguments
        );
        std::fs::create_dir_all(folder.join("node_modules/corepack/dist")).unwrap();
        for name in ["pnpm", "yarn"] {
            let shim = folder.join(format!("{name}.cmd"));
            std::fs::write(&shim, "@echo off\nexit /b 99\n").unwrap();
            std::fs::write(
                folder.join(format!("node_modules/corepack/dist/{name}.js")),
                "process.stdout.write(JSON.stringify(process.argv.slice(2)))",
            )
            .unwrap();
            let command = ProjectCommand {
                id: format!("corepack-{name}"),
                executable: shim.to_string_lossy().into_owned(),
                ..command.clone()
            };
            runner.start("fixture", &command, &folder, false).unwrap();
            let run = wait(&runner);
            assert_eq!(run.status, "succeeded");
            assert_eq!(
                serde_json::from_str::<Vec<String>>(&run.output).unwrap(),
                arguments
            );
        }
        assert!(structured_windows_executable(folder.join("unknown.cmd")).is_err());
    }
}
