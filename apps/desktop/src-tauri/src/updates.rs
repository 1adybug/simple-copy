use std::{sync::Mutex, time::Duration};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::{Mutex as AsyncMutex, watch};

const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const DEFER_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Unavailable,
    Idle,
    Checking,
    UpToDate,
    Available,
    Downloading,
    Installing,
    CheckFailed,
    DownloadFailed,
    InstallFailed,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    revision: u64,
    current_version: String,
    status: Status,
    version: Option<String>,
    downloaded: u64,
    total: Option<u64>,
}

#[derive(Default)]
struct Pending {
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
}

pub struct Updates {
    snapshot: Mutex<Snapshot>,
    pending: AsyncMutex<Pending>,
    automatic: watch::Sender<bool>,
}

impl Updates {
    pub fn new(app: &AppHandle) -> Self {
        let configured = cfg!(windows)
            && app.config().plugins.0.get("updater").is_some_and(|config| {
                config["pubkey"]
                    .as_str()
                    .is_some_and(|key| !key.trim().is_empty())
                    && config["endpoints"]
                        .as_array()
                        .is_some_and(|urls| !urls.is_empty())
            });
        Self {
            snapshot: Mutex::new(Snapshot {
                revision: 0,
                current_version: app.package_info().version.to_string(),
                status: if configured {
                    Status::Idle
                } else {
                    Status::Unavailable
                },
                version: None,
                downloaded: 0,
                total: None,
            }),
            pending: AsyncMutex::new(Pending::default()),
            automatic: watch::channel(false).0,
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        self.snapshot.lock().expect("update snapshot lock").clone()
    }

    fn publish(&self, app: &AppHandle, change: impl FnOnce(&mut Snapshot)) -> Snapshot {
        let mut snapshot = self.snapshot.lock().expect("update snapshot lock");
        change(&mut snapshot);
        snapshot.revision += 1;
        let _ = app.emit_to("settings", "update-state", &*snapshot);
        snapshot.clone()
    }

    fn status(&self, app: &AppHandle, status: Status) -> Snapshot {
        self.publish(app, |snapshot| snapshot.status = status)
    }

    pub fn set_automatic(&self, enabled: bool) {
        self.automatic.send_if_modified(|current| {
            if *current == enabled {
                return false;
            }
            *current = enabled;
            true
        });
    }

    // Native ownership keeps the schedule alive when either webview is hidden or destroyed.
    pub fn start(app: AppHandle) {
        tauri::async_runtime::spawn(async move {
            let updates = app.state::<Self>();
            let mut automatic = updates.automatic.subscribe();
            let mut next = tokio::time::Instant::now();
            loop {
                if !*automatic.borrow_and_update() {
                    if automatic.changed().await.is_err() {
                        break;
                    }
                    next = tokio::time::Instant::now();
                    continue;
                }
                tokio::select! {
                    changed = automatic.changed() => {
                        if changed.is_err() { break; }
                        next = tokio::time::Instant::now();
                    }
                    () = tokio::time::sleep_until(next) => {
                        let delay = updates.run_automatic(&app).await;
                        next = tokio::time::Instant::now() + delay;
                    }
                }
            }
        });
    }

    async fn find_update(&self, app: &AppHandle, pending: &mut Pending) {
        *pending = Pending::default();
        self.publish(app, |snapshot| {
            snapshot.status = Status::Checking;
            snapshot.version = None;
            snapshot.downloaded = 0;
            snapshot.total = None;
        });
        let result = tokio::time::timeout(Duration::from_secs(30), async {
            app.updater_builder()
                .timeout(Duration::from_secs(10 * 60))
                .build()?
                .check()
                .await
        })
        .await
        .map_err(|error| error.to_string())
        .and_then(|result| result.map_err(|error| error.to_string()));
        match result {
            Ok(update) => {
                self.publish(app, |snapshot| {
                    snapshot.version = update.as_ref().map(|update| update.version.clone());
                    snapshot.status = if update.is_some() {
                        Status::Available
                    } else {
                        Status::UpToDate
                    };
                });
                pending.update = update;
            }
            Err(error) => {
                eprintln!("Update check failed: {error}");
                self.status(app, Status::CheckFailed);
            }
        }
    }

    pub async fn check(&self, app: &AppHandle) -> Snapshot {
        if self.snapshot().status == Status::Unavailable {
            return self.snapshot();
        }
        // A second request observes the same operation instead of queuing another download.
        let Ok(mut pending) = self.pending.try_lock() else {
            return self.snapshot();
        };
        self.find_update(app, &mut pending).await;
        self.snapshot()
    }

    fn can_install_automatically(&self, app: &AppHandle) -> bool {
        *self.automatic.borrow() && app.get_webview_window("settings").is_none()
    }

    async fn run_automatic(&self, app: &AppHandle) -> Duration {
        if self.snapshot().status == Status::Unavailable {
            return CHECK_INTERVAL;
        }
        let Ok(mut pending) = self.pending.try_lock() else {
            return DEFER_INTERVAL;
        };
        if pending.update.is_none() {
            self.find_update(app, &mut pending).await;
        }
        if pending.update.is_some() {
            // Do not interrupt a settings edit, including changes queued in its webview.
            if !self.can_install_automatically(app) {
                return DEFER_INTERVAL;
            }
            self.install_pending(app, &mut pending, true).await;
            if self.snapshot().status == Status::Available {
                return DEFER_INTERVAL;
            }
        }
        CHECK_INTERVAL
    }

    pub async fn install(&self, app: &AppHandle) -> Snapshot {
        let Ok(mut pending) = self.pending.try_lock() else {
            return self.snapshot();
        };
        self.install_pending(app, &mut pending, false).await;
        self.snapshot()
    }

    async fn install_pending(&self, app: &AppHandle, pending: &mut Pending, automatic: bool) {
        let Some(update) = pending.update.as_ref() else {
            return;
        };
        if pending.bytes.is_none() {
            self.publish(app, |snapshot| {
                snapshot.status = Status::Downloading;
                snapshot.downloaded = 0;
                snapshot.total = None;
            });
            let result = update
                .download(
                    |bytes, total| {
                        self.publish(app, |snapshot| {
                            snapshot.downloaded += bytes as u64;
                            snapshot.total = total;
                        });
                    },
                    || {},
                )
                .await;
            match result {
                Ok(bytes) => pending.bytes = Some(bytes),
                Err(error) => {
                    eprintln!("Update download failed: {error}");
                    self.status(app, Status::DownloadFailed);
                    return;
                }
            }
        }
        // Recheck after downloading: disabling the option or opening settings cancels auto-install.
        if automatic && !self.can_install_automatically(app) {
            self.status(app, Status::Available);
            return;
        }
        self.status(app, Status::Installing);
        let update = update.clone();
        let bytes = pending.bytes.take().expect("verified update bytes");
        // On Windows the plugin verifies the signature, launches NSIS and restarts the app.
        let result = tauri::async_runtime::spawn_blocking(move || update.install(bytes)).await;
        match result {
            Ok(Ok(())) => {}
            result => {
                eprintln!("Update installation failed: {result:?}");
                self.status(app, Status::InstallFailed);
            }
        }
    }
}
