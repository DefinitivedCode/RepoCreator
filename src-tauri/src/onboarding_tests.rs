use crate::preferences::{Onboarding, Preferences, ONBOARDING_VERSION};
use std::fs;

#[test]
fn onboarding_is_incomplete_by_default_and_round_trips() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("preferences.json");
    let mut preferences = Preferences::new(temp.path().into());
    assert_eq!(preferences.onboarding, Onboarding::default());
    assert!(preferences.onboarding.completed_at.is_none());
    preferences.onboarding.complete();
    preferences.onboarding.github_skipped = true;
    preferences.save(&file).unwrap();
    let text = fs::read_to_string(&file).unwrap();
    assert!(text.contains("\"onboarding\"") && text.contains("\"githubSkipped\": true"));
    let loaded = Preferences::load(&file, temp.path().into());
    assert!(loaded.onboarding.completed_at.is_some());
    assert!(loaded.onboarding.github_skipped);
    assert_eq!(loaded.onboarding.version, ONBOARDING_VERSION);
    assert!(loaded.recovery_notice.is_none() && !loaded.needs_backup);
}

#[test]
fn older_settings_load_unchanged_without_onboarding() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("preferences.json");
    fs::write(
        &file,
        serde_json::json!({"schemaVersion": 5, "appearance": "dark"}).to_string(),
    )
    .unwrap();
    let loaded = Preferences::load(&file, temp.path().into());
    assert_eq!(loaded.onboarding, Onboarding::default());
    assert!(loaded.recovery_notice.is_none() && !loaded.needs_backup && !loaded.future_version);
}

#[test]
fn reset_clears_only_the_completion_marker() {
    let mut onboarding = Onboarding::default();
    onboarding.complete();
    onboarding.github_skipped = true;
    onboarding.reset();
    assert!(onboarding.completed_at.is_none());
    assert!(onboarding.github_skipped, "skipping GitHub is remembered");
    assert_eq!(onboarding.version, ONBOARDING_VERSION);
}

#[test]
fn damaged_onboarding_recovers_with_the_usual_backup() {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("preferences.json");
    let original = serde_json::json!({
        "schemaVersion": 5,
        "onboarding": {"completedAt": 7, "unknownField": true}
    })
    .to_string();
    fs::write(&file, &original).unwrap();
    let loaded = Preferences::load(&file, temp.path().into());
    assert_eq!(loaded.onboarding, Onboarding::default());
    assert!(loaded.needs_backup && loaded.recovery_notice.is_some());
    loaded.save(&file).unwrap();
    assert_eq!(
        fs::read_to_string(temp.path().join("preferences.json.bak")).unwrap(),
        original
    );
}
