use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};

use crate::model::ThemeMode;

#[cfg(windows)]
mod windows;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    pub revision: u64,
    pub accent_color: Option<[u8; 3]>,
    pub transparency: bool,
}

pub fn initialize(_app: &AppHandle) {
    #[cfg(windows)]
    windows::initialize(_app);
}

pub fn stop(_app: &AppHandle) {
    #[cfg(windows)]
    windows::stop(_app);
}

pub fn forget_window(_app: &AppHandle, _label: &str) {
    #[cfg(windows)]
    windows::forget_window(_app, _label);
}

pub fn refresh(_app: &AppHandle) {
    #[cfg(windows)]
    {
        let app = _app.clone();
        let _ = _app.run_on_main_thread(move || windows::refresh(&app));
    }
}

pub fn apply_theme(app: &AppHandle, mode: ThemeMode) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        handle.set_theme(match mode {
            ThemeMode::System => None,
            ThemeMode::Light => Some(tauri::Theme::Light),
            ThemeMode::Dark => Some(tauri::Theme::Dark),
        });
        #[cfg(windows)]
        windows::apply_theme(&handle, mode);
    });
}

pub fn snapshot(_window: &WebviewWindow) -> Appearance {
    #[cfg(windows)]
    return windows::snapshot(_window);
    #[cfg(not(windows))]
    Appearance::default()
}
