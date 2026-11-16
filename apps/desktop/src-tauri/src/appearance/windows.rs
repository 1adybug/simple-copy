use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use windows::{
    Foundation::TypedEventHandler,
    UI::ViewManagement::{AccessibilitySettings, UIColorType, UISettings},
    core::IInspectable,
};

use super::Appearance;

#[derive(Default)]
struct AppearanceState(Mutex<Context>);

#[derive(Default)]
struct Context {
    revision: u64,
    monitor: Option<Monitor>,
    windows: HashMap<String, Appearance>,
}

struct Monitor {
    colors: UISettings,
    accessibility: Option<AccessibilitySettings>,
    color_token: Option<i64>,
    contrast_token: Option<i64>,
}

impl Monitor {
    fn new(on_change: impl Fn() + Send + Sync + 'static) -> windows::core::Result<Self> {
        let mut monitor = Self {
            colors: UISettings::new()?,
            accessibility: AccessibilitySettings::new().ok(),
            color_token: None,
            contrast_token: None,
        };
        let on_change = Arc::new(on_change);
        let update = on_change.clone();
        let changed = TypedEventHandler::<UISettings, IInspectable>::new(move |_, _| {
            update();
            Ok(())
        });
        // Some desktop Windows versions expose HighContrast but reject its event with
        // ERROR_NOT_FOUND. Optional subscriptions must not discard readable system settings
        // or the other active listeners. ColorValuesChanged also refreshes contrast state.
        monitor.color_token = monitor.colors.ColorValuesChanged(&changed).ok();
        if let Some(accessibility) = &monitor.accessibility {
            monitor.contrast_token = accessibility
                .HighContrastChanged(&TypedEventHandler::new(move |_, _| {
                    on_change();
                    Ok(())
                }))
                .ok();
        }
        Ok(monitor)
    }
}

impl Drop for Monitor {
    fn drop(&mut self) {
        if let Some(token) = self.color_token {
            let _ = self.colors.RemoveColorValuesChanged(token);
        }
        if let (Some(accessibility), Some(token)) = (&self.accessibility, self.contrast_token) {
            let _ = accessibility.RemoveHighContrastChanged(token);
        }
    }
}

pub(super) fn initialize(app: &AppHandle) {
    app.manage(AppearanceState::default());
    let handle = app.clone();
    // WinRT delivers changes on worker threads; publish appearance on the UI loop.
    let monitor = Monitor::new(move || super::refresh(&handle)).ok();
    app.state::<AppearanceState>()
        .0
        .lock()
        .expect("appearance lock")
        .monitor = monitor;
}

pub(super) fn stop(app: &AppHandle) {
    // Revoke callbacks before dropping the AppHandle references they retain.
    let monitor = app
        .state::<AppearanceState>()
        .0
        .lock()
        .expect("appearance lock")
        .monitor
        .take();
    drop(monitor);
}

pub(super) fn forget_window(app: &AppHandle, label: &str) {
    // A recreated WebView must receive a fresh appearance snapshot.
    let state = app.state::<AppearanceState>();
    let mut context = state.0.lock().expect("appearance lock");
    context.windows.remove(label);
}

pub(super) fn snapshot(window: &WebviewWindow) -> Appearance {
    window
        .state::<AppearanceState>()
        .0
        .lock()
        .expect("appearance lock")
        .windows
        .get(window.label())
        .cloned()
        .unwrap_or_default()
}

pub(super) fn refresh(app: &AppHandle) {
    let state = app.state::<AppearanceState>();
    let (revision, accent_color) = {
        let mut context = state.0.lock().expect("appearance lock");
        context.revision += 1;
        let monitor = context.monitor.as_ref();
        let high_contrast = monitor
            .and_then(|monitor| monitor.accessibility.as_ref())
            .and_then(|accessibility| accessibility.HighContrast().ok())
            .unwrap_or(true);
        let accent = monitor
            .and_then(|monitor| monitor.colors.GetColorValue(UIColorType::Accent).ok())
            .filter(|_| !high_contrast)
            .map(|color| [color.R, color.G, color.B]);
        (context.revision, accent)
    };
    for (label, window) in app.webview_windows() {
        if !matches!(label.as_str(), "history" | "settings") {
            continue;
        }
        let appearance = Appearance {
            revision,
            accent_color,
            // The shared UI draws an opaque frosted texture. Native desktop backdrops
            // add live composition work and can paint outside the custom window corners.
            transparency: false,
        };
        state
            .0
            .lock()
            .expect("appearance lock")
            .windows
            .insert(label, appearance.clone());
        let _ = window.emit("system-appearance-changed", appearance);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn optional_accessibility_events_do_not_disable_system_colors() {
        let monitor = Monitor::new(|| {}).expect("Windows system appearance is readable");
        assert!(monitor.colors.GetColorValue(UIColorType::Accent).is_ok());
        assert!(monitor.color_token.is_some());
    }
}
