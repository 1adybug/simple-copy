use std::{
    str::FromStr,
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::Duration,
};

use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::{
    appearance,
    model::ThemeMode,
    platform::{self, Monitor, Target},
};

#[derive(Default)]
pub struct WindowState {
    popup: Mutex<PopupContext>,
    shortcut: Mutex<Option<Shortcut>>,
    pub shortcut_error: Mutex<Option<String>>,
    pub monitor: Mutex<Option<Monitor>>,
    settings_opening: AtomicBool,
    pub recording_shortcut: AtomicBool,
    tray_labels: Mutex<Vec<(MenuItem<tauri::Wry>, &'static str)>>,
    #[cfg(windows)]
    rounded_windows: Mutex<std::collections::HashMap<String, (u32, u32, i32)>>,
}

#[derive(Default)]
struct PopupContext {
    token: u64,
    target: Option<Target>,
    passive: bool,
}

impl PopupContext {
    fn open(&mut self, target: Option<Target>, passive: bool) -> u64 {
        self.token += 1;
        self.target = target;
        self.passive = passive;
        self.token
    }

    fn activate(&mut self) -> bool {
        std::mem::take(&mut self.passive)
    }

    fn dismiss(&mut self) -> bool {
        std::mem::take(&mut self.passive)
    }

    #[cfg(any(windows, test))]
    fn can_dismiss(&self, token: u64) -> bool {
        self.passive && self.token == token
    }
}

pub fn apply_theme(app: &AppHandle, mode: ThemeMode) {
    appearance::apply_theme(app, mode);
}

pub fn refresh_language(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        for (item, key) in handle
            .state::<WindowState>()
            .tray_labels
            .lock()
            .expect("tray labels lock")
            .iter()
        {
            let _ = item.set_text(crate::i18n::t(key));
        }
        if let Some(window) = handle.get_webview_window("history") {
            let _ = window.set_title(crate::i18n::t("appName"));
        }
        if let Some(window) = handle.get_webview_window("settings") {
            let _ = window.set_title(&format!(
                "{} · {}",
                crate::i18n::t("appName"),
                crate::i18n::t("settings")
            ));
        }
    });
}

fn sync_window_shape(window: &WebviewWindow) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Graphics::Gdi::{CreateRoundRectRgn, DeleteObject, SetWindowRgn};

        let window = window.clone();
        let dispatcher = window.clone();
        let _ = dispatcher.run_on_main_thread(move || {
            let (Ok(hwnd), Ok(size), Ok(scale)) =
                (window.hwnd(), window.outer_size(), window.scale_factor())
            else {
                return;
            };
            if size.width == 0 || size.height == 0 {
                return;
            }
            // Match the shared UI's 9 logical-pixel shell radius, including on mixed-DPI displays.
            let diameter = (18. * scale).round() as i32;
            let shape = (size.width, size.height, diameter);
            let state = window.state::<WindowState>();
            {
                let mut shapes = state.rounded_windows.lock().expect("window shape lock");
                if shapes.get(window.label()) == Some(&shape) {
                    return;
                }
                // SetWindowRgn can synchronously send window-position events. Cache first
                // and release the lock so a resulting resize cannot re-enter this update.
                shapes.insert(window.label().to_owned(), shape);
            }
            unsafe {
                let region = CreateRoundRectRgn(
                    0,
                    0,
                    size.width as i32 + 1,
                    size.height as i32 + 1,
                    diameter,
                    diameter,
                );
                if region.is_null() || SetWindowRgn(hwnd.0, region, 1) == 0 {
                    if !region.is_null() {
                        DeleteObject(region);
                    }
                    state
                        .rounded_windows
                        .lock()
                        .expect("window shape lock")
                        .remove(window.label());
                    eprintln!(
                        "Could not clip native window: {}",
                        std::io::Error::last_os_error()
                    );
                }
                // A successful SetWindowRgn transfers ownership to Windows.
            }
        });
    }
    #[cfg(not(windows))]
    let _ = window;
}

