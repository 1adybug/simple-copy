use std::sync::{
    OnceLock,
    atomic::{AtomicU64, Ordering},
};

use clipboard_rs::{
    Clipboard, ClipboardContent, ClipboardContext, ClipboardHandler, ClipboardWatcher,
    ClipboardWatcherContext, RustImageData, WatcherShutdown, common::RustImage,
};
use tauri::AppHandle;

use super::{
    Capabilities, Capture, ClipboardBackend, ORIGIN_FORMAT, Wake, Written, read_payload,
    validate_files,
};
use crate::model::{Formats, Payload, WriteId};

static REVISION: AtomicU64 = AtomicU64::new(1);
static WATCHING: OnceLock<()> = OnceLock::new();

#[derive(Clone)]
pub struct Target {
    pub anchor: Option<(i32, i32)>,
}

pub fn capture_target() -> Option<Target> {
    None
}

pub fn target_has_focus(_target: &Target) -> bool {
    false
}

pub fn enable_win_v(_enabled: bool) -> Result<(), String> {
    Ok(())
}

pub struct Monitor(WatcherShutdown);
impl Drop for Monitor {
    fn drop(&mut self) {
        self.0.stop();
    }
}

struct Handler(Wake);
impl ClipboardHandler for Handler {
    fn on_clipboard_change(&mut self) {
        REVISION.fetch_add(1, Ordering::AcqRel);
        (self.0)();
    }
}

pub fn start_monitor(changed: Wake, _shortcut: Wake) -> Result<Monitor, String> {
    let mut watcher = ClipboardWatcherContext::new().map_err(|error| error.to_string())?;
    let shutdown = watcher.add_handler(Handler(changed)).get_shutdown_channel();
    std::thread::Builder::new()
        .name("clipboard-desktop-events".into())
        .spawn(move || watcher.start_watch())
        .map_err(|error| error.to_string())?;
    let _ = WATCHING.set(());
    Ok(Monitor(shutdown))
}

pub struct Native {
    ctx: ClipboardContext,
}

impl Native {
    pub fn new(_app: AppHandle) -> Result<Self, String> {
        if std::env::var_os("WAYLAND_DISPLAY").is_some()
            && std::env::var("GDK_BACKEND").as_deref() != Ok("x11")
        {
            return Err("Wayland 系统集成待完成；当前交付以 Windows 为验收目标。".into());
        }
        Ok(Self {
            ctx: ClipboardContext::new().map_err(|error| error.to_string())?,
        })
    }
}

impl ClipboardBackend for Native {
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            platform: if cfg!(target_os = "macos") {
                "macos"
            } else {
                "x11"
            },
            background: WATCHING.get().is_some(),
            automatic_paste: false,
            restore_available: false,
            can_authorize: false,
            message: Some("此平台的原窗口自动粘贴集成待完成，选择后可手动粘贴。".into()),
        }
    }

    fn revision(&self) -> Result<u64, String> {
        Ok(REVISION.load(Ordering::Acquire))
    }

    fn read(&self, formats: &Formats) -> Result<Capture, String> {
        let revision = self.revision()?;
        let (payload, origin) = read_payload(&self.ctx, formats)?;
        if revision != self.revision()? {
            return Err("剪贴板已变化，请重试。".into());
        }
        Ok(Capture {
            revision,
            payload,
            origin,
        })
    }

    fn write(
        &self,
        payload: &Payload,
        expected: Option<u64>,
        origin: WriteId,
    ) -> Result<Written, String> {
        validate_files(payload)?;
        let mut contents = Vec::new();
        if let Some(text) = &payload.text {
            contents.push(ClipboardContent::Text(text.clone()));
        }
        if let Some(html) = &payload.html {
            contents.push(ClipboardContent::Html(html.clone()));
        }
        if let Some(rtf) = &payload.rtf {
            contents.push(ClipboardContent::Other(
                if cfg!(target_os = "macos") {
                    "public.rtf"
                } else {
                    "text/rtf"
                }
                .into(),
                rtf.clone(),
            ));
        }
        if let Some(png) = &payload.png {
            contents.push(ClipboardContent::Image(
                RustImageData::from_bytes(png).map_err(|error| error.to_string())?,
            ));
        }
        if !payload.files.is_empty() {
            contents.push(ClipboardContent::Files(payload.files.clone()));
        }
        contents.push(ClipboardContent::Other(
            ORIGIN_FORMAT.into(),
            origin.to_vec(),
        ));
        if expected.is_some_and(|expected| self.revision().ok() != Some(expected)) {
            return Ok(Written::Superseded);
        }
        self.ctx.set(contents).map_err(|error| error.to_string())?;
        Ok(Written::Applied(self.revision()?))
    }

    fn paste(&self, _target: &Target, _expected: u64) -> Result<bool, String> {
        Ok(false)
    }
}
