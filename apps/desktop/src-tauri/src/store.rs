use std::{collections::HashMap, fs, path::Path};

use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, OsRng, rand_core::RngCore},
};
use rusqlite::{Connection, OptionalExtension, params};

use crate::{
    history::{Entry, History, now_millis},
    model::{ClipId, Retention, Settings},
};

pub struct Store {
    db: Connection,
    cipher: Option<Aes256Gcm>,
    saved: HashMap<ClipId, (u64, Option<u64>, u64)>,
    pub status: Option<String>,
    memory_only: bool,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| crate::i18n::with_error("native.createDirectory", error))?;
        }
        let db = Connection::open(path)
            .map_err(|error| crate::i18n::with_error("native.openDatabase", error))?;
        Self::initialize(db, false, None)
    }

    pub fn memory(reason: String) -> Self {
        Self::initialize(
            Connection::open_in_memory().expect("in-memory SQLite initialization"),
            true,
            Some(reason),
        )
        .expect("in-memory SQLite schema")
    }

    fn initialize(
        mut db: Connection,
        memory_only: bool,
        status: Option<String>,
    ) -> Result<Self, String> {
        db.busy_timeout(std::time::Duration::from_secs(3))
            .map_err(db_error)?;
        let version: u32 = db
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(db_error)?;
        if version > 2 {
            return Err(crate::i18n::t("native.newerDatabase").into());
        }
        let tx = db.transaction().map_err(db_error)?;
        tx.execute_batch(
            "PRAGMA secure_delete = ON;
             CREATE TABLE IF NOT EXISTS settings (
                 id INTEGER PRIMARY KEY CHECK(id = 1), value TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS entries (
                 id INTEGER PRIMARY KEY, pinned INTEGER NOT NULL, sealed BLOB NOT NULL,
                 copied_at INTEGER NOT NULL
             );",
        )
        .map_err(db_error)?;
        if version == 1 {
            tx.execute_batch(
                "ALTER TABLE entries ADD COLUMN copied_at INTEGER NOT NULL DEFAULT 0;",
            )
            .map_err(db_error)?;
            // Older versions only stored ordering. Give those records one full lifetime.
            tx.execute("UPDATE entries SET copied_at = ?1", [now_millis()])
                .map_err(db_error)?;
        }
        tx.pragma_update(None, "user_version", 2)
            .map_err(db_error)?;
        tx.commit().map_err(db_error)?;
        Ok(Self {
            db,
            cipher: None,
            saved: HashMap::new(),
            status,
            memory_only,
        })
    }

    pub fn load(&mut self) -> Result<(Settings, History), String> {
        let serialized: Option<String> = self
            .db
            .query_row("SELECT value FROM settings WHERE id = 1", [], |row| {
                row.get(0)
            })
            .optional()
            .map_err(db_error)?;
        let settings = serialized
            .map(|json| {
                serde_json::from_str::<Settings>(&json)
                    .map_err(|_| crate::i18n::t("native.readSettings").to_string())
            })
            .transpose()?
            .unwrap_or_default();
        settings.validate()?;
        if settings.retention == Retention::Session {
            self.db
                .execute("DELETE FROM entries", [])
                .map_err(db_error)?;
        } else {
            if settings.retention == Retention::Pinned {
                self.db
                    .execute("DELETE FROM entries WHERE pinned = 0", [])
                    .map_err(db_error)?;
            }
            self.unlock();
        }
        let max_id = self
            .db
            .query_row("SELECT COALESCE(MAX(id), 0) FROM entries", [], |row| {
                row.get(0)
            })
            .map_err(db_error)?;
        let mut entries = Vec::new();
        if let Some(cipher) = self.cipher.clone() {
            let mut query = self
                .db
                .prepare("SELECT id, sealed, copied_at FROM entries ORDER BY id")
                .map_err(db_error)?;
            let rows = query
                .query_map([], |row| {
                    Ok((
                        row.get::<_, u64>(0)?,
                        row.get::<_, Vec<u8>>(1)?,
                        row.get::<_, u64>(2)?,
                    ))
                })
                .map_err(db_error)?;
            for row in rows {
                let (id, sealed, copied_at) = row.map_err(db_error)?;
                let entry = unseal(&cipher, &sealed).and_then(|mut entry| {
                    if entry.id == id && entry.payload.size() <= crate::model::MAX_ITEM_BYTES {
                        entry.copied_at = copied_at;
                        Ok(entry)
                    } else {
                        Err(crate::i18n::t("native.invalidEntry").into())
                    }
                });
                match entry {
                    Ok(entry) => {
                        self.saved
                            .insert(id, (entry.recency, entry.pin_order, entry.copied_at));
                        entries.push(entry);
                    }
                    Err(_) => {
                        self.status = Some(crate::i18n::t("native.partialDecrypt").into());
                        // Prevent later synchronization from pruning records we could not load.
                        self.cipher = None;
                        self.saved.clear();
                        let history = History::load(
                            Vec::new(),
                            max_id,
                            settings.max_history_items,
                            settings.expiry_seconds,
                        );
                        return Ok((settings, history));
                    }
                }
            }
        }
        let history = History::load(
            entries,
            max_id,
            settings.max_history_items,
            settings.expiry_seconds,
        );
        // Apply startup expiration to disk as well as the in-memory model.
        if self.cipher.is_some() {
            self.sync(&settings, &history)?;
        }
        Ok((settings, history))
    }

    fn unlock(&mut self) {
        if self.cipher.is_some() || self.memory_only {
            return;
        }
        let result = (|| -> Result<Aes256Gcm, String> {
            let entry = keyring::Entry::new("io.simplecopy.clipboard", "history-key-v1")
                .map_err(|error| error.to_string())?;
            let key = match entry.get_secret() {
                Ok(key) => key,
                Err(keyring::Error::NoEntry) => {
                    let count: u64 = self
                        .db
                        .query_row("SELECT COUNT(*) FROM entries", [], |row| row.get(0))
                        .map_err(db_error)?;
                    if count > 0 {
                        return Err(crate::i18n::t("native.missingKey").into());
                    }
                    let mut key = vec![0; 32];
                    OsRng.fill_bytes(&mut key);
                    entry.set_secret(&key).map_err(|error| error.to_string())?;
                    key
                }
                Err(error) => return Err(error.to_string()),
            };
            Aes256Gcm::new_from_slice(&key).map_err(|_| crate::i18n::t("native.invalidKey").into())
        })();
        match result {
            Ok(cipher) => {
                self.cipher = Some(cipher);
                self.status = None;
            }
            Err(_) => {
                self.status = Some(crate::i18n::t("native.keyringUnavailable").into());
            }
        }
    }

    pub fn sync(&mut self, settings: &Settings, history: &History) -> Result<(), String> {
        if settings.retention != Retention::Session
            && self.cipher.is_none()
            && self.status.is_none()
        {
            self.unlock();
        }
        let mut changed = Vec::new();
        let mut retained = HashMap::new();
        if let Some(cipher) = &self.cipher {
            for entry in history.retained(settings.retention) {
                let stamp = (entry.recency, entry.pin_order, entry.copied_at);
                if self.saved.get(&entry.id) != Some(&stamp) {
                    changed.push((
                        entry.id,
                        entry.pin_order.is_some(),
                        seal(cipher, entry)?,
                        entry.copied_at,
                    ));
                }
                retained.insert(entry.id, stamp);
            }
        }
        let tx = self.db.transaction().map_err(db_error)?;
        tx.execute(
            "INSERT INTO settings(id, value) VALUES(1, ?1)
             ON CONFLICT(id) DO UPDATE SET value = excluded.value",
            [serde_json::to_string(settings).map_err(|error| error.to_string())?],
        )
        .map_err(db_error)?;
        match settings.retention {
            Retention::Session => {
                tx.execute("DELETE FROM entries", []).map_err(db_error)?;
            }
            Retention::Pinned => {
                tx.execute("DELETE FROM entries WHERE pinned = 0", [])
                    .map_err(db_error)?;
            }
            Retention::All => {}
        }
        if self.cipher.is_some() {
            let ids: Vec<u64> = tx
                .prepare("SELECT id FROM entries")
                .map_err(db_error)?
                .query_map([], |row| row.get(0))
                .map_err(db_error)?
                .collect::<Result<_, _>>()
                .map_err(db_error)?;
            for id in ids {
                if !retained.contains_key(&id) {
                    tx.execute("DELETE FROM entries WHERE id = ?1", [id])
                        .map_err(db_error)?;
                }
            }
            for (id, pinned, sealed, copied_at) in changed {
                tx.execute(
                    "INSERT INTO entries(id, pinned, sealed, copied_at) VALUES(?1, ?2, ?3, ?4)
                     ON CONFLICT(id) DO UPDATE SET pinned = excluded.pinned, sealed = excluded.sealed,
                         copied_at = excluded.copied_at",
                    params![id, pinned, sealed, copied_at],
                )
                .map_err(db_error)?;
            }
        }
        tx.commit().map_err(db_error)?;
        self.saved = retained;
        Ok(())
    }
}

