//! Bounded local evidence only. This module has no process, network or persistence APIs.
use crate::{handoff, model::AppError, technologies, workspace};
use serde::Serialize;
use std::{
    collections::{BTreeMap, VecDeque},
    fs,
    io::Read,
    path::Path,
    time::{Duration, Instant},
};

const MAX_DEPTH: usize = 5;
const MAX_ENTRIES: usize = 8_000;
const MAX_DIRECTORIES: usize = 256;
const MAX_FILE_BYTES: usize = 256 * 1024;
const MAX_TOTAL_BYTES: usize = 4 * 1024 * 1024;
const MAX_EVIDENCE: usize = 3;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    description: String,
    path: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    id: String,
    name: String,
    evidence: Vec<Evidence>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    suggestions: Vec<Suggestion>,
    notices: Vec<&'static str>,
}
#[derive(Default)]
struct Scan {
    evidence: BTreeMap<&'static str, Vec<Evidence>>,
    bytes: usize,
    unreadable: bool,
    limited: bool,
}
impl Scan {
    fn add(&mut self, id: &'static str, path: &str, description: impl Into<String>) {
        let evidence = self.evidence.entry(id).or_default();
        if evidence.len() < MAX_EVIDENCE && !evidence.iter().any(|item| item.path == path) {
            evidence.push(Evidence {
                path: path.into(),
                description: description.into(),
            });
        }
    }
    fn found(&mut self, id: &'static str, path: &str) {
        self.add(id, path, "Found project file.");
    }
    fn read(&mut self, path: &Path) -> Option<String> {
        if self.bytes >= MAX_TOTAL_BYTES {
            self.limited = true;
            return None;
        }
        let limit = MAX_FILE_BYTES.min(MAX_TOTAL_BYTES - self.bytes);
        let mut bytes = Vec::new();
        let result = fs::File::open(path).and_then(|file| {
            let metadata = file.metadata()?;
            if !metadata.is_file() || linked(&metadata) {
                return Err(std::io::Error::other("Not a regular project file"));
            }
            file.take(limit as u64 + 1).read_to_end(&mut bytes)
        });
        self.bytes += bytes.len();
        if bytes.len() > limit {
            self.limited = true;
            return None;
        }
        if result.is_err() {
            self.unreadable = true;
            return None;
        }
        String::from_utf8(bytes)
            .map_err(|_| self.unreadable = true)
            .ok()
    }
    fn json(&mut self, path: &Path) -> Option<serde_json::Value> {
        let text = self.read(path)?;
        serde_json::from_str(&text)
            .map_err(|_| self.unreadable = true)
            .ok()
    }
    fn toml(&mut self, path: &Path) -> Option<toml::Value> {
        let text = self.read(path)?;
        toml::from_str(&text)
            .map_err(|_| self.unreadable = true)
            .ok()
    }
    fn package(&mut self, file: &Path, path: &str) {
        let Some(value) = self.json(file).filter(|value| value.is_object()) else {
            return;
        };
        for section in [
            "dependencies",
            "devDependencies",
            "peerDependencies",
            "optionalDependencies",
        ] {
            let Some(dependencies) = value[section].as_object() else {
                continue;
            };
            for (dependency, id) in [
                ("typescript", "typescript"),
                ("react", "react"),
                ("react-dom", "react"),
                ("vite", "vite"),
                ("next", "next"),
                ("vue", "vue"),
                ("nuxt", "nuxt"),
                ("svelte", "svelte"),
                ("@sveltejs/kit", "svelte"),
                ("@angular/core", "angular"),
                ("astro", "astro"),
                ("electron", "electron"),
                ("react-native", "react-native"),
                ("express", "express"),
                ("@nestjs/core", "nestjs"),
                ("sass", "sass"),
                ("@tauri-apps/api", "tauri"),
                ("@tauri-apps/cli", "tauri"),
            ] {
                if dependencies
                    .get(dependency)
                    .is_some_and(|value| value.is_string())
                {
                    self.add(id, path, format!("Declared {dependency} in {section}."));
                }
            }
        }
        if value["engines"]["node"].is_string() {
            self.add("node", path, "Declares a Node.js engine requirement.");
        } else if value["scripts"].as_object().is_some_and(|scripts| {
            scripts.values().any(|script| {
                script
                    .as_str()
                    .and_then(|text| text.split_whitespace().next())
                    .is_some_and(|program| {
                        ["node", "npm", "npx", "pnpm", "yarn"].contains(&program)
                    })
            })
        }) {
            self.add("node", path, "Declares scripts using Node.js tooling.");
        }
    }
    fn python_dependency(&mut self, dependency: &str, path: &str) {
        // Accept a declared requirement name, never arbitrary substring matches or URLs.
        let name: String = dependency
            .trim()
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || ['-', '_', '.'].contains(c))
            .collect();
        for (package, id) in [
            ("fastapi", "fastapi"),
            ("django", "django"),
            ("flask", "flask"),
        ] {
            if name.eq_ignore_ascii_case(package) {
                self.add(id, path, format!("Declares the {package} dependency."));
            }
        }
    }
    fn python(&mut self, file: &Path, path: &str) {
        let Some(value) = self.toml(file) else { return };
        if value.get("project").is_some()
            || value.get("build-system").is_some()
            || value
                .get("tool")
                .and_then(|tool| tool.get("poetry"))
                .is_some()
        {
            self.found("python", path);
        }
        if let Some(dependencies) = value
            .get("project")
            .and_then(|v| v.get("dependencies"))
            .and_then(|v| v.as_array())
        {
            for dependency in dependencies.iter().filter_map(|v| v.as_str()) {
                self.python_dependency(dependency, path);
            }
        }
        if let Some(dependencies) = value
            .get("tool")
            .and_then(|v| v.get("poetry"))
            .and_then(|v| v.get("dependencies"))
            .and_then(|v| v.as_table())
        {
            for dependency in dependencies.keys() {
                self.python_dependency(dependency, path);
            }
        }
        if let Some(groups) = value
            .get("project")
            .and_then(|v| v.get("optional-dependencies"))
            .and_then(|v| v.as_table())
        {
            for dependency in groups
                .values()
                .filter_map(|v| v.as_array())
                .flatten()
                .filter_map(|v| v.as_str())
            {
                self.python_dependency(dependency, path);
            }
        }
    }
    fn inspect(&mut self, file: &Path, path: &str, name: &str) {
        match name {
            "package.json" => self.package(file, path),
            "Cargo.toml" => {
                if let Some(value) = self.toml(file) {
                    if value.get("package").is_some() || value.get("workspace").is_some() {
                        self.found("rust", path);
                    }
                    for table in [Some(&value), value.get("workspace")].into_iter().flatten() {
                        if ["dependencies", "build-dependencies", "dev-dependencies"]
                            .iter()
                            .any(|key| table.get(key).and_then(|v| v.get("tauri")).is_some())
                        {
                            self.add("tauri", path, "Declares the tauri dependency.");
                        }
                    }
                }
            }
            "pyproject.toml" => self.python(file, path),
            "requirements.txt" => {
                if let Some(text) = self.read(file) {
                    self.found("python", path);
                    for line in text.lines() {
                        self.python_dependency(line, path);
                    }
                }
            }
            "tsconfig.json" => self.found("typescript", path),
            "angular.json" => {
                if self.json(file).is_some_and(|v| v["projects"].is_object()) {
                    self.found("angular", path);
                }
            }
            "tauri.conf.json" | "tauri.conf.json5" | "Tauri.toml" => self.found("tauri", path),
            "project.godot" => self.found("godot", path),
            "deno.json" | "deno.jsonc" => self.found("deno", path),
            "bun.lock" | "bun.lockb" => self.add(
                "bun",
                path,
                "Found a Bun lockfile; indicates package tooling.",
            ),
            "Dockerfile"
            | "compose.yaml"
            | "compose.yml"
            | "docker-compose.yml"
            | "docker-compose.yaml" => self.found("docker", path),
            "go.mod" => self.found("go", path),
            "Gemfile" => self.found("ruby", path),
            "composer.json" => {
                if let Some(value) = self.json(file).filter(|v| v.is_object()) {
                    self.found("php", path);
                    if value["require"]["laravel/framework"].is_string() {
                        self.add("laravel", path, "Declares laravel/framework in require.");
                    }
                }
            }
            "wrangler.toml" => {
                if let Some(value) = self.toml(file) {
                    if value.get("main").and_then(|v| v.as_str()).is_some()
                        && value.get("pages_build_output_dir").is_none()
                    {
                        self.add(
                            "cloudflare-workers",
                            path,
                            "Workers configuration declares a main entry point.",
                        );
                    } else if value
                        .get("pages_build_output_dir")
                        .and_then(|v| v.as_str())
                        .is_some()
                    {
                        self.add(
                            "cloudflare-pages",
                            path,
                            "Declares a Pages build output directory.",
                        );
                    }
                }
            }
            "wrangler.json" | "wrangler.jsonc" => {
                if let Some(text) = self.read(file) {
                    match serde_json::from_str::<serde_json::Value>(&jsonc(&text)) {
                        Ok(value) if value["pages_build_output_dir"].is_string() => self.add(
                            "cloudflare-pages",
                            path,
                            "Declares a Pages build output directory.",
                        ),
                        Ok(value) if value["main"].is_string() => self.add(
                            "cloudflare-workers",
                            path,
                            "Workers configuration declares a main entry point.",
                        ),
                        Ok(_) => (),
                        Err(_) => self.unreadable = true,
                    }
                }
            }
            "ProjectVersion.txt" if path.ends_with("ProjectSettings/ProjectVersion.txt") => {
                if self.read(file).is_some_and(|text| {
                    text.lines()
                        .any(|line| line.starts_with("m_EditorVersion: "))
                }) {
                    // Unity's version metadata is specific evidence, unlike a bare Assets directory.
                    self.add("unity", path, "Found Unity Editor version metadata.");
                }
            }
            _ => {
                for (prefix, id) in [
                    ("vite.config.", "vite"),
                    ("next.config.", "next"),
                    ("nuxt.config.", "nuxt"),
                    ("svelte.config.", "svelte"),
                    ("astro.config.", "astro"),
                    ("vue.config.", "vue"),
                ] {
                    if name.strip_prefix(prefix).is_some_and(|suffix| {
                        ["js", "ts", "mjs", "cjs", "mts", "cts"].contains(&suffix)
                    }) {
                        self.found(id, path);
                    }
                }
            }
        }
        let extension = file
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        let id = match extension {
            "ts" | "tsx" | "mts" | "cts" if !name.ends_with(".d.ts") => Some("typescript"),
            "js" | "jsx" | "mjs" | "cjs" => Some("javascript"),
            "py" => Some("python"),
            "rs" => Some("rust"),
            "cs" => Some("csharp"),
            "html" | "htm" => Some("html"),
            "css" => Some("css"),
            "scss" | "sass" => Some("sass"),
            "vue" => Some("vue"),
            "svelte" => Some("svelte"),
            "go" => Some("go"),
            "java" => Some("java"),
            "kt" | "kts" => Some("kotlin"),
            "swift" => Some("swift"),
            "dart" => Some("dart"),
            "rb" => Some("ruby"),
            "php" => Some("php"),
            "csproj" => {
                self.found("dotnet", path);
                Some("csharp")
            }
            "fsproj" | "vbproj" | "sln" | "slnx" => Some("dotnet"),
            _ => None,
        };
        if let Some(id) = id {
            self.found(id, path);
        }
        if path.contains(".github/workflows/") && ["yml", "yaml"].contains(&extension) {
            self.add(
                "github-actions",
                path,
                "Found a GitHub Actions workflow file.",
            );
        }
    }
}

