use crate::{
    generation::generate_files,
    github,
    model::{validate_request, AppError, CreateRequest, CreatedRepo, Destination},
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
    pub author_email: Option<String>,
    pub authenticated_user: Option<String>,
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
            branch: self.request.options.initial_branch.clone(),
            commit_message: self.request.options.commit_message.clone(),
            files: generate_files(&self.request)
                .unwrap_or_default()
                .iter()
                .map(|f| f.path.clone())
                .collect(),
            warnings: Vec::new(),
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
    // Validate the complete file tree and configuration formats before creating a folder.
    generate_files(&request)?;
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
    git(
        runner,
        &parent,
        &[
            "check-ref-format",
            "--branch",
            &request.options.initial_branch,
        ],
        "Git rejected the initial branch name.",
    )?;
    for key in ["user.name", "user.email"] {
        let value = runner
            .run(Program::Git, &args(&["config", "--get", key]), &parent)
            .ok();
        if !value.is_some_and(|v| v.success && !v.stdout.trim().is_empty()) {
            return Err(AppError::new("Set your Git commit identity first.", "In a terminal, run: git config --global user.name \"Your Name\" and git config --global user.email \"you@example.com\". Then check setup again."));
        }
    }
    let account = if request.destination == Destination::Github {
        Some(github::authenticated_account(runner, &parent)?)
    } else {
        None
    };
    let owner = if let Some(account) = &account {
        let owner = if request.github_owner.is_empty() {
            account.login.clone()
        } else {
            request.github_owner.clone()
        };
        if !owner.eq_ignore_ascii_case(&account.login)
            && !github::organisations(runner, &parent)
                .iter()
                .any(|org| org.eq_ignore_ascii_case(&owner))
        {
            return Err(AppError::new(
                "The selected GitHub owner is unavailable.",
                "Refresh your connection and choose your account or one of its organisations.",
            ));
        }
        Some(owner)
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
        authenticated_user: account.as_ref().map(|account| account.login.clone()),
        author_email: account.map(|account| account.noreply_email()),
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
    let generated_files = generate_files(&pending.request)?;
    for generated in &generated_files {
        let relative = Path::new(&generated.path);
        let mut directory = pending.path.clone();
        if let Some(parent) = relative.parent() {
            for component in parent.components() {
                directory.push(component);
                match fs::create_dir(&directory) {
                    Ok(()) => {}
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
                    Err(_) => {
                        return Err(AppError::new(
                            "Could not create a generated-file directory.",
                            "Check permissions and available disk space.",
                        ))
                    }
                }
                let metadata = fs::symlink_metadata(&directory).map_err(|_| {
                    AppError::new(
                        "Could not inspect the generated directory.",
                        "The new project is preserved.",
                    )
                })?;
                #[cfg(windows)]
                let reparse = {
                    use std::os::windows::fs::MetadataExt;
                    metadata.file_attributes() & 0x400 != 0
                };
                #[cfg(not(windows))]
                let reparse = metadata.file_type().is_symlink();
                if !metadata.is_dir()
                    || reparse
                    || !directory
                        .canonicalize()
                        .is_ok_and(|p| p.starts_with(&pending.path))
                {
                    return Err(AppError::new(
                        "A generated-file directory changed unexpectedly.",
                        "No existing files will be overwritten. Inspect the preserved project.",
                    ));
                }
            }
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(pending.path.join(&generated.path))
            .map_err(|_| {
                AppError::new(
                    format!("Could not write {}.", generated.path),
                    "Check folder permissions and disk space. The new project folder is preserved.",
                )
            })?;
        file.write_all(generated.content.as_bytes()).map_err(|_| {
            AppError::new(
                format!("Could not finish {}.", generated.path),
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
            &format!(
                "--initial-branch={}",
                pending.request.options.initial_branch
            ),
            ".",
        ],
        "Could not initialise Git.",
    )?;
    if let Some(email) = &pending.author_email {
        // Use the authenticated account's private address only in this new repository.
        // This also prevents GitHub's protected-email rule from rejecting the push.
        git(
            runner,
            &pending.path,
            &["config", "--local", "user.email", email],
            "Could not configure the repository's private commit address.",
        )?;
    }
    git(runner, &pending.path, &["var", "GIT_AUTHOR_IDENT"], "Git could not resolve your commit identity. Set user.name and user.email for this location.")?;
    if !generated_files.is_empty() {
        // Stage only explicitly selected generated files, including project configs that a
        // broad global ignore might otherwise hide. Never stage unrelated runtime files.
        let mut values = vec!["add", "--force", "--"];
        values.extend(generated_files.iter().map(|f| f.path.as_str()));
        git(
            runner,
            &pending.path,
            &values,
            "Could not stage the selected project files.",
        )?;
    }
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
            &pending.request.options.commit_message,
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
    if Some(github::authenticated_owner(runner, &pending.path)?) != pending.authenticated_user {
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
    if pending.commit.as_deref() != Some(&head) || branch != pending.request.options.initial_branch
    {
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
    if !pending.request.topics.is_empty() || !pending.request.homepage.is_empty() {
        progress("metadata");
        let output = runner
            .run(
                Program::Gh,
                &github::metadata_args(&pending.request, &owner),
                &pending.path,
            )
            .map_err(|_| {
                github::publish_error(
                    "The repository exists, but its topics or homepage could not be configured.",
                )
            })?;
        if !output.success {
            return Err(github::publish_error(
                "The repository exists, but its topics or homepage could not be configured.",
            ));
        }
    }
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
        .run(
            Program::Git,
            &github::push_args(&pending.request.options.initial_branch),
            &pending.path,
        )
        .map_err(|_| {
            github::publish_error("The GitHub repository exists, but pushing did not finish.")
        })?;
    if !output.success {
        return Err(github::publish_error(
            "The GitHub repository exists, but the initial commit could not be pushed.",
        ));
    }
    progress("verify");
    let mut verification = github::push_args(&pending.request.options.initial_branch);
    verification.truncate(4);
    verification.extend(args(&[
        "ls-remote",
        "--exit-code",
        "origin",
        &format!("refs/heads/{}", pending.request.options.initial_branch),
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
    let output = runner
        .run(
            Program::Gh,
            &github::default_branch_args(&pending.request, &owner),
            &pending.path,
        )
        .map_err(|_| {
            github::publish_error(
                "The initial commit was pushed, but GitHub's default branch could not be set.",
            )
        })?;
    if !output.success {
        return Err(github::publish_error(
            "The initial commit was pushed, but GitHub's default branch could not be set.",
        ));
    }
    Ok(())
}