pub fn build(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let history = WebviewWindowBuilder::new(app, "history", WebviewUrl::App("index.html".into()))
        .title(crate::i18n::t("appName"))
        .inner_size(360., 400.)
        .resizable(false)
        .decorations(false)
        .transparent(cfg!(windows))
        // Windows adds a 1px white frame when shadows are enabled without decorations.
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(!cfg!(windows))
        .build()?;
    sync_window_shape(&history);
    appearance::refresh(app);
    let handle = app.clone();
    history.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = hide(&handle);
        }
        tauri::WindowEvent::Focused(true) => {
            let passive = {
                let state = handle.state::<WindowState>();
                let mut popup = state.popup.lock().expect("popup context lock");
                popup.activate()
            };
            // Once the user activates the native popup, resume Tauri's visibility lifecycle.
            if passive {
                #[cfg(windows)]
                platform::stop_watching_popup();
                if let Some(window) = handle.get_webview_window("history") {
                    let _ = window.show();
                }
            }
        }
        tauri::WindowEvent::Focused(false) => {
            let _ = hide(&handle);
        }
        tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. } => {
            if let Some(window) = handle.get_webview_window("history") {
                sync_window_shape(&window);
            }
        }
        _ => {}
    });

    let show = MenuItem::with_id(
        app,
        "show",
        crate::i18n::t("native.show"),
        true,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(
        app,
        "settings",
        crate::i18n::t("settings"),
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        crate::i18n::t("native.quit"),
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&show, &settings, &quit])?;
    *app.state::<WindowState>()
        .tray_labels
        .lock()
        .expect("tray labels lock") = vec![
        (show, "native.show"),
        (settings, "settings"),
        (quit, "native.quit"),
    ];
    TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .expect("bundled application icon")
                .clone(),
        )
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => toggle(app),
            "settings" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = open_settings(&handle).await;
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                toggle(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn toggle(app: &AppHandle) {
    toggle_with_focus(app, true);
}

fn toggle_with_focus(app: &AppHandle, focus: bool) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(window) = handle.get_webview_window("history") else {
            return;
        };
        if window.is_visible().unwrap_or(false) && (!focus || window.is_focused().unwrap_or(false))
        {
            let _ = hide(&handle);
            return;
        }
        let target = platform::capture_target();
        let anchor = target
            .as_ref()
            .and_then(|target| target.anchor)
            .or_else(|| {
                window
                    .cursor_position()
                    .ok()
                    .map(|point| (point.x as i32, point.y as i32))
            });
        if let Some((x, y)) = anchor
            && let Ok(Some(monitor)) = window.monitor_from_point(x.into(), y.into())
        {
            let scale = monitor.scale_factor();
            let area = monitor.work_area();
            let width = (360. * scale).round() as i32;
            let height = (400. * scale).round() as i32;
            let left = (x + 8).clamp(
                area.position.x,
                (area.position.x + area.size.width as i32 - width).max(area.position.x),
            );
            let top = (y + 10).clamp(
                area.position.y,
                (area.position.y + area.size.height as i32 - height).max(area.position.y),
            );
            let _ = window.set_position(PhysicalPosition::new(left, top));
        }
        let token = {
            let state = handle.state::<WindowState>();
            let mut popup = state.popup.lock().expect("popup context lock");
            popup.open(target, !focus)
        };
        if show_history(&window, focus, token).is_ok() {
            let _ = window.emit("popup-opened", token);
        }
    });
}