// Remove JSONC comments and trailing commas without altering quoted strings.
fn jsonc(text: &str) -> String {
    let mut output = String::new();
    let mut chars = text.chars().peekable();
    let (mut quoted, mut escaped) = (false, false);
    while let Some(c) = chars.next() {
        if quoted {
            output.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                quoted = false;
            }
        } else if c == '"' {
            quoted = true;
            output.push(c);
        } else if c == '/' && chars.peek() == Some(&'/') {
            for c in chars.by_ref() {
                if c == '\n' {
                    break;
                }
            }
            output.push('\n');
        } else if c == '/' && chars.peek() == Some(&'*') {
            chars.next();
            let mut closed = false;
            while let Some(c) = chars.next() {
                if c == '*' && chars.peek() == Some(&'/') {
                    chars.next();
                    closed = true;
                    break;
                }
            }
            if !closed {
                return String::new();
            }
            output.push(' ');
        } else {
            output.push(c);
        }
    }
    let mut result = String::new();
    let mut chars = output.chars().peekable();
    quoted = false;
    escaped = false;
    while let Some(c) = chars.next() {
        if !quoted
            && c == ','
            && chars
                .clone()
                .find(|c| !c.is_whitespace())
                .is_some_and(|c| c == '}' || c == ']')
        {
            continue;
        }
        result.push(c);
        if escaped {
            escaped = false;
        } else if quoted && c == '\\' {
            escaped = true;
        } else if c == '"' {
            quoted = !quoted;
        }
    }
    result
}

