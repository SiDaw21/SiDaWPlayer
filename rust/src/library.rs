//! Медиатека и сохранение состояния в %APPDATA%/SiDaW/SiDaW Player/state.json.
use crate::eq::EqParams;
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
}

impl Track {
    pub fn from_path(path: &Path) -> Self {
        let stem = path.file_stem().unwrap_or_default().to_string_lossy().into_owned();
        let (artist, title) = match stem.split_once(" - ") {
            Some((a, b)) => (a.trim().to_owned(), b.trim().to_owned()),
            None => ("Локальный файл".to_owned(), stem.clone()),
        };
        Self {
            id: format!("file:{}", path.to_string_lossy()),
            path: path.to_string_lossy().into_owned(),
            title,
            artist,
            album: "Мои файлы".to_owned(),
        }
    }

    pub fn path_buf(&self) -> PathBuf {
        PathBuf::from(&self.path)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedState {
    pub tracks: Vec<Track>,
    pub favorites: Vec<String>,
    pub current_id: Option<String>,
    pub volume: f32,
    pub eq: EqParams,
}

impl Default for SavedState {
    fn default() -> Self {
        Self {
            tracks: Vec::new(),
            favorites: Vec::new(),
            current_id: None,
            volume: 0.72,
            eq: EqParams::default(),
        }
    }
}

fn config_path() -> Option<PathBuf> {
    ProjectDirs::from("com", "SiDaW", "SiDaW Player").map(|dirs| dirs.config_dir().join("state.json"))
}

/// Демо-треки лежат рядом с exe (установщик копирует их в assets/audio),
/// а при запуске из репозитория берутся из web-версии.
fn demo_dir() -> Option<PathBuf> {
    let near_exe = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("assets").join("audio")));
    if near_exe.as_ref().map_or(false, |p| p.join("morning-light.wav").exists()) {
        return near_exe;
    }
    let in_repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../sidaw-player/assets/audio");
    if in_repo.join("morning-light.wav").exists() {
        Some(in_repo)
    } else {
        None
    }
}

pub fn demo_tracks() -> Vec<Track> {
    let Some(dir) = demo_dir() else { return Vec::new() };
    let demos = [
        ("t1", "morning-light.wav", "Утренний свет", "Aurora Fields", "Morning Light"),
        ("t2", "neon-rain.wav", "Неоновый дождь", "Luna Wave", "Neon Rain"),
        ("t3", "midnight-city.wav", "Полночный город", "Night Atlas", "Midnight City"),
        ("t4", "warm-wind.wav", "Тёплый ветер", "Solar Drift", "Warm Wind"),
    ];
    demos.iter().map(|(id, file, title, artist, album)| Track {
        id: format!("demo-{id}"),
        path: dir.join(file).to_string_lossy().into_owned(),
        title: (*title).to_owned(),
        artist: (*artist).to_owned(),
        album: (*album).to_owned(),
    }).collect()
}

pub fn load_state() -> SavedState {
    let saved: SavedState = config_path()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<SavedState>(&s).ok())
        .unwrap_or_default();

    // Демо-треки всегда доступны; пользовательские добавляются после них.
    let SavedState { tracks: saved_tracks, favorites, current_id, volume, eq } = saved;
    let mut tracks = demo_tracks();
    for track in saved_tracks {
        if !tracks.iter().any(|t| t.id == track.id) {
            tracks.push(track);
        }
    }
    SavedState { tracks, favorites, current_id, volume, eq }
}

pub fn save_state(state: &SavedState) {
    let Some(path) = config_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let _ = fs::write(path, json);
    }
}