fn show_history(window: &WebviewWindow, focus: bool, _token: u64) -> Result<(), String> {
    #[cfg(windows)]
    if !focus {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SetWindowPos,
        };

        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        let app = window.app_handle().clone();
        platform::watch_popup(
            hwnd.0 as usize,
            std::sync::Arc::new(move || {
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let can_dismiss = handle
                        .state::<WindowState>()
                        .popup
                        .lock()
                        .expect("popup context lock")
                        .can_dismiss(_token);
                    if can_dismiss {
                        let _ = hide(&handle);
                    }
                });
            }),
        );
        // Tauri's show() activates the window. Keep this native popup passive until a user
        // clicks it, then the Focused event resumes Tauri's visibility lifecycle.
        if unsafe {
            SetWindowPos(
                hwnd.0,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
            )
        } == 0
        {
            platform::stop_watching_popup();
            return Err(std::io::Error::last_os_error().to_string());
        }
        return Ok(());
    }

    #[cfg(windows)]
    platform::stop_watching_popup();
    window.show().map_err(|error| error.to_string())?;
    if focus {
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn popup_token(app: &AppHandle) -> u64 {
    app.state::<WindowState>()
        .popup
        .lock()
        .expect("popup context lock")
        .token
}

pub fn target_for(app: &AppHandle, token: u64) -> Option<Target> {
    let state = app.state::<WindowState>();
    let popup = state.popup.lock().ok()?;
    if popup.token == token {
        popup.target.clone()
    } else {
        None
    }
}

pub fn popup_is_current(app: &AppHandle, token: u64) -> bool {
    popup_token(app) == token
        && app.get_webview_window("history").is_some_and(|window| {
            window.is_visible().unwrap_or(false)
                && (window.is_focused().unwrap_or(false)
                    || target_for(app, token)
                        .as_ref()
                        .is_some_and(platform::target_has_focus))
        })
}

pub fn shortcut_triggered(app: &AppHandle, shortcut: &str) {
    if app
        .state::<WindowState>()
        .recording_shortcut
        .swap(false, Ordering::AcqRel)
    {
        let _ = app.emit_to("settings", "shortcut-recorded", shortcut);
    } else {
        toggle_with_focus(app, !cfg!(windows));
    }
}

pub fn show_notice(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window("history") {
            handle
                .state::<WindowState>()
                .popup
                .lock()
                .expect("popup context lock")
                .activate();
            #[cfg(windows)]
            platform::stop_watching_popup();
            let _ = window.show();
            let _ = window.set_focus();
        }
    });
}

pub fn hide(app: &AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    platform::stop_watching_popup();
    let passive = app
        .state::<WindowState>()
        .popup
        .lock()
        .map_err(|error| error.to_string())?
        .dismiss();
    if let Some(window) = app.get_webview_window("history") {
        hide_history(&window, passive)?;
    }
    Ok(())
}

fn hide_history(window: &WebviewWindow, _passive: bool) -> Result<(), String> {
    #[cfg(windows)]
    if _passive {
        use windows_sys::Win32::UI::WindowsAndMessaging::{SW_HIDE, ShowWindow};

        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as usize;
        // Passive popups bypass Tauri's visibility flags when shown. Hide through the same
        // native lifecycle until activation hands visibility back to Tauri.
        return window
            .run_on_main_thread(move || unsafe {
                ShowWindow(hwnd as _, SW_HIDE);
            })
            .map_err(|error| error.to_string());
    }
    window.hide().map_err(|error| error.to_string())
}

pub fn hide_from_worker(app: &AppHandle) -> Result<(), String> {
    let (tx, rx) = mpsc::sync_channel(1);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(hide(&handle));
    })
    .map_err(|error| error.to_string())?;
    rx.recv_timeout(Duration::from_secs(2))
        .map_err(|_| crate::i18n::t("native.hideTimeout").to_string())?
}

pub async fn open_settings(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window.show().map_err(|error| error.to_string())?;
        hide(app)?;
        return window.set_focus().map_err(|error| error.to_string());
    }
    if app
        .state::<WindowState>()
        .settings_opening
        .swap(true, Ordering::AcqRel)
    {
        return Ok(());
    }
    let handle = app.clone();
    // Dynamic WebView2 creation must leave the Windows UI event loop free.
    let result = tauri::async_runtime::spawn_blocking(move || {
        let window = WebviewWindowBuilder::new(
            &handle,
            "settings",
            WebviewUrl::App("index.html?view=settings".into()),
        )
        .title(format!(
            "{} · {}",
            crate::i18n::t("appName"),
            crate::i18n::t("settings")
        ))
        .inner_size(480., 640.)
        .min_inner_size(400., 480.)
        .resizable(true)
        .decorations(false)
        .transparent(cfg!(windows))
        .shadow(false)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?;
        sync_window_shape(&window);
        appearance::refresh(&handle);
        let owner = handle.clone();
        window.on_window_event(move |event| {
            if matches!(
                event,
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }
            ) && let Some(window) = owner.get_webview_window("settings")
            {
                sync_window_shape(&window);
            }
            if matches!(event, tauri::WindowEvent::Destroyed) {
                appearance::forget_window(&owner, "settings");
                #[cfg(windows)]
                owner
                    .state::<WindowState>()
                    .rounded_windows
                    .lock()
                    .expect("window shape lock")
                    .remove("settings");
                owner
                    .state::<WindowState>()
                    .recording_shortcut
                    .store(false, Ordering::Release);
            }
        });
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        hide(&handle)
    })
    .await
    .map_err(|error| error.to_string());
    app.state::<WindowState>()
        .settings_opening
        .store(false, Ordering::Release);
    result?
}

