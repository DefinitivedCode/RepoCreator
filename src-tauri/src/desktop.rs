use crate::{
    config::PostActions,
    model::{AppError, CreatedRepo},
    process::{executable_file, resolve_executable},
};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
};
use tauri::Manager;

#[derive(serde::Deserialize, serde::Serialize)]
struct WindowSize {
    width: f64,
    height: f64,
    maximized: bool,
}

fn saved_window_size(path: &Path) -> Option<WindowSize> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .ok()?
        .take(1025)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > 1024 {
        return None;
    }
    let size: WindowSize = serde_json::from_slice(&bytes).ok()?;
    (size.width.is_finite()
        && size.height.is_finite()
        && (820.0..=5000.0).contains(&size.width)
        && (580.0..=3000.0).contains(&size.height))
    .then_some(size)
}

pub fn restore_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(directory) = crate::data_dir(app) else {
        return;
    };
    let Some(mut size) = saved_window_size(&directory.join("window.json")) else {
        return;
    };
    if let Ok(Some(monitor)) = window.current_monitor() {
        let screen = monitor.size().to_logical::<f64>(monitor.scale_factor());
        size.width = size.width.min((screen.width - 60.0).max(820.0));
        size.height = size.height.min((screen.height - 80.0).max(580.0));
    }
    let _ = window.set_size(tauri::LogicalSize::new(size.width, size.height));
    let _ = window.center();
    if size.maximized {
        let _ = window.maximize();
    }
}

pub fn remember_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(directory) = crate::data_dir(app) else {
        return;
    };
    let (Ok(physical), Ok(scale)) = (window.inner_size(), window.scale_factor()) else {
        return;
    };
    let logical = physical.to_logical::<f64>(scale);
    let maximized = window.is_maximized().unwrap_or_default();
    let previous = maximized
        .then(|| saved_window_size(&directory.join("window.json")))
        .flatten();
    let size = WindowSize {
        width: previous.as_ref().map_or_else(
            || if maximized { 1100.0 } else { logical.width },
            |size| size.width,
        ),
        height: previous.as_ref().map_or_else(
            || if maximized { 740.0 } else { logical.height },
            |size| size.height,
        ),
        maximized,
    };
    let Ok(bytes) = serde_json::to_vec(&size) else {
        return;
    };
    if fs::create_dir_all(&directory).is_err() {
        return;
    }
    if let Ok(mut temporary) = tempfile::NamedTempFile::new_in(&directory) {
        if temporary.write_all(&bytes).is_ok() {
            let _ = temporary.persist(directory.join("window.json"));
        }
    }
}

pub fn vscode_path() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        candidates.push(PathBuf::from(local).join("Programs/Microsoft VS Code/Code.exe"));
    }
    for key in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(path) = std::env::var_os(key) {
            candidates.push(PathBuf::from(path).join("Microsoft VS Code/Code.exe"));
        }
    }
    if let Some(paths) = std::env::var_os("PATH") {
        for path in std::env::split_paths(&paths) {
            candidates.push(path.join("Code.exe"));
            if path
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case("bin"))
            {
                if let Some(parent) = path.parent() {
                    candidates.push(parent.join("Code.exe"));
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from(
            "/Applications/Visual Studio Code.app/Contents/MacOS/Electron",
        ));
        if let Some(home) = std::env::var_os("HOME") {
            candidates.push(
                PathBuf::from(home)
                    .join("Applications/Visual Studio Code.app/Contents/MacOS/Electron"),
            );
        }
    }
    #[cfg(target_os = "linux")]
    {
        candidates.push(PathBuf::from("/usr/share/code/code"));
        candidates.extend(resolve_executable("code"));
    }
    candidates.into_iter().find(|path| executable_file(path))
}