fn seal(cipher: &Aes256Gcm, entry: &Entry) -> Result<Vec<u8>, String> {
    let mut nonce = [0; 12];
    OsRng.fill_bytes(&mut nonce);
    let plaintext = bincode::serialize(entry).map_err(|error| error.to_string())?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext.as_ref())
        .map_err(|_| crate::i18n::t("native.encrypt").to_string())?;
    Ok([nonce.as_slice(), ciphertext.as_slice()].concat())
}

fn unseal(cipher: &Aes256Gcm, sealed: &[u8]) -> Result<Entry, String> {
    if sealed.len() < 28 {
        return Err(crate::i18n::t("native.incompleteEntry").into());
    }
    let plain = cipher
        .decrypt(Nonce::from_slice(&sealed[..12]), &sealed[12..])
        .map_err(|_| crate::i18n::t("native.decrypt").to_string())?;
    bincode::deserialize(&plain).map_err(|_| crate::i18n::t("native.historyFormat").into())
}

fn db_error(error: rusqlite::Error) -> String {
    crate::i18n::with_error("native.saveHistory", error)
}

#[cfg(test)]
mod tests {
    use crate::model::Payload;

    use super::*;

    #[test]
    fn language_choice_survives_reload_and_can_return_to_system() {
        let mut store =
            Store::initialize(Connection::open_in_memory().unwrap(), false, None).unwrap();
        let mut settings = Settings {
            retention: Retention::Session,
            language: crate::i18n::Language::Japanese,
            ..Settings::default()
        };
        store.sync(&settings, &History::default()).unwrap();
        assert_eq!(store.load().unwrap().0.language, settings.language);
        settings.language = crate::i18n::Language::System;
        store.sync(&settings, &History::default()).unwrap();
        assert_eq!(store.load().unwrap().0.language, settings.language);
    }