pub fn validate_shortcut(value: &str) -> Result<Shortcut, String> {
    let shortcut = Shortcut::from_str(value)
        .map_err(|_| crate::i18n::t("native.shortcutInvalid").to_string())?;
    if shortcut.mods.is_empty() {
        return Err(crate::i18n::t("native.shortcutModifier").into());
    }
    let paste_modifier = if cfg!(target_os = "macos") {
        Modifiers::SUPER
    } else {
        Modifiers::CONTROL
    };
    if matches!(shortcut.key, Code::KeyC | Code::KeyV | Code::KeyX)
        && shortcut.mods == paste_modifier
    {
        return Err(crate::i18n::t("native.shortcutReserved").into());
    }
    Ok(shortcut)
}

pub fn apply_shortcut(app: &AppHandle, value: &str) -> Result<(), String> {
    let shortcut = validate_shortcut(value)?;
    let state = app.state::<WindowState>();
    let mut previous = state.shortcut.lock().map_err(|error| error.to_string())?;
    if *previous == Some(shortcut) {
        return Ok(());
    }
    let win_v = cfg!(windows) && shortcut.mods == Modifiers::SUPER && shortcut.key == Code::KeyV;
    if win_v {
        platform::enable_win_v(true)?;
    } else {
        let label = value.to_string();
        app.global_shortcut()
            .on_shortcut(shortcut, move |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    shortcut_triggered(app, &label);
                }
            })
            .map_err(|_| crate::i18n::t("native.shortcutOccupied").to_string())?;
        platform::enable_win_v(false)?;
    }
    if let Some(old) = *previous
        && !(cfg!(windows) && old.mods == Modifiers::SUPER && old.key == Code::KeyV)
        && let Err(error) = app.global_shortcut().unregister(old)
    {
        if win_v {
            let _ = platform::enable_win_v(false);
        } else {
            let _ = app.global_shortcut().unregister(shortcut);
        }
        return Err(crate::i18n::with_error("native.shortcutSwitch", error));
    }
    *previous = Some(shortcut);
    *state
        .shortcut_error
        .lock()
        .map_err(|error| error.to_string())? = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::PopupContext;

    #[test]
    fn passive_dismissal_cannot_close_a_reopened_popup() {
        let mut popup = PopupContext::default();
        assert!(!popup.can_dismiss(0));

        let first = popup.open(None, true);
        assert!(popup.can_dismiss(first));

        let second = popup.open(None, true);
        assert!(!popup.can_dismiss(first));
        assert!(popup.can_dismiss(second));
    }

    #[test]
    fn activating_the_popup_cancels_pending_passive_dismissal() {
        let mut popup = PopupContext::default();
        let token = popup.open(None, true);
        assert!(popup.activate());
        assert!(!popup.can_dismiss(token));
        assert!(!popup.activate());

        let token = popup.open(None, false);
        assert!(!popup.can_dismiss(token));
    }

    #[test]
    fn dismissing_before_activation_uses_the_native_visibility_lifecycle() {
        let mut popup = PopupContext::default();
        let token = popup.open(None, true);

        assert!(popup.dismiss());
        assert!(!popup.can_dismiss(token));
        assert!(!popup.activate());

        popup.open(None, true);
        assert!(popup.activate());
        assert!(!popup.dismiss());

        popup.open(None, false);
        assert!(!popup.dismiss());
    }
}