fn linked(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // Includes junctions and other reparse points.
        if metadata.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    false
}
fn skip(name: &str) -> bool {
    (name.starts_with('.') && name != ".github")
        || [
            "node_modules",
            "vendor",
            "venv",
            "env",
            "__pycache__",
            "target",
            "dist",
            "build",
            "generated",
            "gen",
            "out",
            "coverage",
            "bin",
            "obj",
            "packages-cache",
            "bower_components",
            "Pods",
            "DerivedData",
            "Library",
            "Temp",
            "Logs",
            "UserSettings",
            "artifacts",
            "test-results",
            "playwright-report",
        ]
        .iter()
        .any(|excluded| name.eq_ignore_ascii_case(excluded))
}
fn relative(root: &Path, path: &Path) -> Option<String> {
    let path = path.strip_prefix(root).ok()?;
    let parts: Option<Vec<_>> = path.iter().map(|part| part.to_str()).collect();
    let text = parts?.join("/");
    (text.len() <= 320
        && !text.chars().any(|c| {
            c.is_control()
                || [
                    '\\', ':', '\u{202a}', '\u{202b}', '\u{202d}', '\u{202e}', '\u{202c}',
                    '\u{2066}', '\u{2067}', '\u{2068}', '\u{2069}',
                ]
                .contains(&c)
        }))
    .then_some(text)
}
pub(crate) fn scan(directory: &Path) -> Result<Report, AppError> {
    let root = handoff::existing_project_folder(directory.to_str().unwrap_or_default())?;
    let started = Instant::now();
    let mut scan = Scan::default();
    let mut queue = VecDeque::from([(root.clone(), 0)]);
    let (mut entries, mut directories) = (0, 1);
    'scan: while let Some((directory, depth)) = queue.pop_front() {
        // Recheck scope and links immediately before traversing, including queued directories.
        if !fs::symlink_metadata(&directory).is_ok_and(|metadata| !linked(&metadata))
            || !directory
                .canonicalize()
                .is_ok_and(|path| path.starts_with(&root))
        {
            scan.unreadable = true;
            continue;
        }
        let listing = match fs::read_dir(&directory) {
            Ok(listing) => listing,
            Err(_) if directory == root => {
                return Err(AppError::new(
                    "Could not inspect this project folder.",
                    "Check folder access and try again. Project settings are unchanged.",
                ))
            }
            Err(_) => {
                scan.unreadable = true;
                continue;
            }
        };
        // Bounded collection permits stable ordering without collecting an enormous directory.
        let mut children = Vec::new();
        for entry in listing {
            entries += 1;
            if entries > MAX_ENTRIES || started.elapsed() > Duration::from_secs(3) {
                scan.limited = true;
                break;
            }
            match entry {
                Ok(entry) => children.push(entry),
                Err(_) => scan.unreadable = true,
            }
        }
        children.sort_by_key(|entry| entry.file_name());
        for entry in children {
            if started.elapsed() > Duration::from_secs(3) {
                scan.limited = true;
                break 'scan;
            }
            let file = entry.path();
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if skip(&name) {
                continue;
            }
            let Ok(metadata) = fs::symlink_metadata(&file) else {
                scan.unreadable = true;
                continue;
            };
            if linked(&metadata) {
                continue;
            }
            let Some(path) = relative(&root, &file) else {
                continue;
            };
            if !file
                .canonicalize()
                .is_ok_and(|path| path.starts_with(&root))
            {
                scan.unreadable = true;
                continue;
            }
            if metadata.is_dir() {
                if depth < MAX_DEPTH && directories < MAX_DIRECTORIES {
                    directories += 1;
                    queue.push_back((file, depth + 1));
                } else {
                    scan.limited = true;
                }
            } else if metadata.is_file() {
                scan.inspect(&file, &path, &name);
            }
        }
        if entries > MAX_ENTRIES {
            break;
        }
    }
    let suggestions = technologies::catalog()
        .iter()
        .filter_map(|technology| {
            scan.evidence
                .remove(technology.id.as_str())
                .map(|evidence| Suggestion {
                    id: technology.id.clone(),
                    name: technology.name.clone(),
                    evidence,
                })
        })
        .collect();
    let mut notices = Vec::new();
    if scan.limited {
        notices.push("Scan limits reached. Some deep, large or additional files were skipped.");
    }
    if scan.unreadable {
        notices.push("Some files could not be read or parsed. Suggestions may be incomplete.");
    }
    Ok(Report {
        suggestions,
        notices,
    })
}

