//! Project readiness. Automatic inspection reads a bounded set of files in the
//! project root and locates tools without starting them. Version probes, remote
//! access and GitHub sign-in run only during an explicit full check.
use crate::{
    command_runner, github, handoff, launcher,
    model::AppError,
    process::{self, args, BoundedRunner, Program, Runner},
    workspace::{self, ProjectCommand, MANIFEST_LIMIT},
};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::State;

const PROBE_TIMEOUT: Duration = Duration::from_secs(20);
const REMOTE_TIMEOUT: Duration = Duration::from_secs(45);
const LOCKFILES: [(&str, &str); 6] = [
    ("pnpm-lock.yaml", "pnpm"),
    ("yarn.lock", "yarn"),
    ("bun.lock", "bun"),
    ("bun.lockb", "bun"),
    ("package-lock.json", "npm"),
    ("npm-shrinkwrap.json", "npm"),
];
const ENV_TEMPLATES: [&str; 3] = [".env.example", ".env.sample", ".env.template"];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Ready,
    Attention,
    NotChecked,
    CouldNotCheck,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub id: String,
    pub group: &'static str,
    pub title: String,
    pub status: Status,
    pub detail: String,
    /// Copyable guidance. Repo Creator never runs a suggested fix.
    pub fix: Option<String>,
    /// Based on files being present rather than a verified state.
    pub inferred: bool,
    pub network: bool,
}
impl Check {
    fn new(id: impl Into<String>, group: &'static str, title: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            group,
            title: title.into(),
            status: Status::NotChecked,
            detail: String::new(),
            fix: None,
            inferred: false,
            network: false,
        }
    }
    fn status(mut self, status: Status, detail: impl Into<String>) -> Self {
        self.status = status;
        self.detail = detail.into();
        self
    }
    fn fix(mut self, fix: impl Into<String>) -> Self {
        self.fix = Some(fix.into());
        self
    }
    fn inferred(mut self) -> Self {
        self.inferred = true;
        self
    }
    fn network(mut self) -> Self {
        self.network = true;
        self
    }
}

/// A program the full check will start, as listed to the user before it runs.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Probe {
    pub id: &'static str,
    pub label: String,
    pub network: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub checks: Vec<Check>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FullReport {
    pub checks: Vec<Check>,
    pub cancelled: bool,
}

pub(crate) struct Environment<'a> {
    pub find: &'a dyn Fn(&str) -> Option<PathBuf>,
    pub rustup_home: Option<PathBuf>,
    /// The resolved Python is the macOS developer tools placeholder.
    pub python_stub: bool,
}
impl Environment<'static> {
    fn system() -> Self {
        let rustup_home = std::env::var_os("RUSTUP_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
                    .map(|home| PathBuf::from(home).join(".rustup"))
            })
            .filter(|path| path.is_absolute());
        Self {
            find: &launcher::find_executable,
            rustup_home,
            python_stub: developer_tools_stub(),
        }
    }
}

enum FileRead {
    Missing,
    Unreadable,
    Text(String),
}
fn read_scoped(root: &Path, name: &str) -> FileRead {
    let path = root.join(name);
    if fs::symlink_metadata(&path).is_err() {
        return FileRead::Missing;
    }
    // Linked project files are read only when they resolve inside the project.
    let Some(path) = path
        .canonicalize()
        .ok()
        .filter(|path| path.starts_with(root) && path.is_file())
    else {
        return FileRead::Unreadable;
    };
    let mut text = String::new();
    match fs::File::open(path).and_then(|file| {
        file.take(MANIFEST_LIMIT as u64 + 1)
            .read_to_string(&mut text)
    }) {
        Ok(_) if text.len() <= MANIFEST_LIMIT => FileRead::Text(text),
        _ => FileRead::Unreadable,
    }
}
/// Project text is displayed only after removing control characters and bounding it.
fn clean(value: &str, limit: usize) -> String {
    let text: String = value.chars().filter(|c| !c.is_control()).collect();
    let text = text.trim();
    if text.chars().count() > limit {
        format!("{}…", text.chars().take(limit).collect::<String>())
    } else {
        text.to_string()
    }
}
/// Paths display conventionally, without Windows verbatim prefixes.
fn shown(path: &Path) -> String {
    let text = path.to_string_lossy();
    let text = match text.strip_prefix(r"\\?\UNC\") {
        Some(rest) => format!(r"\\{rest}"),
        None => text.strip_prefix(r"\\?\").unwrap_or(&text).to_string(),
    };
    clean(&text, 400)
}

/// A declared requirement: absent, a value to compare, or present but unusable.
#[derive(Clone, Debug, Default, PartialEq)]
enum Declared {
    #[default]
    Absent,
    Value(String),
    /// Present but unreadable or of the wrong type, so the requirement is unknown.
    Invalid(String),
}
#[derive(Default)]
struct Node {
    manager: &'static str,
    declared_manager: bool,
    /// package.json was read and parsed.
    manifest: bool,
    lockfiles: Vec<&'static str>,
    requirements: Vec<(&'static str, Declared)>,
    dependencies: bool,
    plug_n_play: bool,
}
#[derive(Clone, Default, PartialEq, Debug)]
enum Toolchain {
    #[default]
    Default,
    Channel(String),
    CustomPath,
    Invalid,
}
#[derive(Default)]
struct Rust {
    rust_version: Declared,
    toolchain: Toolchain,
    toolchain_file: &'static str,
    targets: Vec<String>,
    targets_error: Option<String>,
}
#[derive(Default)]
struct Python {
    requires: Declared,
}
#[derive(Default)]
struct Facts {
    node: Option<Node>,
    rust: Option<Rust>,
    python: Option<Python>,
    problems: Vec<Check>,
}

fn unreadable(file: &str) -> Check {
    Check::new(format!("file-{file}"), "project", format!("Read {file}")).status(
        Status::CouldNotCheck,
        format!("{file} could not be read or parsed, so checks based on it were skipped."),
    )
}
fn first_line(text: &str) -> Option<String> {
    text.lines()
        .map(|line| line.split('#').next().unwrap_or_default().trim())
        .find(|line| !line.is_empty())
        .map(|line| clean(line, 80))
}
fn valid_channel(value: &str) -> bool {
    let first = value.split('-').next().unwrap_or_default();
    (1..=80).contains(&value.len())
        && value.starts_with(|c: char| c.is_ascii_alphanumeric())
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b".-_".contains(&c))
        && (["stable", "beta", "nightly"].contains(&first)
            || (first.split('.').count() >= 2
                && first
                    .split('.')
                    .all(|part| !part.is_empty() && part.bytes().all(|c| c.is_ascii_digit()))))
}
fn valid_target(value: &str) -> bool {
    (1..=80).contains(&value.len())
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
}

fn node_facts(root: &Path, facts: &mut Facts) {
    let value = match read_scoped(root, "package.json") {
        FileRead::Missing => return,
        FileRead::Unreadable => None,
        FileRead::Text(text) => serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .filter(|value| value.is_object()),
    };
    let manifest = value.is_some();
    if !manifest {
        facts.problems.push(unreadable("package.json"));
    }
    let value = value.unwrap_or_default();
    let mut node = Node {
        manifest,
        lockfiles: LOCKFILES
            .iter()
            .filter(|(file, _)| root.join(file).is_file())
            .map(|(file, _)| *file)
            .collect(),
        dependencies: [
            "dependencies",
            "devDependencies",
            "optionalDependencies",
            "peerDependencies",
        ]
        .iter()
        .any(|key| value[key].as_object().is_some_and(|map| !map.is_empty())),
        plug_n_play: root.join(".pnp.cjs").is_file() || root.join(".pnp.js").is_file(),
        ..Node::default()
    };
    // Lockfiles take precedence, matching command discovery.
    let declared = value["packageManager"]
        .as_str()
        .and_then(|value| value.split('@').next())
        .and_then(|name| {
            ["npm", "pnpm", "yarn", "bun"]
                .into_iter()
                .find(|m| *m == name)
        });
    node.manager = LOCKFILES
        .iter()
        .find(|(file, _)| node.lockfiles.contains(file))
        .map(|(_, manager)| *manager)
        .or(declared)
        .unwrap_or("npm");
    node.declared_manager = declared == Some(node.manager);
    // An unreadable manifest or wrongly typed range leaves the requirement unknown.
    let engines = match value.get("engines") {
        _ if !manifest => Some(Err("package.json could not be read")),
        None => None,
        Some(engines) if !engines.is_object() => {
            Some(Err("engines in package.json is not an object"))
        }
        Some(engines) => engines.get("node").map(|range| {
            range
                .as_str()
                .ok_or("engines.node in package.json is not a version range")
        }),
    };
    match engines {
        None => {}
        Some(Ok(range)) => node
            .requirements
            .push(("package.json engines", Declared::Value(clean(range, 100)))),
        Some(Err(reason)) => node
            .requirements
            .push(("package.json engines", Declared::Invalid(reason.into()))),
    }
    for file in [".nvmrc", ".node-version"] {
        let declared = match read_scoped(root, file) {
            FileRead::Missing => continue,
            FileRead::Unreadable => Declared::Invalid(format!("{file} could not be read")),
            FileRead::Text(text) => match first_line(&text) {
                Some(line) => Declared::Value(line),
                None => Declared::Invalid(format!("{file} doesn't name a version")),
            },
        };
        node.requirements.push((file, declared));
    }
    facts.node = Some(node);
}

fn rust_version(manifest: &toml::Value) -> Declared {
    let inherited = manifest
        .get("workspace")
        .and_then(|w| w.get("package"))
        .and_then(|p| p.get("rust-version"));
    let value =
        match manifest.get("package") {
            // A package uses the workspace value only when it opts in.
            Some(package) => match package.get("rust-version") {
                None => return Declared::Absent,
                Some(value) if value.get("workspace").is_some() => match inherited {
                    Some(value) => value,
                    None => return Declared::Invalid(
                        "Cargo.toml inherits rust-version from a workspace that doesn't declare it"
                            .into(),
                    ),
                },
                Some(value) => value,
            },
            None => match inherited {
                Some(value) => value,
                None => return Declared::Absent,
            },
        };
    match value.as_str() {
        Some(version)
            if parse_version(version).is_some()
                && version.bytes().all(|c| c.is_ascii_digit() || c == b'.') =>
        {
            Declared::Value(clean(version, 40))
        }
        _ => Declared::Invalid("rust-version in Cargo.toml is not a version number".into()),
    }
}
/// Fields of a TOML `[toolchain]` table are validated by type; nothing falls back silently.
fn toml_toolchain(toolchain: &toml::Value, file: &str, rust: &mut Rust) -> Toolchain {
    let Some(table) = toolchain.as_table() else {
        return Toolchain::Invalid;
    };
    match table.get("targets") {
        None => {}
        Some(toml::Value::Array(items)) if items.len() <= 32 => {
            match items
                .iter()
                .map(|item| item.as_str().filter(|t| valid_target(t)).map(str::to_string))
                .collect::<Option<Vec<_>>>()
            {
                Some(targets) => rust.targets = targets,
                None => {
                    rust.targets_error = Some(format!(
                        "{file} lists targets that aren't valid target names, so required targets are unknown."
                    ))
                }
            }
        }
        Some(_) => {
            rust.targets_error = Some(format!(
                "targets in {file} must be a list of up to 32 target names, so required targets are unknown."
            ))
        }
    }
    if table.contains_key("path") {
        return Toolchain::CustomPath;
    }
    match table.get("channel") {
        None => Toolchain::Default,
        Some(toml::Value::String(channel)) if valid_channel(channel) => {
            Toolchain::Channel(channel.clone())
        }
        Some(_) => Toolchain::Invalid,
    }
}
fn rust_facts(root: &Path, facts: &mut Facts) {
    let manifest = match read_scoped(root, "Cargo.toml") {
        FileRead::Missing => return,
        FileRead::Unreadable => None,
        FileRead::Text(text) => toml::from_str::<toml::Value>(&text).ok(),
    };
    let mut rust = Rust::default();
    match &manifest {
        Some(value) if value.get("package").is_some() || value.get("workspace").is_some() => {
            rust.rust_version = rust_version(value);
        }
        Some(_) => return,
        None => {
            facts.problems.push(unreadable("Cargo.toml"));
            rust.rust_version = Declared::Invalid("Cargo.toml could not be read".into());
        }
    }
    // rustup prefers the legacy file when both exist.
    for file in ["rust-toolchain", "rust-toolchain.toml"] {
        let text = match read_scoped(root, file) {
            FileRead::Missing => continue,
            FileRead::Unreadable => {
                rust.toolchain = Toolchain::Invalid;
                rust.toolchain_file = file;
                break;
            }
            FileRead::Text(text) => text,
        };
        rust.toolchain_file = file;
        rust.toolchain = match toml::from_str::<toml::Value>(&text) {
            Ok(value) if value.get("toolchain").is_some() => {
                toml_toolchain(&value["toolchain"], file, &mut rust)
            }
            _ if file == "rust-toolchain" => match first_line(&text) {
                Some(line) if line.contains(['/', '\\']) || line.starts_with('.') => {
                    Toolchain::CustomPath
                }
                Some(line) if valid_channel(&line) => Toolchain::Channel(line),
                _ => Toolchain::Invalid,
            },
            _ => Toolchain::Invalid,
        };
        break;
    }
    facts.rust = Some(rust);
}

fn python_facts(root: &Path, facts: &mut Facts) {
    let pyproject = read_scoped(root, "pyproject.toml");
    let markers = ["pytest.ini", "requirements.txt"]
        .iter()
        .any(|file| root.join(file).is_file());
    let unreadable_project = |facts: &mut Facts| {
        facts.problems.push(unreadable("pyproject.toml"));
        Declared::Invalid("pyproject.toml could not be read".into())
    };
    let requires = match pyproject {
        FileRead::Missing if !markers => return,
        FileRead::Missing => Declared::Absent,
        FileRead::Unreadable => unreadable_project(facts),
        FileRead::Text(text) => match toml::from_str::<toml::Value>(&text) {
            Ok(value) => match value.get("project").and_then(|p| p.get("requires-python")) {
                None => Declared::Absent,
                Some(toml::Value::String(value)) => Declared::Value(clean(value, 100)),
                Some(_) => Declared::Invalid(
                    "requires-python in pyproject.toml is not a version specifier".into(),
                ),
            },
            Err(_) => unreadable_project(facts),
        },
    };
    facts.python = Some(Python { requires });
}

fn facts(root: &Path) -> Facts {
    let mut facts = Facts::default();
    node_facts(root, &mut facts);
    rust_facts(root, &mut facts);
    python_facts(root, &mut facts);
    facts
}

fn tool(id: &str, name: &str, executable: &str, env: &Environment, fix: &str) -> Check {
    let check = Check::new(format!("tool-{id}"), "tools", name);
    match (env.find)(executable) {
        Some(path) => check.status(Status::Ready, format!("Found at {}.", shown(&path))),
        None => check
            .status(
                Status::Attention,
                format!("{executable} was not found on this computer."),
            )
            .fix(fix),
    }
}
fn manager_fix(node: &Node) -> String {
    match node.manager {
        "bun" => "Install Bun from https://bun.sh".into(),
        manager if node.declared_manager => format!("corepack enable {manager}"),
        manager => format!("npm install --global {manager}"),
    }
}
fn python_name() -> &'static str {
    Program::Python.executable()
}

