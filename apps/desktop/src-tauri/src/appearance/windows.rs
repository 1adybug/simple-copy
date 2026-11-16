use std::{collections::HashMap, sync::Mutex};

use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use windows::{
    Foundation::TypedEventHandler,
    UI::ViewManagement::{AccessibilitySettings, UIColorType, UISettings},
    core::IInspectable,
};

use super::Appearance;
use crate::model::ThemeMode;

#[derive(Default)]
struct AppearanceState(Mutex<Context>);

#[derive(Default)]
struct Context {
    mode: ThemeMode,
    revision: u64,
    monitor: Option<Monitor>,
    windows: HashMap<String, Appearance>,
}

struct Monitor {
    colors: UISettings,
    accessibility: AccessibilitySettings,
    color_token: Option<i64>,
    effects_token: Option<i64>,
    contrast_token: Option<i64>,
}

impl Monitor {
    fn new(app: &AppHandle) -> windows::core::Result<Self> {
        let mut monitor = Self {
            colors: UISettings::new()?,
            accessibility: AccessibilitySettings::new()?,
            color_token: None,
            effects_token: None,
            contrast_token: None,
        };
        let handle = app.clone();
        let changed = TypedEventHandler::<UISettings, IInspectable>::new(move |_, _| {
            // WinRT delivers these events on a worker thread. Window effects belong to the UI loop.
            super::refresh(&handle);
            Ok(())
        });
        monitor.color_token = Some(monitor.colors.ColorValuesChanged(&changed)?);
        monitor.effects_token = Some(monitor.colors.AdvancedEffectsEnabledChanged(&changed)?);
        let handle = app.clone();
        monitor.contrast_token = Some(monitor.accessibility.HighContrastChanged(
            &TypedEventHandler::<AccessibilitySettings, IInspectable>::new(move |_, _| {
                super::refresh(&handle);
                Ok(())
            }),
        )?);
        Ok(monitor)
    }
}

impl Drop for Monitor {
    fn drop(&mut self) {
        if let Some(token) = self.color_token {
            let _ = self.colors.RemoveColorValuesChanged(token);
        }
        if let Some(token) = self.effects_token {
            let _ = self.colors.RemoveAdvancedEffectsEnabledChanged(token);
        }
        if let Some(token) = self.contrast_token {
            let _ = self.accessibility.RemoveHighContrastChanged(token);
        }
    }
}

pub(super) fn initialize(app: &AppHandle) {
    app.manage(AppearanceState::default());
    let monitor = Monitor::new(app).ok();
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

pub(super) fn apply_theme(app: &AppHandle, mode: ThemeMode) {
    app.state::<AppearanceState>()
        .0
        .lock()
        .expect("appearance lock")
        .mode = mode;
    refresh(app);
}

pub(super) fn forget_window(app: &AppHandle, label: &str) {
    // A recreated WebView must not inherit a successful material result from its old HWND.
    app.state::<AppearanceState>()
        .0
        .lock()
        .expect("appearance lock")
        .windows
        .remove(label);
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
    let (revision, accent_color, effects, tint) = {
        let mut context = state.0.lock().expect("appearance lock");
        context.revision += 1;
        let monitor = context.monitor.as_ref();
        let high_contrast = monitor
            .and_then(|monitor| monitor.accessibility.HighContrast().ok())
            .unwrap_or(true);
        let color = |kind| monitor.and_then(|monitor| monitor.colors.GetColorValue(kind).ok());
        let accent = color(UIColorType::Accent)
            .filter(|_| !high_contrast)
            .map(|color| [color.R, color.G, color.B]);
        let effects = !high_contrast
            && monitor
                .is_some_and(|monitor| monitor.colors.AdvancedEffectsEnabled().unwrap_or(false));
        let tint = match context.mode {
            ThemeMode::System => {
                color(UIColorType::Background).map(|color| (color.R, color.G, color.B, 160))
            }
            ThemeMode::Light => Some((255, 255, 255, 160)),
            ThemeMode::Dark => Some((32, 32, 32, 160)),
        };
        (context.revision, accent, effects, tint)
    };
    for (label, window) in app.webview_windows() {
        if !matches!(label.as_str(), "history" | "settings") {
            continue;
        }
        // Use the same native material as Tauri, but retain its result: set_effects discards
        // native failures, which would otherwise leave a transparent, unblurred window.
        let transparency = effects && window_vibrancy::apply_acrylic(&window, tint).is_ok();
        if !transparency {
            let _ = window_vibrancy::clear_acrylic(&window);
        }
        let appearance = Appearance {
            revision,
            accent_color,
            transparency,
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
