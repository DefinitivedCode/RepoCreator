//! The updater owns its network, download and installation state independently of Git operations.
use crate::{lock_error, model::AppError, preferences::Preferences, Runtime};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};
use tauri::{ipc::Channel, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::{Mutex, Notify};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
    #[default]
    Stable,
    Beta,
}
impl UpdateChannel {
    fn endpoint(self) -> &'static str {
        match self {
            Self::Stable => "https://raw.githubusercontent.com/DefinitivedCode/RepoCreator/update-feeds/stable.json",
            Self::Beta => "https://raw.githubusercontent.com/DefinitivedCode/RepoCreator/update-feeds/beta.json",
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdatePreferences {
    pub channel: UpdateChannel,
    pub automatic: bool,
}
impl Default for UpdatePreferences {
    fn default() -> Self {
        Self {
            channel: UpdateChannel::Stable,
            automatic: true,
        }
    }
}
#[derive(Default)]
struct PendingUpdate {
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
}
#[derive(Default)]
pub struct UpdateManager {
    pending: Mutex<PendingUpdate>,
    cancel: Notify,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current_version: &'static str,
    configured: bool,
    unavailable_reason: Option<&'static str>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    version: String,
    notes: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}
fn public_key() -> Option<&'static str> {
    option_env!("REPO_CREATOR_UPDATER_PUBLIC_KEY")
        .map(str::trim)
        .filter(|key| !key.is_empty())
}
fn unavailable_reason() -> Option<&'static str> {
    if public_key().is_none() {
        return Some("Updates are not configured in this development build.");
    }
    if cfg!(windows) && tauri::utils::platform::bundle_type().is_none() {
        return Some("In-app updates require the Windows NSIS or MSI installation. Portable copies can be replaced manually.");
    }
    None
}
fn error(message: &str) -> AppError {
    AppError::new(
        message,
        "Your settings and projects are unchanged. You can retry in Settings → Updates.",
    )
}
fn busy() -> AppError {
    error("Another update operation is in progress. Wait for it to finish.")
}
fn eligible(current: &Version, candidate: &Version, channel: UpdateChannel) -> bool {
    candidate.cmp_precedence(current).is_gt()
        && (channel == UpdateChannel::Beta || candidate.pre.is_empty())
}
fn update_error(failure: tauri_plugin_updater::Error) -> AppError {
    // Do not send network internals, local paths or key material to the WebView.
    match failure {
        tauri_plugin_updater::Error::Minisign(_)
        | tauri_plugin_updater::Error::SignedVersionMismatch { .. }
        | tauri_plugin_updater::Error::MissingSignedVersion => error("Update signature verification failed. The update was not installed."),
        _ => error("The update service or package could not be verified or reached. Check your connection and try again."),
    }
}
#[tauri::command]
pub fn get_update_info() -> UpdateInfo {
    UpdateInfo {
        current_version: env!("CARGO_PKG_VERSION"),
        configured: unavailable_reason().is_none(),
        unavailable_reason: unavailable_reason(),
    }
}
#[tauri::command]
pub async fn set_update_preferences(
    updates: UpdatePreferences,
    manager: State<'_, UpdateManager>,
    runtime: State<'_, Arc<Runtime>>,
) -> Result<Preferences, AppError> {
    let mut pending = manager.pending.try_lock().map_err(|_| busy())?;
    let mut session = runtime.session.lock().map_err(|_| lock_error())?;
    let mut preferences = session.preferences.clone();
    preferences.updates = updates;
    preferences
        .save(&session.preference_file)
        .map_err(|message| error(&message))?;
    // A channel change invalidates both the offer and any downloaded package.
    if preferences.updates.channel != session.preferences.updates.channel {
        *pending = PendingUpdate::default();
    }
    session.preferences = preferences.clone();
    Ok(preferences)
}
#[tauri::command]
pub async fn check_for_updates(
    app: tauri::AppHandle,
    manager: State<'_, UpdateManager>,
    runtime: State<'_, Arc<Runtime>>,
) -> Result<Option<AvailableUpdate>, AppError> {
    let mut pending = manager.pending.try_lock().map_err(|_| busy())?;
    *pending = PendingUpdate::default();
    if let Some(reason) = unavailable_reason() {
        return Err(error(reason));
    }
    let channel = runtime
        .session
        .lock()
        .map_err(|_| lock_error())?
        .preferences
        .updates
        .channel;
    let key = public_key()
        .ok_or_else(|| error("Updates are not configured in this development build."))?;
    let cleanup_app = app.clone();
    let updater = app
        .updater_builder()
        .pubkey(key)
        .endpoints(vec![channel
            .endpoint()
            .parse()
            .map_err(|_| error("The update endpoint is invalid."))?])
        .map_err(update_error)?
        .version_comparator(move |current, release| eligible(&current, &release.version, channel))
        .timeout(Duration::from_secs(30))
        .configure_client(|client| client.https_only(true))
        .on_before_exit(move || {
            // Windows runs this hook BEFORE attempting to launch the installer.
            // Keep the window and command runner usable if launch fails/cancels.
            // On successful launch the plugin exits; owned Windows process jobs
            // stop their children when the parent process closes its handles.
            crate::desktop::remember_window(&cleanup_app);
        })
        .restart_after_install(true)
        .build()
        .map_err(update_error)?;
    let update = updater.check().await.map_err(update_error)?;
    let result = update.as_ref().map(|update| AvailableUpdate {
        version: update.version.clone(),
        notes: update
            .body
            .clone()
            .unwrap_or_else(|| "No release notes were provided.".into()),
    });
    if let Some(update) = &update {
        if update.download_url.scheme() != "https" {
            return Err(error("The update download URL is not secure."));
        }
    }
    pending.update = update;
    Ok(result)
}
#[tauri::command]
pub async fn download_update(
    on_progress: Channel<DownloadProgress>,
    manager: State<'_, UpdateManager>,
) -> Result<bool, AppError> {
    let mut pending = manager.pending.try_lock().map_err(|_| busy())?;
    pending.bytes = None;
    let mut update = pending
        .update
        .as_ref()
        .ok_or_else(|| error("Check for an update before downloading."))?
        .clone();
    update.timeout = Some(Duration::from_secs(15 * 60));
    let cancelled = manager.cancel.notified();
    tokio::pin!(cancelled);
    cancelled.as_mut().enable();
    let mut downloaded = 0;
    let bytes = tokio::select! {
        biased;
        _ = &mut cancelled => return Ok(false),
        result = update.download(|length, total| {
            downloaded += length as u64;
            let _ = on_progress.send(DownloadProgress { downloaded, total });
        }, || {}) => result.map_err(update_error)?,
    };
    // The plugin verifies the signature before returning these bytes. Nothing is installed yet.
    pending.bytes = Some(bytes);
    Ok(true)
}
#[tauri::command]
pub fn cancel_update_download(manager: State<'_, UpdateManager>) {
    // Dropping the download future stops the request; partial bytes are never persisted.
    manager.cancel.notify_waiters();
}
#[tauri::command]
pub async fn install_update(
    app: tauri::AppHandle,
    manager: State<'_, UpdateManager>,
    runtime: State<'_, Arc<Runtime>>,
) -> Result<(), AppError> {
    let mut pending = manager.pending.try_lock().map_err(|_| busy())?;
    let _repository_guard = crate::acquire(runtime.inner())?;
    let update = pending
        .update
        .as_ref()
        .ok_or_else(|| error("Check for an update before installing."))?;
    let current = Version::parse(env!("CARGO_PKG_VERSION")).map_err(|_| lock_error())?;
    let version =
        Version::parse(&update.version).map_err(|_| error("The update version is invalid."))?;
    let channel = runtime
        .session
        .lock()
        .map_err(|_| lock_error())?
        .preferences
        .updates
        .channel;
    if !eligible(&current, &version, channel) {
        return Err(error(
            "This version is not a newer eligible update. Check again.",
        ));
    }
    let bytes = pending
        .bytes
        .as_ref()
        .ok_or_else(|| error("Download and verify the update before installing."))?;
    // This command is called only by the explicit Update and Restart action.
    // install() verifies again and launches the installer/exits on Windows.
    update.install(bytes).map_err(update_error)?;
    pending.bytes = None;
    app.state::<Arc<crate::command_runner::CommandRunner>>()
        .shutdown();
    crate::desktop::remember_window(&app);
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn update_operations_are_exclusive_and_cancellation_does_not_install() {
        let manager = UpdateManager::default();
        let operation = manager.pending.try_lock().unwrap();
        assert!(manager.pending.try_lock().is_err());
        drop(operation);
        assert!(manager.pending.try_lock().is_ok());
        tauri::async_runtime::block_on(async {
            let cancelled = manager.cancel.notified();
            tokio::pin!(cancelled);
            cancelled.as_mut().enable();
            manager.cancel.notify_waiters();
            cancelled.await;
            assert!(manager.pending.try_lock().unwrap().bytes.is_none());
        });
    }
    #[test]
    fn channels_only_offer_newer_semver_precedence() {
        for (current, candidate, stable, beta) in [
            ("1.4.1", "1.4.2", true, true),
            ("1.4.1", "1.5.0-beta.1", false, true),
            ("1.5.0-beta.2", "1.5.0-beta.1", false, false),
            ("1.5.0-beta.2", "1.4.9", false, false),
            ("1.5.0-beta.2", "1.5.0", true, true),
            ("1.4.1", "1.4.1", false, false),
            ("1.4.1+build.1", "1.4.1+build.2", false, false),
        ] {
            let current = Version::parse(current).unwrap();
            let candidate = Version::parse(candidate).unwrap();
            assert_eq!(
                eligible(&current, &candidate, UpdateChannel::Stable),
                stable
            );
            assert_eq!(eligible(&current, &candidate, UpdateChannel::Beta), beta);
        }
    }
    #[test]
    fn preferences_migrate_and_persist_without_losing_project_settings() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("preferences.json");
        let mut preferences = Preferences::new(directory.path().into());
        let mut legacy = serde_json::to_value(&preferences).unwrap();
        legacy.as_object_mut().unwrap().remove("updates");
        std::fs::write(&file, legacy.to_string()).unwrap();
        preferences = Preferences::load(&file, directory.path().into());
        assert_eq!(preferences.updates.channel, UpdateChannel::Stable);
        assert!(preferences.updates.automatic);
        preferences.updates = UpdatePreferences {
            channel: UpdateChannel::Beta,
            automatic: false,
        };
        preferences.save(&file).unwrap();
        let loaded = Preferences::load(&file, directory.path().into());
        assert_eq!(loaded.updates.channel, UpdateChannel::Beta);
        assert!(!loaded.updates.automatic);
        assert_eq!(
            serde_json::to_value(loaded.defaults).unwrap(),
            serde_json::to_value(preferences.defaults).unwrap()
        );
        assert_eq!(loaded.parent_path, preferences.parent_path);
    }
}