fn requirement_checks(facts: &Facts, checks: &mut Vec<Check>) {
    let pending = "Run a full check to compare it with the installed version.";
    if let Some(node) = &facts.node {
        let check = Check::new("version-node", "requirements", "Node.js version");
        let invalid: Vec<&str> = node
            .requirements
            .iter()
            .filter_map(|(_, declared)| match declared {
                Declared::Invalid(reason) => Some(reason.as_str()),
                _ => None,
            })
            .collect();
        let ranges: Vec<(&str, &str)> = node
            .requirements
            .iter()
            .filter_map(|(source, declared)| match declared {
                Declared::Value(range) => Some((*source, range.as_str())),
                _ => None,
            })
            .collect();
        let declared = ranges
            .iter()
            .map(|(source, range)| format!("{range} ({source})"))
            .collect::<Vec<_>>()
            .join(", ");
        if !invalid.is_empty() {
            checks.push(check.status(
                Status::CouldNotCheck,
                format!(
                    "{}, so the required Node.js version is unknown.",
                    invalid.join("; ")
                ),
            ));
        } else if !ranges.is_empty() {
            let comparable = ranges
                .iter()
                .all(|(_, range)| node_satisfies([0, 0, 0], range).is_some());
            checks.push(check.status(
                Status::NotChecked,
                if comparable {
                    format!("Requires Node.js {declared}. {pending}")
                } else {
                    format!("Requires Node.js {declared}. Repo Creator can't compare every form of this requirement automatically.")
                },
            ));
        }
    }
    if let Some(rust) = &facts.rust {
        let file = rust.toolchain_file;
        let toolchain = Check::new("toolchain-rust", "requirements", "Rust toolchain");
        match &rust.toolchain {
            Toolchain::Default if file.is_empty() => {}
            Toolchain::Default => checks.push(toolchain.status(
                Status::NotChecked,
                format!("{file} doesn't name a channel, so the default toolchain applies. Run a full check to see its version."),
            )),
            Toolchain::Channel(channel) => checks.push(toolchain.status(
                Status::NotChecked,
                format!("{file} selects the {channel} toolchain. Run a full check to confirm it's installed."),
            )),
            Toolchain::CustomPath => checks.push(toolchain.status(
                Status::NotChecked,
                format!("{file} points to a custom toolchain folder. Repo Creator doesn't run programs from a project-defined toolchain."),
            )),
            Toolchain::Invalid => checks.push(toolchain.status(
                Status::CouldNotCheck,
                format!("{file} could not be read or its channel isn't a valid toolchain name, so the toolchain is unknown."),
            )),
        }
        let version = Check::new("version-rust", "requirements", "Rust version");
        match &rust.rust_version {
            Declared::Absent => {}
            Declared::Value(required) => checks.push(version.status(
                Status::NotChecked,
                format!("Requires Rust {required} or newer (Cargo.toml rust-version). {pending}"),
            )),
            Declared::Invalid(reason) => checks.push(version.status(
                Status::CouldNotCheck,
                format!("{reason}, so the required Rust version is unknown."),
            )),
        }
        let targets = Check::new("targets-rust", "requirements", "Rust targets");
        if let Some(error) = &rust.targets_error {
            checks.push(targets.status(Status::CouldNotCheck, error.clone()));
        } else if !rust.targets.is_empty() {
            checks.push(targets.status(
                Status::NotChecked,
                format!(
                    "{file} requires {}. Run a full check to confirm they're installed.",
                    rust.targets.join(", ")
                ),
            ));
        }
    }
    if let Some(python) = &facts.python {
        let check = Check::new("version-python", "requirements", "Python version");
        match &python.requires {
            Declared::Absent => {}
            Declared::Value(requires) => checks.push(check.status(
                Status::NotChecked,
                if python_satisfies([0, 0, 0], requires).is_some() {
                    format!("Requires Python {requires} (pyproject.toml). {pending}")
                } else {
                    format!("Requires Python {requires} (pyproject.toml). Repo Creator can't compare this requirement automatically.")
                },
            )),
            Declared::Invalid(reason) => checks.push(check.status(
                Status::CouldNotCheck,
                format!("{reason}, so the required Python version is unknown."),
            )),
        }
    }
}

fn configuration_checks(root: &Path, facts: &Facts, checks: &mut Vec<Check>) {
    if let Some(node) = &facts.node {
        let managers = LOCKFILES
            .iter()
            .filter(|(file, _)| node.lockfiles.contains(file))
            .map(|(_, manager)| *manager)
            .fold(Vec::new(), |mut list, manager| {
                if !list.contains(&manager) {
                    list.push(manager);
                }
                list
            });
        let check = Check::new("lockfile", "configuration", "Lockfile");
        if managers.len() > 1 {
            checks.push(check.status(Status::Attention, format!("Lockfiles for several package managers exist ({}). They can install different dependency versions.", node.lockfiles.join(", "))).fix("Keep only the lockfile for the package manager you use."));
        } else if let Some(file) = node.lockfiles.first() {
            checks.push(check.status(Status::Ready, format!("{file} found.")));
        } else if node.dependencies {
            checks.push(
                check
                    .status(
                        Status::Attention,
                        "No lockfile was found, so each install may resolve different versions.",
                    )
                    .fix(format!("{} install", node.manager)),
            );
        }
    }
    let ignore = Check::new("gitignore", "configuration", ".gitignore");
    checks.push(if root.join(".gitignore").is_file() {
        ignore.status(Status::Ready, ".gitignore found.")
    } else {
        ignore
            .status(
                Status::Attention,
                "No .gitignore was found. Build output and local secrets could be committed.",
            )
            .fix("Add a .gitignore for this project type.")
    });
    if let Some(template) = ENV_TEMPLATES.iter().find(|file| root.join(file).is_file()) {
        let check = Check::new("env", "configuration", "Local environment file").inferred();
        // Only existence is checked. Environment files can contain secrets.
        checks.push(if root.join(".env").exists() {
            check.status(Status::Ready, ".env exists. Its contents were not read.")
        } else {
            check
                .status(
                    Status::Attention,
                    format!("{template} exists but .env does not. The project may expect local settings."),
                )
                .fix(if cfg!(windows) {
                    format!("Copy-Item {template} .env")
                } else {
                    format!("cp {template} .env")
                })
        });
    }
}

fn dependency_checks(root: &Path, facts: &Facts, checks: &mut Vec<Check>) {
    let Some(node) = &facts.node else {
        return;
    };
    let check = Check::new("dependencies-node", "dependencies", "Node.js dependencies");
    checks.push(if !node.manifest {
        check.status(
            Status::CouldNotCheck,
            "package.json could not be read, so dependencies weren't checked.",
        )
    } else if !node.dependencies {
        check.status(Status::Ready, "package.json declares no dependencies.")
    } else if node.plug_n_play {
        check.status(
            Status::NotChecked,
            "This project uses Yarn Plug'n'Play, which has no node_modules folder. Repo Creator can't verify the install.",
        )
    } else if root.join("node_modules").is_dir() {
        check
            .status(
                Status::Ready,
                "node_modules exists. Repo Creator doesn't verify that it matches the lockfile.",
            )
            .inferred()
    } else {
        check
            .status(
                Status::Attention,
                "Dependencies don't appear to be installed (there is no node_modules folder).",
            )
            .fix(format!("{} install", node.manager))
            .inferred()
    });
}

