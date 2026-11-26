//! Открытый каталог аудио Openverse: CC-лицензии, без ключа, с атрибуцией.
//! https://api.openverse.org/v1/audio/
use serde::Deserialize;
use std::time::Duration;

const API: &str = "https://api.openverse.org/v1/audio/";

#[derive(Debug, Clone, Deserialize)]
pub struct AudioItem {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub creator: Option<String>,
    pub url: String,
    #[serde(default)]
    pub thumbnail: Option<String>,
    #[serde(default)]
    pub license: String,
    #[serde(default)]
    pub license_url: Option<String>,
    #[serde(default)]
    pub attribution: Option<String>,
    /// Длительность в миллисекундах.
    #[serde(default)]
    pub duration: Option<u64>,
    #[serde(default)]
    pub provider: String,
}

impl AudioItem {
    pub fn author(&self) -> &str {
        self.creator.as_deref().unwrap_or("неизвестный автор")
    }
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    #[serde(default)]
    results: Vec<AudioItem>,
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Не удалось создать HTTP-клиент: {e}"))
}

pub fn search(query: &str) -> Result<Vec<AudioItem>, String> {
    let response = client()?
        .get(API)
        .query(&[
            ("q", query),
            ("page_size", "20"),
            ("license_type", "commercial,modification"),
        ])
        .header("User-Agent", "SiDaWPlayer/0.3.0 (personal music player)")
        .send()
        .map_err(|e| format!("Нет связи с Openverse: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Openverse вернул HTTP {}", response.status()));
    }
    let data: SearchResponse = response.json().map_err(|e| format!("Не удалось разобрать ответ: {e}"))?;
    Ok(data.results)
}

pub fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    let response = client()?
        .get(url)
        .header("User-Agent", "SiDaWPlayer/0.3.0 (personal music player)")
        .send()
        .map_err(|e| format!("Не удалось скачать трек: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Источник вернул HTTP {}", response.status()));
    }
    Ok(response.bytes().map_err(|e| format!("Ошибка чтения потока: {e}"))?.to_vec())
}