    #[test]
    fn retention_changes_prune_disk_and_preserve_session_history() {
        let mut store =
            Store::initialize(Connection::open_in_memory().unwrap(), false, None).unwrap();
        store.cipher = Some(Aes256Gcm::new_from_slice(&[7; 32]).unwrap());
        let mut history = History::default();
        let pin = history
            .record(Payload {
                text: Some("private pinned text".into()),
                ..Payload::default()
            })
            .unwrap();
        history.pin(pin, true);
        history.record(Payload {
            text: Some("ordinary text".into()),
            ..Payload::default()
        });
        let mut settings = Settings {
            retention: Retention::All,
            ..Settings::default()
        };
        store.sync(&settings, &history).unwrap();
        assert_eq!(count(&store), 2);
        let encrypted: Vec<u8> = store
            .db
            .query_row("SELECT sealed FROM entries LIMIT 1", [], |row| row.get(0))
            .unwrap();
        assert!(!encrypted.windows(7).any(|part| part == b"private"));
        settings.retention = Retention::Pinned;
        store.sync(&settings, &history).unwrap();
        assert_eq!(count(&store), 1);
        let (_, reopened) = store.load().unwrap();
        assert_eq!(reopened.previews().len(), 1);
        settings.retention = Retention::Session;
        store.sync(&settings, &history).unwrap();
        assert_eq!(count(&store), 0);
        assert_eq!(history.previews().len(), 2);
    }

    #[test]
    fn repeated_content_persists_the_latest_formats_without_another_row() {
        let mut store =
            Store::initialize(Connection::open_in_memory().unwrap(), false, None).unwrap();
        store.cipher = Some(Aes256Gcm::new_from_slice(&[7; 32]).unwrap());
        let settings = Settings {
            retention: Retention::All,
            ..Settings::default()
        };
        let mut history = History::default();
        let plain = Payload {
            text: Some("same content".into()),
            ..Payload::default()
        };
        let id = history.record(plain.clone()).unwrap();
        history.pin(id, true);
        store.sync(&settings, &history).unwrap();
        let rich = Payload {
            html: Some("<b>same content</b>".into()),
            ..plain
        };
        assert_eq!(history.record(rich.clone()), Some(id));
        store.sync(&settings, &history).unwrap();
        let (_, reopened) = store.load().unwrap();
        assert_eq!(count(&store), 1);
        assert_eq!(reopened.previews().len(), 1);
        let restored = &reopened.get(id).unwrap().entry;
        assert_eq!(restored.payload, rich);
        assert!(restored.pin_order.is_some());
        assert_eq!(restored.recency, history.get(id).unwrap().entry.recency);
    }

