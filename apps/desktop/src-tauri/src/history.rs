use std::{sync::Arc, time::Instant};

use serde::{Deserialize, Serialize};

use crate::model::{ClipId, Kind, MAX_HISTORY_BYTES, Payload, Retention, Settings, thumbnail};

const MAX_UNPINNED: usize = 100;

#[derive(Clone, Deserialize, Serialize)]
pub struct Entry {
    pub id: ClipId,
    pub recency: u64,
    pub pin_order: Option<u64>,
    pub payload: Payload,
}

#[derive(Clone)]
pub struct Clip {
    pub entry: Arc<Entry>,
    pub fingerprint: [u8; 32],
    thumbnail: Option<Arc<Vec<u8>>>,
}

impl Clip {
    fn from_entry(entry: Entry) -> Self {
        let thumbnail = entry
            .payload
            .png
            .as_deref()
            .and_then(|png| thumbnail(png).ok());
        Self {
            fingerprint: entry.payload.fingerprint(),
            entry: Arc::new(entry),
            thumbnail: thumbnail.map(Arc::new),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub id: ClipId,
    pub kind: Kind,
    pub pinned: bool,
    pub text: String,
    pub has_thumbnail: bool,
    pub file_count: usize,
}

#[derive(Clone, Default)]
pub struct History {
    clips: Vec<Clip>,
    next_id: ClipId,
    order: u64,
}

impl History {
    pub fn load(entries: Vec<Entry>, max_id: ClipId) -> Self {
        let order = entries
            .iter()
            .map(|entry| entry.recency.max(entry.pin_order.unwrap_or_default()))
            .max()
            .unwrap_or_default();
        let mut history = Self {
            clips: entries.into_iter().map(Clip::from_entry).collect(),
            next_id: max_id.saturating_add(1),
            order,
        };
        history.trim();
        history
    }

    pub fn record(&mut self, payload: Payload) -> Option<ClipId> {
        let fingerprint = payload.fingerprint();
        self.order += 1;
        if let Some(clip) = self
            .clips
            .iter_mut()
            .find(|clip| clip.fingerprint == fingerprint)
        {
            Arc::make_mut(&mut clip.entry).recency = self.order;
            return Some(clip.entry.id);
        }
        let id = self.next_id;
        self.next_id += 1;
        self.clips.push(Clip::from_entry(Entry {
            id,
            recency: self.order,
            pin_order: None,
            payload,
        }));
        self.trim();
        self.get(id).map(|_| id)
    }

    pub fn get(&self, id: ClipId) -> Option<&Clip> {
        self.clips.iter().find(|clip| clip.entry.id == id)
    }

    pub fn image(&self, id: ClipId) -> Option<&[u8]> {
        self.get(id)?.thumbnail.as_deref().map(Vec::as_slice)
    }

    pub fn top_pin(&self) -> Option<&Clip> {
        self.clips
            .iter()
            .filter(|clip| clip.entry.pin_order.is_some())
            .max_by_key(|clip| clip.entry.pin_order)
    }

    pub fn pin(&mut self, id: ClipId, pinned: bool) -> bool {
        let Some(clip) = self.clips.iter_mut().find(|clip| clip.entry.id == id) else {
            return false;
        };
        if clip.entry.pin_order.is_some() != pinned {
            self.order += 1;
            Arc::make_mut(&mut clip.entry).pin_order = pinned.then_some(self.order);
            self.trim();
        }
        true
    }

    pub fn delete(&mut self, id: ClipId) -> bool {
        let previous_len = self.clips.len();
        self.clips.retain(|clip| clip.entry.id != id);
        self.clips.len() != previous_len
    }

    pub fn clear_unpinned(&mut self) {
        self.clips.retain(|clip| clip.entry.pin_order.is_some());
    }

    pub fn previews(&self) -> Vec<Preview> {
        let mut clips: Vec<_> = self.clips.iter().collect();
        clips.sort_by_key(|clip| std::cmp::Reverse((clip.entry.pin_order, clip.entry.recency)));
        clips
            .into_iter()
            .map(|clip| Preview {
                id: clip.entry.id,
                kind: clip.entry.payload.kind(),
                pinned: clip.entry.pin_order.is_some(),
                text: clip.entry.payload.preview_text(),
                has_thumbnail: clip.thumbnail.is_some(),
                file_count: clip.entry.payload.files.len(),
            })
            .collect()
    }

    pub fn retained(&self, policy: Retention) -> impl Iterator<Item = &Entry> {
        self.clips.iter().filter_map(move |clip| {
            let entry = clip.entry.as_ref();
            (policy == Retention::All || (policy == Retention::Pinned && entry.pin_order.is_some()))
                .then_some(entry)
        })
    }

    fn trim(&mut self) {
        let mut bytes: usize = self
            .clips
            .iter()
            .map(|clip| clip.entry.payload.size())
            .sum();
        let mut ordinary = self
            .clips
            .iter()
            .filter(|clip| clip.entry.pin_order.is_none())
            .count();
        if ordinary <= MAX_UNPINNED && bytes <= MAX_HISTORY_BYTES {
            return;
        }
        self.clips.sort_by_key(|clip| clip.entry.recency);
        self.clips.retain(|clip| {
            if clip.entry.pin_order.is_none()
                && (ordinary > MAX_UNPINNED || bytes > MAX_HISTORY_BYTES)
            {
                ordinary -= 1;
                bytes -= clip.entry.payload.size();
                false
            } else {
                true
            }
        });
    }
}

#[derive(Clone, Copy, Debug)]
pub struct PendingRestore {
    pub revision: u64,
    pub deadline: Instant,
}

#[derive(Default)]
pub struct Restore {
    pending: Option<PendingRestore>,
}

impl Restore {
    pub fn changed(&mut self, revision: u64, now: Instant, settings: &Settings, has_pin: bool) {
        self.pending = (settings.restore_enabled && has_pin).then(|| PendingRestore {
            revision,
            deadline: now + settings.restore_delay(),
        });
    }

    pub fn settings_changed(&mut self, before: &Settings, after: &Settings, now: Instant) {
        if !after.restore_enabled {
            self.cancel();
        } else if before.restore_seconds != after.restore_seconds
            && let Some(pending) = &mut self.pending
        {
            pending.deadline = now + after.restore_delay();
        }
    }

    pub fn track_own_write(&mut self, revision: u64) {
        if let Some(pending) = &mut self.pending {
            pending.revision = revision;
        }
    }

    pub fn deadline(&self) -> Option<Instant> {
        self.pending.map(|pending| pending.deadline)
    }

    pub fn take_due(&mut self, now: Instant) -> Option<PendingRestore> {
        if self.pending.is_some_and(|pending| pending.deadline <= now) {
            self.pending.take()
        } else {
            None
        }
    }

    pub fn cancel(&mut self) {
        self.pending = None;
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    fn text(value: &str) -> Payload {
        Payload {
            text: Some(value.into()),
            ..Payload::default()
        }
    }

    #[test]
    fn dedup_keeps_pin_order_and_clear_only_removes_recent() {
        let mut history = History::default();
        let a = history.record(text("a")).unwrap();
        let b = history.record(text("b")).unwrap();
        history.pin(a, true);
        history.pin(b, true);
        assert_eq!(history.record(text("a")), Some(a));
        assert_eq!(history.top_pin().unwrap().entry.id, b);
        let ordinary = history.record(text("ordinary")).unwrap();
        history.clear_unpinned();
        assert!(history.get(ordinary).is_none());
        assert_eq!(
            history
                .previews()
                .iter()
                .map(|clip| clip.id)
                .collect::<Vec<_>>(),
            [b, a]
        );
        history.delete(b);
        assert_eq!(history.top_pin().unwrap().entry.id, a);
    }

    #[test]
    fn only_the_latest_change_can_be_due() {
        let settings = Settings {
            restore_enabled: true,
            ..Settings::default()
        };
        let mut restore = Restore::default();
        let now = Instant::now();
        restore.changed(1, now, &settings, true);
        restore.changed(2, now + Duration::from_secs(4), &settings, true);
        assert!(restore.take_due(now + Duration::from_secs(5)).is_none());
        restore.track_own_write(3);
        assert_eq!(
            restore
                .take_due(now + Duration::from_secs(9))
                .unwrap()
                .revision,
            3
        );
        assert!(restore.deadline().is_none());
    }

    #[test]
    fn no_pin_or_disabled_mode_cancels_pending_restore() {
        let settings = Settings {
            restore_enabled: true,
            ..Settings::default()
        };
        let now = Instant::now();
        let mut restore = Restore::default();
        restore.changed(1, now, &settings, true);
        restore.changed(2, now, &settings, false);
        assert!(restore.deadline().is_none());
        restore.changed(3, now, &settings, true);
        restore.settings_changed(&settings, &Settings::default(), now);
        assert!(restore.deadline().is_none());
    }

    #[test]
    fn changing_delay_rebases_the_existing_deadline_and_resolves_the_current_first_pin() {
        let now = Instant::now();
        let mut settings = Settings {
            restore_enabled: true,
            ..Settings::default()
        };
        let mut restore = Restore::default();
        let mut history = History::default();
        let first = history.record(text("first")).unwrap();
        history.pin(first, true);
        restore.changed(11, now, &settings, true);
        let second = history.record(text("second")).unwrap();
        history.pin(second, true);
        let previous = settings.clone();
        settings.restore_seconds = 2;
        restore.settings_changed(&previous, &settings, now + Duration::from_secs(4));
        assert!(restore.take_due(now + Duration::from_secs(5)).is_none());
        assert_eq!(
            restore
                .take_due(now + Duration::from_secs(6))
                .unwrap()
                .revision,
            11
        );
        assert_eq!(history.top_pin().unwrap().entry.id, second);
        history.delete(second);
        assert_eq!(history.top_pin().unwrap().entry.id, first);
    }

    #[test]
    fn ordinary_history_limits_keep_pinned_entries() {
        let mut history = History::default();
        let pinned = history.record(text("pinned")).unwrap();
        history.pin(pinned, true);
        for index in 0..120 {
            history.record(text(&format!("ordinary {index}")));
        }
        assert_eq!(history.previews().len(), MAX_UNPINNED + 1);
        assert_eq!(history.top_pin().unwrap().entry.id, pinned);
        assert_eq!(history.retained(Retention::Session).count(), 0);
        assert_eq!(history.retained(Retention::Pinned).count(), 1);
        assert_eq!(history.retained(Retention::All).count(), MAX_UNPINNED + 1);
    }
}
