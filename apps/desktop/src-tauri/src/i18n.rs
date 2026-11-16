use std::{
    collections::HashMap,
    sync::{
        OnceLock,
        atomic::{AtomicUsize, Ordering},
    },
};

#[derive(Clone, Copy, Debug, Default, serde::Deserialize, Eq, PartialEq, serde::Serialize)]
pub enum Language {
    #[default]
    #[serde(rename = "system")]
    System,
    #[serde(rename = "en")]
    English,
    #[serde(rename = "zh-CN")]
    SimplifiedChinese,
    #[serde(rename = "zh-TW")]
    TraditionalChinese,
    #[serde(rename = "ja")]
    Japanese,
    #[serde(rename = "ko")]
    Korean,
    #[serde(rename = "de")]
    German,
    #[serde(rename = "fr")]
    French,
    #[serde(rename = "es")]
    Spanish,
    #[serde(rename = "pt")]
    Portuguese,
    #[serde(rename = "ru")]
    Russian,
}

impl Language {
    fn resolve(self, system: &'static str) -> &'static str {
        match self {
            Self::System => system,
            Self::English => "en",
            Self::SimplifiedChinese => "zh-CN",
            Self::TraditionalChinese => "zh-TW",
            Self::Japanese => "ja",
            Self::Korean => "ko",
            Self::German => "de",
            Self::French => "fr",
            Self::Spanish => "es",
            Self::Portuguese => "pt",
            Self::Russian => "ru",
        }
    }
}

const CATALOGS: [(&str, &str); 10] = [
    (
        "en",
        include_str!("../../../../packages/i18n/locales/en.json"),
    ),
    (
        "zh-CN",
        include_str!("../../../../packages/i18n/locales/zh-CN.json"),
    ),
    (
        "zh-TW",
        include_str!("../../../../packages/i18n/locales/zh-TW.json"),
    ),
    (
        "ja",
        include_str!("../../../../packages/i18n/locales/ja.json"),
    ),
    (
        "ko",
        include_str!("../../../../packages/i18n/locales/ko.json"),
    ),
    (
        "de",
        include_str!("../../../../packages/i18n/locales/de.json"),
    ),
    (
        "fr",
        include_str!("../../../../packages/i18n/locales/fr.json"),
    ),
    (
        "es",
        include_str!("../../../../packages/i18n/locales/es.json"),
    ),
    (
        "pt",
        include_str!("../../../../packages/i18n/locales/pt.json"),
    ),
    (
        "ru",
        include_str!("../../../../packages/i18n/locales/ru.json"),
    ),
];

struct Localization {
    system_locale: &'static str,
    selected: AtomicUsize,
    messages: Vec<HashMap<String, String>>,
}

fn localization() -> &'static Localization {
    static LOCALIZATION: OnceLock<Localization> = OnceLock::new();
    LOCALIZATION.get_or_init(|| {
        let locale = resolve_locale(&system_languages());
        Localization {
            system_locale: locale,
            selected: AtomicUsize::new(
                CATALOGS
                    .iter()
                    .position(|(name, _)| *name == locale)
                    .unwrap(),
            ),
            messages: CATALOGS
                .iter()
                .map(|(_, source)| serde_json::from_str(source).expect("bundled locale catalog"))
                .collect(),
        }
    })
}

pub fn locale() -> &'static str {
    CATALOGS[localization().selected.load(Ordering::Acquire)].0
}

pub fn set_language(language: Language) {
    let localization = localization();
    let locale = language.resolve(localization.system_locale);
    let index = CATALOGS
        .iter()
        .position(|(name, _)| *name == locale)
        .unwrap();
    localization.selected.store(index, Ordering::Release);
}