    #[test]
    fn history_limit_survives_reload_and_prunes_persisted_entries() {
        for max_history_items in [150, 0] {
            let mut store =
                Store::initialize(Connection::open_in_memory().unwrap(), false, None).unwrap();
            store.cipher = Some(Aes256Gcm::new_from_slice(&[7; 32]).unwrap());
            let mut settings = Settings {
                retention: Retention::All,
                max_history_items,
                ..Settings::default()
            };
            let mut history = History::default();
            history.set_max_items(max_history_items);
            let pinned = history
                .record(Payload {
                    text: Some("pinned".into()),
                    ..Payload::default()
                })
                .unwrap();
            history.pin(pinned, true);
            for index in 0..180 {
                history.record(Payload {
                    text: Some(format!("ordinary {index}")),
                    ..Payload::default()
                });
            }
            store.sync(&settings, &history).unwrap();
            let (loaded_settings, mut reopened) = store.load().unwrap();
            assert_eq!(loaded_settings, settings);
            assert_eq!(
                reopened.previews().len(),
                if max_history_items == 0 { 181 } else { 151 }
            );
            let newest = reopened
                .record(Payload {
                    text: Some("newest".into()),
                    ..Payload::default()
                })
                .unwrap();
            assert_eq!(
                reopened.previews().len(),
                if max_history_items == 0 { 182 } else { 151 }
            );

            settings.max_history_items = 1;
            reopened.set_max_items(settings.max_history_items);
            store.sync(&settings, &reopened).unwrap();
            assert_eq!(count(&store), 2);
            let (loaded_settings, reopened) = store.load().unwrap();
            assert_eq!(loaded_settings.max_history_items, 1);
            assert_eq!(
                reopened
                    .previews()
                    .iter()
                    .map(|clip| clip.id)
                    .collect::<Vec<_>>(),
                [pinned, newest]
            );
        }
    }

    #[test]
    fn failed_limit_change_preserves_persisted_settings_and_history() {
        let mut store =
            Store::initialize(Connection::open_in_memory().unwrap(), false, None).unwrap();
        store.cipher = Some(Aes256Gcm::new_from_slice(&[7; 32]).unwrap());
        let settings = Settings {
            retention: Retention::All,
            ..Settings::default()
        };
        let mut history = History::default();
        for index in 0..3 {
            history.record(Payload {
                text: Some(format!("ordinary {index}")),
                ..Payload::default()
            });
        }
        store.sync(&settings, &history).unwrap();
        store
            .db
            .execute_batch(
                "CREATE TRIGGER reject_pruning BEFORE DELETE ON entries
             BEGIN SELECT RAISE(ABORT, 'pruning failed'); END;",
            )
            .unwrap();

        let reduced_settings = Settings {
            max_history_items: 1,
            ..settings.clone()
        };
        let mut reduced_history = history.clone();
        reduced_history.set_max_items(reduced_settings.max_history_items);
        assert!(store.sync(&reduced_settings, &reduced_history).is_err());
        let (loaded_settings, reopened) = store.load().unwrap();
        assert_eq!(loaded_settings, settings);
        assert_eq!(count(&store), 3);
        assert_eq!(reopened.previews().len(), 3);
        assert_eq!(history.previews().len(), 3);
    }

    #[test]
    fn authenticated_encryption_rejects_damaged_records() {
        let cipher = Aes256Gcm::new_from_slice(&[9; 32]).unwrap();
        let entry = Entry {
            id: 3,
            recency: 1,
            pin_order: None,
            payload: Payload::default(),
            copied_at: now_millis(),
        };
        let mut sealed = seal(&cipher, &entry).unwrap();
        assert_eq!(unseal(&cipher, &sealed).unwrap().id, 3);
        sealed[20] ^= 1;
        assert!(unseal(&cipher, &sealed).is_err());
    }