pub fn open_vscode(path: &Path) -> Result<(), AppError> {
    let executable = vscode_path().ok_or_else(|| {
        AppError::new(
            "Visual Studio Code is unavailable.",
            "Install VS Code, reopen Repo Creator, or open the folder manually.",
        )
    })?;
    // Launch the application's binary directly, without a shell wrapper.
    let mut command = Command::new(executable);
    command.arg("--new-window").arg(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.spawn().map_err(|_| {
        AppError::new(
            "Could not open VS Code.",
            "The repository was created. Open its folder manually.",
        )
    })?;
    Ok(())
}

pub fn post_creation(result: &mut CreatedRepo, actions: &PostActions) {
    if actions.folder && open::that(&result.path).is_err() {
        result
            .warnings
            .push("Repository created; the file manager could not be opened.".into());
    }
    if actions.vscode {
        if let Err(error) = open_vscode(Path::new(&result.path)) {
            result.warnings.push(error.message);
        }
    }
    if actions.github {
        if let Some(url) = &result.github_url {
            if open::that(url).is_err() {
                result
                    .warnings
                    .push("Repository published; the browser could not be opened.".into());
            }
        }
    }
}

pub fn setup_url(resource: &str) -> Result<&'static str, AppError> {
    match resource {
        "git" => Ok(if cfg!(target_os = "macos") {
            "https://git-scm.com/downloads/mac"
        } else if cfg!(windows) {
            "https://git-scm.com/downloads/win"
        } else {
            "https://git-scm.com/downloads/linux"
        }),
        "gh" => Ok("https://cli.github.com/"),
        "git-identity" => Ok("https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup"),
        "claude" => Ok("https://code.claude.com/docs/en/setup"),
        "codex" => Ok("https://developers.openai.com/codex/cli/"),
        "copilot" => Ok("https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli"),
        "cursor" => Ok("https://cursor.com/downloads"),
        "gemini" => Ok("https://geminicli.com/docs/get-started/installation/"),
        "opencode" => Ok("https://opencode.ai/docs/"),
        "vscode" => Ok("https://code.visualstudio.com/download"),
        _ => Err(AppError::new(
            "Unknown setup resource.",
            "Choose a setup action in Repo Creator.",
        )),
    }
}

pub fn connect_github() -> Result<(), AppError> {
    if resolve_executable("gh").is_none() {
        return Err(AppError::new(
            "GitHub CLI is unavailable.",
            "Install GitHub CLI, then recheck setup before connecting.",
        ));
    }
    // This deliberately opens the official interactive device flow in a terminal.
    // Every script below is constant: project names and paths never enter a shell.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut command = Command::new("powershell.exe");
        if let Ok(path) = std::env::join_paths(crate::process::executable_directories()) {
            command.env("PATH", path);
        }
        command.args(["-NoProfile", "-NoExit", "-Command",
                "& gh auth login --hostname github.com --git-protocol https --web; if ($LASTEXITCODE -eq 0) { exit }"])
            .creation_flags(0x00000010)
            .spawn()
            .map_err(|_| authentication_error())?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("/usr/bin/osascript")
            .args([
                "-e",
                "tell application \"Terminal\" to activate",
                "-e",
                "tell application \"Terminal\" to do script \"PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH gh auth login --hostname github.com --git-protocol https --web\"",
            ])
            .status()
            .map_err(|_| authentication_error())?;
        if status.success() {
            Ok(())
        } else {
            Err(authentication_error())
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    Err(authentication_error())
}

fn authentication_error() -> AppError {
    AppError::new(
        "Could not open GitHub sign-in.",
        "Open a terminal and run: gh auth login --hostname github.com --git-protocol https --web. Then return and recheck setup.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setup_links_are_allowlisted_and_platform_specific() {
        assert!(setup_url("https://untrusted.example").is_err());
        assert!(setup_url("git; echo injected").is_err());
        assert_eq!(setup_url("gh").unwrap(), "https://cli.github.com/");
        let git = setup_url("git").unwrap();
        assert!(git.starts_with("https://git-scm.com/downloads/"));
        #[cfg(target_os = "macos")]
        assert!(git.ends_with("/mac"));
        #[cfg(windows)]
        assert!(git.ends_with("/win"));
    }
}