fn command_check(root: &Path, command: &ProjectCommand) -> Check {
    let check = Check::new(
        format!("command-{}", command.id),
        "commands",
        clean(&command.name, 120),
    );
    let review = if command.imported {
        " Review it in Commands before its first run."
    } else {
        ""
    };
    if command.mode == "shell" {
        return check.status(
            Status::NotChecked,
            format!("Shell commands can't be verified without running them.{review}"),
        );
    }
    let Ok(directory) = workspace::command_directory(root, command) else {
        return check
            .status(
                Status::Attention,
                format!(
                    "Its working folder {} doesn't exist or can't be accessed.",
                    clean(&command.working_directory, 200)
                ),
            )
            .fix("Edit the command's working directory in Commands.");
    };
    let executable = clean(&command.executable, 200);
    let resolved = command_runner::executable(&command.executable, &directory);
    #[cfg(windows)]
    let resolved = resolved
        .and_then(|path| command_runner::structured_windows_executable(path.clone()).map(|_| path));
    match resolved {
        Ok(_) => check.status(
            Status::Ready,
            format!("{executable} was found and its working folder exists.{review}"),
        ),
        Err(error) => check
            .status(
                Status::Attention,
                format!("{executable}: {}{review}", error.message),
            )
            .fix(format!(
                "Install {executable}, or edit the command to use its full path."
            )),
    }
}

pub(crate) fn inspect(root: &Path, commands: &[ProjectCommand], env: &Environment) -> Report {
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let facts = facts(&root);
    let mut checks = Vec::new();
    let mut kinds = Vec::new();
    if let Some(node) = &facts.node {
        kinds.push(format!("Node.js ({})", node.manager));
    }
    if facts.rust.is_some() {
        kinds.push("Rust (Cargo)".into());
    }
    if facts.python.is_some() {
        kinds.push("Python".into());
    }
    let kind = Check::new("project-type", "project", "Project type");
    checks.push(if kinds.is_empty() {
        kind.status(Status::NotChecked, "No supported manifest was found (package.json, Cargo.toml, pyproject.toml). Only configuration, Git and saved commands are checked.")
    } else {
        kind.status(Status::Ready, format!("Detected {}.", kinds.join(", ")))
    });
    checks.extend(facts.problems.iter().cloned());
    if let Some(node) = &facts.node {
        if node.manager != "bun" {
            checks.push(tool(
                "node",
                "Node.js",
                "node",
                env,
                "Install Node.js from https://nodejs.org",
            ));
        }
        let manager = match node.manager {
            "pnpm" => "pnpm",
            "yarn" => "Yarn",
            "bun" => "Bun",
            _ => "npm",
        };
        checks.push(tool(
            node.manager,
            manager,
            node.manager,
            env,
            &manager_fix(node),
        ));
    }
    if let Some(rust) = &facts.rust {
        checks.push(tool(
            "cargo",
            "Cargo",
            "cargo",
            env,
            "Install Rust with rustup from https://rustup.rs",
        ));
        if !matches!(rust.toolchain, Toolchain::Default) || !rust.targets.is_empty() {
            checks.push(tool(
                "rustup",
                "rustup",
                "rustup",
                env,
                "Install rustup from https://rustup.rs",
            ));
        }
    }
    if facts.python.is_some() {
        checks.push(tool(
            "python",
            "Python",
            python_name(),
            env,
            "Install Python from https://www.python.org/downloads/",
        ));
    }
    requirement_checks(&facts, &mut checks);
    configuration_checks(&root, &facts, &mut checks);
    dependency_checks(&root, &facts, &mut checks);
    checks.extend(
        commands
            .iter()
            .filter(|command| command.enabled)
            .take(64)
            .map(|command| command_check(&root, command)),
    );
    Report { checks }
}

// Versions are compared as major.minor.patch. Pre-release forms are not guessed.
type Version = [u64; 3];
fn parse_version(text: &str) -> Option<Version> {
    let text = text.trim().trim_start_matches(['v', 'V']);
    let digits: String = text
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    let parts = digits
        .split('.')
        .filter(|p| !p.is_empty())
        .take(3)
        .map(|p| p.parse::<u64>().ok())
        .collect::<Option<Vec<_>>>()?;
    let mut version = [0; 3];
    if parts.is_empty() {
        return None;
    }
    version[..parts.len()].copy_from_slice(&parts);
    Some(version)
}
/// Leading specified components of a partial version: `18.x` is `[18]`, `*` is `[]`.
fn partial(text: &str) -> Option<Vec<u64>> {
    let text = text.trim().trim_start_matches(['v', '=']);
    if text.contains(['-', '+']) {
        return None;
    }
    let mut parts = Vec::new();
    for part in text.split('.').filter(|p| !p.is_empty()) {
        if ["x", "X", "*"].contains(&part) {
            break;
        }
        parts.push(part.parse::<u64>().ok()?);
    }
    (parts.len() <= 3).then_some(parts)
}
fn fill(parts: &[u64]) -> Version {
    let mut version = [0; 3];
    version[..parts.len()].copy_from_slice(parts);
    version
}
fn bump(parts: &[u64], index: usize) -> Version {
    let mut version = [0; 3];
    version[..index].copy_from_slice(&parts[..index]);
    version[index] = parts[index] + 1;
    version
}
#[derive(Clone, Copy)]
enum Bound {
    Ge(Version),
    Gt(Version),
    Lt(Version),
    Le(Version),
    Never,
}
fn x_range(p: &[u64], bounds: &mut Vec<Bound>) {
    match p.len() {
        0 => {}
        3 => bounds.extend([Bound::Ge(fill(p)), Bound::Le(fill(p))]),
        n => bounds.extend([Bound::Ge(fill(p)), Bound::Lt(bump(p, n - 1))]),
    }
}
fn comparator(token: &str, bounds: &mut Vec<Bound>) -> Option<()> {
    let (op, rest) = [">=", "<=", ">", "<", "=", "^", "~"]
        .iter()
        .find_map(|op| token.strip_prefix(op).map(|rest| (*op, rest)))
        .unwrap_or(("", token));
    let p = partial(rest)?;
    let n = p.len();
    match op {
        "" | "=" => x_range(&p, bounds),
        ">=" if n > 0 => bounds.push(Bound::Ge(fill(&p))),
        ">=" => {}
        ">" if n == 3 => bounds.push(Bound::Gt(fill(&p))),
        ">" if n > 0 => bounds.push(Bound::Ge(bump(&p, n - 1))),
        "<" if n > 0 => bounds.push(Bound::Lt(fill(&p))),
        "<=" if n == 3 => bounds.push(Bound::Le(fill(&p))),
        "<=" if n > 0 => bounds.push(Bound::Lt(bump(&p, n - 1))),
        "<=" => {}
        ">" | "<" => bounds.push(Bound::Never),
        "^" if n == 0 => {}
        "^" => {
            let index = p.iter().position(|v| *v > 0).unwrap_or(n - 1).min(n - 1);
            bounds.extend([Bound::Ge(fill(&p)), Bound::Lt(bump(&p, index))]);
        }
        "~" if n == 0 => {}
        "~" => bounds.extend([Bound::Ge(fill(&p)), Bound::Lt(bump(&p, (n - 1).min(1)))]),
        _ => return None,
    }
    Some(())
}
fn allowed(version: Version, bounds: &[Bound]) -> bool {
    bounds.iter().all(|bound| match *bound {
        Bound::Ge(v) => version >= v,
        Bound::Gt(v) => version > v,
        Bound::Lt(v) => version < v,
        Bound::Le(v) => version <= v,
        Bound::Never => false,
    })
}
/// Evaluates common npm range forms. `None` means the range is not understood.
pub(crate) fn node_satisfies(version: Version, range: &str) -> Option<bool> {
    if range.len() > 200 || range.contains(['/', '@']) {
        return None;
    }
    let mut any = false;
    for set in range.split("||") {
        let tokens: Vec<&str> = set.split_whitespace().collect();
        let mut bounds = Vec::new();
        if tokens.len() == 3 && tokens[1] == "-" {
            bounds.push(Bound::Ge(fill(&partial(tokens[0])?)));
            let upper = partial(tokens[2])?;
            match upper.len() {
                0 => {}
                3 => bounds.push(Bound::Le(fill(&upper))),
                n => bounds.push(Bound::Lt(bump(&upper, n - 1))),
            }
        } else {
            let mut index = 0;
            while index < tokens.len() {
                let mut token = tokens[index].to_string();
                if [">=", "<=", ">", "<", "=", "^", "~"].contains(&tokens[index]) {
                    index += 1;
                    token.push_str(tokens.get(index)?);
                }
                comparator(&token, &mut bounds)?;
                index += 1;
            }
        }
        any |= allowed(version, &bounds);
    }
    Some(any)
}
/// Evaluates PEP 440 specifiers on release numbers. `None` means not understood.
pub(crate) fn python_satisfies(version: Version, specifier: &str) -> Option<bool> {
    if specifier.len() > 200 {
        return None;
    }
    let mut result = true;
    for clause in specifier
        .split(',')
        .map(str::trim)
        .filter(|c| !c.is_empty())
    {
        let (op, rest) = ["~=", "==", "!=", "<=", ">=", "<", ">"]
            .iter()
            .find_map(|op| clause.strip_prefix(op).map(|rest| (*op, rest.trim())))?;
        let (rest, wildcard) = match rest.strip_suffix(".*") {
            Some(rest) => (rest, true),
            None => (rest, false),
        };
        if rest.is_empty() || !rest.bytes().all(|c| c.is_ascii_digit() || c == b'.') {
            return None;
        }
        let p = partial(rest)?;
        let n = p.len();
        let prefix = |len: usize| version[..len] == fill(&p)[..len];
        result &= match (op, wildcard) {
            ("==", true) => prefix(n),
            ("!=", true) => !prefix(n),
            ("==", false) => version == fill(&p),
            ("!=", false) => version != fill(&p),
            (">=", false) => version >= fill(&p),
            ("<=", false) => version <= fill(&p),
            (">", false) => version > fill(&p),
            ("<", false) => version < fill(&p),
            ("~=", false) if n >= 2 => version >= fill(&p) && prefix(n - 1),
            _ => return None,
        };
    }
    Some(result)
}

fn toolchain_installed(channel: &str, rustup_home: Option<&Path>) -> Option<bool> {
    let entries = fs::read_dir(rustup_home?.join("toolchains")).ok()?;
    Some(entries.filter_map(Result::ok).any(|entry| {
        let name = entry.file_name().to_string_lossy().into_owned();
        name == channel || name.starts_with(&format!("{channel}-"))
    }))
}
/// macOS ships /usr/bin/python3 as a stub that offers to install developer tools.
fn developer_tools_stub() -> bool {
    cfg!(target_os = "macos")
        && process::resolve_executable(Program::Python.executable())
            .is_some_and(|path| path == Path::new("/usr/bin/python3"))
        && ![
            "/Library/Developer/CommandLineTools/usr/bin/python3",
            "/Applications/Xcode.app/Contents/Developer/usr/bin/python3",
        ]
        .iter()
        .any(|path| Path::new(path).exists())
}
fn version_of(result: Result<process::Output, String>) -> Result<Version, &'static str> {
    let output = result.map_err(|reason| match reason.as_str() {
        "timed out" => "timed out",
        "cancelled" => "cancelled",
        _ => "unavailable",
    })?;
    if !output.success {
        return Err("failed");
    }
    // `rustc 1.90.0 (…)`, `Python 3.12.1` or `v22.18.0`
    output
        .stdout
        .split_whitespace()
        .find_map(|word| {
            word.starts_with(|c: char| c.is_ascii_digit() || c == 'v')
                .then(|| parse_version(word))
                .flatten()
        })
        .ok_or("failed")
}
fn shown_version(version: Version) -> String {
    format!("{}.{}.{}", version[0], version[1], version[2])
}
fn probe_failure(check: Check, program: &str, reason: &str) -> Check {
    match reason {
        "stub" => check.status(Status::NotChecked, format!("{program} is the macOS developer tools placeholder. Running it would open an installer, so it wasn't started.")).fix("xcode-select --install"),
        "timed out" => check.status(Status::CouldNotCheck, format!("{program} didn't respond in time.")),
        _ => check.status(Status::CouldNotCheck, format!("{program} didn't report a version.")),
    }
}

