fn main() {
    println!("cargo:rerun-if-env-changed=REPO_CREATOR_UPDATER_PUBLIC_KEY");
    tauri_build::build()
}
