use crate::{
    github,
    model::{render_readme, validate_request, AppError, CreateRequest, CreatedRepo, Destination},
    process::{args, Program, Runner},
};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone)]
pub struct PendingRepo {
    pub request: CreateRequest,
    pub path: PathBuf,
    pub owner: Option<String>,
    pub commit: Option<String>,
    pub remote_created: bool,
    pub github_url: Option<String>,
}

impl PendingRepo {
    pub fn failure(&self, mut error: AppError) -> AppError {
        error.local_path = Some(self.path.to_string_lossy().into_owned());
        error.local_ready = self.commit.is_some();
        error.can_retry = self.commit.is_some() && self.request.destination == Destination::Github;
        error.github_url = self.github_url.clone();
        error
    }
    pub fn result(&self) -> CreatedRepo {
        CreatedRepo {
            name: self.request.name.clone(),
            path: self.path.to_string_lossy().into_owned(),
            github_url: self.github_url.clone(),
            commit: self.commit.clone().unwrap_or_default(),
        }
    }
}

fn git(
    runner: &dyn Runner,
    path: &Path,
    values: &[&str],
    message: &str,
) -> Result<String, AppError> {
    let output = runner.run(Program::Git, &args(values), path)
        .map_err(|_| AppError::new(message, "Check that Git is installed, reopen Repo Creator and try again. Existing work is preserved."))?;
    if !output.success {
        return Err(AppError::new(message, "Check Git configuration and folder permissions. Existing work is preserved; open the folder to inspect it."));
    }
    Ok(output.stdout)
}

pub fn begin(
    runner: &dyn Runner,
    parent: &Path,
    request: CreateRequest,
) -> Result<PendingRepo, AppError> {
    validate_request(&request)?;
    let parent = parent.canonicalize().map_err(|_| {
        AppError::new(
            "The project location is unavailable.",
            "Choose an existing folder using Browse.",
        )
    })?;
    if !parent.is_dir() {
        return Err(AppError::new(
            "Choose a project folder.",
            "Use Browse to select an existing parent folder.",
        ));
    }
    git(runner, &parent, &["--version"], "Git is unavailable.")?;
    for key in ["user.name", "user.email"] {
        let value = runner
            .run(Program::Git, &args(&["config", "--get", key]), &parent)
            .ok();
        if !value.is_some_and(|v| v.success && !v.stdout.trim().is_empty()) {
            return Err(AppError::new("Set your Git commit identity first.", "In a terminal, run: git config --global user.name \"Your Name\" and git config --global user.email \"you@example.com\". Then check setup again."));
        }
    }
    let owner = if request.destination == Destination::Github {
        Some(github::authenticated_owner(runner, &parent)?)
    } else {
        None
    };
    let path = parent.join(&request.name);
    // create_dir is exclusive. It refuses existing folders, files, symlinks and junctions.
    fs::create_dir(&path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            AppError::new(
                "A project with this name already exists here.",
                "Choose another name or parent folder. The existing project has not been changed.",
            )
        } else {
            AppError::new(
                "Could not create the project folder.",
                "Choose a writable location and check available disk space and path length.",
            )
        }
    })?;
    let canonical = path.canonicalize().map_err(|_| {
        AppError::new(
            "Could not verify the new folder.",
            "Check folder permissions. No existing project was changed.",
        )
    })?;
    if canonical != path
        || canonical.parent() != Some(parent.as_path())
        || fs::symlink_metadata(&path)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(true)
    {
        return Err(AppError::new(
            "The project folder changed unexpectedly.",
            "Choose another location. No files were written to this folder.",
        ));
    }
    Ok(PendingRepo {
        request,
        path: canonical,
        owner,
        commit: None,
        remote_created: false,
        github_url: None,
    })
}

