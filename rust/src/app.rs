//! Интерфейс плеера на egui.
use crate::{
    audio::AudioEngine,
    catalog::{self, AudioItem},
    design::{self, Design},
    eq::{EqParams, BANDS_HZ, PRESETS},
    library::{self, theme_preset, SavedState, Track, THEME_PRESETS},
};
use eframe::egui;
use std::{sync::{Arc, Mutex}, time::{Duration, SystemTime, UNIX_EPOCH}};

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
    show_theme: bool,
    show_catalog: bool,
    catalog_query: String,
    catalog_results: Vec<AudioItem>,
    catalog_message: String,
    remote_title: String,
    wave: bool,
    rng: u64,
    design: Design,
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
        let seed = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0x9e3779b9);
        Self {
            state, engine, params,
            view: View::All,
            search: String::new(),
            status: "Готово".to_owned(),
            show_eq: false,
            show_theme: false,
            show_catalog: false,
            catalog_query: String::new(),
            catalog_results: Vec::new(),
            catalog_message: String::new(),
            remote_title: String::new(),
            wave: false,
            rng: seed | 1,
            design: Design::new(),
        }
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
                self.remote_title.clear();
                *self.state.plays.entry(track.id.clone()).or_insert(0) += 1;
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

    // Простой xorshift: независимый генератор без внешней зависимости.
    fn random(&mut self) -> f64 {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 7;
        self.rng ^= self.rng << 17;
        ((self.rng >> 11) as f64) / ((1u64 << 53) as f64)
    }

    /// «Моя волна»: бесконечный микс с учётом избранного и истории прослушиваний.
    fn next_wave(&mut self) {
        if self.state.tracks.is_empty() { return; }
        let current = self.state.current_id.clone().unwrap_or_default();
        let candidates: Vec<usize> = (0..self.state.tracks.len())
            .filter(|i| self.state.tracks[*i].id != current)
            .collect();
        if candidates.is_empty() { return; }
        let rolls: Vec<f64> = (0..candidates.len()).map(|_| self.random()).collect();
        let target = self.random();
        let mut cumulative = 0.0_f64;
        let mut chosen = candidates[0];
        for (pos, &index) in candidates.iter().enumerate() {
            let track = &self.state.tracks[index];
            let favorite = if self.state.favorites.contains(&track.id) { 4.0_f64 } else { 1.0 };
            let familiar = (*self.state.plays.get(&track.id).unwrap_or(&0) as f64).min(20.0) * 0.15;
            cumulative += (favorite + familiar) * (0.5 + rolls[pos]);
            chosen = index;
            if cumulative >= target { break; }
        }
        self.play_index(chosen);
    }

    fn toggle_wave(&mut self) {
        self.wave = !self.wave;
        if self.wave {
            self.status = "Моя волна: подбираю трек…".to_owned();
            self.next_wave();
        } else {
            self.status = "Моя волна выключена".to_owned();
        }
    }

    fn apply_theme(&self, ctx: &egui::Context, accent: egui::Color32) {
        ctx.set_pixels_per_point(self.state.theme.scale);
        let mut visuals = if self.state.theme.light { egui::Visuals::light() } else { egui::Visuals::dark() };
        // Панели непрозрачные: фон рисуется внутри central panel под виджетами.
        let base = if self.state.theme.light {
            egui::Color32::from_rgb(238, 240, 248)
        } else {
            egui::Color32::from_rgb(12, 14, 24)
        };
        visuals.window_fill = base;
        visuals.panel_fill = base;
        visuals.selection.bg_fill = accent;
        visuals.widgets.active.bg_fill = accent;
        visuals.widgets.hovered.bg_fill = self.design.glow(45.0);
        visuals.hyperlink_color = accent;
        ctx.set_visuals(visuals);
    }

    fn theme_window(&mut self, ctx: &egui::Context) {
        if !self.show_theme { return; }
        let mut changed = false;
        egui::Window::new("Оформление").open(&mut self.show_theme).show(ctx, |ui| {
            ui.horizontal_wrapped(|ui| {
                for (id, name, _, _, _) in THEME_PRESETS {
                    if ui.button(*name).clicked() {
                        self.state.theme = theme_preset(id);
                        changed = true;
                    }
                }
            });
            ui.separator();
            let mut light = self.state.theme.light;
            if ui.checkbox(&mut light, "Светлый режим").changed() {
                self.state.theme.light = light;
                changed = true;
            }
            let mut scale = self.state.theme.scale;
            if ui.add(egui::Slider::new(&mut scale, 0.85..=1.15).text("Масштаб интерфейса")).changed() {
                self.state.theme.scale = scale;
                changed = true;
            }
            ui.separator();
            ui.label("Акцентный цвет (RGB)");
            let mut accent = self.state.theme.accent;
            for (i, name) in ["R", "G", "B"].iter().enumerate() {
                ui.add(egui::Slider::new(&mut accent[i], 0..=255).text(*name));
            }
            if accent != self.state.theme.accent {
                self.state.theme.accent = accent;
                changed = true;
            }
            if ui.button("Сбросить оформление").clicked() {
                self.state.theme = theme_preset("night");
                changed = true;
            }
        });
        if changed { self.persist(); }
    }

    fn catalog_window(&mut self, ctx: &egui::Context) {
        if !self.show_catalog { return; }
        egui::Window::new("Открытый каталог").open(&mut self.show_catalog).show(ctx, |ui| {
            ui.label("Треки с открытыми лицензиями через Openverse (Jamendo, Freesound, Wikimedia).");
            ui.horizontal(|ui| {
                ui.text_edit_singleline(&mut self.catalog_query);
                if ui.button("Найти").clicked() {
                    let query = self.catalog_query.trim().to_owned();
                    if query.chars().count() < 2 {
                        self.catalog_message = "Введите хотя бы 2 символа".to_owned();
                    } else {
                        match catalog::search(&query) {
                            Ok(items) => {
                                self.catalog_message = format!("Найдено треков: {}", items.len());
                                self.catalog_results = items;
                            }
                            Err(err) => {
                                self.catalog_message = err;
                                self.catalog_results.clear();
                            }
                        }
                    }
                }
            });
            ui.label(self.catalog_message.as_str());
            ui.separator();
            egui::ScrollArea::vertical().max_height(340.0).show(ui, |ui| {
                for item in self.catalog_results.clone() {
                    ui.horizontal(|ui| {
                        if ui.button("▶").clicked() {
                            match catalog::fetch_bytes(&item.url).and_then(|bytes| self.engine.play_buffer(bytes)) {
                                Ok(()) => {
                                    self.state.current_id = None;
                                    self.remote_title = format!("{} — {}", item.title, item.author());
                                    self.status = "Играет из открытого каталога".to_owned();
                                }
                                Err(err) => self.status = err,
                            }
                        }
                        ui.label(format!("{} — {}", item.title, item.author()));
                    });
                    ui.label(format!("{} · {} · {}", item.provider, item.license.to_uppercase(),
                        format_time(item.duration.unwrap_or(0) as f32 / 1000.0)));
                    if let Some(attribution) = &item.attribution {
                        ui.label(egui::RichText::new(attribution.as_str()).small());
                    }
                    ui.separator();
                }
            });
        });
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
        let playing = self.engine.is_playing();
        let accent = self.design.frame(self.state.theme.accent, playing);
        self.apply_theme(ctx, accent);
        ctx.request_repaint_after(Duration::from_millis(90)); // анимация волны и прогресс воспроизведения
        if self.engine.is_finished() {
            if self.wave { self.next_wave(); } else { self.next_track(); }
        }

        egui::SidePanel::left("navigation").default_width(200.0).show(ctx, |ui| {
            ui.heading("SiDaW Player");
            ui.separator();
            if ui.button("Все треки").clicked() { self.view = View::All; }
            if ui.button("Любимое").clicked() { self.view = View::Favorites; }
            if ui.button("Недавние").clicked() { self.view = View::Recent; }
            ui.separator();
            let wave_label = if self.wave { "Моя волна · вкл" } else { "Моя волна" };
            let wave_button = ui.button(wave_label);
            if wave_button.clicked() { self.toggle_wave(); }
            if self.wave {
                let pulse = 110.0 + 80.0 * (self.design.time() * 3.0).sin().abs();
                ui.painter().rect_stroke(wave_button.rect.expand(3.0), 7.0, egui::Stroke::new(2.0, self.design.glow(pulse)), egui::StrokeKind::Middle);
            }
            if ui.button("Открытый каталог").clicked() { self.show_catalog = !self.show_catalog; }
            if ui.button("Оформление").clicked() { self.show_theme = !self.show_theme; }
            ui.separator();
            if ui.button("Добавить музыку…").clicked() { self.add_files(); }
            ui.label(format!("Треков в медиатеке: {}", self.state.tracks.len()));
        });

        egui::TopBottomPanel::bottom("transport").show(ctx, |ui| {
            ui.horizontal(|ui| {
                let title = self.state.tracks.iter()
                    .find(|t| Some(t.id.as_str()) == self.state.current_id.as_deref())
                    .map(|t| format!("{} — {}", t.title, t.artist))
                    .unwrap_or_else(|| {
                        if self.remote_title.is_empty() { "Ничего не выбрано".to_owned() } else { self.remote_title.clone() }
                    });
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
            let strip_width = ui.available_width().min(240.0);
            let (strip_rect, _) = ui.allocate_exact_size(egui::vec2(strip_width, 20.0), egui::Sense::hover());
            design::wave(ui, strip_rect, &self.design);
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
            self.design.paint(ui, self.state.theme.light);
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
                    let row = ui.horizontal(|ui| {
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
                    if active {
                        let pulse = 70.0 + 55.0 * (self.design.time() * 2.6).sin().abs();
                        ui.painter().rect_stroke(row.response.rect.expand(2.0), 6.0, egui::Stroke::new(1.0, self.design.glow(pulse)), egui::StrokeKind::Middle);
                    }
                }
            });
        });

        self.eq_window(ctx);
        self.theme_window(ctx);
        self.catalog_window(ctx);
    }
}
