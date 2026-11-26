//! Интерфейс плеера на egui.
use crate::{
    audio::AudioEngine,
    eq::{EqParams, BANDS_HZ, PRESETS},
    library::{self, SavedState, Track},
};
use eframe::egui;
use std::{sync::{Arc, Mutex}, time::Duration};

#[derive(Clone, Copy, PartialEq)]
enum View {
    All,
    Favorites,
    Recent,
}

pub struct SiDawApp {
    state: SavedState,
    engine: AudioEngine,
    params: Arc<Mutex<EqParams>>,
    view: View,
    search: String,
    status: String,
    show_eq: bool,
}

fn format_time(seconds: f32) -> String {
    if !seconds.is_finite() || seconds < 0.0 {
        return "0:00".to_owned();
    }
    let total = seconds as u64;
    format!("{}:{:02}", total / 60, total % 60)
}

impl SiDawApp {
    pub fn new() -> Self {
        let state = library::load_state();
        let params = Arc::new(Mutex::new(state.eq));
        let engine = AudioEngine::new(Arc::clone(&params), state.volume);
        Self { state, engine, params, view: View::All, search: String::new(), status: "Готово".to_owned(), show_eq: false }
    }

    fn persist(&mut self) {
        self.state.eq = *self.params.lock().expect("params mutex poisoned");
        self.state.volume = self.engine.volume();
        library::save_state(&self.state);
    }

    fn visible_indices(&self) -> Vec<usize> {
        let query = self.search.trim().to_lowercase();
        let recent_from = self.state.tracks.len().saturating_sub(8);
        self.state.tracks
            .iter()
            .enumerate()
            .filter(|(i, track)| {
                let in_view = match self.view {
                    View::All => true,
                    View::Favorites => self.state.favorites.contains(&track.id),
                    View::Recent => *i >= recent_from,
                };
                let matches = query.is_empty() || format!("{} {} {}", track.title, track.artist, track.album).to_lowercase().contains(&query);
                in_view && matches
            })
            .map(|(i, _)| i)
            .collect()
    }

    fn play_index(&mut self, index: usize) {
        let Some(track) = self.state.tracks.get(index).cloned() else { return };
        match self.engine.play(&track.path_buf()) {
            Ok(()) => {
                self.state.current_id = Some(track.id.clone());
                self.status = format!("Сейчас играет: {} — {}", track.title, track.artist);
            }
            Err(err) => self.status = err,
        }
        self.persist();
    }

    fn next_track(&mut self) {
        if self.state.tracks.is_empty() { return; }
        let next = self.state.tracks.iter().position(|t| Some(t.id.as_str()) == self.state.current_id.as_deref())
            .map_or(0, |i| (i + 1) % self.state.tracks.len());
        self.play_index(next);
    }

    fn prev_track(&mut self) {
        if self.state.tracks.is_empty() { return; }
        let len = self.state.tracks.len();
        let prev = self.state.tracks.iter().position(|t| Some(t.id.as_str()) == self.state.current_id.as_deref())
            .map_or(0, |i| (i + len - 1) % len);
        self.play_index(prev);
    }

    fn toggle_like(&mut self, id: &str) {
        if let Some(pos) = self.state.favorites.iter().position(|x| x == id) {
            self.state.favorites.remove(pos);
        } else {
            self.state.favorites.push(id.to_owned());
        }
        self.persist();
    }

    fn add_files(&mut self) {
        let files = rfd::FileDialog::new()
            .add_filter("Аудио", &["mp3", "wav", "flac", "ogg", "m4a", "aac", "opus"])
            .pick_files();
        let Some(files) = files else { return };
        let mut added = 0;
        for path in files {
            let track: Track = Track::from_path(&path);
            if !self.state.tracks.iter().any(|t| t.id == track.id) {
                self.state.tracks.push(track);
                added += 1;
            }
        }
        self.status = format!("Добавлено треков: {added}");
        self.persist();
    }

    fn eq_window(&mut self, ctx: &egui::Context) {
        if !self.show_eq { return; }
        let before = *self.params.lock().expect("params mutex poisoned");
        let mut params = before;
        egui::Window::new("Эквалайзер").open(&mut self.show_eq).show(ctx, |ui| {
            ui.checkbox(&mut params.enabled, "Включить эквалайзер");
            ui.add(egui::Slider::new(&mut params.preamp, -12.0..=12.0).text("Предусиление, дБ"));
            ui.separator();
            egui::Grid::new("eq_bands").show(ui, |ui| {
                for (i, gain) in params.bands.iter_mut().enumerate() {
                    let hz = if BANDS_HZ[i] >= 1000.0 {
                        format!("{} кГц", BANDS_HZ[i] / 1000.0)
                    } else {
                        format!("{} Гц", BANDS_HZ[i])
                    };
                    ui.label(hz);
                    ui.add(egui::Slider::new(gain, -12.0..=12.0).text("дБ"));
                    ui.end_row();
                }
            });
            ui.separator();
            ui.label("Пресеты");
            ui.horizontal_wrapped(|ui| {
                for (name, gains) in PRESETS {
                    if ui.button(*name).clicked() {
                        params.bands = *gains;
                        params.enabled = true;
                    }
                }
            });
        });
        if params != before {
            *self.params.lock().expect("params mutex poisoned") = params;
            self.persist();
        }
    }
}