    #[test]
    fn legacy_database_migration_keeps_payloads_and_starts_expiry_once() {
        let db = Connection::open_in_memory().unwrap();
        let cipher = Aes256Gcm::new_from_slice(&[7; 32]).unwrap();
        let entry = Entry {
            id: 1,
            recency: 1,
            pin_order: None,
            payload: Payload {
                text: Some("legacy content".into()),
                ..Payload::default()
            },
            copied_at: 0,
        };
        // The old encrypted entry layout is unchanged by the new schema metadata.
        assert_eq!(
            bincode::serialize(&entry).unwrap(),
            bincode::serialize(&(entry.id, entry.recency, entry.pin_order, &entry.payload))
                .unwrap()
        );
        db.execute_batch(
            "CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id = 1), value TEXT NOT NULL);
             INSERT INTO settings VALUES(1, '{\"retention\":\"all\"}');
             CREATE TABLE entries (id INTEGER PRIMARY KEY, pinned INTEGER NOT NULL, sealed BLOB NOT NULL);
             PRAGMA user_version = 1;",
        ).unwrap();
        db.execute(
            "INSERT INTO entries VALUES(?1, 0, ?2)",
            params![entry.id, seal(&cipher, &entry).unwrap()],
        )
        .unwrap();
        let before = now_millis();
        let mut store = Store::initialize(db, false, None).unwrap();
        store.cipher = Some(cipher.clone());
        let (settings, history) = store.load().unwrap();
        let copied_at = history.get(1).unwrap().entry.copied_at;
        assert!((before..=now_millis()).contains(&copied_at));
        assert_eq!(settings.expiry_seconds, 86_400);
        assert_eq!(history.get(1).unwrap().entry.payload, entry.payload);
        let mut reopened = Store::initialize(store.db, false, None).unwrap();
        reopened.cipher = Some(cipher);
        assert_eq!(
            reopened.load().unwrap().1.get(1).unwrap().entry.copied_at,
            copied_at
        );
    }

    #[test]
    fn startup_expiry_prunes_disk_and_preserves_original_timestamps_and_pins() {
        let mut store =
            Store::initialize(Connection::open_in_memory().unwrap(), false, None).unwrap();
        store.cipher = Some(Aes256Gcm::new_from_slice(&[7; 32]).unwrap());
        let settings = Settings {
            retention: Retention::All,
            expiry_seconds: 60,
            ..Settings::default()
        };
        let mut history = History::default();
        let old = history
            .record(Payload {
                text: Some("old".into()),
                ..Payload::default()
            })
            .unwrap();
        let fresh = history
            .record(Payload {
                text: Some("fresh".into()),
                ..Payload::default()
            })
            .unwrap();
        let pinned = history
            .record(Payload {
                text: Some("pinned".into()),
                ..Payload::default()
            })
            .unwrap();
        history.pin(pinned, true);
        store.sync(&settings, &history).unwrap();
        store
            .db
            .execute(
                "UPDATE entries SET copied_at = ?1 WHERE id IN (?2, ?3)",
                params![now_millis() - 61_000, old, pinned],
            )
            .unwrap();
        let (loaded_settings, loaded) = store.load().unwrap();
        assert_eq!(loaded_settings.expiry_seconds, 60);
        assert!(loaded.get(old).is_none());
        assert_eq!(
            loaded.get(fresh).unwrap().entry.copied_at,
            history.get(fresh).unwrap().entry.copied_at
        );
        assert!(loaded.get(pinned).is_some());
        assert_eq!(count(&store), 2);
        let mut reduced = loaded.clone();
        assert!(reduced.expire(now_millis() + 61_000));
        store.sync(&settings, &reduced).unwrap();
        assert_eq!(count(&store), 1);
        assert!(store.load().unwrap().1.get(pinned).is_some());
    }

    #[test]
    fn failed_expiry_change_preserves_saved_settings_and_history() {
        let mut store =
            Store::initialize(Connection::open_in_memory().unwrap(), false, None).unwrap();
        store.cipher = Some(Aes256Gcm::new_from_slice(&[7; 32]).unwrap());
        let settings = Settings {
            retention: Retention::All,
            ..Settings::default()
        };
        let history = History::load(
            vec![Entry {
                id: 1,
                recency: 1,
                pin_order: None,
                payload: Payload {
                    text: Some("still valid".into()),
                    ..Payload::default()
                },
                copied_at: now_millis() - 10_000,
            }],
            1,
            settings.max_history_items,
            settings.expiry_seconds,
        );
        store.sync(&settings, &history).unwrap();
        store.db.execute_batch("CREATE TRIGGER reject_pruning BEFORE DELETE ON entries BEGIN SELECT RAISE(ABORT, 'pruning failed'); END;").unwrap();
        let reduced_settings = Settings {
            expiry_seconds: 1,
            ..settings.clone()
        };
        let mut reduced = history.clone();
        reduced.set_expiry_seconds(1);
        assert!(store.sync(&reduced_settings, &reduced).is_err());
        let (loaded_settings, loaded) = store.load().unwrap();
        assert_eq!(loaded_settings, settings);
        assert_eq!(loaded.previews().len(), 1);
        assert_eq!(count(&store), 1);
    }

    fn count(store: &Store) -> u64 {
        store
            .db
            .query_row("SELECT COUNT(*) FROM entries", [], |row| row.get(0))
            .unwrap()
    }
}