/// Remote URLs may contain credentials. Only network transports are contacted and
/// only the host and path are ever displayed.
fn remote_target(url: &str) -> Option<(String, String)> {
    if url.starts_with('-')
        || url.contains("::")
        || url.len() > 2000
        || url.chars().any(|c| c.is_control() || c.is_whitespace())
    {
        return None;
    }
    if let Some((scheme, rest)) = url.split_once("://") {
        if !["https", "http", "ssh", "git"].contains(&scheme.to_ascii_lowercase().as_str()) {
            return None;
        }
        let rest = rest.split(['?', '#']).next().unwrap_or_default();
        let rest = rest.rsplit_once('@').map_or(rest, |(_, host)| host);
        let (host, path) = rest.split_once('/').unwrap_or((rest, ""));
        let host = host.split(':').next().unwrap_or_default();
        return (!host.is_empty()).then(|| (host.to_ascii_lowercase(), format!("{host}/{path}")));
    }
    // scp-like `user@host:owner/repository.git`
    let (authority, path) = url.split_once(':')?;
    let host = authority
        .rsplit_once('@')
        .map_or(authority, |(_, host)| host);
    if host.is_empty()
        || host.contains(['/', '\\'])
        || path.starts_with("//")
        || authority.len() <= 1
    {
        return None;
    }
    Some((host.to_ascii_lowercase(), format!("{host}:{path}")))
}

