use std::{
    path::PathBuf,
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

use aes_gcm::aead::{OsRng, rand_core::RngCore};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

use crate::{
    history::{History, Preview, Restore},
    model::{ClipId, Payload, Settings, WriteId},
    platform::{self, Capabilities, ClipboardBackend, Written},
    store::Store,
    windows::{self, WindowState},
};

#[derive(Clone)]
pub struct ServiceHandle(mpsc::Sender<Message>);

pub enum Request {
    Snapshot,
    Action {
        action: Action,
        target: Option<platform::Target>,
        popup_token: u64,
    },
    SaveSettings(Settings),
    Image(ClipId),
    CaptureCurrent,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Action {
    Copy { id: ClipId },
    Paste { id: ClipId },
    Pin { id: ClipId, pinned: bool },
    Delete { id: ClipId },
    ClearUnpinned,
}

pub enum Reply {
    Snapshot(Box<Snapshot>),
    Image(Vec<u8>),
    Operation(Operation),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub locale: &'static str,
    pub revision: u64,
    pub popup_token: u64,
    pub items: Vec<Preview>,
    pub settings: Settings,
    pub capabilities: Capabilities,
    pub storage_status: Option<String>,
    pub shortcut_error: Option<String>,
    pub error: Option<String>,
    pub restore_pending: bool,
}

enum Message {
    InitializeShortcut,
    Wake,
    Request(Request, oneshot::Sender<Result<Reply, String>>),
    Stop,
}

#[derive(Clone, Copy)]
enum WriteReason {
    Choice,
    Restore,
}

struct OwnWrite {
    id: WriteId,
    revision: u64,
    reason: WriteReason,
}

impl OwnWrite {
    fn matches(&self, capture: &platform::Capture) -> bool {
        capture.revision == self.revision && capture.origin == Some(self.id)
    }
}

impl ServiceHandle {
    pub fn start(app: AppHandle, path: PathBuf) -> Self {
        let (tx, rx) = mpsc::channel();
        let handle = Self(tx);
        thread::Builder::new()
            .name("clipboard-state".into())
            .spawn(move || {
                let mut store = Store::open(&path).unwrap_or_else(Store::memory);
                let (settings, history) = store.load().unwrap_or_else(|error| {
                    store.status = Some(error);
                    (Settings::default(), History::default())
                });
                crate::i18n::set_language(settings.language);
                windows::refresh_language(&app);
                windows::apply_theme(&app, settings.theme_mode);
                let backend = platform::create(app.clone());
                let (backend, initial_error) = match backend {
                    Ok(backend) => (Some(backend), None),
                    Err(error) => (None, Some(error)),
                };
                let mut service = Service {
                    app,
                    backend,
                    store,
                    settings,
                    history,
                    restore: Restore::default(),
                    last_revision: None,
                    needs_capture: false,
                    last_write: None,
                    event_revision: 0,
                    error: initial_error,
                };
                // Startup establishes a baseline. Recording begins with the next change.
                service.last_revision = service
                    .backend
                    .as_ref()
                    .and_then(|backend| backend.revision().ok());
                service.publish();
                loop {
                    let now = Instant::now();
                    let timeout = service
                        .restore
                        .deadline()
                        .map(|deadline| {
                            deadline
                                .saturating_duration_since(now)
                                .min(Duration::from_millis(250))
                        })
                        .unwrap_or(Duration::from_millis(250));
                    match rx.recv_timeout(timeout) {
                        Ok(Message::InitializeShortcut) => {
                            if let Err(error) =
                                windows::apply_shortcut(&service.app, &service.settings.shortcut)
                            {
                                *service
                                    .app
                                    .state::<WindowState>()
                                    .shortcut_error
                                    .lock()
                                    .expect("shortcut error lock") = Some(error);
                            }
                            service.publish();
                        }
                        Ok(Message::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        Ok(Message::Request(request, reply)) => {
                            let result = service.request(request);
                            let _ = reply.send(result);
                        }
                        Ok(Message::Wake) | Err(mpsc::RecvTimeoutError::Timeout) => {}
                    }
                    service.observe();
                    service.restore_if_due();
                }
                service.restore.cancel();
            })
            .expect("clipboard state thread");
        handle
    }

    pub fn wake(&self) {
        let _ = self.0.send(Message::Wake);
    }
    pub fn initialize_shortcut(&self) {
        let _ = self.0.send(Message::InitializeShortcut);
    }
    pub fn stop(&self) {
        let _ = self.0.send(Message::Stop);
    }

    pub async fn request(&self, request: Request) -> Result<Reply, String> {
        let (tx, rx) = oneshot::channel();
        self.0
            .send(Message::Request(request, tx))
            .map_err(|_| crate::i18n::t("native.serviceStopped").to_string())?;
        rx.await
            .map_err(|_| crate::i18n::t("native.serviceNoResponse").to_string())?
    }
}

struct Service {
    app: AppHandle,
    backend: Option<Box<dyn ClipboardBackend>>,
    store: Store,
    settings: Settings,
    history: History,
    restore: Restore,
    last_revision: Option<u64>,
    needs_capture: bool,
    last_write: Option<OwnWrite>,
    event_revision: u64,
    error: Option<String>,
}

impl Service {
    fn snapshot(&self) -> Snapshot {
        Snapshot {
            locale: crate::i18n::locale(),
            revision: self.event_revision,
            popup_token: windows::popup_token(&self.app),
            items: self.history.previews(),
            settings: self.settings.clone(),
            capabilities: self
                .backend
                .as_ref()
                .map(|backend| backend.capabilities())
                .unwrap_or(Capabilities {
                    platform: std::env::consts::OS,
                    background: false,
                    automatic_paste: false,
                    restore_available: false,
                    can_authorize: false,
                    message: Some(crate::i18n::t("native.serviceUnavailable").into()),
                }),
            storage_status: self.store.status.clone(),
            shortcut_error: self
                .app
                .state::<WindowState>()
                .shortcut_error
                .lock()
                .ok()
                .and_then(|error| error.clone()),
            error: self.error.clone(),
            restore_pending: self.restore.deadline().is_some(),
        }
    }

    fn publish(&mut self) {
        self.event_revision += 1;
        let snapshot = self.snapshot();
        let _ = self.app.emit_to("history", "clipboard-state", &snapshot);
        let _ = self.app.emit_to("settings", "clipboard-state", &snapshot);
    }

    fn request(&mut self, request: Request) -> Result<Reply, String> {
        match request {
            Request::Snapshot => Ok(Reply::Snapshot(Box::new(self.snapshot()))),
            Request::Image(id) => self
                .history
                .image(id)
                .map(|bytes| Reply::Image(bytes.to_vec()))
                .ok_or_else(|| crate::i18n::t("native.imageRemoved").into()),
            Request::Action {
                action,
                target,
                popup_token,
            } => self
                .action(action, target, popup_token)
                .map(Reply::Operation),
            Request::SaveSettings(settings) => {
                settings.validate()?;
                if settings.restore_enabled
                    && !self
                        .backend
                        .as_ref()
                        .is_some_and(|backend| backend.capabilities().restore_available)
                {
                    return Err(crate::i18n::t("native.restoreUnsupported").into());
                }
                let before = self.settings.clone();
                let mut history = self.history.clone();
                history.set_max_items(settings.max_history_items);
                windows::apply_shortcut(&self.app, &settings.shortcut)?;
                if let Err(error) = self.store.sync(&settings, &history) {
                    if windows::apply_shortcut(&self.app, &before.shortcut).is_err() {
                        self.settings.shortcut = settings.shortcut;
                        *self
                            .app
                            .state::<WindowState>()
                            .shortcut_error
                            .lock()
                            .expect("shortcut error lock") =
                            Some(crate::i18n::t("native.shortcutRollback").into());
                        self.publish();
                    }
                    return Err(error);
                }
                self.restore
                    .settings_changed(&before, &settings, Instant::now());
                if settings.theme_mode != before.theme_mode {
                    windows::apply_theme(&self.app, settings.theme_mode);
                }
                if settings.language != before.language {
                    crate::i18n::set_language(settings.language);
                    windows::refresh_language(&self.app);
                }
                self.history = history;
                self.settings = settings;
                self.publish();
                Ok(Reply::Snapshot(Box::new(self.snapshot())))
            }
            Request::CaptureCurrent => {
                self.capture_current(true)?;
                Ok(Reply::Operation(Operation {
                    message: Some(crate::i18n::t("native.captured").into()),
                }))
            }
        }
    }

    fn action(
        &mut self,
        action: Action,
        target: Option<platform::Target>,
        popup_token: u64,
    ) -> Result<Operation, String> {
        self.error = None;
        match action {
            Action::Copy { id } | Action::Paste { id } => {
                let paste = matches!(action, Action::Paste { .. });
                if paste && !windows::popup_is_current(&self.app, popup_token) {
                    return Err(crate::i18n::t("native.popupChanged").into());
                }
                let clip = self
                    .history
                    .get(id)
                    .ok_or_else(|| crate::i18n::t("native.recordRemoved").to_string())?
                    .entry
                    .clone();
                let revision = self
                    .write(&clip.payload, None, WriteReason::Choice)?
                    .ok_or_else(|| crate::i18n::t("native.clipboardChanged").to_string())?;
                self.history.record(clip.payload.clone());
                if let Err(error) = self.store.sync(&self.settings, &self.history) {
                    self.store.status = Some(error);
                }
                let same_as_pin = self
                    .history
                    .top_pin()
                    .is_some_and(|pin| pin.fingerprint == clip.payload.fingerprint());
                self.restore.changed(
                    revision,
                    Instant::now(),
                    &self.settings,
                    !same_as_pin && self.history.top_pin().is_some(),
                );
                self.publish();
                if paste {
                    if !windows::popup_is_current(&self.app, popup_token) {
                        return Ok(Operation {
                            message: Some(crate::i18n::t("native.pasteCancelled").into()),
                        });
                    }
                    if let Some(target) = target {
                        match self
                            .backend
                            .as_ref()
                            .ok_or(crate::i18n::t("native.serviceUnavailable"))?
                            .paste(&target, revision)
                        {
                            Ok(true) => {
                                windows::hide_from_worker(&self.app)?;
                                return Ok(Operation { message: None });
                            }
                            Ok(false) => windows::show_notice(&self.app),
                            Err(error) => {
                                windows::show_notice(&self.app);
                                return Err(error);
                            }
                        }
                    }
                    return Ok(Operation {
                        message: Some(crate::i18n::t("native.manualPaste").into()),
                    });
                }
                Ok(Operation {
                    message: Some(crate::i18n::t("native.copied").into()),
                })
            }
            Action::Pin { id, pinned } => {
                let before = self.history.clone();
                if !self.history.pin(id, pinned) {
                    return Err(crate::i18n::t("native.recordRemoved").into());
                }
                self.commit_history(before)?;
                if self.history.top_pin().is_none() {
                    self.restore.cancel();
                }
                self.publish();
                Ok(Operation { message: None })
            }
            Action::Delete { id } => {
                let before = self.history.clone();
                if !self.history.delete(id) {
                    return Err(crate::i18n::t("native.recordRemoved").into());
                }
                self.commit_history(before)?;
                if self.history.top_pin().is_none() {
                    self.restore.cancel();
                }
                self.publish();
                Ok(Operation {
                    message: Some(crate::i18n::t("native.deleted").into()),
                })
            }
            Action::ClearUnpinned => {
                let before = self.history.clone();
                self.history.clear_unpinned();
                self.commit_history(before)?;
                self.publish();
                Ok(Operation {
                    message: Some(crate::i18n::t("native.cleared").into()),
                })
            }
        }
    }

    fn commit_history(&mut self, before: History) -> Result<(), String> {
        if let Err(error) = self.store.sync(&self.settings, &self.history) {
            self.history = before;
            return Err(error);
        }
        Ok(())
    }

    fn write(
        &mut self,
        payload: &Payload,
        expected: Option<u64>,
        reason: WriteReason,
    ) -> Result<Option<u64>, String> {
        let mut id = [0; 16];
        OsRng.fill_bytes(&mut id);
        let result = self
            .backend
            .as_ref()
            .ok_or(crate::i18n::t("native.serviceUnavailable"))?
            .write(payload, expected, id)?;
        match result {
            Written::Superseded => Ok(None),
            Written::Applied(revision) => {
                self.last_write = Some(OwnWrite {
                    id,
                    revision,
                    reason,
                });
                self.last_revision = Some(revision);
                self.needs_capture = false;
                Ok(Some(revision))
            }
        }
    }

    fn observe(&mut self) {
        let Some(backend) = &self.backend else {
            return;
        };
        let capabilities = backend.capabilities();
        if !capabilities.background {
            self.restore.cancel();
            return;
        }
        if !capabilities.restore_available {
            self.restore.cancel();
        }
        let revision = match backend.revision() {
            Ok(revision) => revision,
            Err(error) => {
                self.set_error(error);
                self.restore.cancel();
                return;
            }
        };
        if self.last_revision != Some(revision) {
            self.last_revision = Some(revision);
            self.needs_capture = true;
            self.restore.changed(
                revision,
                Instant::now(),
                &self.settings,
                capabilities.restore_available && self.history.top_pin().is_some(),
            );
        }
        if self.needs_capture
            && let Err(error) = self.capture_current(false)
        {
            self.set_error(error);
        }
    }

    fn capture_current(&mut self, manual: bool) -> Result<(), String> {
        let capture = self
            .backend
            .as_ref()
            .ok_or(crate::i18n::t("native.serviceUnavailable"))?
            .read(&self.settings.formats)?;
        self.last_revision = Some(capture.revision);
        self.needs_capture = false;
        self.error = None;
        if !manual
            && let Some(own) = self
                .last_write
                .as_ref()
                .filter(|write| write.matches(&capture))
        {
            match own.reason {
                WriteReason::Restore => self.restore.cancel(),
                WriteReason::Choice => self.restore.track_own_write(capture.revision),
            }
            self.publish();
            return Ok(());
        }
        if capture.payload.size() > crate::model::MAX_ITEM_BYTES {
            return Err(crate::i18n::t("native.contentTooLarge").into());
        }
        if let Some(payload) = capture.payload.filtered(&self.settings.formats) {
            if self.history.record(payload).is_none() {
                self.error = Some(crate::i18n::t("native.historyFull").into());
            }
            if let Err(error) = self.store.sync(&self.settings, &self.history) {
                self.store.status = Some(error);
            }
        }
        self.publish();
        Ok(())
    }

    fn restore_if_due(&mut self) {
        let Some(pending) = self.restore.take_due(Instant::now()) else {
            return;
        };
        let Some(pin) = self.history.top_pin().map(|clip| clip.entry.clone()) else {
            return;
        };
        match self.write(&pin.payload, Some(pending.revision), WriteReason::Restore) {
            Ok(Some(_)) => self.publish(),
            Ok(None) => {
                // A newer OS revision takes priority even if its notification is still queued.
                self.last_revision = None;
                self.observe();
            }
            Err(error) => self.set_error(error),
        }
    }

    fn set_error(&mut self, error: String) {
        if self.error.as_deref() != Some(&error) {
            self.error = Some(error);
            self.publish();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_old_origin_marker_cannot_hide_a_new_external_revision() {
        let own = OwnWrite {
            id: [7; 16],
            revision: 42,
            reason: WriteReason::Restore,
        };
        let mut capture = platform::Capture {
            revision: 42,
            payload: Payload::default(),
            origin: Some([7; 16]),
        };
        assert!(own.matches(&capture));
        capture.revision = 43;
        assert!(!own.matches(&capture));
        capture.revision = 42;
        capture.origin = Some([8; 16]);
        assert!(!own.matches(&capture));
    }
}