pub fn t(key: &'static str) -> &'static str {
    let localization = localization();
    localization.messages[localization.selected.load(Ordering::Acquire)]
        .get(key)
        .filter(|value| !value.is_empty())
        .or_else(|| localization.messages[0].get(key))
        .map(String::as_str)
        .expect("known translation key")
}

pub fn with_error(key: &'static str, error: impl std::fmt::Display) -> String {
    t(key).replace("{error}", &error.to_string())
}

fn resolve_locale(languages: &[String]) -> &'static str {
    for language in languages {
        let normalized = language.trim().replace('_', "-").to_ascii_lowercase();
        let parts: Vec<_> = normalized.split('-').collect();
        let base = parts[0];
        if !(2..=3).contains(&base.len())
            || !base.bytes().all(|ch| ch.is_ascii_lowercase())
            || parts[1..].iter().any(|part| {
                part.is_empty()
                    || part.len() > 8
                    || !part.bytes().all(|ch| ch.is_ascii_alphanumeric())
            })
        {
            continue;
        }
        if base == "zh" {
            let subtags: Vec<_> = parts[1..]
                .iter()
                .copied()
                .take_while(|part| part.len() != 1)
                .collect();
            match subtags
                .iter()
                .find(|part| part.len() == 4 && part.bytes().all(|ch| ch.is_ascii_lowercase()))
                .copied()
            {
                Some("hant") => return "zh-TW",
                Some("hans") => return "zh-CN",
                Some(_) => continue,
                None => {
                    return if subtags
                        .iter()
                        .any(|part| matches!(*part, "tw" | "hk" | "mo"))
                    {
                        "zh-TW"
                    } else {
                        "zh-CN"
                    };
                }
            }
        }
        if let Some((name, _)) = CATALOGS.iter().find(|(name, _)| *name == base) {
            return name;
        }
    }
    "en"
}

#[cfg(windows)]
fn system_languages() -> Vec<String> {
    use windows_sys::Win32::Globalization::{GetUserPreferredUILanguages, MUI_LANGUAGE_NAME};
    let mut count = 0;
    let mut length = 0;
    unsafe {
        if GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &mut count,
            std::ptr::null_mut(),
            &mut length,
        ) == 0
            || length == 0
        {
            return Vec::new();
        }
        let mut buffer = vec![0u16; length as usize];
        if GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &mut count,
            buffer.as_mut_ptr(),
            &mut length,
        ) == 0
        {
            return Vec::new();
        }
        buffer
            .split(|unit| *unit == 0)
            .filter(|part| !part.is_empty())
            .map(String::from_utf16_lossy)
            .collect()
    }
}

#[cfg(not(windows))]
fn system_languages() -> Vec<String> {
    // POSIX locale precedence; an explicit C/POSIX locale deliberately resolves to English.
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .into_iter()
        .filter_map(|name| std::env::var(name).ok())
        .find(|value| !value.is_empty())
        .map(|value| vec![value.split('.').next().unwrap_or(&value).to_owned()])
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_override_and_system_mode_share_the_bundled_catalogs() {
        assert_eq!(Language::System.resolve("zh-CN"), "zh-CN");
        for (locale, _) in CATALOGS {
            let language: Language = serde_json::from_value(serde_json::json!(locale)).unwrap();
            assert_eq!(language.resolve("zh-CN"), locale);
            assert_eq!(serde_json::to_value(language).unwrap(), locale);
        }
    }

    #[test]
    fn language_negotiation_matches_the_shared_contract() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("../../../../packages/i18n/locale-cases.json"))
                .unwrap();
        for case in cases.as_array().unwrap() {
            let languages: Vec<String> = serde_json::from_value(case["languages"].clone()).unwrap();
            assert_eq!(
                resolve_locale(&languages),
                case["expected"].as_str().unwrap(),
                "{languages:?}"
            );
        }
    }

    #[test]
    fn every_native_key_has_a_nonempty_translation_in_every_language() {
        let english: HashMap<String, String> = serde_json::from_str(CATALOGS[0].1).unwrap();
        for (locale, source) in CATALOGS {
            let messages: HashMap<String, String> = serde_json::from_str(source).unwrap();
            assert_eq!(messages.len(), english.len(), "{locale}");
            for key in english.keys() {
                assert!(
                    messages
                        .get(key)
                        .is_some_and(|value| !value.trim().is_empty()),
                    "{locale}: {key}"
                );
            }
        }
    }
}
