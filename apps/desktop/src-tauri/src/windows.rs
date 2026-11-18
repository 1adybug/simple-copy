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
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
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
}

#[derive(Default)]
struct PopupContext {
    token: u64,
    target: Option<Target>,
    mode: PopupMode,
}

#[derive(Clone, Copy, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PopupMode {
    #[default]
    Active,
    #[cfg(windows)]
    Passive,
}

#[derive(Clone, Copy, serde::Serialize)]
pub struct PopupPresentation {
    token: u64,
    mode: PopupMode,
}

impl PopupContext {
    fn open(&mut self, target: Option<Target>, mode: PopupMode) -> u64 {
        self.token += 1;
        self.target = target;
        self.mode = mode;
        self.token
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

pub fn build(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let history = WebviewWindowBuilder::new(app, "history", WebviewUrl::App("index.html".into()))
        .title(crate::i18n::t("appName"))
        .inner_size(360., 400.)
        .resizable(false)
        .decorations(false)
        .transparent(cfg!(windows))
        // Composite WebView2 directly so the hidden native caption cannot be
        // redirected into the transparent pixels around the custom window frame.
        .no_redirection_bitmap(true)
        // Windows adds a 1px white frame when shadows are enabled without decorations.
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(!cfg!(windows))
        .build()?;
    appearance::prepare_window(&history);
    appearance::refresh(app);
    let handle = app.clone();
    history.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = hide(&handle);
        }
        #[cfg(windows)]
        tauri::WindowEvent::Focused(true) => {
            if let Some(window) = handle.get_webview_window("history") {
                let _ = adopt_popup(&window);
            }
        }
        tauri::WindowEvent::Focused(false) => {
            if current_popup_mode(&handle) == PopupMode::Active {
                let _ = hide(&handle);
            }
        }
        tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. } => {
            if let Some(window) = handle.get_webview_window("history") {
                appearance::prepare_window(&window);
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
    toggle_popup(app, PopupMode::Active);
}

fn toggle_popup(app: &AppHandle, mode: PopupMode) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(window) = handle.get_webview_window("history") else {
            return;
        };
        if window.is_visible().unwrap_or(false) {
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
            popup.open(target, mode)
        };
        if show_popup(&window, mode, token).is_ok() {
            let _ = window.emit("popup-state", popup_presentation(&handle));
        }
    });
}

fn show_popup(window: &tauri::WebviewWindow, _mode: PopupMode, _token: u64) -> Result<(), String> {
    #[cfg(windows)]
    if _mode == PopupMode::Passive {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        let app = window.app_handle().clone();
        return platform::show_passive_popup(
            hwnd.0,
            _token,
            std::sync::Arc::new(move |input| handle_passive_input(&app, _token, input)),
        )
        .map_err(|error| error.to_string());
    }
    window
        .show()
        .and_then(|()| window.set_focus())
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
fn handle_passive_input(app: &AppHandle, token: u64, input: platform::PopupInput) {
    use platform::PopupInput;

    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if popup_mode_for(&handle, token) != Some(PopupMode::Passive) {
            return;
        }
        let Some(window) = handle.get_webview_window("history") else {
            return;
        };
        match input {
            PopupInput::Dismiss => {
                let _ = hide(&handle);
            }
            PopupInput::Activate => {
                if platform::popup_owner_is_foreground(token) {
                    let _ = adopt_popup(&window).and_then(|()| window.set_focus());
                }
            }
            PopupInput::Navigate(key) => {
                if platform::popup_owner_is_foreground(token) {
                    let _ = window.emit("popup-navigation", (token, key));
                }
            }
        }
    });
}

#[cfg(windows)]
fn adopt_popup(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    if take_popup_mode(window.app_handle()) == PopupMode::Passive {
        // Record visibility in Tauri once the user enters the popup.
        platform::stop_watching_popup();
        window.show()?;
        let _ = window.emit("popup-state", popup_presentation(window.app_handle()));
    }
    Ok(())
}

fn current_popup_mode(app: &AppHandle) -> PopupMode {
    popup_presentation(app).mode
}

fn take_popup_mode(app: &AppHandle) -> PopupMode {
    let state = app.state::<WindowState>();
    let mut popup = state.popup.lock().expect("popup context lock");
    std::mem::take(&mut popup.mode)
}

fn popup_mode_for(app: &AppHandle, token: u64) -> Option<PopupMode> {
    let state = app.state::<WindowState>();
    let popup = state.popup.lock().ok()?;
    (popup.token == token).then_some(popup.mode)
}

pub fn popup_presentation(app: &AppHandle) -> PopupPresentation {
    let state = app.state::<WindowState>();
    let popup = state.popup.lock().expect("popup context lock");
    PopupPresentation {
        token: popup.token,
        mode: popup.mode,
    }
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

pub fn popup_for_paste(app: &AppHandle, token: u64) -> Option<PopupMode> {
    let window = app.get_webview_window("history")?;
    if !window.is_visible().unwrap_or(false) {
        return None;
    }
    let mode = popup_mode_for(app, token)?;
    let current = match mode {
        PopupMode::Active => window.is_focused().unwrap_or(false),
        #[cfg(windows)]
        PopupMode::Passive => platform::popup_owner_is_foreground(token),
    };
    current.then_some(mode)
}

pub fn shortcut_triggered(app: &AppHandle, shortcut: &str) {
    if app
        .state::<WindowState>()
        .recording_shortcut
        .swap(false, Ordering::AcqRel)
    {
        let _ = app.emit_to("settings", "shortcut-recorded", shortcut);
    } else {
        #[cfg(windows)]
        toggle_popup(app, PopupMode::Passive);
        #[cfg(not(windows))]
        toggle(app);
    }
}

pub fn show_notice(app: &AppHandle, token: u64) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if popup_mode_for(&handle, token) == Some(PopupMode::Active)
            && let Some(window) = handle.get_webview_window("history")
        {
            let _ = window.show();
            let _ = window.set_focus();
        }
    });
}

pub fn hide(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("history") else {
        return Ok(());
    };
    #[cfg(windows)]
    {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as usize;
        let handle = app.clone();
        app.run_on_main_thread(move || {
            if take_popup_mode(&handle) == PopupMode::Passive {
                platform::hide_passive_popup(hwnd as _);
            } else {
                let _ = window.hide();
            }
        })
        .map_err(|error| error.to_string())
    }
    #[cfg(not(windows))]
    {
        window.hide().map_err(|error| error.to_string())?;
        Ok(())
    }
}

pub fn hide_from_worker(app: &AppHandle, token: u64) -> Result<(), String> {
    let (tx, rx) = mpsc::sync_channel(1);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let result = if popup_presentation(&handle).token == token {
            hide(&handle)
        } else {
            Ok(())
        };
        let _ = tx.send(result);
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
        .no_redirection_bitmap(true)
        .shadow(false)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?;
        appearance::prepare_window(&window);
        appearance::refresh(&handle);
        let owner = handle.clone();
        window.on_window_event(move |event| {
            if matches!(
                event,
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }
            ) && let Some(window) = owner.get_webview_window("settings")
            {
                appearance::prepare_window(&window);
            }
            if matches!(event, tauri::WindowEvent::Destroyed) {
                appearance::forget_window(&owner, "settings");
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
