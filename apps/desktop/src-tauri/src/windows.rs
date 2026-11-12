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

use crate::platform::{self, Monitor, Target};

#[derive(Default)]
pub struct WindowState {
    popup: Mutex<PopupContext>,
    shortcut: Mutex<Option<Shortcut>>,
    pub shortcut_error: Mutex<Option<String>>,
    pub monitor: Mutex<Option<Monitor>>,
    settings_opening: AtomicBool,
    pub recording_shortcut: AtomicBool,
}

#[derive(Default)]
struct PopupContext {
    token: u64,
    target: Option<Target>,
}

pub fn build(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let history = WebviewWindowBuilder::new(app, "history", WebviewUrl::App("index.html".into()))
        .title("Simple Copy")
        .inner_size(360., 400.)
        .resizable(false)
        .decorations(false)
        .transparent(cfg!(windows))
        // Windows adds a 1px white frame when shadows are enabled without decorations.
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()?;
    let handle = app.clone();
    history.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = hide(&handle);
        }
        tauri::WindowEvent::Focused(false) => {
            if let Some(window) = handle.get_webview_window("history") {
                let _ = window.hide();
            }
        }
        _ => {}
    });

    let show = MenuItem::with_id(app, "show", "打开剪贴板", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 Simple Copy", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &settings, &quit])?;
    TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .expect("bundled application icon")
                .clone(),
        )
        .tooltip("Simple Copy")
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
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(window) = handle.get_webview_window("history") else {
            return;
        };
        if window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false) {
            let _ = window.hide();
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
            popup.token += 1;
            popup.target = target;
            popup.token
        };
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("popup-opened", token);
    });
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
            window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false)
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
        toggle(app);
    }
}

pub fn show_notice(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window("history") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    });
}

pub fn hide(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("history") {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn hide_from_worker(app: &AppHandle) -> Result<(), String> {
    let (tx, rx) = mpsc::sync_channel(1);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(hide(&handle));
    })
    .map_err(|error| error.to_string())?;
    rx.recv_timeout(Duration::from_secs(2))
        .map_err(|_| "收起面板超时，请重试。".to_string())?
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
        .title("Simple Copy · 设置")
        .inner_size(480., 640.)
        .min_inner_size(400., 480.)
        .resizable(true)
        .decorations(false)
        .transparent(cfg!(windows))
        .shadow(false)
        .build()
        .map_err(|error| error.to_string())?;
        let owner = handle.clone();
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                owner
                    .state::<WindowState>()
                    .recording_shortcut
                    .store(false, Ordering::Release);
            }
        });
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
    let shortcut =
        Shortcut::from_str(value).map_err(|_| "快捷键格式无效，请重新录入。".to_string())?;
    if shortcut.mods.is_empty() {
        return Err("快捷键需要包含 Ctrl、Alt、Shift 或 Win / Command。".into());
    }
    let paste_modifier = if cfg!(target_os = "macos") {
        Modifiers::SUPER
    } else {
        Modifiers::CONTROL
    };
    if matches!(shortcut.key, Code::KeyC | Code::KeyV | Code::KeyX)
        && shortcut.mods == paste_modifier
    {
        return Err("请选择一个带额外修饰键的组合，以便正常复制和粘贴。".into());
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
            .map_err(|_| "该快捷键被系统或其他应用占用，请更换组合。".to_string())?;
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
        return Err(format!("无法切换快捷键：{error}"));
    }
    *previous = Some(shortcut);
    *state
        .shortcut_error
        .lock()
        .map_err(|error| error.to_string())? = None;
    Ok(())
}
