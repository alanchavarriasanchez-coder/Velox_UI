#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
	veloxui_lib::run();
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
