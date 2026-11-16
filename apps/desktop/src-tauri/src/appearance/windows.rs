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

use super::{Appearance, frame};
use crate::model::ThemeMode;

#[derive(Default)]
struct AppearanceState(Mutex<Context>);

#[derive(Default)]
struct Context {
    mode: ThemeMode,
    revision: u64,
    monitor: Option<Monitor>,
    windows: HashMap<String, Appearance>,
    frames: HashMap<String, WindowFrame>,
}

#[derive(Clone, Copy)]
struct WindowFrame {
    hwnd: usize,
    shape: (u32, u32, i32),
    native_corners: bool,
}

struct Monitor {
    colors: UISettings,
    accessibility: Option<AccessibilitySettings>,
    color_token: Option<i64>,
    effects_token: Option<i64>,
    contrast_token: Option<i64>,
}

impl Monitor {
    fn new(on_change: impl Fn() + Send + Sync + 'static) -> windows::core::Result<Self> {
        let mut monitor = Self {
            colors: UISettings::new()?,
            accessibility: AccessibilitySettings::new().ok(),
            color_token: None,
            effects_token: None,
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
        monitor.effects_token = monitor.colors.AdvancedEffectsEnabledChanged(&changed).ok();
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
        if let Some(token) = self.effects_token {
            let _ = self.colors.RemoveAdvancedEffectsEnabledChanged(token);
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
    context.frames.remove(label);
}

pub(super) fn apply_theme(app: &AppHandle, mode: ThemeMode) {
    app.state::<AppearanceState>()
        .0
        .lock()
        .expect("appearance lock")
        .mode = mode;
    refresh(app);
}

pub(super) fn prepare_window(window: &WebviewWindow) -> bool {
    let (Ok(hwnd), Ok(size), Ok(scale)) =
        (window.hwnd(), window.outer_size(), window.scale_factor())
    else {
        return false;
    };
    if size.width == 0 || size.height == 0 {
        return false;
    }
    let shape = (
        size.width,
        size.height,
        (2. * frame::FALLBACK_RADIUS * scale).round() as i32,
    );
    let state = window.state::<AppearanceState>();
    {
        let mut context = state.0.lock().expect("appearance lock");
        if context.frames.get(window.label()).is_some_and(|frame| {
            frame.hwnd == hwnd.0 as usize && (frame.native_corners || frame.shape == shape)
        }) {
            return false;
        }
        // Cache before any SetWindowRgn call, which can synchronously re-enter a
        // resize callback. Native DWM corners need no geometry updates on resize.
        context.frames.insert(
            window.label().to_owned(),
            WindowFrame {
                hwnd: hwnd.0 as usize,
                shape,
                native_corners: false,
            },
        );
    }
    let native_corners = frame::native_corners(hwnd.0);
    let success = native_corners || frame::fallback_corners(hwnd.0, shape.0, shape.1, shape.2);
    let mut context = state.0.lock().expect("appearance lock");
    if success {
        if let Some(frame) = context.frames.get_mut(window.label()) {
            frame.native_corners = native_corners;
        }
    } else {
        context.frames.remove(window.label());
        eprintln!(
            "Could not configure window corners: {}",
            std::io::Error::last_os_error()
        );
    }
    context
        .windows
        .get(window.label())
        .is_some_and(|appearance| appearance.native_corners != native_corners)
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
    let (revision, accent_color, effects, dark) = {
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
        let effects = !high_contrast
            && monitor
                .is_some_and(|monitor| monitor.colors.AdvancedEffectsEnabled().unwrap_or(false));
        let dark = match context.mode {
            ThemeMode::Dark => true,
            ThemeMode::Light => false,
            ThemeMode::System => monitor
                .and_then(|monitor| monitor.colors.GetColorValue(UIColorType::Background).ok())
                .is_some_and(|color| {
                    u32::from(color.R) + u32::from(color.G) + u32::from(color.B) < 384
                }),
        };
        (context.revision, accent, effects, dark)
    };
    for (label, window) in app.webview_windows() {
        if !matches!(label.as_str(), "history" | "settings") {
            continue;
        }
        let (native_corners, transparency) = if let Ok(hwnd) = window.hwnd() {
            let native_corners = state
                .0
                .lock()
                .expect("appearance lock")
                .frames
                .get(&label)
                .is_some_and(|frame| frame.hwnd == hwnd.0 as usize && frame.native_corners);
            (
                native_corners,
                frame::acrylic(hwnd.0, native_corners && effects, dark),
            )
        } else {
            (false, false)
        };
        let appearance = Appearance {
            revision,
            accent_color,
            transparency,
            native_corners,
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
        assert!(monitor.colors.AdvancedEffectsEnabled().is_ok());
        assert!(monitor.color_token.is_some());
        assert!(monitor.effects_token.is_some());
    }
}