/// What results are compared against, captured when the plan is prepared.
#[derive(Clone, Debug, Default, PartialEq)]
struct Inputs {
    node: Vec<(&'static str, Declared)>,
    rust_version: Declared,
    channel: Option<String>,
    toolchain_file: &'static str,
    targets: Vec<String>,
    python: Declared,
    /// The displayed address and name of the contacted remote.
    remote: Option<(String, String)>,
}
/// One program the full check starts, exactly as it was listed to the user.
#[derive(Clone, Debug, PartialEq)]
struct Step {
    id: &'static str,
    program: Program,
    args: Vec<String>,
    label: String,
    network: bool,
}
/// A reviewed full check. It runs only if rebuilding it immediately before
/// execution produces an identical plan.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Plan {
    steps: Vec<Step>,
    /// Results decided without starting a program.
    decided: Vec<Check>,
    inputs: Inputs,
}
impl Plan {
    fn step(
        &mut self,
        id: &'static str,
        program: Program,
        args: Vec<String>,
        label: String,
        network: bool,
    ) {
        self.steps.push(Step {
            id,
            program,
            args,
            label,
            network,
        });
    }
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanView {
    pub token: String,
    pub probes: Vec<Probe>,
}

fn rust_plan(rust: &Rust, env: &Environment, plan: &mut Plan) {
    plan.inputs.rust_version = rust.rust_version.clone();
    plan.inputs.toolchain_file = rust.toolchain_file;
    if (env.find)("rustc").is_none() {
        return;
    }
    let file = rust.toolchain_file;
    let toolchain = Check::new("toolchain-rust", "requirements", "Rust toolchain");
    let version = Check::new("version-rust", "requirements", "Rust version");
    let compare_later = |plan: &mut Plan| {
        if rust.rust_version != Declared::Absent {
            plan.decided.push(version.clone().status(
                Status::NotChecked,
                "The project's toolchain isn't available to run, so its version wasn't compared.",
            ));
        }
    };
    let rustup = (env.find)("rustup").is_some();
    let channel = match &rust.toolchain {
        Toolchain::Default => None,
        // Tier 1 explains an unusable toolchain file; no compiler is run for it.
        Toolchain::CustomPath | Toolchain::Invalid => return compare_later(plan),
        Toolchain::Channel(channel) if !rustup => {
            plan.decided.push(
                toolchain
                    .status(
                        Status::CouldNotCheck,
                        format!("{file} selects {channel}, but rustup wasn't found."),
                    )
                    .fix("Install rustup from https://rustup.rs"),
            );
            return compare_later(plan);
        }
        Toolchain::Channel(channel) => {
            match toolchain_installed(channel, env.rustup_home.as_deref()) {
                Some(true) => Some(channel.clone()),
                Some(false) => {
                    plan.decided.push(
                        toolchain
                            .status(
                                Status::Attention,
                                format!("The {channel} toolchain from {file} isn't installed."),
                            )
                            .fix(format!("rustup toolchain install {channel}")),
                    );
                    return compare_later(plan);
                }
                None => {
                    // Running an unconfirmed toolchain could make older rustup versions download it.
                    plan.decided.push(toolchain.status(
                    Status::CouldNotCheck,
                    format!("Couldn't confirm that the {channel} toolchain is installed, so it wasn't run."),
                ));
                    return compare_later(plan);
                }
            }
        }
    };
    plan.inputs.channel = channel.clone();
    let mut arguments: Vec<String> = channel.iter().map(|c| format!("+{c}")).collect();
    arguments.push("--version".into());
    let label = format!("rustc {}", arguments.join(" "));
    plan.step("rustc", Program::Rustc, arguments, label, false);
    if rust.targets_error.is_some() || rust.targets.is_empty() {
        return;
    }
    plan.inputs.targets = rust.targets.clone();
    if rustup {
        let mut arguments = args(&["target", "list", "--installed"]);
        if let Some(channel) = &channel {
            arguments.extend(["--toolchain".into(), channel.clone()]);
        }
        let label = format!("rustup {}", arguments.join(" "));
        plan.step("rustup", Program::Rustup, arguments, label, false);
    } else {
        plan.decided.push(
            Check::new("targets-rust", "requirements", "Rust targets")
                .status(
                    Status::CouldNotCheck,
                    "rustup wasn't found, so installed targets couldn't be listed.",
                )
                .fix("Install rustup from https://rustup.rs"),
        );
    }
}

fn remote_plan(root: &Path, env: &Environment, local: &dyn Runner, plan: &mut Plan) {
    let check = Check::new("remote", "remote", "Git remote access").network();
    let mut decide =
        |status, detail: String| plan.decided.push(check.clone().status(status, detail));
    // Reading remotes and configuration runs no repository-configured programs.
    let names = match local.run(Program::Git, &args(&["remote"]), root) {
        Ok(output) if output.success => output.stdout,
        _ => {
            return decide(
                Status::CouldNotCheck,
                "Couldn't list this repository's remotes.".into(),
            )
        }
    };
    let names: Vec<&str> = names
        .lines()
        .map(str::trim)
        .filter(|name| {
            !name.is_empty()
                && name.len() <= 100
                && name
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
        })
        .collect();
    let Some(name) = names
        .iter()
        .find(|name| **name == "origin")
        .or(names.first())
    else {
        return decide(
            Status::NotChecked,
            "No Git remote is configured, so nothing was contacted.".into(),
        );
    };
    let url = match local.run(
        Program::Git,
        &args(&["config", "--get", &format!("remote.{name}.url")]),
        root,
    ) {
        Ok(output) if output.success => output.stdout.trim().to_string(),
        _ => {
            return decide(
                Status::CouldNotCheck,
                format!("Couldn't read the address of remote {name}."),
            )
        }
    };
    let Some((host, display)) = remote_target(&url) else {
        return decide(
            Status::NotChecked,
            format!(
                "Remote {name} uses a local path or unsupported transport, so it wasn't contacted."
            ),
        );
    };
    let display = clean(&display, 200);
    // Only the user's own configuration may choose an SSH command.
    let custom_ssh = local
        .run(
            Program::Git,
            &args(&["config", "--global", "--get", "core.sshCommand"]),
            root,
        )
        .is_ok_and(|output| output.success && !output.stdout.is_empty());
    let mut arguments = Vec::new();
    if !custom_ssh {
        arguments.extend(args(&["-c", "core.sshCommand=ssh -o BatchMode=yes"]));
    }
    arguments.extend(["ls-remote".into(), url, "HEAD".into()]);
    plan.inputs.remote = Some((display.clone(), name.to_string()));
    plan.step(
        "remote",
        Program::Git,
        arguments,
        format!("git ls-remote {display} HEAD"),
        true,
    );
    if host == "github.com" {
        if (env.find)("gh").is_some() {
            plan.step(
                "github",
                Program::Gh,
                args(&github::ACCOUNT_ARGS),
                "gh api user (GitHub CLI sign-in)".into(),
                true,
            );
        } else {
            plan.decided.push(
                Check::new("github", "remote", "GitHub CLI sign-in")
                    .network()
                    .status(
                        Status::NotChecked,
                        "GitHub CLI isn't installed. It's needed only for Repo Creator's GitHub features.",
                    ),
            );
        }
    }
}

/// Builds the exact full check: every program with its arguments, results that
/// need no program, and the requirements results are compared against.
pub(crate) fn prepare(root: &Path, env: &Environment, local: &dyn Runner) -> Plan {
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let facts = facts(&root);
    let mut plan = Plan::default();
    if let Some(node) = &facts.node {
        plan.inputs.node = node.requirements.clone();
        if (node.manager != "bun" || !node.requirements.is_empty()) && (env.find)("node").is_some()
        {
            plan.step(
                "node",
                Program::Node,
                args(&["--version"]),
                "node --version".into(),
                false,
            );
        }
    }
    if let Some(rust) = &facts.rust {
        rust_plan(rust, env, &mut plan);
    }
    if let Some(python) = &facts.python {
        plan.inputs.python = python.requires.clone();
        if (env.find)(python_name()).is_some() {
            if env.python_stub {
                plan.decided.push(probe_failure(
                    Check::new("version-python", "requirements", "Python version"),
                    python_name(),
                    "stub",
                ));
            } else {
                plan.step(
                    "python",
                    Program::Python,
                    args(&["--version"]),
                    format!("{} --version", python_name()),
                    false,
                );
            }
        }
    }
    remote_plan(&root, env, local, &mut plan);
    plan
}

fn node_result(inputs: &Inputs, version: Result<Version, &str>) -> Check {
    let check = Check::new("version-node", "requirements", "Node.js version");
    let version = match version {
        Ok(version) => version,
        Err(reason) => return probe_failure(check, "node", reason),
    };
    let installed = shown_version(version);
    let mut unknown = Vec::new();
    for (source, declared) in &inputs.node {
        match declared {
            Declared::Value(range) => match node_satisfies(version, range) {
                Some(true) => {}
                Some(false) => {
                    return check
                        .status(Status::Attention, format!("Node.js {installed} is installed, but this project requires {range} ({source})."))
                        .fix(format!("Install a Node.js version matching {range}, then select Refresh."))
                }
                None => unknown.push(format!("{range} ({source}) can't be evaluated")),
            },
            Declared::Invalid(reason) => unknown.push(reason.clone()),
            Declared::Absent => {}
        }
    }
    if !unknown.is_empty() {
        check.status(
            Status::CouldNotCheck,
            format!(
                "Node.js {installed} is installed, but it couldn't be compared: {}.",
                unknown.join("; ")
            ),
        )
    } else if inputs.node.is_empty() {
        check.status(Status::Ready, format!("Node.js {installed} is installed."))
    } else {
        check.status(
            Status::Ready,
            format!("Node.js {installed} meets this project's requirement."),
        )
    }
}
fn rust_result(inputs: &Inputs, version: Result<Version, &str>) -> Vec<Check> {
    let toolchain = Check::new("toolchain-rust", "requirements", "Rust toolchain");
    let check = Check::new("version-rust", "requirements", "Rust version");
    let installed = match version {
        Ok(installed) => installed,
        Err(reason) => {
            let mut checks = vec![probe_failure(check, "rustc", reason)];
            if let Some(channel) = &inputs.channel {
                checks.push(toolchain.status(
                    Status::CouldNotCheck,
                    format!("rustc for the {channel} toolchain didn't report a version."),
                ));
            }
            return checks;
        }
    };
    let shown = shown_version(installed);
    let mut checks = Vec::new();
    if let Some(channel) = &inputs.channel {
        checks.push(toolchain.status(
            Status::Ready,
            format!("The {channel} toolchain is installed (rustc {shown})."),
        ));
    }
    checks.push(match &inputs.rust_version {
        Declared::Value(required) => match parse_version(required) {
            Some(minimum) if installed >= minimum => check.status(
                Status::Ready,
                format!("rustc {shown} meets rust-version {required}."),
            ),
            Some(_) => check
                .status(
                    Status::Attention,
                    format!("rustc {shown} is installed, but Cargo.toml requires Rust {required} or newer."),
                )
                .fix(match &inputs.channel {
                    Some(_) => format!(
                        "Update the toolchain in {} to {required} or newer.",
                        inputs.toolchain_file
                    ),
                    None => "rustup update".into(),
                }),
            None => check.status(
                Status::CouldNotCheck,
                format!("rustc {shown} is installed. Repo Creator couldn't read rust-version {required}."),
            ),
        },
        Declared::Invalid(reason) => check.status(
            Status::CouldNotCheck,
            format!("rustc {shown} is installed, but it couldn't be compared: {reason}."),
        ),
        Declared::Absent => check.status(Status::Ready, format!("rustc {shown} is installed.")),
    });
    checks
}
fn targets_result(inputs: &Inputs, result: Result<process::Output, String>) -> Check {
    let check = Check::new("targets-rust", "requirements", "Rust targets");
    match result {
        Ok(output) if output.success => {
            let installed: Vec<&str> = output.stdout.lines().map(str::trim).collect();
            let missing: Vec<&str> = inputs
                .targets
                .iter()
                .map(String::as_str)
                .filter(|target| !installed.contains(target))
                .collect();
            match missing.first() {
                None => check.status(
                    Status::Ready,
                    format!(
                        "Required targets are installed: {}.",
                        inputs.targets.join(", ")
                    ),
                ),
                Some(first) => {
                    let toolchain = inputs
                        .channel
                        .as_ref()
                        .map(|c| format!(" --toolchain {c}"))
                        .unwrap_or_default();
                    check
                        .status(
                            Status::Attention,
                            format!(
                                "Rust is installed, but the target {} required by {} is missing.",
                                missing.join(", "),
                                inputs.toolchain_file
                            ),
                        )
                        .fix(format!("rustup target add {first}{toolchain}"))
                }
            }
        }
        Err(reason) if reason == "timed out" => {
            check.status(Status::CouldNotCheck, "rustup didn't respond in time.")
        }
        _ => check.status(
            Status::CouldNotCheck,
            "rustup couldn't list installed targets.",
        ),
    }
}
fn python_result(inputs: &Inputs, version: Result<Version, &str>) -> Check {
    let check = Check::new("version-python", "requirements", "Python version");
    let version = match version {
        Ok(version) => version,
        Err(reason) => return probe_failure(check, python_name(), reason),
    };
    let installed = shown_version(version);
    match &inputs.python {
        Declared::Absent => {
            check.status(Status::Ready, format!("Python {installed} is installed."))
        }
        Declared::Value(requires) => match python_satisfies(version, requires) {
            Some(true) => check.status(
                Status::Ready,
                format!("Python {installed} meets requires-python {requires}."),
            ),
            Some(false) => check
                .status(
                    Status::Attention,
                    format!(
                        "Python {installed} is installed, but this project requires {requires}."
                    ),
                )
                .fix(format!("Install a Python version matching {requires}.")),
            None => check.status(
                Status::CouldNotCheck,
                format!(
                    "Python {installed} is installed. Repo Creator couldn't evaluate {requires}."
                ),
            ),
        },
        Declared::Invalid(reason) => check.status(
            Status::CouldNotCheck,
            format!("Python {installed} is installed, but it couldn't be compared: {reason}."),
        ),
    }
}
fn remote_result(inputs: &Inputs, result: Result<process::Output, String>) -> Check {
    let check = Check::new("remote", "remote", "Git remote access").network();
    let (display, name) = inputs.remote.clone().unwrap_or_default();
    match result {
        Ok(output) if output.success => check.status(
            Status::Ready,
            format!("Reached {display} ({name}) with your Git credentials."),
        ),
        Ok(_) => check
            .status(
                Status::Attention,
                format!("Couldn't access {display} ({name}). Check the address, your connection and your Git sign-in."),
            )
            .fix(format!("git ls-remote {name}")),
        Err(reason) if reason == "timed out" => check.status(
            Status::CouldNotCheck,
            format!(
                "{display} didn't respond within {} seconds.",
                REMOTE_TIMEOUT.as_secs()
            ),
        ),
        Err(_) => check.status(Status::CouldNotCheck, "Git could not be started."),
    }
}
fn github_result(result: Result<process::Output, String>) -> Check {
    let check = Check::new("github", "remote", "GitHub CLI sign-in").network();
    match github::account_from(result) {
        Ok(account) => check.status(
            Status::Ready,
            format!("GitHub CLI is signed in as {}.", account.login),
        ),
        Err(error) => check
            .status(Status::Attention, error.message)
            .fix("gh auth login"),
    }
}

/// Runs exactly the reviewed steps and nothing else; project files are not reread.
pub(crate) fn execute(
    plan: &Plan,
    versions: &dyn Runner,
    remote: &dyn Runner,
    neutral: &Path,
    cancel: &AtomicBool,
) -> Vec<Check> {
    let mut checks = plan.decided.clone();
    for step in &plan.steps {
        if cancel.load(Ordering::Acquire) {
            break;
        }
        // Every program runs in an empty folder, so project version-manager files
        // and repository configuration cannot affect it.
        let runner = if step.network { remote } else { versions };
        let result = runner.run(step.program, &step.args, neutral);
        if matches!(&result, Err(reason) if reason == "cancelled") {
            break;
        }
        let inputs = &plan.inputs;
        match step.id {
            "node" => checks.push(node_result(inputs, version_of(result))),
            "rustc" => checks.extend(rust_result(inputs, version_of(result))),
            "rustup" => checks.push(targets_result(inputs, result)),
            "python" => checks.push(python_result(inputs, version_of(result))),
            "remote" => checks.push(remote_result(inputs, result)),
            "github" => checks.push(github_result(result)),
            _ => {}
        }
    }
    checks
}

static NEXT_PLAN: AtomicU64 = AtomicU64::new(1);
#[derive(Default)]
pub struct ReadinessChecks {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
    reviewed: Mutex<HashMap<String, (String, Plan)>>,
}
fn state_error() -> AppError {
    AppError::new(
        "Readiness state is unavailable.",
        "Reopen the project workspace. No command ran.",
    )
}
fn stale_plan() -> AppError {
    AppError::new(
        "The project changed after you reviewed the full check.",
        "Review the updated list of programs and confirm again. Nothing ran.",
    )
}
impl ReadinessChecks {
    /// Stores a plan for review and returns the token that confirms it.
    pub(crate) fn review(&self, id: &str, plan: Plan) -> Result<String, AppError> {
        let token = format!("plan-{}", NEXT_PLAN.fetch_add(1, Ordering::Relaxed));
        self.reviewed
            .lock()
            .map_err(|_| state_error())?
            .insert(id.into(), (token.clone(), plan));
        Ok(token)
    }
    /// Consumes a reviewed plan. It is returned only for the matching token and
    /// only when a plan rebuilt now is identical; any change requires a new review.
    pub(crate) fn confirm(&self, id: &str, token: &str, current: &Plan) -> Result<Plan, AppError> {
        let reviewed = self.reviewed.lock().map_err(|_| state_error())?.remove(id);
        match reviewed {
            Some((expected, plan)) if expected == token && plan == *current => Ok(plan),
            _ => Err(stale_plan()),
        }
    }
}

#[tauri::command(async)]
pub fn get_project_readiness(id: String, app: tauri::AppHandle) -> Result<Report, AppError> {
    let project = handoff::find_project(&app, &id)?;
    let root = workspace::project_directory(&project)?;
    Ok(inspect(&root, &project.commands, &Environment::system()))
}
fn local_runner() -> BoundedRunner {
    BoundedRunner {
        timeout: PROBE_TIMEOUT,
        cancel: None,
    }
}
#[tauri::command(async)]
pub fn prepare_readiness_check(
    id: String,
    app: tauri::AppHandle,
    state: State<'_, Arc<ReadinessChecks>>,
) -> Result<PlanView, AppError> {
    let project = handoff::find_project(&app, &id)?;
    let root = workspace::project_directory(&project)?;
    let plan = prepare(&root, &Environment::system(), &local_runner());
    let probes = plan
        .steps
        .iter()
        .map(|step| Probe {
            id: step.id,
            label: step.label.clone(),
            network: step.network,
        })
        .collect();
    Ok(PlanView {
        token: state.review(&id, plan)?,
        probes,
    })
}
#[tauri::command(async)]
pub fn run_readiness_check(
    id: String,
    token: String,
    app: tauri::AppHandle,
    state: State<'_, Arc<ReadinessChecks>>,
) -> Result<FullReport, AppError> {
    let project = handoff::find_project(&app, &id)?;
    let root = workspace::project_directory(&project)?;
    let current = prepare(&root, &Environment::system(), &local_runner());
    let plan = state.confirm(&id, &token, &current)?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut active = state.active.lock().map_err(|_| state_error())?;
        if active.contains_key(&id) {
            return Err(AppError::new(
                "A full check is already running for this project.",
                "Wait for it to finish or cancel it.",
            ));
        }
        active.insert(id.clone(), cancel.clone());
    }
    let neutral = tempfile::tempdir();
    let checks = neutral.as_ref().map(|neutral| {
        execute(
            &plan,
            &BoundedRunner {
                timeout: PROBE_TIMEOUT,
                cancel: Some(cancel.clone()),
            },
            &BoundedRunner {
                timeout: REMOTE_TIMEOUT,
                cancel: Some(cancel.clone()),
            },
            neutral.path(),
            &cancel,
        )
    });
    if let Ok(mut active) = state.active.lock() {
        active.remove(&id);
    }
    let checks = checks.map_err(|_| {
        AppError::new(
            "Could not prepare a temporary folder for the full check.",
            "Check free disk space, then try again. No command ran.",
        )
    })?;
    Ok(FullReport {
        checks,
        cancelled: cancel.load(Ordering::Acquire),
    })
}
#[tauri::command(async)]
pub fn cancel_readiness_check(
    id: String,
    state: State<'_, Arc<ReadinessChecks>>,
) -> Result<(), AppError> {
    if let Some(cancel) = state.active.lock().map_err(|_| state_error())?.get(&id) {
        cancel.store(true, Ordering::Release);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::process::Output;

    type Response = Box<dyn Fn(Program, &[String]) -> Result<Output, String> + Send + Sync>;
    struct Fixture {
        calls: Mutex<Vec<(Program, Vec<String>, PathBuf)>>,
        respond: Response,
    }
    impl Fixture {
        fn new(
            respond: impl Fn(Program, &[String]) -> Result<Output, String> + Send + Sync + 'static,
        ) -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                respond: Box::new(respond),
            }
        }
        fn calls(&self) -> Vec<(Program, Vec<String>, PathBuf)> {
            self.calls.lock().unwrap().clone()
        }
    }
    impl Runner for Fixture {
        fn run(&self, program: Program, args: &[String], cwd: &Path) -> Result<Output, String> {
            self.calls
                .lock()
                .unwrap()
                .push((program, args.to_vec(), cwd.to_path_buf()));
            (self.respond)(program, args)
        }
    }
    fn ok(stdout: &str) -> Result<Output, String> {
        Ok(Output {
            success: true,
            stdout: stdout.into(),
        })
    }
    fn tools(names: Vec<&'static str>) -> impl Fn(&str) -> Option<PathBuf> {
        move |name| {
            names
                .contains(&name)
                .then(|| PathBuf::from(format!("/fixture/bin/{name}")))
        }
    }
    fn environment<'a>(find: &'a dyn Fn(&str) -> Option<PathBuf>) -> Environment<'a> {
        Environment {
            find,
            rustup_home: None,
            python_stub: false,
        }
    }
    fn find<'a>(report: &'a [Check], id: &str) -> &'a Check {
        report
            .iter()
            .find(|check| check.id == id)
            .unwrap_or_else(|| panic!("missing check {id}: {report:#?}"))
    }
    fn write(root: &Path, name: &str, text: &str) {
        fs::write(root.join(name), text).unwrap();
    }
    fn command(id: &str) -> ProjectCommand {
        ProjectCommand {
            id: id.into(),
            name: format!("Command {id}"),
            executable: "git".into(),
            ..ProjectCommand::default()
        }
    }

    /// Plan labels for a project whose remote is unavailable.
    fn labels(root: &Path, env: &Environment) -> Vec<String> {
        let local = Fixture::new(|_, _| Err("unavailable".into()));
        prepare(root, env, &local)
            .steps
            .iter()
            .filter(|step| step.id != "remote")
            .map(|step| step.label.clone())
            .collect()
    }

    #[test]
    fn node_projects_report_tools_requirements_configuration_and_dependencies() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(
            root,
            "package.json",
            r#"{"packageManager":"pnpm@9.1.0","engines":{"node":">=22.18 <23"},"dependencies":{"react":"19"}}"#,
        );
        write(root, "pnpm-lock.yaml", "lockfileVersion: 9\n");
        write(root, ".nvmrc", "# pinned\nv22.18.0\n");
        write(root, ".env.example", "API_URL=\n");
        let finder = tools(vec!["node"]);
        let report = inspect(root, &[], &environment(&finder));
        let checks = &report.checks;
        assert_eq!(find(checks, "project-type").status, Status::Ready);
        assert!(find(checks, "project-type")
            .detail
            .contains("Detected Node.js (pnpm)"));
        assert_eq!(find(checks, "tool-node").status, Status::Ready);
        let pnpm = find(checks, "tool-pnpm");
        assert_eq!(pnpm.status, Status::Attention);
        assert_eq!(pnpm.fix.as_deref(), Some("corepack enable pnpm"));
        let version = find(checks, "version-node");
        assert_eq!(version.status, Status::NotChecked);
        assert!(version
            .detail
            .contains(">=22.18 <23 (package.json engines)"));
        assert!(version.detail.contains("v22.18.0 (.nvmrc)"));
        assert_eq!(find(checks, "lockfile").status, Status::Ready);
        let dependencies = find(checks, "dependencies-node");
        assert_eq!(dependencies.status, Status::Attention);
        assert_eq!(dependencies.fix.as_deref(), Some("pnpm install"));
        assert!(dependencies.inferred);
        let env = find(checks, "env");
        assert_eq!(env.status, Status::Attention);
        assert!(env.inferred);
        assert!(env.fix.as_deref().unwrap().contains(".env.example .env"));
        assert_eq!(find(checks, "gitignore").status, Status::Attention);
        let plan = labels(root, &environment(&finder));
        assert_eq!(plan, ["node --version"]);

        fs::create_dir(root.join("node_modules")).unwrap();
        write(root, ".env", "API_TOKEN=secret-value\n");
        write(root, ".gitignore", "node_modules\n");
        let checks = inspect(root, &[], &environment(&finder)).checks;
        assert_eq!(find(&checks, "dependencies-node").status, Status::Ready);
        assert!(find(&checks, "dependencies-node").inferred);
        assert_eq!(find(&checks, "env").status, Status::Ready);
        assert_eq!(find(&checks, "gitignore").status, Status::Ready);
        assert!(checks.iter().all(|c| !c.detail.contains("secret-value")));
    }

    #[test]
    fn lockfile_conflicts_plug_n_play_and_projects_without_dependencies() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "package.json", r#"{"devDependencies":{"vite":"8"}}"#);
        write(root, "package-lock.json", "{}");
        write(root, "yarn.lock", "");
        write(root, ".pnp.cjs", "");
        let finder = tools(vec!["node", "yarn"]);
        let checks = inspect(root, &[], &environment(&finder)).checks;
        assert_eq!(find(&checks, "lockfile").status, Status::Attention);
        assert_eq!(find(&checks, "tool-yarn").status, Status::Ready);
        assert_eq!(
            find(&checks, "dependencies-node").status,
            Status::NotChecked
        );
        let empty = tempfile::tempdir().unwrap();
        write(empty.path(), "package.json", r#"{"name":"tiny"}"#);
        let checks = inspect(empty.path(), &[], &environment(&finder)).checks;
        assert_eq!(find(&checks, "dependencies-node").status, Status::Ready);
        assert!(!checks.iter().any(|c| c.id == "lockfile"));
        assert_eq!(
            find(&checks, "tool-npm").fix.as_deref(),
            Some("npm install --global npm")
        );
    }

    #[test]
    fn malformed_and_out_of_scope_manifests_are_not_trusted_or_echoed() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "package.json", "{ \"token\": \"ghp_hidden\", ");
        write(root, "Cargo.toml", "[package\nname = 'broken'");
        write(root, "pyproject.toml", "[project]\nrequires-python = ");
        let finder = tools(vec![]);
        let checks = inspect(root, &[], &environment(&finder)).checks;
        for file in ["package.json", "Cargo.toml", "pyproject.toml"] {
            assert_eq!(
                find(&checks, &format!("file-{file}")).status,
                Status::CouldNotCheck
            );
        }
        assert!(checks.iter().all(|c| !c.detail.contains("ghp_hidden")));
        assert_eq!(find(&checks, "tool-node").status, Status::Attention);
        assert_eq!(find(&checks, "tool-cargo").status, Status::Attention);

        let empty = tempfile::tempdir().unwrap();
        let checks = inspect(empty.path(), &[], &environment(&finder)).checks;
        assert_eq!(find(&checks, "project-type").status, Status::NotChecked);
        let oversized = tempfile::tempdir().unwrap();
        write(
            oversized.path(),
            "package.json",
            &" ".repeat(MANIFEST_LIMIT + 1),
        );
        let checks = inspect(oversized.path(), &[], &environment(&finder)).checks;
        assert_eq!(
            find(&checks, "file-package.json").status,
            Status::CouldNotCheck
        );
    }

    #[cfg(unix)]
    #[test]
    fn linked_manifests_outside_the_project_are_not_read() {
        let outside = tempfile::tempdir().unwrap();
        write(
            outside.path(),
            "package.json",
            r#"{"engines":{"node":"99"}}"#,
        );
        let dir = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("package.json"),
            dir.path().join("package.json"),
        )
        .unwrap();
        let finder = tools(vec![]);
        let checks = inspect(dir.path(), &[], &environment(&finder)).checks;
        assert_eq!(
            find(&checks, "file-package.json").status,
            Status::CouldNotCheck
        );
        let version = find(&checks, "version-node");
        assert_eq!(version.status, Status::CouldNotCheck);
        assert!(!version.detail.contains("99"));
    }

    #[test]
    fn rust_toolchain_files_select_channels_targets_and_refuse_custom_paths() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(
            root,
            "Cargo.toml",
            "[package]\nname='app'\nversion='0.1.0'\nrust-version='1.90'\n",
        );
        write(
            root,
            "rust-toolchain.toml",
            "[toolchain]\nchannel='1.91.0'\ntargets=['aarch64-apple-darwin','bad target']\n",
        );
        let finder = tools(vec!["cargo", "rustc", "rustup"]);
        let report = inspect(root, &[], &environment(&finder));
        assert_eq!(
            find(&report.checks, "toolchain-rust").status,
            Status::NotChecked
        );
        assert!(!find(&report.checks, "targets-rust")
            .detail
            .contains("bad target"));
        assert!(find(&report.checks, "version-rust").detail.contains("1.90"));
        let rustup = tempfile::tempdir().unwrap();
        fs::create_dir_all(
            rustup
                .path()
                .join("toolchains/1.91.0-x86_64-pc-windows-msvc"),
        )
        .unwrap();
        let installed = Environment {
            find: &finder,
            rustup_home: Some(rustup.path().to_path_buf()),
            python_stub: false,
        };
        // An invalid target name makes the whole declaration unknown rather than shorter.
        assert_eq!(
            find(&report.checks, "targets-rust").status,
            Status::CouldNotCheck
        );
        assert_eq!(labels(root, &installed), ["rustc +1.91.0 --version"]);
        write(
            root,
            "rust-toolchain.toml",
            "[toolchain]\nchannel='1.91.0'\ntargets=['aarch64-apple-darwin']\n",
        );
        assert_eq!(
            labels(root, &installed),
            [
                "rustc +1.91.0 --version",
                "rustup target list --installed --toolchain 1.91.0"
            ]
        );

        write(
            root,
            "rust-toolchain.toml",
            "[toolchain]\npath='./toolchain'\n",
        );
        let report = inspect(root, &[], &environment(&finder));
        assert_eq!(
            find(&report.checks, "toolchain-rust").status,
            Status::NotChecked
        );
        assert!(find(&report.checks, "toolchain-rust")
            .detail
            .contains("custom toolchain"));
        assert!(labels(root, &installed).is_empty());
        write(root, "rust-toolchain", "../outside/toolchain\n");
        assert!(labels(root, &installed).is_empty());
        write(root, "rust-toolchain", "stable; touch pwned\n");
        let report = inspect(root, &[], &environment(&finder));
        assert_eq!(
            find(&report.checks, "toolchain-rust").status,
            Status::CouldNotCheck
        );
        assert!(labels(root, &installed).is_empty());
        assert!(valid_channel("nightly-2026-01-01-aarch64-apple-darwin"));
        assert!(!valid_channel("../stable"));
    }

    #[test]
    fn saved_commands_are_validated_without_running_them() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("app")).unwrap();
        let mut shell = command("shell");
        shell.mode = "shell".into();
        shell.shell_command = "touch should-not-exist".into();
        let mut missing_directory = command("folder");
        missing_directory.working_directory = "missing".into();
        let mut missing_program = command("program");
        missing_program.executable = "repo-creator-missing-program".into();
        let mut reviewed = command("reviewed");
        reviewed.working_directory = "app".into();
        let mut imported = command("imported");
        imported.imported = true;
        let mut disabled = command("disabled");
        disabled.enabled = false;
        let finder = tools(vec![]);
        let checks = inspect(
            dir.path(),
            &[
                shell,
                missing_directory,
                missing_program,
                reviewed,
                imported,
                disabled,
            ],
            &environment(&finder),
        )
        .checks;
        assert_eq!(find(&checks, "command-shell").status, Status::NotChecked);
        assert_eq!(find(&checks, "command-folder").status, Status::Attention);
        assert!(find(&checks, "command-folder").detail.contains("missing"));
        assert_eq!(find(&checks, "command-program").status, Status::Attention);
        assert_eq!(find(&checks, "command-reviewed").status, Status::Ready);
        assert!(find(&checks, "command-imported")
            .detail
            .contains("Review it in Commands"));
        assert!(!checks.iter().any(|c| c.id == "command-disabled"));
        assert!(!dir.path().join("should-not-exist").exists());
    }

    #[test]
    fn version_ranges_cover_common_npm_and_python_forms() {
        let v = |text: &str| parse_version(text).unwrap();
        for (range, version, expected) in [
            (">=22.18 <23", "22.23.4", Some(true)),
            (">=22.18 <23", "23.0.0", Some(false)),
            ("^20.11", "20.19.0", Some(true)),
            ("^20.11", "21.0.0", Some(false)),
            ("^0.2.3", "0.2.9", Some(true)),
            ("^0.2.3", "0.3.0", Some(false)),
            ("~1.2", "1.2.9", Some(true)),
            ("~1.2", "1.3.0", Some(false)),
            ("18.x || >= 20", "19.1.0", Some(false)),
            ("18.x || >= 20", "21.0.0", Some(true)),
            ("16 - 18", "18.9.0", Some(true)),
            ("16 - 18", "19.0.0", Some(false)),
            ("v22.18.0", "22.18.0", Some(true)),
            ("v22.18.0", "22.18.1", Some(false)),
            ("22", "22.4.0", Some(true)),
            ("*", "1.0.0", Some(true)),
            ("> 1.2", "1.2.9", Some(false)),
            ("lts/*", "22.0.0", None),
            ("node", "22.0.0", None),
            (">=18.0.0-beta", "18.0.0", None),
        ] {
            assert_eq!(
                node_satisfies(v(version), range),
                expected,
                "{range} vs {version}"
            );
        }
        for (specifier, version, expected) in [
            (">=3.10", "3.12.1", Some(true)),
            (">=3.10,<3.12", "3.12.0", Some(false)),
            ("~=3.11", "3.13.0", Some(true)),
            ("~=3.11.2", "3.12.0", Some(false)),
            ("==3.12.*", "3.12.7", Some(true)),
            ("!=3.12.*", "3.12.7", Some(false)),
            ("==3.12", "3.12.1", Some(false)),
            (">=3.10a1", "3.12.0", None),
            ("===3.12", "3.12.0", None),
        ] {
            assert_eq!(
                python_satisfies(v(version), specifier),
                expected,
                "{specifier} vs {version}"
            );
        }
        assert_eq!(parse_version("v22.18.0"), Some([22, 18, 0]));
        assert_eq!(parse_version("1.90"), Some([1, 90, 0]));
        assert_eq!(parse_version("next"), None);
    }

    fn mixed_project() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "package.json", r#"{"engines":{"node":">=22"}}"#);
        write(
            root,
            "Cargo.toml",
            "[package]\nname='app'\nversion='0.1.0'\nrust-version='1.95'\n",
        );
        write(
            root,
            "rust-toolchain.toml",
            "[toolchain]\nchannel='1.91.0'\ntargets=['wasm32-unknown-unknown']\n",
        );
        write(
            root,
            "pyproject.toml",
            "[project]\nrequires-python='>=3.11'\n",
        );
        dir
    }
    fn neutral_and_rustup(installed: bool) -> (tempfile::TempDir, tempfile::TempDir) {
        let rustup = tempfile::tempdir().unwrap();
        fs::create_dir_all(rustup.path().join("toolchains/stable-aarch64-apple-darwin")).unwrap();
        if installed {
            fs::create_dir_all(rustup.path().join("toolchains/1.91.0-aarch64-apple-darwin"))
                .unwrap();
        }
        (tempfile::tempdir().unwrap(), rustup)
    }

    fn github_remote() -> Fixture {
        Fixture::new(|_, args| match args[0].as_str() {
            "remote" => ok("upstream\norigin"),
            "config" if args[2] == "remote.origin.url" => {
                ok("https://person:secret-token@github.com/example/app.git")
            }
            _ => Err("unavailable".into()),
        })
    }

    #[test]
    fn full_check_runs_exactly_the_reviewed_steps_in_a_neutral_folder() {
        let project = mixed_project();
        let (neutral, rustup) = neutral_and_rustup(true);
        let finder = tools(vec![
            "node",
            "npm",
            "rustc",
            "rustup",
            "cargo",
            python_name(),
            "gh",
        ]);
        let env = Environment {
            find: &finder,
            rustup_home: Some(rustup.path().to_path_buf()),
            python_stub: false,
        };
        let plan = prepare(project.path(), &env, &github_remote());
        let shown: Vec<&str> = plan.steps.iter().map(|step| step.label.as_str()).collect();
        assert_eq!(
            shown,
            [
                "node --version",
                "rustc +1.91.0 --version",
                "rustup target list --installed --toolchain 1.91.0",
                &format!("{} --version", python_name()),
                "git ls-remote github.com/example/app.git HEAD",
                "gh api user (GitHub CLI sign-in)",
            ]
        );
        assert!(shown.iter().all(|label| !label.contains("secret-token")));
        let versions = Fixture::new(|program, args| match program {
            Program::Node => ok("v20.11.1"),
            Program::Rustc => ok("rustc 1.91.0 (abc 2026-01-01)"),
            Program::Rustup if args[0] == "target" => ok("aarch64-apple-darwin\n"),
            Program::Python => ok("Python 3.12.4"),
            _ => Err("unexpected".into()),
        });
        let remote = Fixture::new(|program, _| match program {
            Program::Git => ok("abc\tHEAD"),
            Program::Gh => ok(r#"{"login":"example","id":7}"#),
            _ => Err("unexpected".into()),
        });
        // Project files changing after review cannot add programs to this run.
        write(
            project.path(),
            "pyproject.toml",
            "[project]\nrequires-python='>=3.13'\n",
        );
        let checks = execute(
            &plan,
            &versions,
            &remote,
            neutral.path(),
            &AtomicBool::new(false),
        );
        let node = find(&checks, "version-node");
        assert_eq!(node.status, Status::Attention);
        assert!(node.detail.contains("20.11.1") && node.detail.contains(">=22"));
        assert_eq!(find(&checks, "toolchain-rust").status, Status::Ready);
        let rust = find(&checks, "version-rust");
        assert_eq!(rust.status, Status::Attention);
        assert!(rust.detail.contains("1.95"));
        let targets = find(&checks, "targets-rust");
        assert_eq!(targets.status, Status::Attention);
        assert_eq!(
            targets.fix.as_deref(),
            Some("rustup target add wasm32-unknown-unknown --toolchain 1.91.0")
        );
        assert!(targets
            .detail
            .contains("Rust is installed, but the target wasm32-unknown-unknown"));
        assert_eq!(find(&checks, "version-python").status, Status::Ready);
        let access = find(&checks, "remote");
        assert_eq!(access.status, Status::Ready);
        assert!(access.network);
        assert!(access.detail.contains("github.com/example/app.git"));
        assert_eq!(find(&checks, "github").status, Status::Ready);
        assert!(checks.iter().all(|c| !c.detail.contains("secret-token")));
        let ran: Vec<(Program, Vec<String>, PathBuf)> =
            versions.calls().into_iter().chain(remote.calls()).collect();
        let reviewed: Vec<(Program, Vec<String>, PathBuf)> = plan
            .steps
            .iter()
            .map(|step| {
                (
                    step.program,
                    step.args.clone(),
                    neutral.path().to_path_buf(),
                )
            })
            .collect();
        let mut ran_sorted = ran.clone();
        let mut reviewed_sorted = reviewed.clone();
        ran_sorted.sort_by_key(|(_, args, _)| args.join(" "));
        reviewed_sorted.sort_by_key(|(_, args, _)| args.join(" "));
        assert_eq!(
            ran_sorted, reviewed_sorted,
            "only reviewed programs and arguments run"
        );
        let ls_remote = remote
            .calls()
            .into_iter()
            .find(|(p, ..)| *p == Program::Git)
            .unwrap();
        assert_eq!(
            ls_remote.1,
            [
                "-c",
                "core.sshCommand=ssh -o BatchMode=yes",
                "ls-remote",
                "https://person:secret-token@github.com/example/app.git",
                "HEAD"
            ]
        );
        assert_eq!(
            remote
                .calls()
                .into_iter()
                .find(|(p, ..)| *p == Program::Gh)
                .unwrap()
                .1,
            github::ACCOUNT_ARGS
        );
    }

    #[test]
    fn reviewed_plans_run_once_and_only_while_unchanged() {
        let project = mixed_project();
        let (_, rustup) = neutral_and_rustup(true);
        let finder = tools(vec!["node", "rustc", "rustup", python_name(), "gh"]);
        let env = Environment {
            find: &finder,
            rustup_home: Some(rustup.path().to_path_buf()),
            python_stub: false,
        };
        let state = ReadinessChecks::default();
        let reviewed = prepare(project.path(), &env, &github_remote());
        let token = state.review("project", reviewed.clone()).unwrap();
        assert!(state.confirm("project", "plan-guess", &reviewed).is_err());
        // A rejected confirmation consumes the review; a new review is required.
        assert!(state.confirm("project", &token, &reviewed).is_err());
        let token = state.review("project", reviewed.clone()).unwrap();
        assert_eq!(
            state.confirm("project", &token, &reviewed).unwrap(),
            reviewed
        );
        assert!(
            state.confirm("project", &token, &reviewed).is_err(),
            "single use"
        );

        // Metadata edited while the confirmation is open: new targets would add
        // undisclosed arguments, and a new requirement changes what is compared.
        for (file, text) in [
            (
                "rust-toolchain.toml",
                "[toolchain]\nchannel='1.91.0'\ntargets=['wasm32-unknown-unknown','aarch64-apple-darwin']\n",
            ),
            ("package.json", r#"{"engines":{"node":">=24"}}"#),
        ] {
            let project = mixed_project();
            let reviewed = prepare(project.path(), &env, &github_remote());
            let token = state.review("project", reviewed).unwrap();
            write(project.path(), file, text);
            let current = prepare(project.path(), &env, &github_remote());
            assert!(state.confirm("project", &token, &current).is_err(), "{file}");
        }
        // A changed remote address is also a different plan.
        let reviewed = prepare(project.path(), &env, &github_remote());
        let token = state.review("project", reviewed).unwrap();
        let moved = Fixture::new(|_, args| match args[0].as_str() {
            "remote" => ok("origin"),
            "config" if args[2] == "remote.origin.url" => ok("git@example.com:other/app.git"),
            _ => Err("unavailable".into()),
        });
        let current = prepare(project.path(), &env, &moved);
        assert!(state.confirm("project", &token, &current).is_err());
    }

    #[test]
    fn missing_toolchains_stubs_unsafe_remotes_and_cancellation_start_nothing() {
        let project = mixed_project();
        let (neutral, rustup) = neutral_and_rustup(false);
        let finder = tools(vec!["node", "rustc", "rustup", python_name()]);
        let env = Environment {
            find: &finder,
            rustup_home: Some(rustup.path().to_path_buf()),
            python_stub: true,
        };
        let versions = Fixture::new(|program, _| match program {
            Program::Node => Err("timed out".into()),
            _ => Err("unexpected".into()),
        });
        let local = Fixture::new(|_, args| match args[0].as_str() {
            "remote" => ok("origin"),
            "config" => ok("/Users/example/elsewhere.git"),
            _ => Err("unavailable".into()),
        });
        let remote = Fixture::new(|_, _| Err("unexpected".into()));
        let plan = prepare(project.path(), &env, &local);
        assert_eq!(
            plan.steps
                .iter()
                .map(|s| s.label.as_str())
                .collect::<Vec<_>>(),
            ["node --version"]
        );
        let checks = execute(
            &plan,
            &versions,
            &remote,
            neutral.path(),
            &AtomicBool::new(false),
        );
        assert_eq!(find(&checks, "version-node").status, Status::CouldNotCheck);
        let toolchain = find(&checks, "toolchain-rust");
        assert_eq!(toolchain.status, Status::Attention);
        assert_eq!(
            toolchain.fix.as_deref(),
            Some("rustup toolchain install 1.91.0")
        );
        assert_eq!(find(&checks, "version-rust").status, Status::NotChecked);
        assert_eq!(find(&checks, "version-python").status, Status::NotChecked);
        assert_eq!(find(&checks, "remote").status, Status::NotChecked);
        assert!(versions.calls().iter().all(|(p, ..)| *p == Program::Node));
        assert!(remote.calls().is_empty());

        let unknown = Environment {
            find: &finder,
            rustup_home: None,
            python_stub: true,
        };
        let plan = prepare(project.path(), &unknown, &local);
        assert_eq!(
            find(&plan.decided, "toolchain-rust").status,
            Status::CouldNotCheck
        );
        assert!(!plan.steps.iter().any(|s| s.program == Program::Rustc));

        let before = versions.calls().len();
        let cancelled = execute(
            &plan,
            &versions,
            &remote,
            neutral.path(),
            &AtomicBool::new(true),
        );
        assert_eq!(cancelled, plan.decided);
        assert_eq!(versions.calls().len(), before);
        let interrupted = Fixture::new(|_, _| Err("cancelled".into()));
        let partial = execute(
            &plan,
            &interrupted,
            &remote,
            neutral.path(),
            &AtomicBool::new(false),
        );
        assert!(!partial.iter().any(|c| c.id == "version-node"));
    }

    #[test]
    fn unreadable_or_mistyped_node_requirements_are_never_ready() {
        let finder = tools(vec!["node"]);
        let env = environment(&finder);
        let node = |installed: &str| {
            Fixture::new({
                let installed = installed.to_string();
                move |_, _| ok(&installed)
            })
        };
        let none = Fixture::new(|_, _| Err("unavailable".into()));
        let neutral = tempfile::tempdir().unwrap();
        type Arrange = Box<dyn Fn(&Path)>;
        let cases: [(&str, Arrange); 5] = [
            (
                ".nvmrc is a folder",
                Box::new(|root: &Path| fs::create_dir(root.join(".nvmrc")).unwrap()),
            ),
            (
                "empty .node-version",
                Box::new(|root: &Path| write(root, ".node-version", "# no version\n")),
            ),
            (
                "engines.node is a number",
                Box::new(|root: &Path| write(root, "package.json", r#"{"engines":{"node":22}}"#)),
            ),
            (
                "engines is a string",
                Box::new(|root: &Path| write(root, "package.json", r#"{"engines":"node 22"}"#)),
            ),
            (
                "malformed package.json",
                Box::new(|root: &Path| write(root, "package.json", "{ \"engines\": ")),
            ),
        ];
        for (name, arrange) in cases {
            let dir = tempfile::tempdir().unwrap();
            write(dir.path(), "package.json", r#"{"engines":{"node":">=20"}}"#);
            arrange(dir.path());
            let tier1 = inspect(dir.path(), &[], &env).checks;
            assert_eq!(
                find(&tier1, "version-node").status,
                Status::CouldNotCheck,
                "{name}"
            );
            let plan = prepare(dir.path(), &env, &none);
            let checks = execute(
                &plan,
                &node("v22.4.0"),
                &none,
                neutral.path(),
                &AtomicBool::new(false),
            );
            assert_eq!(
                find(&checks, "version-node").status,
                Status::CouldNotCheck,
                "{name}"
            );
            // A definite mismatch with a readable range is still reported.
            let checks = execute(
                &plan,
                &node("v18.0.0"),
                &none,
                neutral.path(),
                &AtomicBool::new(false),
            );
            if name.contains(".nvmrc") || name.contains("node-version") {
                assert_eq!(
                    find(&checks, "version-node").status,
                    Status::Attention,
                    "{name}"
                );
            } else {
                assert_ne!(
                    find(&checks, "version-node").status,
                    Status::Ready,
                    "{name}"
                );
            }
        }
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "package.json", "[1, 2]");
        let checks = inspect(dir.path(), &[], &env).checks;
        assert_eq!(
            find(&checks, "dependencies-node").status,
            Status::CouldNotCheck
        );
        assert_eq!(find(&checks, "version-node").status, Status::CouldNotCheck);
    }

    #[test]
    fn mistyped_rust_toolchain_and_version_declarations_are_reported() {
        let finder = tools(vec!["cargo", "rustc", "rustup"]);
        let rustup = tempfile::tempdir().unwrap();
        fs::create_dir_all(rustup.path().join("toolchains/stable-aarch64-apple-darwin")).unwrap();
        let env = Environment {
            find: &finder,
            rustup_home: Some(rustup.path().to_path_buf()),
            python_stub: false,
        };
        let none = Fixture::new(|_, _| Err("unavailable".into()));
        for (toolchain, expect_toolchain, expect_targets) in [
            (
                "[toolchain]\nchannel=1.80\n",
                Some(Status::CouldNotCheck),
                None,
            ),
            (
                "[toolchain]\nchannel=['stable']\n",
                Some(Status::CouldNotCheck),
                None,
            ),
            ("toolchain='stable'\n", Some(Status::CouldNotCheck), None),
            (
                "[toolchain]\nchannel='stable'\ntargets='wasm32-unknown-unknown'\n",
                None,
                Some(Status::CouldNotCheck),
            ),
            (
                "[toolchain]\nchannel='stable'\ntargets=[42]\n",
                None,
                Some(Status::CouldNotCheck),
            ),
            (
                "[toolchain]\nchannel='stable'\ntargets=['../evil']\n",
                None,
                Some(Status::CouldNotCheck),
            ),
        ] {
            let dir = tempfile::tempdir().unwrap();
            write(
                dir.path(),
                "Cargo.toml",
                "[package]\nname='app'\nversion='0.1.0'\n",
            );
            write(dir.path(), "rust-toolchain.toml", toolchain);
            let checks = inspect(dir.path(), &[], &env).checks;
            if let Some(status) = expect_toolchain {
                assert_eq!(
                    find(&checks, "toolchain-rust").status,
                    status,
                    "{toolchain}"
                );
                // No fallback to the default compiler.
                assert!(
                    prepare(dir.path(), &env, &none)
                        .steps
                        .iter()
                        .all(|s| s.program != Program::Rustc),
                    "{toolchain}"
                );
            }
            if let Some(status) = expect_targets {
                assert_eq!(find(&checks, "targets-rust").status, status, "{toolchain}");
                let plan = prepare(dir.path(), &env, &none);
                assert!(
                    plan.steps.iter().all(|s| s.program != Program::Rustup),
                    "{toolchain}"
                );
            }
            assert!(
                checks.iter().all(|c| c.status != Status::Ready
                    || !c.id.contains("rust")
                    || c.id == "tool-rustup"),
                "{toolchain}"
            );
        }
        let neutral = tempfile::tempdir().unwrap();
        let rustc = Fixture::new(|_, _| ok("rustc 1.99.0 (abc)"));
        for manifest in [
            "[package]\nname='app'\nversion='0.1.0'\nrust-version=1.70\n",
            "[package]\nname='app'\nversion='0.1.0'\nrust-version='latest'\n",
            "[package]\nname='app'\nversion='0.1.0'\nrust-version.workspace=true\n",
            "[package\nname='broken'",
        ] {
            let dir = tempfile::tempdir().unwrap();
            write(dir.path(), "Cargo.toml", manifest);
            let checks = inspect(dir.path(), &[], &env).checks;
            assert_eq!(
                find(&checks, "version-rust").status,
                Status::CouldNotCheck,
                "{manifest}"
            );
            let plan = prepare(dir.path(), &env, &none);
            let checks = execute(
                &plan,
                &rustc,
                &none,
                neutral.path(),
                &AtomicBool::new(false),
            );
            assert_eq!(
                find(&checks, "version-rust").status,
                Status::CouldNotCheck,
                "{manifest}"
            );
        }
        let dir = tempfile::tempdir().unwrap();
        write(
            dir.path(),
            "Cargo.toml",
            "[workspace]\n[workspace.package]\nrust-version='1.90'\n",
        );
        let checks = inspect(dir.path(), &[], &env).checks;
        assert_eq!(find(&checks, "version-rust").status, Status::NotChecked);
        let dir = tempfile::tempdir().unwrap();
        write(
            dir.path(),
            "pyproject.toml",
            "[project]\nrequires-python=3.11\n",
        );
        let python_tools = tools(vec![python_name()]);
        let python = Environment {
            find: &python_tools,
            rustup_home: None,
            python_stub: false,
        };
        assert_eq!(
            find(&inspect(dir.path(), &[], &python).checks, "version-python").status,
            Status::CouldNotCheck
        );
        let plan = prepare(dir.path(), &python, &none);
        let checks = execute(
            &plan,
            &Fixture::new(|_, _| ok("Python 3.12.0")),
            &none,
            neutral.path(),
            &AtomicBool::new(false),
        );
        assert_eq!(
            find(&checks, "version-python").status,
            Status::CouldNotCheck
        );
    }

    #[test]
    fn remote_addresses_are_restricted_and_displayed_without_credentials() {
        for (url, expected) in [
            (
                "https://github.com/o/r.git",
                Some(("github.com", "github.com/o/r.git")),
            ),
            (
                "https://user:token@example.com:8443/o/r?x=1",
                Some(("example.com", "example.com/o/r")),
            ),
            (
                "git@github.com:o/r.git",
                Some(("github.com", "github.com:o/r.git")),
            ),
            (
                "ssh://git@host.example/o/r",
                Some(("host.example", "host.example/o/r")),
            ),
            ("file:///tmp/r.git", None),
            ("/tmp/r.git", None),
            ("C:\\repos\\r.git", None),
            ("ext::sh -c touch% /tmp/pwned", None),
            ("ext::helper", None),
            ("-uhelper", None),
        ] {
            let actual = remote_target(url);
            assert_eq!(
                actual.as_ref().map(|(h, d)| (h.as_str(), d.as_str())),
                expected,
                "{url}"
            );
        }
    }
}
