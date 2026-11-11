use std::{io::Cursor, time::Duration};

use image::{DynamicImage, ImageFormat, ImageReader, Limits};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;

pub const MAX_ITEM_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_HISTORY_BYTES: usize = 128 * 1024 * 1024;
pub type ClipId = u64;
pub type WriteId = [u8; 16];

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Retention {
    Session,
    Pinned,
    All,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Formats {
    pub text: bool,
    pub link: bool,
    pub rich_text: bool,
    pub image: bool,
    pub files: bool,
}

impl Default for Formats {
    fn default() -> Self {
        Self {
            text: true,
            link: true,
            rich_text: true,
            image: true,
            files: true,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub shortcut: String,
    pub formats: Formats,
    pub retention: Retention,
    pub restore_enabled: bool,
    pub restore_seconds: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            shortcut: if cfg!(target_os = "macos") {
                "Control+Shift+V"
            } else {
                "Super+V"
            }
            .into(),
            formats: Formats::default(),
            retention: Retention::Pinned,
            restore_enabled: false,
            restore_seconds: 5,
        }
    }
}

impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if !(1..=3600).contains(&self.restore_seconds) {
            return Err("恢复时间应为 1–3600 秒。".into());
        }
        crate::windows::validate_shortcut(&self.shortcut).map(|_| ())
    }

    pub fn restore_delay(&self) -> Duration {
        Duration::from_secs(self.restore_seconds.into())
    }
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct Payload {
    pub text: Option<String>,
    pub html: Option<String>,
    pub rtf: Option<Vec<u8>>,
    pub png: Option<Vec<u8>>,
    pub files: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Text,
    Link,
    RichText,
    Image,
    Files,
}

impl Payload {
    pub fn filtered(mut self, formats: &Formats) -> Option<Self> {
        if !self.files.is_empty() {
            return (formats.files && self.size() <= MAX_ITEM_BYTES).then(|| Self {
                files: self.files,
                ..Self::default()
            });
        }
        if !self.text.as_deref().is_some_and(|text| {
            !text.is_empty()
                && if is_link(text) {
                    formats.link
                } else {
                    formats.text
                }
        }) {
            self.text = None;
        }
        if !formats.rich_text {
            self.html = None;
            self.rtf = None;
        }
        if !formats.image {
            self.png = None;
        }
        let size = self.size();
        (size > 0 && size <= MAX_ITEM_BYTES).then_some(self)
    }

    pub fn kind(&self) -> Kind {
        if !self.files.is_empty() {
            Kind::Files
        } else if self.png.is_some() {
            Kind::Image
        } else if self.html.is_some() || self.rtf.is_some() {
            Kind::RichText
        } else if self.text.as_deref().is_some_and(is_link) {
            Kind::Link
        } else {
            Kind::Text
        }
    }

    pub fn size(&self) -> usize {
        self.text.as_ref().map_or(0, String::len)
            + self.html.as_ref().map_or(0, String::len)
            + self.rtf.as_ref().map_or(0, Vec::len)
            + self.png.as_ref().map_or(0, Vec::len)
            + self.files.iter().map(String::len).sum::<usize>()
    }

    pub fn fingerprint(&self) -> [u8; 32] {
        let mut digest = Sha256::new();
        bincode::serialize_into(&mut digest, self).expect("clipboard payload is serializable");
        digest.finalize().into()
    }

    pub fn preview_text(&self) -> String {
        if !self.files.is_empty() {
            return self
                .files
                .iter()
                .take(4)
                .map(|file| {
                    Url::parse(file)
                        .ok()
                        .and_then(|url| url.to_file_path().ok())
                        .and_then(|path| {
                            path.file_name()
                                .map(|name| name.to_string_lossy().into_owned())
                        })
                        .unwrap_or_else(|| file.chars().take(80).collect())
                })
                .collect::<Vec<_>>()
                .join("\n");
        }
        self.text
            .as_deref()
            .unwrap_or_default()
            .chars()
            .take(640)
            .collect()
    }
}

pub fn is_link(text: &str) -> bool {
    let trimmed = text.trim();
    !trimmed.contains(char::is_whitespace)
        && Url::parse(trimmed)
            .is_ok_and(|url| matches!(url.scheme(), "http" | "https") && url.has_host())
}

pub fn file_uri(value: &str) -> Option<String> {
    let url = if value.starts_with("file:") {
        let url = Url::parse(value).ok()?;
        if url.to_file_path().ok()?.as_os_str().is_empty()
            || url.host_str().is_some_and(|host| host != "localhost")
        {
            return None;
        }
        url
    } else {
        let path = std::path::Path::new(value);
        Url::from_file_path(path).ok()?
    };
    Some(url.into())
}

pub fn decode_image(bytes: &[u8]) -> Result<DynamicImage, String> {
    if bytes.len() > MAX_ITEM_BYTES {
        return Err("图片超过单条记录的大小上限。".into());
    }
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "无法识别图片。".to_string())?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(12_000);
    limits.max_image_height = Some(12_000);
    limits.max_alloc = Some(160 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(|_| "无法读取图片。".into())
}

pub fn png_bytes(image: &DynamicImage) -> Result<Vec<u8>, String> {
    let mut bytes = Cursor::new(Vec::new());
    image
        .write_to(&mut bytes, ImageFormat::Png)
        .map_err(|_| "无法转换图片。".to_string())?;
    Ok(bytes.into_inner())
}

pub fn thumbnail(bytes: &[u8]) -> Result<Vec<u8>, String> {
    png_bytes(&decode_image(bytes)?.thumbnail(672, 256))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_representations_without_changing_copy_semantics() {
        let rich = Payload {
            text: Some("内容".into()),
            html: Some("<b>内容</b>".into()),
            rtf: Some(b"{\\rtf1 content}".to_vec()),
            ..Payload::default()
        };
        let text_only = Formats {
            rich_text: false,
            ..Formats::default()
        };
        let captured = rich.clone().filtered(&text_only).unwrap();
        assert_eq!(captured.kind(), Kind::Text);
        assert_eq!(captured.text.as_deref(), Some("内容"));
        assert!(captured.html.is_none() && captured.rtf.is_none());
        assert_eq!(
            rich.filtered(&Formats::default()).unwrap().kind(),
            Kind::RichText
        );

        let link = Payload {
            text: Some("https://example.org/".into()),
            ..Payload::default()
        };
        assert!(
            link.filtered(&Formats {
                link: false,
                ..Formats::default()
            })
            .is_none()
        );
        let file = Payload {
            text: Some("report.pdf".into()),
            files: vec!["file:///report.pdf".into()],
            ..Payload::default()
        };
        assert!(
            file.filtered(&Formats {
                files: false,
                ..Formats::default()
            })
            .is_none()
        );
    }
}
