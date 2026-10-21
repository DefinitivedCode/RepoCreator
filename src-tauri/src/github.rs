use crate::{
    model::{AppError, CreateRequest, Visibility},
    process::{args, Program, Runner},
};
use std::path::Path;

#[derive(serde::Deserialize)]
pub struct GithubAccount {
    pub login: String,
    pub id: u64,
}

impl GithubAccount {
    pub fn noreply_email(&self) -> String {
        format!("{}+{}@users.noreply.github.com", self.id, self.login)
    }
}

pub fn authenticated_account(runner: &dyn Runner, cwd: &Path) -> Result<GithubAccount, AppError> {
    let output = runner.run(Program::Gh, &args(&["api", "user", "--jq", "{login: .login, id: .id}"]), cwd)
        .map_err(|_| AppError::new("GitHub CLI is unavailable.", "Install GitHub CLI from cli.github.com, reopen Repo Creator and connect your account."))?;
    let account = serde_json::from_str::<GithubAccount>(&output.stdout).ok();
    if !output.success
        || !account.as_ref().is_some_and(|account| {
            account.id > 0
                && !account.login.is_empty()
                && account.login.len() <= 39
                && account
                    .login
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'-')
        })
    {
        return Err(AppError::new("Connect to GitHub to continue.", "Use Connect to GitHub, complete the official sign-in, then check the connection again."));
    }
    account.ok_or_else(|| publish_error("Could not verify the GitHub account."))
}

pub fn authenticated_owner(runner: &dyn Runner, cwd: &Path) -> Result<String, AppError> {
    Ok(authenticated_account(runner, cwd)?.login)
}

pub fn create_args(request: &CreateRequest, owner: &str, path: &Path) -> Vec<String> {
    let mut result = args(&[
        "repo",
        "create",
        &format!("{owner}/{}", request.name),
        "--source",
    ]);
    result.push(path.to_string_lossy().into_owned());
    result.extend(args(&[
        "--remote",
        "origin",
        match request.visibility {
            Visibility::Private => "--private",
            Visibility::Public => "--public",
        },
    ]));
    if !request.description.trim().is_empty() {
        result.push("--description".into());
        // Newlines are useful in a README, but GitHub descriptions are a single line.
        result.push(
            request
                .description
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" "),
        );
    }
    result
}

pub fn repository_url(
    runner: &dyn Runner,
    path: &Path,
    owner: &str,
    name: &str,
) -> Result<String, AppError> {
    let output = runner
        .run(
            Program::Gh,
            &args(&["repo", "view", &format!("{owner}/{name}"), "--json", "url"]),
            path,
        )
        .map_err(|_| publish_error("Could not verify the GitHub repository."))?;
    let value: serde_json::Value = serde_json::from_str(&output.stdout).unwrap_or_default();
    let url = value["url"].as_str().unwrap_or_default();
    let expected = format!("https://github.com/{owner}/{name}");
    if !output.success || !url.eq_ignore_ascii_case(&expected) {
        return Err(publish_error("Could not verify the GitHub repository URL."));
    }
    Ok(url.to_string())
}

pub fn push_args() -> Vec<String> {
    // A fixed credential helper uses gh's official credential store without changing global Git config.
    args(&[
        "-c",
        "credential.helper=",
        "-c",
        "credential.https://github.com.helper=!gh auth git-credential",
        "push",
        "--set-upstream",
        "origin",
        "main",
    ])
}

pub fn publish_error(message: &str) -> AppError {
    AppError::new(message, "Your local repository and commit are safe. Check your connection and GitHub access, then retry publishing. If the name already exists on GitHub, inspect it before retrying; Repo Creator will never overwrite or delete it.")
}