#[tauri::command(async)]
pub fn detect_project_technologies(id: String, app: tauri::AppHandle) -> Result<Report, AppError> {
    let project = handoff::find_project(&app, &id)?;
    scan(&workspace::project_directory(&project)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn write(root: &Path, path: &str, content: &str) {
        let file = root.join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, content).unwrap();
    }
    fn ids(report: &Report) -> Vec<&str> {
        report
            .suggestions
            .iter()
            .map(|item| item.id.as_str())
            .collect()
    }
    #[test]
    fn mixed_monorepo_uses_real_catalogue_and_deduplicated_relative_evidence() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        write(
            root,
            "apps/web/package.json",
            r#"{"dependencies":{"react":"19","vite":"8"},"devDependencies":{"typescript":"7"},"engines":{"node":">=22"}}"#,
        );
        write(root, "apps/web/src/main.tsx", "export const app = 1;");
        write(root, "apps/web/src/theme.css", "body {}");
        write(root, "apps/web/index.html", "<!doctype html>");
        write(
            root,
            "native/Cargo.toml",
            "[package]\nname='sample'\nversion='0.1.0'\n[dependencies]\ntauri='2'",
        );
        write(root, "native/tauri.conf.json", "{}");
        write(
            root,
            "api/pyproject.toml",
            "[project]\nname='sample'\ndependencies=['fastapi>=0.1', 'Django[extra]>=5']",
        );
        write(
            root,
            "worker/wrangler.jsonc",
            "{// comment\n\"main\":\"src/index.ts\",}",
        );
        let report = scan(root).unwrap();
        for id in [
            "typescript",
            "react",
            "vite",
            "node",
            "rust",
            "tauri",
            "python",
            "fastapi",
            "django",
            "html",
            "css",
            "cloudflare-workers",
        ] {
            assert!(ids(&report).contains(&id), "missing {id}: {report:?}");
        }
        assert!(!ids(&report).contains(&"javascript"));
        assert!(report.notices.is_empty());
        for suggestion in &report.suggestions {
            assert_eq!(
                suggestion.name,
                technologies::catalog()
                    .iter()
                    .find(|item| item.id == suggestion.id)
                    .unwrap()
                    .name
            );
            assert!((1..=MAX_EVIDENCE).contains(&suggestion.evidence.len()));
            for evidence in &suggestion.evidence {
                assert!(root.join(&evidence.path).is_file());
                assert!(!evidence.path.contains('\\'));
                assert!(!Path::new(&evidence.path).is_absolute());
            }
        }
        let react = report
            .suggestions
            .iter()
            .find(|item| item.id == "react")
            .unwrap();
        assert_eq!(
            react.evidence[0].description,
            "Declared react in dependencies."
        );
        assert_eq!(react.evidence[0].path, "apps/web/package.json");
    }
    #[test]
    fn frameworks_never_imply_related_stack_or_node_runtime() {
        for (package, id) in [
            ("react", "react"),
            ("next", "next"),
            ("vue", "vue"),
            ("svelte", "svelte"),
            ("@angular/core", "angular"),
        ] {
            let temp = tempfile::tempdir().unwrap();
            write(
                temp.path(),
                "package.json",
                &serde_json::json!({"dependencies":{package:"1"}}).to_string(),
            );
            assert_eq!(ids(&scan(temp.path()).unwrap()), [id]);
        }
        let temp = tempfile::tempdir().unwrap();
        write(
            temp.path(),
            "package.json",
            r#"{"name":"plain-package","description":"react vite typescript","scripts":{"start":"bun index.ts"}}"#,
        );
        assert!(scan(temp.path()).unwrap().suggestions.is_empty());
    }
    #[test]
    fn ignores_vendor_generated_hidden_and_overdeep_evidence() {
        let temp = tempfile::tempdir().unwrap();
        for excluded in [
            ".git",
            "node_modules",
            ".venv",
            ".next",
            "vendor",
            "target",
            "dist",
            "build",
            "Library",
            "__pycache__",
            ".cache",
            "bin",
            "obj",
        ] {
            write(temp.path(), &format!("{excluded}/source.py"), "");
        }
        write(temp.path(), "a/b/c/d/e/f/ignored.py", "");
        let report = scan(temp.path()).unwrap();
        assert!(report.suggestions.is_empty());
        assert!(!report.notices.is_empty());
    }
    #[test]
    fn malformed_oversized_and_secret_content_is_not_returned() {
        let temp = tempfile::tempdir().unwrap();
        write(temp.path(), "package.json", "{broken");
        write(temp.path(), "Cargo.toml", "[broken");
        write(
            temp.path(),
            "pyproject.toml",
            &" ".repeat(MAX_FILE_BYTES + 1),
        );
        write(temp.path(), ".env", "SECRET=private-marker");
        let report = scan(temp.path()).unwrap();
        assert!(report.suggestions.is_empty());
        assert_eq!(report.notices.len(), 2);
        write(
            temp.path(),
            "package.json",
            r#"{"dependencies":{"react":"https://secret:password@example.test/"},"scripts":{"postinstall":"touch marker"}}"#,
        );
        let report = scan(temp.path()).unwrap();
        let serialized = serde_json::to_string(&report).unwrap();
        assert!(serialized.contains("react"));
        assert!(!serialized.contains("password"));
        assert!(!serialized.contains("private-marker"));
        assert!(!serialized.contains(&temp.path().display().to_string()));
        assert!(!temp.path().join("marker").exists());
    }
    #[test]
    fn rescans_reflect_changes_without_writing_or_executing_project_files() {
        let temp = tempfile::tempdir().unwrap();
        write(
            temp.path(),
            "package.json",
            r#"{"dependencies":{"react":"1"},"scripts":{"preinstall":"touch marker","postinstall":"touch marker","start":"node marker.js"}}"#,
        );
        write(
            temp.path(),
            "marker.js",
            "require('fs').writeFileSync('marker', 'ran')",
        );
        write(temp.path(), ".git/hooks/pre-commit", "touch marker");
        let original = fs::read(temp.path().join("package.json")).unwrap();
        assert!(ids(&scan(temp.path()).unwrap()).contains(&"react"));
        assert_eq!(
            original,
            fs::read(temp.path().join("package.json")).unwrap()
        );
        assert!(!temp.path().join("marker").exists());
        fs::remove_file(temp.path().join("package.json")).unwrap();
        assert!(!ids(&scan(temp.path()).unwrap()).contains(&"react"));
        // Keep this boundary free of execution and network clients.
        let implementation = include_str!("technology_detection.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap();
        for forbidden in [
            "SystemRunner",
            "Command::new",
            "std::process",
            "reqwest",
            "update_project",
            "write_history",
        ] {
            assert!(!implementation.contains(forbidden));
        }
    }
    #[test]
    fn native_games_and_dotnet_have_specific_evidence() {
        let temp = tempfile::tempdir().unwrap();
        write(
            temp.path(),
            "unity/ProjectSettings/ProjectVersion.txt",
            "m_EditorVersion: 6000.1.0f1",
        );
        write(temp.path(), "godot/project.godot", "config_version=5");
        write(
            temp.path(),
            "dotnet/Sample.csproj",
            "<Project Sdk=\"Microsoft.NET.Sdk\" />",
        );
        assert_eq!(
            ids(&scan(temp.path()).unwrap()),
            ["csharp", "dotnet", "unity", "godot"]
        );
    }
    #[test]
    fn cloudflare_pages_and_empty_workers_config_do_not_imply_workers() {
        let temp = tempfile::tempdir().unwrap();
        write(
            temp.path(),
            "wrangler.toml",
            "pages_build_output_dir = 'dist'",
        );
        assert_eq!(ids(&scan(temp.path()).unwrap()), ["cloudflare-pages"]);
        write(temp.path(), "wrangler.toml", "name='empty'");
        assert!(scan(temp.path()).unwrap().suggestions.is_empty());
        assert_eq!(
            jsonc(r#"{"url":"https://example.test/a,//b", /* comment */ "x":[1,],}"#),
            r#"{"url":"https://example.test/a,//b",   "x":[1]}"#
        );
    }
    #[test]
    fn empty_missing_and_entry_budget_are_bounded() {
        let temp = tempfile::tempdir().unwrap();
        assert!(scan(temp.path()).unwrap().suggestions.is_empty());
        assert!(scan(&temp.path().join("missing")).is_err());
        for index in 0..MAX_ENTRIES + 1 {
            write(temp.path(), &format!("file-{index}.txt"), "");
        }
        assert!(!scan(temp.path()).unwrap().notices.is_empty());
    }
    #[cfg(unix)]
    #[test]
    fn external_internal_and_cyclic_symlinks_are_skipped() {
        let temp = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        write(
            outside.path(),
            "package.json",
            r#"{"dependencies":{"react":"1"}}"#,
        );
        std::os::unix::fs::symlink(outside.path(), temp.path().join("external")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("package.json"),
            temp.path().join("package.json"),
        )
        .unwrap();
        std::os::unix::fs::symlink(temp.path(), temp.path().join("cycle")).unwrap();
        assert!(scan(temp.path()).unwrap().suggestions.is_empty());
    }
    #[cfg(unix)]
    #[test]
    fn unreadable_files_leave_other_evidence_available() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        write(temp.path(), "package.json", "{}");
        write(temp.path(), "source.py", "");
        fs::set_permissions(
            temp.path().join("package.json"),
            fs::Permissions::from_mode(0o000),
        )
        .unwrap();
        let report = scan(temp.path()).unwrap();
        assert!(ids(&report).contains(&"python"));
        if fs::File::open(temp.path().join("package.json")).is_err() {
            assert!(!report.notices.is_empty());
        }
    }
}