pub fn create_local(
    runner: &dyn Runner,
    pending: &mut PendingRepo,
    progress: &dyn Fn(&str),
) -> Result<(), AppError> {
    progress("readme");
    if let Some(content) = render_readme(&pending.request) {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(pending.path.join("README.md"))
            .map_err(|_| {
                AppError::new(
                    "Could not write the README.",
                    "Check folder permissions and disk space. The new project folder is preserved.",
                )
            })?;
        file.write_all(content.as_bytes()).map_err(|_| {
            AppError::new(
                "Could not finish the README.",
                "Check available disk space. The project folder is preserved.",
            )
        })?;
    }
    progress("git");
    git(
        runner,
        &pending.path,
        &[
            "-c",
            "init.templateDir=",
            "init",
            "--initial-branch=main",
            ".",
        ],
        "Could not initialise Git.",
    )?;
    git(runner, &pending.path, &["var", "GIT_AUTHOR_IDENT"], "Git could not resolve your commit identity. Set user.name and user.email for this location.")?;
    git(
        runner,
        &pending.path,
        &["add", "--all", "--", "."],
        "Could not stage the project files.",
    )?;
    progress("commit");
    git(
        runner,
        &pending.path,
        &[
            "-c",
            "core.hooksPath=.git/repo-creator-no-hooks",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-m",
            "Initial commit",
        ],
        "Could not create the initial commit.",
    )?;
    let commit = git(
        runner,
        &pending.path,
        &["rev-parse", "--verify", "HEAD"],
        "Could not verify the initial commit.",
    )?;
    if commit.len() < 40 || !commit.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::new(
            "Git returned an invalid commit.",
            "Open the preserved folder to inspect the repository.",
        ));
    }
    pending.commit = Some(commit);
    Ok(())
}

pub fn publish(
    runner: &dyn Runner,
    pending: &mut PendingRepo,
    progress: &dyn Fn(&str),
) -> Result<(), AppError> {
    let owner = pending
        .owner
        .clone()
        .ok_or_else(|| github::publish_error("GitHub account is unavailable."))?;
    if github::authenticated_owner(runner, &pending.path)? != owner {
        return Err(github::publish_error(
            "The active GitHub account changed. Reconnect the original account before retrying.",
        ));
    }
    if pending.path.canonicalize().ok().as_ref() != Some(&pending.path) {
        return Err(github::publish_error("The local project location changed."));
    }
    let head = git(
        runner,
        &pending.path,
        &["rev-parse", "--verify", "HEAD"],
        "Could not read the local commit.",
    )?;
    let branch = git(
        runner,
        &pending.path,
        &["branch", "--show-current"],
        "Could not read the local branch.",
    )?;
    if pending.commit.as_deref() != Some(&head) || branch != "main" {
        return Err(github::publish_error(
            "The local commit or branch changed. Open the folder to finish publishing with Git.",
        ));
    }
    progress("github");
    if !pending.remote_created {
        let output = runner
            .run(
                Program::Gh,
                &github::create_args(&pending.request, &owner, &pending.path),
                &pending.path,
            )
            .map_err(|_| github::publish_error("GitHub repository creation could not finish."))?;
        if !output.success {
            return Err(github::publish_error("GitHub could not create the repository. The name may already be in use, or the connection failed."));
        }
        pending.remote_created = true;
    }
    let url = github::repository_url(runner, &pending.path, &owner, &pending.request.name)?;
    pending.github_url = Some(url.clone());
    // gh respects the user's SSH preference; use HTTPS here so its authenticated helper
    // works even when an SSH key has not been configured.
    let origin = runner
        .run(
            Program::Git,
            &args(&["remote", "get-url", "origin"]),
            &pending.path,
        )
        .ok();
    let remote = format!("{url}.git");
    if origin.is_some_and(|o| o.success) {
        git(
            runner,
            &pending.path,
            &["remote", "set-url", "origin", &remote],
            "Could not configure origin.",
        )?;
    } else {
        git(
            runner,
            &pending.path,
            &["remote", "add", "origin", &remote],
            "Could not add origin.",
        )?;
    }
    progress("push");
    let output = runner
        .run(Program::Git, &github::push_args(), &pending.path)
        .map_err(|_| {
            github::publish_error("The GitHub repository exists, but pushing did not finish.")
        })?;
    if !output.success {
        return Err(github::publish_error(
            "The GitHub repository exists, but the initial commit could not be pushed.",
        ));
    }
    progress("verify");
    let mut verification = github::push_args();
    verification.truncate(4);
    verification.extend(args(&[
        "ls-remote",
        "--exit-code",
        "origin",
        "refs/heads/main",
    ]));
    let output = runner
        .run(Program::Git, &verification, &pending.path)
        .map_err(|_| {
            github::publish_error("Push finished, but remote verification could not complete.")
        })?;
    if !output.success || output.stdout.split_whitespace().next() != pending.commit.as_deref() {
        return Err(github::publish_error(
            "Could not confirm that the initial commit is on GitHub.",
        ));
    }
    Ok(())
}