impl eframe::App for SiDawApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        ctx.set_visuals(egui::Visuals::dark());
        ctx.request_repaint_after(Duration::from_millis(250)); // обновляем прогресс воспроизведения
        if self.engine.is_finished() {
            self.next_track();
        }

        egui::SidePanel::left("navigation").default_width(200.0).show(ctx, |ui| {
            ui.heading("SiDaW Player");
            ui.separator();
            if ui.button("Все треки").clicked() { self.view = View::All; }
            if ui.button("Любимое").clicked() { self.view = View::Favorites; }
            if ui.button("Недавние").clicked() { self.view = View::Recent; }
            ui.separator();
            if ui.button("Добавить музыку…").clicked() { self.add_files(); }
            ui.label(format!("Треков в медиатеке: {}", self.state.tracks.len()));
        });

        egui::TopBottomPanel::bottom("transport").show(ctx, |ui| {
            ui.horizontal(|ui| {
                let title = self.state.tracks.iter()
                    .find(|t| Some(t.id.as_str()) == self.state.current_id.as_deref())
                    .map(|t| format!("{} — {}", t.title, t.artist))
                    .unwrap_or_else(|| "Ничего не выбрано".to_owned());
                let short_title = if title.chars().count() > 60 {
                    format!("{}…", title.chars().take(60).collect::<String>())
                } else {
                    title
                };
                ui.label(short_title);
                ui.add_space(10.0);
                if ui.button("⏮").clicked() { self.prev_track(); }
                let toggle = if self.engine.is_playing() { "⏸" } else { "▶" };
                if ui.button(toggle).clicked() { self.engine.toggle_play(); }
                if ui.button("⏭").clicked() { self.next_track(); }
                ui.add_space(10.0);
                ui.label("Громкость");
                let mut volume = self.engine.volume();
                if ui.add(egui::Slider::new(&mut volume, 0.0..=1.0).show_value(false)).changed() {
                    self.engine.set_volume(volume);
                    self.persist();
                }
                if ui.button("Эквалайзер").clicked() { self.show_eq = !self.show_eq; }
            });
            ui.horizontal(|ui| {
                let duration = self.engine.duration.map(|d| d.as_secs_f32()).unwrap_or(0.0);
                let position = self.engine.position().as_secs_f32();
                let fraction = if duration > 0.0 { (position / duration).clamp(0.0, 1.0) } else { 0.0 };
                ui.add(egui::ProgressBar::new(fraction).text(format!("{} / {}", format_time(position), format_time(duration))));
                if ui.button("−5 с").clicked() {
                    let pos = self.engine.position().saturating_sub(Duration::from_secs(5));
                    self.engine.seek(pos);
                }
                if ui.button("+5 с").clicked() {
                    self.engine.seek(self.engine.position() + Duration::from_secs(5));
                }
                ui.label(self.status.as_str());
            });
        });

        egui::CentralPanel::default().show(ctx, |ui| {
            let title = match self.view {
                View::All => "Все треки",
                View::Favorites => "Любимое",
                View::Recent => "Недавние",
            };
            ui.heading(title);
            ui.horizontal(|ui| {
                ui.label("Поиск:");
                ui.text_edit_singleline(&mut self.search);
            });
            ui.separator();
            egui::ScrollArea::vertical().show(ui, |ui| {
                for index in self.visible_indices() {
                    // Копируем строку: дальше в цикле меняем self (лайки/воспроизведение).
                    let track = self.state.tracks[index].clone();
                    let active = self.state.current_id.as_deref() == Some(track.id.as_str());
                    ui.horizontal(|ui| {
                        if ui.button("▶").clicked() {
                            if active { self.engine.toggle_play(); } else { self.play_index(index); }
                        }
                        let liked = self.state.favorites.contains(&track.id);
                        if ui.button(if liked { "♥" } else { "♡" }).clicked() {
                            self.toggle_like(&track.id);
                        }
                        if ui.selectable_label(active, format!("{} — {}", track.title, track.artist)).clicked() {
                            self.play_index(index);
                        }
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(track.album.as_str());
                        });
                    });
                }
            });
        });

        self.eq_window(ctx);
    }
}
