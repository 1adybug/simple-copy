mod appearance;
mod history;
mod i18n;
mod model;
mod platform;
mod service;
mod store;
mod windows;

use tauri::{Manager, WebviewWindow};

use service::{Action, Reply, Request, ServiceHandle, Snapshot};
use windows::WindowState;

#[tauri::command]
async fn system_locale(state: tauri::State<'_, ServiceHandle>) -> Result<&'static str, String> {
    // Wait for persisted settings to load before the first webview chooses its language.
    state.request(Request::Snapshot).await?;
    Ok(i18n::locale())
}

fn check_window(window: &WebviewWindow) -> Result<(), String> {
    if matches!(window.label(), "history" | "settings") {
        Ok(())
    } else {
        Err(crate::i18n::t("native.windowPermission").into())
    }
}

#[tauri::command]
fn system_appearance(window: WebviewWindow) -> Result<appearance::Appearance, String> {
    check_window(&window)?;
    Ok(appearance::snapshot(&window))
}

#[tauri::command]
async fn clipboard_snapshot(
    window: WebviewWindow,
    state: tauri::State<'_, ServiceHandle>,
) -> Result<Snapshot, String> {
    check_window(&window)?;
    match state.request(Request::Snapshot).await? {
        Reply::Snapshot(snapshot) => Ok(*snapshot),
        _ => unreachable!(),
    }
}

#[tauri::command]
async fn history_action(
    window: WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, ServiceHandle>,
    action: Action,
    popup_token: u64,
) -> Result<service::Operation, String> {
    check_window(&window)?;
    let target = windows::target_for(&app, popup_token);
    match state
        .request(Request::Action {
            action,
            target,
            popup_token,
        })
        .await?
    {
        Reply::Operation(result) => Ok(result),
        _ => unreachable!(),
    }
}

#[tauri::command]
async fn save_settings(
    window: WebviewWindow,
    state: tauri::State<'_, ServiceHandle>,
    settings: model::Settings,
) -> Result<Snapshot, String> {
    check_window(&window)?;
    match state.request(Request::SaveSettings(settings)).await? {
        Reply::Snapshot(snapshot) => Ok(*snapshot),
        _ => unreachable!(),
    }
}

#[tauri::command]
async fn capture_current(
    window: WebviewWindow,
    state: tauri::State<'_, ServiceHandle>,
) -> Result<service::Operation, String> {
    check_window(&window)?;
    match state.request(Request::CaptureCurrent).await? {
        Reply::Operation(result) => Ok(result),
        _ => unreachable!(),
    }
}

#[tauri::command]
async fn clipboard_thumbnail(
    window: WebviewWindow,
    state: tauri::State<'_, ServiceHandle>,
    id: u64,
) -> Result<tauri::ipc::Response, String> {
    check_window(&window)?;
    match state.request(Request::Image(id)).await? {
        Reply::Image(bytes) => Ok(tauri::ipc::Response::new(bytes)),
        _ => unreachable!(),
    }
}

#[tauri::command]
fn hide_history(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    check_window(&window)?;
    windows::hide(&app)
}

#[tauri::command]
async fn open_settings(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    check_window(&window)?;
    windows::open_settings(&app).await
}

#[tauri::command]
fn record_shortcut(
    window: WebviewWindow,
    state: tauri::State<'_, WindowState>,
    recording: bool,
) -> Result<(), String> {
    if window.label() != "settings" {
        return Err(crate::i18n::t("native.recordInSettings").into());
    }
    state
        .recording_shortcut
        .store(recording, std::sync::atomic::Ordering::Release);
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            windows::toggle(app)
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(WindowState::default())
        .invoke_handler(tauri::generate_handler![
            system_locale,
            system_appearance,
            clipboard_snapshot,
            history_action,
            save_settings,
            capture_current,
            clipboard_thumbnail,
            hide_history,
            open_settings,
            record_shortcut,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            appearance::initialize(&handle);
            windows::build(&handle)?;
            let data = std::env::var_os("SIMPLE_COPY_DATA_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or(app.path().app_local_data_dir()?);
            let service = ServiceHandle::start(handle.clone(), data.join("history.sqlite"));
            app.manage(service.clone());
            let wake = std::sync::Arc::new(move || service.wake());
            let shortcut_app = handle.clone();
            let shortcut =
                std::sync::Arc::new(move || windows::shortcut_triggered(&shortcut_app, "Super+V"));
            match platform::start_monitor(wake, shortcut) {
                Ok(monitor) => {
                    *app.state::<WindowState>()
                        .monitor
                        .lock()
                        .expect("monitor lock") = Some(monitor)
                }
                Err(error) => {
                    *app.state::<WindowState>()
                        .shortcut_error
                        .lock()
                        .expect("shortcut lock") = Some(error)
                }
            }
            app.state::<ServiceHandle>().initialize_shortcut();
            windows::toggle(&handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Simple Copy startup");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            appearance::stop(app);
            app.state::<ServiceHandle>().stop();
            if let Ok(mut monitor) = app.state::<WindowState>().monitor.lock() {
                monitor.take();
            }
        }
    });
}
