use crate::{
    config::PostActions,
    model::{AppError, CreatedRepo},
};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

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
    candidates
        .into_iter()
        .find(|path| path.is_absolute() && path.is_file())
}

pub fn open_vscode(path: &Path) -> Result<(), AppError> {
    let executable = vscode_path().ok_or_else(|| {
        AppError::new(
            "Visual Studio Code is unavailable.",
            "Install VS Code, reopen Repo Creator, or open the folder manually.",
        )
    })?;
    // Launch Code.exe directly. The code.cmd shell wrapper is never used.
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
            .push("Repository created; File Explorer could not be opened.".into());
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
